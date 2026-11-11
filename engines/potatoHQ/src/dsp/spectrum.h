// potatoHQ — realtime spectrum tap for the UI (never touches the audio path).
//
// The render callback only copies mono samples into a fixed ring; a control
// thread snapshots it, runs a 2048-point FFT and aggregates 48 log-spaced bands.
#pragma once

#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <vector>

namespace phq {

class SpectrumAnalyzer {
 public:
  static constexpr size_t kFftSize = 2048;
  static constexpr size_t kRing = 8192;
  static constexpr size_t kBands = 48;

  void configure(int sampleRate);
  void setEnabled(bool enabled) { enabled_.store(enabled, std::memory_order_release); }
  bool enabled() const { return enabled_.load(std::memory_order_acquire); }

  // Render thread: mono downmix into the lock-free ring (no allocation).
  void push(const float* interleaved, size_t frames, int channels);

  // Control thread: computes smoothed 0..1 bars from the latest window.
  bool compute(float* bars, size_t count);

  void reset();

 private:
  std::array<float, kRing> ring_{};
  std::atomic<uint64_t> write_{0};
  std::atomic<bool> enabled_{false};
  int sampleRate_ = 44100;
  std::vector<float> window_;
  std::vector<float> barsDb_;
  bool haveBars_ = false;
};

}  // namespace phq
