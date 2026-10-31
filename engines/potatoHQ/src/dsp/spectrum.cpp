#include "dsp/spectrum.h"

#include <algorithm>
#include <cmath>

#include "audio.h"

namespace phq {
namespace {
// In-place iterative radix-2 FFT.
void fft(std::vector<float>& re, std::vector<float>& im) {
  const size_t n = re.size();
  for (size_t i = 1, j = 0; i < n; ++i) {
    size_t bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      std::swap(re[i], re[j]);
      std::swap(im[i], im[j]);
    }
  }
  for (size_t len = 2; len <= n; len <<= 1) {
    const double ang = -2.0 * M_PI / static_cast<double>(len);
    const float wr = static_cast<float>(std::cos(ang));
    const float wi = static_cast<float>(std::sin(ang));
    for (size_t i = 0; i < n; i += len) {
      float cr = 1.0f, ci = 0.0f;
      for (size_t j = 0; j < len / 2; ++j) {
        const float ur = re[i + j], ui = im[i + j];
        const float vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci;
        const float vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j] = ur + vr;
        im[i + j] = ui + vi;
        re[i + j + len / 2] = ur - vr;
        im[i + j + len / 2] = ui - vi;
        const float ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}
}  // namespace

void SpectrumAnalyzer::configure(int sampleRate) {
  sampleRate_ = std::max(8000, sampleRate);
  window_.resize(kFftSize);
  for (size_t i = 0; i < kFftSize; ++i) {
    const double t = 2.0 * M_PI * static_cast<double>(i) / static_cast<double>(kFftSize - 1);
    window_[i] = static_cast<float>(0.5 * (1.0 - std::cos(t)));  // Hann
  }
  barsDb_.assign(kBands, -90.0f);
  ring_.fill(0.0f);
  write_.store(0, std::memory_order_relaxed);
  haveBars_ = false;
}

void SpectrumAnalyzer::reset() {
  ring_.fill(0.0f);
  write_.store(0, std::memory_order_relaxed);
  barsDb_.assign(kBands, -90.0f);
  haveBars_ = false;
}

void SpectrumAnalyzer::push(const float* interleaved, size_t frames, int channels) {
  if (!enabled_.load(std::memory_order_relaxed) || channels < 1) return;
  const size_t ch = static_cast<size_t>(channels);
  uint64_t w = write_.load(std::memory_order_relaxed);
  for (size_t f = 0; f < frames; ++f) {
    float mono = interleaved[f * ch];
    if (ch > 1) mono = 0.5f * (mono + interleaved[f * ch + 1]);
    ring_[static_cast<size_t>(w & (kRing - 1))] = mono;
    ++w;
  }
  write_.store(w, std::memory_order_release);
}

bool SpectrumAnalyzer::compute(float* bars, size_t count) {
  if (bars == nullptr || count == 0) return false;
  const uint64_t w = write_.load(std::memory_order_acquire);
  if (w < kFftSize) return false;

  std::vector<float> re(kFftSize), im(kFftSize, 0.0f);
  for (size_t i = 0; i < kFftSize; ++i) {
    re[i] = ring_[static_cast<size_t>((w - kFftSize + i) & (kRing - 1))] * window_[i];
  }
  fft(re, im);

  const double binHz = static_cast<double>(sampleRate_) / static_cast<double>(kFftSize);
  const size_t usable = std::min(count, kBands);
  for (size_t b = 0; b < usable; ++b) {
    // Log-spaced bands 30 Hz .. 16 kHz.
    const double t0 = static_cast<double>(b) / static_cast<double>(usable);
    const double t1 = static_cast<double>(b + 1) / static_cast<double>(usable);
    const double f0 = 30.0 * std::pow(16000.0 / 30.0, t0);
    const double f1 = 30.0 * std::pow(16000.0 / 30.0, t1);
    size_t k0 = std::max<size_t>(1, static_cast<size_t>(f0 / binHz));
    size_t k1 = std::max<size_t>(k0 + 1, static_cast<size_t>(f1 / binHz));
    k1 = std::min(k1, kFftSize / 2);
    double power = 0.0;
    for (size_t k = k0; k < k1; ++k) power += static_cast<double>(re[k]) * re[k] + static_cast<double>(im[k]) * im[k];
    power /= static_cast<double>(std::max<size_t>(1, k1 - k0));
    // Normalise: Hann window / FFT size, then map -80..0 dB to 0..1.
    double db = 10.0 * std::log10(power + 1e-20) - 20.0 * std::log10(static_cast<double>(kFftSize) / 4.0);
    db = clampd(db, -80.0, 0.0);
    const double target = (db + 80.0) / 80.0;
    // Attack fast, release slow, so the bars look musical instead of jittery.
    const double prev = barsDb_[b];
    const double smoothed = target > prev ? prev + (target - prev) * 0.6 : prev + (target - prev) * 0.18;
    barsDb_[b] = static_cast<float>(smoothed);
  }
  for (size_t b = usable; b < count; ++b) bars[b] = 0.0f;
  for (size_t b = 0; b < usable; ++b) bars[b] = static_cast<float>(clampd(barsDb_[b], 0.0, 1.0));
  haveBars_ = true;
  return true;
}

}  // namespace phq
