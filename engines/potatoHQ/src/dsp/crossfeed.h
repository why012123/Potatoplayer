// potatoHQ — crossfeed for headphone listening (Bauer/bs2b-style).
//
// Blends a delayed, low-passed copy of the opposite channel into each ear:
//   outL = (inL + g * LP(delay(inR))) / (1 + g)
// The delay (~0.3 ms) and low-pass (~700 Hz) are what make hard-panned content
// feel less "inside the head". Disabled = strict bypass.
#pragma once

#include <vector>

#include "dsp/filters.h"

namespace phq {

class CrossfeedProcessor {
 public:
  void configure(int sampleRate, int channels);
  void reset();
  void setTarget(bool enabled, double strength);  // strength 0..1
  void process(float* interleaved, size_t frames);
  bool enabled() const { return enabled_; }

 private:
  int sampleRate_ = 44100;
  int channels_ = 2;
  bool enabled_ = false;
  double strength_ = 0.5;
  double gain_ = 0.5;
  double mix_ = 1.0;
  std::vector<float> delayL_, delayR_;
  size_t delayPos_ = 0;
  size_t delaySamples_ = 13;
  Biquad lpL_, lpR_;
  int configured_ = 0;
};

}  // namespace phq
