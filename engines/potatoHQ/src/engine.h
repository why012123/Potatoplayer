// potatoHQ — realtime playback engine (decode -> EQ -> resample -> CoreAudio / DoP).
#pragma once

#include <atomic>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#include "audio.h"
#include "dsp/eq.h"
#include "dsp/resampler.h"
#include "dsp/spatial.h"
#include "dsp/spectrum.h"
#include "dsp/crossfeed.h"
#include "json.h"
#include "out/coreaudio_out.h"

namespace phq {

enum class EngineMode { Pcm, Dop };

struct EngineOptions {
  std::string deviceId;   // empty = system default
  bool exclusive = false;  // Hog Mode is opt-in: shared output is far less fragile
  bool followSourceRate = true;  // switch the device to the source rate when supported
  int channels = 2;
  int tapsPerPhase = 128;
  double volume = 0.3;
  std::vector<EqBand> eqBands;
  double preampDb = 0.0;
  int dsdMult = 0;      // 0 = PCM; 64/128/256 = DoP carrier
  int sdmOrder = 7;
  double dsdGainDb = -3.0;
};

class Engine {
 public:
  Engine() = default;
  ~Engine();

  bool play(const std::string& path, double startSeconds, std::string* error,
            const std::string& trackId = {}, const std::string& nextPath = {},
            const std::string& nextTrackId = {});
  // Preload/replace the track that follows the current one (gapless hand-off).
  void setNext(const std::string& path, const std::string& trackId);
  // Control-thread hook: reports a gapless boundary the render thread crossed.
  bool consumeTrackAdvance(std::string* path, std::string* trackId, double* duration);
  void stop();
  void togglePause();
  void pause();
  void resume();
  bool seek(double seconds, std::string* error);
  void setVolume(double v);
  void applyEq(const std::vector<EqBand>& bands, double preampDb);
  void setOutputOptions(const std::string& deviceId, bool exclusive);
  void setUpsampling(int tapsPerPhase);
  void setChannels(int channels);
  void setExclusive(bool exclusive);
  void setFollowSourceRate(bool follow);
  void setSpatial(bool enabled, double x, double y);
  void setVisualization(bool enabled);
  void setCrossfeed(bool enabled, double strength);
  bool spectrumBars(float* bars, size_t count);
  bool visualizationDemand() const { return visualizationDemand_.load(std::memory_order_acquire); }
  void setDsd(int mult);          // 0 disables DoP
  void setSdmOrder(int order);
  std::string deviceId() const;
  bool exclusive() const;

  bool active() const { return active_.load(std::memory_order_acquire); }
  bool playing() const { return playing_.load(std::memory_order_acquire); }
  bool paused() const { return paused_.load(std::memory_order_acquire); }
  bool finished() const { return finished_.load(std::memory_order_acquire); }
  double position() const;
  std::string trackId() const;
  double duration() const { return duration_; }
  int outputSampleRate() const { return outRate_; }
  int sourceSampleRate() const { return srcRate_; }
  EngineMode mode() const { return mode_; }
  std::string sourcePath() const;

  Json status() const;
  std::string lastError() const;

 private:
  void decodeLoopPcm();
  void decodeLoopDop();
  void render(void* data, size_t frames);
  void renderPcm(float* out, size_t frames);
  void renderDop(void* data, size_t frames);
  void joinWorker();

  mutable std::mutex mutex_;
  std::string path_;
  std::string trackId_;
  double startSeconds_ = 0.0;
  double duration_ = 0.0;
  int srcRate_ = 0;
  int outRate_ = 0;
  int srcChannels_ = 0;
  int dsdRate_ = 0;
  int carrierRate_ = 0;
  EngineMode mode_ = EngineMode::Pcm;
  int sdmOrder_ = 7;
  double dsdGainDb_ = -3.0;
  uint64_t dopMarkerIndex_ = 0;

  std::atomic<bool> active_{false};
  std::atomic<bool> playing_{false};
  std::atomic<bool> paused_{false};
  std::atomic<bool> finished_{false};
  std::atomic<bool> stopRequested_{false};
  std::atomic<bool> seekRequested_{false};
  std::atomic<double> pendingSeekSeconds_{0.0};
  // True once the decoder has no further segment; a short final read is a
  // normal drain, not an underrun.
  std::atomic<bool> decoderEof_{false};
  std::atomic<uint64_t> framesRendered_{0};
  std::atomic<uint64_t> framesDecoded_{0};
  std::atomic<double> volume_{0.3};
  std::atomic<double> volumeApplied_{-1.0};
  std::atomic<uint64_t> eqRevision_{0};
  std::atomic<bool> spatialEnabled_{false};
  std::atomic<double> spatialX_{0.0};
  std::atomic<double> spatialY_{0.0};
  std::atomic<uint64_t> spatialRevision_{0};
  SpectrumAnalyzer spectrum_;
  std::atomic<bool> visualizationDemand_{false};
  std::atomic<bool> crossfeedEnabled_{false};
  std::atomic<double> crossfeedStrength_{0.5};
  std::atomic<uint64_t> crossfeedRevision_{0};

  // Gapless hand-off state.
  mutable std::mutex nextMutex_;
  std::string nextPath_;
  std::string nextTrackId_;
  bool nextValid_ = false;
  mutable std::mutex pendingMutex_;
  std::string pendingPath_;
  std::string pendingTrackId_;
  double pendingDuration_ = 0.0;
  std::atomic<uint64_t> boundaryFrames_{0};
  std::atomic<bool> boundaryValid_{false};
  std::atomic<bool> advancePending_{false};
  // Position model: seconds = trackStartPosition + (framesRendered - trackStartFrame)/rate.
  std::atomic<uint64_t> trackStartFrame_{0};
  std::atomic<double> trackStartPosition_{0.0};

  FloatRing ring_;
  Int32Ring dopRing_;
  std::unique_ptr<CoreAudioOutput> output_;
  std::thread worker_;
  std::vector<EqBand> eqBands_;
  double preampDb_ = 0.0;
  EngineOptions options_;
  std::string lastError_;
};

}  // namespace phq
