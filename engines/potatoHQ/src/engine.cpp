#include "engine.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstring>

#include "decode/ffmpeg_decoder.h"
#include "dsp/sdm.h"
#include "dsp/dop.h"

namespace phq {
namespace {
constexpr size_t kDopChunkBits = 2048;  // multiple of 16 so DoP frames are whole
}

Engine::~Engine() { stop(); }

std::string Engine::sourcePath() const {
  std::lock_guard lock(mutex_);
  return path_;
}

std::string Engine::lastError() const {
  std::lock_guard lock(mutex_);
  return lastError_;
}

double Engine::position() const {
  const int rate = mode_ == EngineMode::Dop ? carrierRate_ : outRate_;
  if (rate <= 0) return 0.0;
  const uint64_t rendered = framesRendered_.load(std::memory_order_relaxed);
  const uint64_t startFrame = trackStartFrame_.load(std::memory_order_relaxed);
  const double startPosition = trackStartPosition_.load(std::memory_order_relaxed);
  double p = startPosition +
             (rendered > startFrame ? static_cast<double>(rendered - startFrame) / rate : 0.0);
  // The gapless boundary is reported on the control tick, so the last few
  // hundred ms of a finished segment would otherwise report > duration.
  if (duration_ > 0.0 && p > duration_) p = duration_;
  return p;
}

std::string Engine::trackId() const {
  std::lock_guard lock(mutex_);
  return trackId_;
}

void Engine::setNext(const std::string& path, const std::string& trackId) {
  std::lock_guard lock(nextMutex_);
  nextPath_ = path;
  nextTrackId_ = trackId;
  nextValid_ = !path.empty();
}

bool Engine::consumeTrackAdvance(std::string* path, std::string* trackId, double* duration) {
  if (!advancePending_.exchange(false, std::memory_order_acq_rel)) return false;
  std::string np, nt;
  double nd = 0.0;
  {
    std::lock_guard lock(pendingMutex_);
    np = pendingPath_;
    nt = pendingTrackId_;
    nd = pendingDuration_;
  }
  if (path) *path = np;
  if (trackId) *trackId = nt;
  if (duration) *duration = nd;
  {
    std::lock_guard lock(mutex_);
    path_ = np;
    trackId_ = nt;
    duration_ = nd;
  }
  trackStartFrame_.store(boundaryFrames_.load(std::memory_order_acquire), std::memory_order_release);
  trackStartPosition_.store(0.0, std::memory_order_release);
  return true;
}

void Engine::joinWorker() {
  if (worker_.joinable()) worker_.join();
}

void Engine::stop() { stopInternal(true); }

void Engine::stopInternal(bool restoreOutputRate) {
  stopRequested_.store(true, std::memory_order_release);
  // Silence the render callback before the rings are cleared; otherwise a
  // callback that is mid-read can race the clear() below.
  switchSwapActive_.store(true, std::memory_order_release);
  if (output_) output_->stop();
  joinWorker();
  waitForRenderIdle();
  ring_.clear();
  dopRing_.clear();
  spectrum_.reset();
  resetSwitchFade(1.0f);
  if (output_) {
    output_->close(restoreOutputRate);
    output_.reset();
  }
  active_.store(false, std::memory_order_release);
  playing_.store(false, std::memory_order_release);
  paused_.store(false, std::memory_order_release);
  finished_.store(false, std::memory_order_release);
  framesRendered_.store(0, std::memory_order_relaxed);
  framesDecoded_.store(0, std::memory_order_relaxed);
  dopMarkerIndex_ = 0;
  switchSwapActive_.store(false, std::memory_order_release);
}

void Engine::pause() {
  if (active_.load()) paused_.store(true, std::memory_order_release);
}
void Engine::resume() {
  if (active_.load()) paused_.store(false, std::memory_order_release);
}
void Engine::togglePause() {
  if (!active_.load()) return;
  paused_.store(!paused_.load(std::memory_order_acquire), std::memory_order_release);
}

void Engine::setVolume(double v) { volume_.store(clampd(v, 0.0, 1.0), std::memory_order_release); }

void Engine::applyEq(const std::vector<EqBand>& bands, double preampDb) {
  {
    std::lock_guard lock(mutex_);
    eqBands_ = bands;
    preampDb_ = preampDb;
  }
  eqRevision_.fetch_add(1, std::memory_order_release);  // picked up by the decode thread
}

void Engine::setOutputOptions(const std::string& deviceId, bool exclusive) {
  std::lock_guard lock(mutex_);
  options_.deviceId = deviceId;
  options_.exclusive = exclusive;
}

void Engine::setUpsampling(int tapsPerPhase) {
  std::lock_guard lock(mutex_);
  options_.tapsPerPhase = std::clamp(tapsPerPhase, 16, 512);
}

void Engine::setChannels(int channels) {
  std::lock_guard lock(mutex_);
  options_.channels = std::clamp(channels, 1, 8);
}

void Engine::setExclusive(bool exclusive) {
  std::lock_guard lock(mutex_);
  options_.exclusive = exclusive;
}

void Engine::setCrossfeed(bool enabled, double strength) {
  crossfeedEnabled_.store(enabled, std::memory_order_release);
  crossfeedStrength_.store(clampd(strength, 0.0, 1.0), std::memory_order_release);
  crossfeedRevision_.fetch_add(1, std::memory_order_release);
}

void Engine::setVisualization(bool enabled) {
  visualizationDemand_.store(enabled, std::memory_order_release);
  spectrum_.setEnabled(enabled);
}

bool Engine::spectrumBars(float* bars, size_t count) {
  if (!visualizationDemand_.load(std::memory_order_acquire)) return false;
  return spectrum_.compute(bars, count);
}

void Engine::setSpatial(bool enabled, double x, double y) {
  spatialEnabled_.store(enabled, std::memory_order_release);
  spatialX_.store(clampd(x, -1.0, 1.0), std::memory_order_release);
  spatialY_.store(clampd(y, -1.0, 1.0), std::memory_order_release);
  spatialRevision_.fetch_add(1, std::memory_order_release);
}

void Engine::setFollowSourceRate(bool follow) {
  std::lock_guard lock(mutex_);
  options_.followSourceRate = follow;
}

void Engine::setDsd(int mult) {
  std::lock_guard lock(mutex_);
  options_.dsdMult = (mult == 64 || mult == 128 || mult == 256) ? mult : 0;
}

void Engine::setSdmOrder(int order) {
  std::lock_guard lock(mutex_);
  options_.sdmOrder = std::clamp(order, 3, 7);
}

std::string Engine::deviceId() const {
  std::lock_guard lock(mutex_);
  return options_.deviceId;
}

bool Engine::exclusive() const {
  std::lock_guard lock(mutex_);
  return options_.exclusive;
}

void Engine::render(void* data, size_t frames) {
  if (mode_ == EngineMode::Dop) {
    renderDop(data, frames);
  } else {
    renderPcm(static_cast<float*>(data), frames);
  }
}

void Engine::renderDop(void* data, size_t frames) {
  renderDepth_.fetch_add(1, std::memory_order_acq_rel);
  auto* out = static_cast<uint32_t*>(data);
  const int ch = options_.channels;
  if (!playing_.load(std::memory_order_acquire) || paused_.load(std::memory_order_acquire) ||
      switchSwapActive_.load(std::memory_order_acquire)) {
    // DoP silence still needs a legal carrier: alternating marker + 0x69 payload,
    // otherwise the DAC loses lock while paused or while the source is swapped.
    for (size_t f = 0; f < frames; ++f) {
      for (int c = 0; c < ch; ++c) {
        out[f * ch + c] = dopCarrierWord(0x6969u, dopMarkerIndex_);
      }
      ++dopMarkerIndex_;
    }
    renderDepth_.fetch_sub(1, std::memory_order_acq_rel);
    return;
  }
  const size_t got = dopRing_.read(out, frames);
  if (got < frames && output_) output_->countUnderrun();
  for (size_t f = 0; f < frames; ++f) {
    for (int c = 0; c < ch; ++c) {
      const uint32_t payload = (f < got) ? (out[f * ch + c] & 0xFFFFu) : 0x6969u;
      out[f * ch + c] = dopCarrierWord(payload, dopMarkerIndex_);
    }
    ++dopMarkerIndex_;
  }
  framesRendered_.fetch_add(got, std::memory_order_relaxed);
  renderDepth_.fetch_sub(1, std::memory_order_acq_rel);
}

void Engine::renderPcm(float* out, size_t frames) {
  renderDepth_.fetch_add(1, std::memory_order_acq_rel);
  const int ch = options_.channels;
  const size_t samples = frames * static_cast<size_t>(ch);
  if (!playing_.load(std::memory_order_acquire) || paused_.load(std::memory_order_acquire) ||
      switchSwapActive_.load(std::memory_order_acquire)) {
    std::memset(out, 0, samples * sizeof(float));
    renderDepth_.fetch_sub(1, std::memory_order_acq_rel);
    return;
  }
  const size_t got = ring_.read(out, frames);
  if (got < frames && output_ && !decoderEof_.load(std::memory_order_acquire)) {
    output_->countUnderrun();
  }
  const double target = volume_.load(std::memory_order_relaxed);
  const double prev = volumeApplied_.load(std::memory_order_relaxed);
  if (prev < 0.0) {
    for (size_t i = 0; i < samples; ++i) out[i] *= static_cast<float>(target);
  } else if (std::abs(target - 1.0) > 1e-6 || std::abs(prev - 1.0) > 1e-6) {
    const double step = (target - prev) / static_cast<double>(std::max<size_t>(1, frames));
    double g = prev;
    for (size_t f = 0; f < frames; ++f) {
      for (int c = 0; c < ch; ++c) out[f * static_cast<size_t>(ch) + static_cast<size_t>(c)] *= static_cast<float>(g);
      g += step;
    }
  }
  volumeApplied_.store(target, std::memory_order_relaxed);
  applySwitchFade(out, frames, ch);
  framesRendered_.fetch_add(got, std::memory_order_relaxed);
  if (got > 0) spectrum_.push(out, got, ch);
  // Gapless hand-off: when the render cursor crosses the segment boundary the
  // control thread takes over the track metadata and emits playback.track.
  if (boundaryValid_.load(std::memory_order_acquire) &&
      framesRendered_.load(std::memory_order_relaxed) >= boundaryFrames_.load(std::memory_order_relaxed)) {
    boundaryValid_.store(false, std::memory_order_release);
    advancePending_.store(true, std::memory_order_release);
  }
  if (got < frames) {
    std::memset(out + got * static_cast<size_t>(ch), 0,
                (frames - got) * static_cast<size_t>(ch) * sizeof(float));
  }
  renderDepth_.fetch_sub(1, std::memory_order_acq_rel);
}

// ---------------------------------------------------------------- PCM ------
void Engine::decodeLoopPcm() {
  std::string path;
  double startSeconds = startSeconds_;
  {
    std::lock_guard lock(mutex_);
    path = path_;
  }
  const size_t chunk = 2048;
  const size_t ch = static_cast<size_t>(options_.channels);
  bool firstSegment = true;

  // EQ is global to the output: it lives across gapless segments so its IIR
  // state stays continuous, and it cross-fades on parameter changes.
  ChannelEq eq;
  std::vector<EqBand> eqBands;
  double eqPreamp = 0.0;
  {
    std::lock_guard lock(mutex_);
    eqBands = eqBands_;
    eqPreamp = preampDb_;
  }
  eq.configure(outRate_, options_.channels, eqBands, eqPreamp);
  uint64_t appliedEqRev = eqRevision_.load(std::memory_order_acquire);
  CrossfeedProcessor crossfeed;
  crossfeed.configure(outRate_, options_.channels);
  uint64_t appliedCrossfeedRev = crossfeedRevision_.load(std::memory_order_acquire);
  SpatialPanner spatial;
  spatial.configure(outRate_, options_.channels);
  uint64_t appliedSpatialRev = spatialRevision_.load(std::memory_order_acquire);

  enum class Push { Ok, Stop, Seek };
  auto pushRing = [&](const float* data, size_t frames) -> Push {
    size_t offset = 0;
    while (offset < frames) {
      if (stopRequested_.load(std::memory_order_acquire)) return Push::Stop;
      // Abort on seek even when the ring is full (paused playback), otherwise
      // a seek issued while paused would never be processed.
      if (seekRequested_.load(std::memory_order_acquire)) return Push::Seek;
      const size_t wrote = ring_.write(data + offset * ch, frames - offset);
      offset += wrote;
      framesDecoded_.fetch_add(wrote, std::memory_order_relaxed);
      if (wrote == 0) std::this_thread::sleep_for(std::chrono::milliseconds(2));
    }
    return Push::Ok;
  };

  // Both regular audio and the resampler tail pass through this same chain.
  auto processEffects = [&](std::vector<float>& samples) {
    const uint64_t rev = eqRevision_.load(std::memory_order_acquire);
    if (rev != appliedEqRev) {
      std::vector<EqBand> fresh;
      double freshPreamp = 0.0;
      {
        std::lock_guard lock(mutex_);
        fresh = eqBands_;
        freshPreamp = preampDb_;
      }
      eq.setTarget(outRate_, options_.channels, fresh, freshPreamp);
      appliedEqRev = rev;
    }
    eq.process(samples.data(), samples.size() / ch);
    // Crossfeed sits between EQ and the spatial panner; disabled = bypass.
    const uint64_t crev = crossfeedRevision_.load(std::memory_order_acquire);
    if (crossfeedEnabled_.load(std::memory_order_acquire) || crev != appliedCrossfeedRev) {
      crossfeed.setTarget(crossfeedEnabled_.load(std::memory_order_acquire),
                          crossfeedStrength_.load(std::memory_order_relaxed));
      crossfeed.process(samples.data(), samples.size() / ch);
      appliedCrossfeedRev = crev;
    }
    // Spatial panner runs after EQ so the cue is not re-filtered; when it is
    // disabled the panner is a strict bypass (no samples touched).
    const uint64_t srev = spatialRevision_.load(std::memory_order_acquire);
    if (spatialEnabled_.load(std::memory_order_acquire) || srev != appliedSpatialRev) {
      spatial.setTarget({spatialEnabled_.load(std::memory_order_acquire),
                         spatialX_.load(std::memory_order_relaxed),
                         spatialY_.load(std::memory_order_relaxed)});
      spatial.process(samples.data(), samples.size() / ch);
      appliedSpatialRev = srev;
    }
  };

  while (!stopRequested_.load(std::memory_order_acquire)) {
    FfmpegDecoder decoder;
    std::string err;
    if (!decoder.open(path, &err, options_.channels)) {
      std::lock_guard lock(mutex_);
      lastError_ = err.empty() ? "decode open failed" : err;
      break;
    }
    if (firstSegment && startSeconds > 0.0) {
      std::string seekErr;
      if (!decoder.seek(startSeconds, &seekErr)) {
        std::lock_guard lock(mutex_);
        lastError_ = seekErr.empty() ? "seek failed" : seekErr;
        break;
      }
    }
    firstSegment = false;

    const int srcRate = decoder.sampleRate();
    const int srcCh = decoder.channels();
    if (srcRate <= 0 || srcCh <= 0) {
      std::lock_guard lock(mutex_);
      lastError_ = "invalid source format";
      break;
    }

    ResamplerConfig rcfg;
    rcfg.tapsPerPhase = options_.tapsPerPhase;
    PolyphaseResampler resampler;
    const bool needResample = (srcRate != outRate_);
    if (needResample && !resampler.configure(srcRate, outRate_, rcfg, &err)) {
      std::lock_guard lock(mutex_);
      lastError_ = err;
      break;
    }

    std::vector<float> in(chunk * static_cast<size_t>(srcCh));
    std::vector<float> outBuf;
    outBuf.reserve((chunk * static_cast<size_t>(outRate_) / srcRate + 2) * ch);
    while (!stopRequested_.load(std::memory_order_acquire)) {
      if (seekRequested_.exchange(false, std::memory_order_acq_rel)) {
        ring_.clear();
        resampler.reset();
        eq.reset();
        crossfeed.reset();
        spatial.reset();
        std::string seekErr;
        if (!decoder.seek(pendingSeekSeconds_.load(std::memory_order_relaxed), &seekErr)) {
          std::lock_guard lock(mutex_);
          lastError_ = seekErr.empty() ? "seek failed" : seekErr;
        }
        continue;
      }
      const size_t got = decoder.read(in.data(), chunk, &err);
      if (got == 0) break;
      outBuf.clear();
      if (needResample) resampler.process(in.data(), got, outBuf);
      else outBuf.assign(in.begin(), in.begin() + got * ch);
      if (outBuf.empty()) continue;
      processEffects(outBuf);
      const Push pushed = pushRing(outBuf.data(), outBuf.size() / ch);
      if (pushed == Push::Stop) break;
      // Push::Seek falls through to the top of the loop, which repositions.
    }
    if (stopRequested_.load(std::memory_order_acquire)) break;

    // Drain this segment's FIR tail into the ring before handing off, so the
    // hand-off is sample-continuous (a gap here is audible as a click).
    if (needResample) {
      std::vector<float> tail;
      resampler.flush(tail);
      processEffects(tail);
      if (!tail.empty() && pushRing(tail.data(), tail.size() / ch) == Push::Stop) break;
    }

    // Gapless hand-off: take the preloaded next track and keep writing the same ring.
    std::string np, nt;
    bool hasNext = false;
    {
      std::lock_guard lock(nextMutex_);
      if (nextValid_) {
        np = nextPath_;
        nt = nextTrackId_;
        nextValid_ = false;
        hasNext = true;
      }
    }
    if (!hasNext) break;

    const uint64_t boundary = framesDecoded_.load(std::memory_order_acquire);
    double nextDuration = 0.0;
    {
      FfmpegDecoder probe;
      std::string probeErr;
      if (probe.open(np, &probeErr)) nextDuration = probe.durationSeconds();
    }
    {
      std::lock_guard lock(pendingMutex_);
      pendingPath_ = np;
      pendingTrackId_ = nt;
      pendingDuration_ = nextDuration;
    }
    boundaryFrames_.store(boundary, std::memory_order_release);
    boundaryValid_.store(true, std::memory_order_release);
    path = np;
    startSeconds = 0.0;
  }

  // No further segment: the remaining ring content is the natural tail.
  decoderEof_.store(true, std::memory_order_release);
  while (!stopRequested_.load(std::memory_order_acquire) && ring_.available() > 0) {
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
  }
  if (!stopRequested_.load(std::memory_order_acquire)) {
    playing_.store(false, std::memory_order_release);
    finished_.store(true, std::memory_order_release);
  }
}

// ---------------------------------------------------------------- DoP ------
void Engine::decodeLoopDop() {
  FfmpegDecoder decoder;
  std::string err;
  if (!decoder.open(path_, &err)) {
    std::lock_guard lock(mutex_);
    lastError_ = err.empty() ? "decode open failed" : err;
    active_.store(false, std::memory_order_release);
    return;
  }
  if (startSeconds_ > 0.0) decoder.seek(startSeconds_, nullptr);
  const int srcRate = decoder.sampleRate();
  const int srcCh = decoder.channels();
  if (srcRate <= 0 || srcCh <= 0 || srcCh > 2) {
    std::lock_guard lock(mutex_);
    lastError_ = "DoP currently supports 1-2 channels";
    active_.store(false, std::memory_order_release);
    return;
  }

  ResamplerConfig rcfg;
  rcfg.tapsPerPhase = 64;  // sharp enough for the 64x+ ratio, cheaper than PCM's 128
  PolyphaseResampler resampler;
  if (!resampler.configure(srcRate, dsdRate_, rcfg, &err)) {
    std::lock_guard lock(mutex_);
    lastError_ = err;
    active_.store(false, std::memory_order_release);
    return;
  }

  SdmConfig scfg;
  scfg.order = sdmOrder_;
  scfg.inputGainDb = dsdGainDb_;
  scfg.outOfBandGain = (sdmOrder_ >= 7) ? 1.8 : 2.0;
  SdmModulator sdm;
  sdm.configure(scfg, options_.channels);

  std::vector<float> in(2048 * static_cast<size_t>(srcCh));
  std::vector<float> pending;  // resampled, waiting for a whole DoP block
  std::vector<double> block;
  std::vector<uint8_t> packed;
  std::vector<uint32_t> payload;

  auto flushBlock = [&](size_t frames) -> bool {
    if (frames < 16) return true;
    block.resize(frames * static_cast<size_t>(options_.channels));
    for (size_t i = 0; i < block.size(); ++i) block[i] = static_cast<double>(pending[i]);
    sdm.process(block.data(), frames, packed);
    const size_t words = frames / 16;
    const size_t bytesPerChannel = frames / 8;
    payload.resize(words * static_cast<size_t>(options_.channels));
    for (size_t w = 0; w < words; ++w) {
      for (int c = 0; c < options_.channels; ++c) {
        const uint8_t earlier = packed[static_cast<size_t>(c) * bytesPerChannel + 2 * w];
        const uint8_t later = packed[static_cast<size_t>(c) * bytesPerChannel + 2 * w + 1];
        payload[w * static_cast<size_t>(options_.channels) + static_cast<size_t>(c)] =
            (static_cast<uint32_t>(earlier) << 8) | later;
      }
    }
    size_t offset = 0;
    while (offset < words && !stopRequested_.load(std::memory_order_acquire) &&
           !seekRequested_.load(std::memory_order_acquire)) {
      const size_t wrote = dopRing_.write(payload.data() + offset * static_cast<size_t>(options_.channels), words - offset);
      offset += wrote;
      framesDecoded_.fetch_add(wrote, std::memory_order_relaxed);
      if (wrote == 0) std::this_thread::sleep_for(std::chrono::milliseconds(2));
    }
    pending.erase(pending.begin(), pending.begin() + static_cast<long>(frames * static_cast<size_t>(options_.channels)));
    return true;
  };

  while (!stopRequested_.load(std::memory_order_acquire)) {
    if (seekRequested_.exchange(false, std::memory_order_acq_rel)) {
      dopRing_.clear();
      resampler.reset();
      sdm.reset();
      pending.clear();
      std::string seekErr;
      if (!decoder.seek(pendingSeekSeconds_.load(std::memory_order_relaxed), &seekErr)) {
        std::lock_guard lock(mutex_);
        lastError_ = seekErr.empty() ? "seek failed" : seekErr;
      }
      continue;
    }
    const size_t got = decoder.read(in.data(), 2048, &err);
    if (got == 0) break;
    std::vector<float> stage(in.begin(), in.begin() + static_cast<long>(got * static_cast<size_t>(srcCh)));
    if (srcCh != options_.channels) {
      std::vector<float> mapped(got * static_cast<size_t>(options_.channels), 0.0f);
      for (size_t f = 0; f < got; ++f) {
        for (int c = 0; c < options_.channels; ++c) {
          mapped[f * static_cast<size_t>(options_.channels) + c] =
              stage[f * static_cast<size_t>(srcCh) + (c < srcCh ? c : srcCh - 1)];
        }
      }
      stage.swap(mapped);
    }
    std::vector<float> outBuf;
    resampler.process(stage.data(), got, outBuf);
    pending.insert(pending.end(), outBuf.begin(), outBuf.end());
    const size_t ch = static_cast<size_t>(options_.channels);
    while (pending.size() / ch >= kDopChunkBits) {
      if (!flushBlock(kDopChunkBits)) break;
    }
  }

  std::vector<float> tail;
  resampler.flush(tail);
  if (!tail.empty()) pending.insert(pending.end(), tail.begin(), tail.end());
  const size_t ch = static_cast<size_t>(options_.channels);
  while (pending.size() / ch >= 16) {
    const size_t frames = std::min(kDopChunkBits, (pending.size() / ch) & ~static_cast<size_t>(15));
    if (frames == 0) break;
    if (!flushBlock(frames)) break;
  }

  while (!stopRequested_.load(std::memory_order_acquire) && dopRing_.available() > 0) {
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
  }
  if (!stopRequested_.load(std::memory_order_acquire)) {
    playing_.store(false, std::memory_order_release);
    finished_.store(true, std::memory_order_release);
  }
}

// ------------------------------------------------------- switch transport ---
void Engine::setSwitchFadeMs(double ms) {
  switchFadeMs_.store(clampd(ms, 0.0, 200.0), std::memory_order_release);
}

void Engine::setSwitchFadeFrames(int frames) {
  // Negative restores the millisecond default; zero disables the ramps.
  switchFadeFrameOverride_.store(frames < 0 ? -1 : frames, std::memory_order_release);
}

uint64_t Engine::switchFadeFrames(int rate) const {
  const int overrideFrames = switchFadeFrameOverride_.load(std::memory_order_acquire);
  if (overrideFrames >= 0) return static_cast<uint64_t>(overrideFrames);
  const double ms = switchFadeMs_.load(std::memory_order_acquire);
  if (ms <= 0.0 || rate <= 0) return 0;
  return std::max<uint64_t>(1, static_cast<uint64_t>(std::llround(ms * rate / 1000.0)));
}

void Engine::resetSwitchFade(float gain) {
  switchFadeFrom_.store(gain, std::memory_order_relaxed);
  switchFadeTo_.store(gain, std::memory_order_relaxed);
  switchFadeLength_.store(0, std::memory_order_release);
  switchFadePos_.store(0, std::memory_order_relaxed);
}

void Engine::beginSwitchFade(float from, float to, uint64_t frames) {
  switchFadeFrom_.store(from, std::memory_order_relaxed);
  switchFadeTo_.store(to, std::memory_order_relaxed);
  switchFadePos_.store(0, std::memory_order_relaxed);
  switchFadeLength_.store(frames, std::memory_order_release);
}

bool Engine::waitForSwitchFade(int rate) {
  const uint64_t length = switchFadeLength_.load(std::memory_order_acquire);
  if (length == 0) return true;
  const double fadeMs = rate > 0 ? static_cast<double>(length) * 1000.0 / rate : 20.0;
  const int timeoutMs = std::clamp(static_cast<int>(std::ceil(fadeMs)) * 3 + 60, 60, 400);
  const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(timeoutMs);
  while (switchFadePos_.load(std::memory_order_acquire) <
         switchFadeLength_.load(std::memory_order_acquire)) {
    if (std::chrono::steady_clock::now() >= deadline) {
      // No render callbacks are arriving (a stalled unit, or a capture harness
      // that is not pumping). Snap to the target so the new track is not silent.
      const float target = switchFadeTo_.load(std::memory_order_relaxed);
      switchFadeFrom_.store(target, std::memory_order_relaxed);
      switchFadeLength_.store(0, std::memory_order_release);
      switchFadePos_.store(0, std::memory_order_relaxed);
      return false;
    }
    std::this_thread::sleep_for(std::chrono::microseconds(250));
  }
  return true;
}

void Engine::waitForRenderIdle() {
  const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(250);
  while (renderDepth_.load(std::memory_order_acquire) != 0) {
    if (std::chrono::steady_clock::now() >= deadline) break;
    std::this_thread::sleep_for(std::chrono::microseconds(250));
  }
}

void Engine::applySwitchFade(float* out, size_t frames, int ch) {
  const uint64_t length = switchFadeLength_.load(std::memory_order_acquire);
  const float to = switchFadeTo_.load(std::memory_order_relaxed);
  const uint64_t pos = switchFadePos_.load(std::memory_order_relaxed);
  if (length == 0 || pos >= length) {
    if (to == 1.0f) return;
    const size_t samples = frames * static_cast<size_t>(ch);
    for (size_t i = 0; i < samples; ++i) out[i] *= to;
    return;
  }
  const float from = switchFadeFrom_.load(std::memory_order_relaxed);
  const float span = static_cast<float>(length);
  size_t f = 0;
  for (; f < frames && pos + f < length; ++f) {
    const float t = static_cast<float>(pos + f + 1) / span;
    const float gain = from + (to - from) * t;
    for (int c = 0; c < ch; ++c) out[f * static_cast<size_t>(ch) + static_cast<size_t>(c)] *= gain;
  }
  if (to != 1.0f) {
    for (; f < frames; ++f) {
      for (int c = 0; c < ch; ++c) out[f * static_cast<size_t>(ch) + static_cast<size_t>(c)] *= to;
    }
  }
  switchFadePos_.store(pos + frames, std::memory_order_release);
}

// ---------------------------------------------------------------- play -----
bool Engine::play(const std::string& path, double startSeconds, std::string* error,
                  const std::string& trackId, const std::string& nextPath,
                  const std::string& nextTrackId) {
  return playInternal(path, startSeconds, error, trackId, nextPath, nextTrackId, false);
}

bool Engine::playInternal(const std::string& path, double startSeconds, std::string* error,
                          const std::string& trackId, const std::string& nextPath,
                          const std::string& nextTrackId, bool forceReopen) {
  // Probe the new source before touching the live playback: a missing or broken
  // file must not tear down the track that is currently playing.
  FfmpegDecoder probe;
  std::string err;
  if (!probe.open(path, &err)) {
    if (error) *error = err;
    return false;
  }
  if (probe.durationSeconds() <= 0.0) {
    if (error) *error = "stream has no known duration";
    return false;
  }
  const double newDuration = probe.durationSeconds();
  const int newSrcRate = probe.sampleRate();
  const int newSrcCh = probe.channels();

  EngineOptions opts;
  {
    std::lock_guard lock(mutex_);
    opts = options_;
  }
  const EngineMode newMode = opts.dsdMult > 0 ? EngineMode::Dop : EngineMode::Pcm;
  const int newDsdRate = newMode == EngineMode::Dop ? 44100 * opts.dsdMult : 0;
  const int newCarrierRate = newDsdRate / 16;
  const ClientFormat newFormat =
      newMode == EngineMode::Dop ? ClientFormat::Int24In32 : ClientFormat::Float32;
  int requestedRate = newMode == EngineMode::Dop ? newCarrierRate : 0;
  if (newMode == EngineMode::Pcm && opts.followSourceRate && newSrcRate > 0 &&
      CoreAudioOutput::supportsSampleRate(opts.deviceId, newSrcRate)) {
    requestedRate = newSrcRate;
  }

  // A live unit is kept running when the hardware configuration does not change:
  // stopping and recreating the AUHAL on every next/previous is the pop itself.
  const bool hadLiveOutput = output_ && output_->isOpen();
  const bool reuse = hadLiveOutput && !forceReopen && mode_ == newMode &&
                     output_->canReuse(opts.deviceId, opts.channels, opts.exclusive, newFormat,
                                       requestedRate);

  // Fade the outgoing waveform out while its unit is still running. DoP cannot
  // carry a gain ramp (its payload is DSD bits), so a DoP switch is a hard swap
  // on the same unit: no reopen, no AUHAL pop.
  const int fadeRate = hadLiveOutput ? std::max(1, outRate_) : 0;
  const uint64_t fadeOutFrames = hadLiveOutput ? switchFadeFrames(fadeRate) : 0;
  const bool audible = hadLiveOutput && active_.load(std::memory_order_acquire) &&
                       playing_.load(std::memory_order_acquire) &&
                       !paused_.load(std::memory_order_acquire) && mode_ == EngineMode::Pcm;
  const bool fadeOut = audible && fadeOutFrames > 0;
  if (fadeOut) {
    beginSwitchFade(1.0f, 0.0f, fadeOutFrames);
    waitForSwitchFade(fadeRate);
  } else {
    resetSwitchFade(1.0f);
  }

  // Stop the old source. On the reuse path the AUHAL unit keeps running and the
  // render callback renders silence (switchSwapActive_) while we swap buffers.
  stopRequested_.store(true, std::memory_order_release);
  if (!reuse && output_) output_->stop();
  joinWorker();
  switchSwapActive_.store(true, std::memory_order_release);
  waitForRenderIdle();
  ring_.clear();
  dopRing_.clear();
  spectrum_.reset();
  if (!reuse) {
    if (output_) {
      output_->close(false);  // keep the rate: open() below is the single change
      output_.reset();
    }
  } else {
    resetSwitchFade(newMode == EngineMode::Pcm ? 0.0f : 1.0f);
  }

  {
    std::lock_guard lock(mutex_);
    path_ = path;
    trackId_ = trackId;
    lastError_.clear();
  }
  {
    std::lock_guard lock(nextMutex_);
    nextPath_ = nextPath;
    nextTrackId_ = nextTrackId;
    nextValid_ = !nextPath.empty();
  }
  boundaryValid_.store(false, std::memory_order_release);
  advancePending_.store(false, std::memory_order_release);
  stopRequested_.store(false, std::memory_order_release);
  seekRequested_.store(false, std::memory_order_release);
  decoderEof_.store(false, std::memory_order_release);
  finished_.store(false, std::memory_order_release);
  paused_.store(false, std::memory_order_release);
  framesRendered_.store(0, std::memory_order_relaxed);
  framesDecoded_.store(0, std::memory_order_relaxed);
  trackStartFrame_.store(0, std::memory_order_relaxed);
  trackStartPosition_.store(startSeconds, std::memory_order_relaxed);
  volumeApplied_.store(-1.0, std::memory_order_relaxed);
  duration_ = newDuration;
  startSeconds_ = std::max(0.0, startSeconds);
  srcRate_ = newSrcRate;
  srcChannels_ = newSrcCh;
  if (!reuse) {
    mode_ = newMode;
    dopMarkerIndex_ = 0;
  }

  auto abortSwap = [&]() {
    active_.store(false, std::memory_order_release);
    playing_.store(false, std::memory_order_release);
    switchSwapActive_.store(false, std::memory_order_release);
    resetSwitchFade(1.0f);
    mode_ = EngineMode::Pcm;
  };

  if (reuse) {
    outRate_ = output_->sampleRate();
    outputReuses_.fetch_add(1, std::memory_order_relaxed);
  } else {
    output_ = std::make_unique<CoreAudioOutput>();
    if (newMode == EngineMode::Dop) {
      if (!output_->open(opts.deviceId, opts.channels, opts.exclusive, ClientFormat::Int24In32,
                         newCarrierRate, &err)) {
        if (error) *error = "DoP: " + err;
        output_.reset();
        abortSwap();
        return false;
      }
      outRate_ = output_->sampleRate();
      if (outRate_ != newCarrierRate) {
        if (error) *error = "DoP: device runs at " + std::to_string(outRate_) + " Hz, carrier needs " +
                            std::to_string(newCarrierRate) + " Hz";
        output_.reset();
        abortSwap();
        return false;
      }
      dopRing_.reset(static_cast<size_t>(newCarrierRate) * 2, opts.channels);
    } else {
      if (!output_->open(opts.deviceId, opts.channels, opts.exclusive, ClientFormat::Float32,
                         requestedRate, &err)) {
        if (error) *error = err;
        output_.reset();
        abortSwap();
        return false;
      }
      outRate_ = output_->sampleRate();
      ring_.reset(static_cast<size_t>(std::max(1, outRate_)) * 2, opts.channels);
      spectrum_.configure(outRate_);
      spectrum_.setEnabled(visualizationDemand_.load(std::memory_order_acquire));
    }
    output_->setRender([this](void* data, size_t frames) { render(data, frames); });
    outputOpens_.fetch_add(1, std::memory_order_relaxed);
    if (hadLiveOutput) outputReopens_.fetch_add(1, std::memory_order_relaxed);
  }

  active_.store(true, std::memory_order_release);
  playing_.store(true, std::memory_order_release);
  worker_ = std::thread([this] {
    if (mode_ == EngineMode::Dop) decodeLoopDop();
    else decodeLoopPcm();
  });

  for (int i = 0; i < 300; ++i) {
    const size_t buffered = (mode_ == EngineMode::Dop) ? dopRing_.available() : ring_.available();
    const size_t target = static_cast<size_t>(outRate_ / 20);
    if (buffered >= target) break;
    if (!active_.load(std::memory_order_acquire)) break;
    std::this_thread::sleep_for(std::chrono::milliseconds(2));
  }
  const std::string startupError = lastError();
  if (!startupError.empty() || !active_.load(std::memory_order_acquire)) {
    if (error) *error = startupError.empty() ? "decoder stopped during startup" : startupError;
    stop();
    return false;
  }
  if (!reuse) {
    if (!output_->start(&err)) {
      if (error) *error = err;
      stop();
      return false;
    }
  }

  // The new source is buffered and the unit is running: release the swap gate
  // and ramp the new waveform in so the first sample is never a step.
  const int fadeInRate = std::max(1, outRate_);
  const uint64_t fadeInFrames = hadLiveOutput ? switchFadeFrames(fadeInRate) : 0;
  const bool fadeIn = hadLiveOutput && newMode == EngineMode::Pcm && fadeInFrames > 0;
  if (fadeIn) {
    beginSwitchFade(0.0f, 1.0f, fadeInFrames);
  } else {
    resetSwitchFade(1.0f);
  }
  switchSwapActive_.store(false, std::memory_order_release);
  if (fadeIn) waitForSwitchFade(fadeInRate);
  return true;
}

bool Engine::seek(double seconds, std::string* error) {
  if (!active_.load(std::memory_order_acquire)) {
    if (error) *error = "not playing";
    return false;
  }
  const double target = std::max(0.0, seconds);
  {
    std::lock_guard lock(nextMutex_);
    nextValid_ = false;  // the controller re-arms the preload after seeking
  }
  boundaryValid_.store(false, std::memory_order_release);
  advancePending_.store(false, std::memory_order_release);
  trackStartFrame_.store(framesRendered_.load(std::memory_order_relaxed), std::memory_order_release);
  trackStartPosition_.store(target, std::memory_order_release);
  pendingSeekSeconds_.store(target, std::memory_order_release);
  seekRequested_.store(true, std::memory_order_release);
  return true;
}

bool Engine::recover(double position, std::string* error) {
  std::string path, trackId, nextPath, nextTrackId;
  {
    std::lock_guard lock(mutex_);
    path = path_;
    trackId = trackId_;
  }
  if (path.empty()) {
    if (error) *error = "nothing to recover";
    return false;
  }
  {
    std::lock_guard lock(nextMutex_);
    if (nextValid_) {
      nextPath = nextPath_;
      nextTrackId = nextTrackId_;
    }
  }
  // Recovery exists for stalled units and route changes: rebuild the hardware
  // path instead of reusing it, but keep the same source/position.
  return playInternal(path, std::max(0.0, position), error, trackId, nextPath, nextTrackId, true);
}

Json Engine::status() const {
  Json j = Json::object();
  j.set("active", active_.load());
  j.set("playing", playing_.load());
  j.set("paused", paused_.load());
  j.set("finished", finished_.load());
  j.set("position", position());
  j.set("duration", duration_);
  j.set("mode", mode_ == EngineMode::Dop ? "dop" : "pcm");
  j.set("sourceRate", srcRate_);
  j.set("outputRate", outRate_);
  j.set("dsdRate", mode_ == EngineMode::Dop ? dsdRate_ : 0);
  j.set("carrierRate", mode_ == EngineMode::Dop ? carrierRate_ : 0);
  j.set("sourceChannels", srcChannels_);
  j.set("bufferedFrames", static_cast<int64_t>(mode_ == EngineMode::Dop ? dopRing_.available() : ring_.available()));
  j.set("decodedFrames", static_cast<int64_t>(framesDecoded_.load()));
  j.set("volume", volume_.load());
  Json cross = Json::object();
  cross.set("enabled", crossfeedEnabled_.load());
  cross.set("strength", crossfeedStrength_.load());
  j.set("crossfeed", cross);
  Json spatial = Json::object();
  spatial.set("enabled", spatialEnabled_.load());
  spatial.set("x", spatialX_.load());
  spatial.set("y", spatialY_.load());
  j.set("spatial", spatial);
  j.set("path", sourcePath());
  j.set("trackId", trackId());
  j.set("outputOpens", static_cast<int64_t>(outputOpens_.load()));
  j.set("outputReopens", static_cast<int64_t>(outputReopens_.load()));
  j.set("outputReuses", static_cast<int64_t>(outputReuses_.load()));
  j.set("switchFadeMs", switchFadeMs_.load());
  if (output_) {
    j.set("outputOpen", output_->isOpen());
    j.set("device", output_->deviceName());
    j.set("hog", output_->hogAcquired());
    j.set("format", output_->actualFormat());
    j.set("underruns", static_cast<int64_t>(output_->underruns()));
    j.set("callbacks", static_cast<int64_t>(output_->callbacks()));
    j.set("routeChanged", output_->routeChanged());
  }
  const std::string err = lastError();
  if (!err.empty()) j.set("error", err);
  return j;
}

}  // namespace phq
