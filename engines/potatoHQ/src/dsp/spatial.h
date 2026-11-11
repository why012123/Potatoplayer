// potatoHQ — 2D positional panner for headphones ("virtual sound field").
//
// The source sits anywhere on a disc: x = left/right, y = front/back. Four cues
// are applied: interaural level difference, interaural time difference, a rear
// high-frequency shelf, and a distance gain. All parameters are smoothed so
// dragging the puck never clicks.
#pragma once

#include <vector>

#include "dsp/filters.h"

namespace phq {

struct SpatialConfig {
  bool enabled = false;
  double x = 0.0;  // -1 left .. +1 right
  double y = 0.0;  // -1 back  .. +1 front
};

class SpatialPanner {
 public:
  void configure(int sampleRate, int channels);
  void reset();
  // Smoothed towards the target on every processed block.
  void setTarget(const SpatialConfig& target);
  void process(float* interleaved, size_t frames);
  bool enabled() const { return target_.enabled; }
  double currentX() const { return x_; }
  double currentY() const { return y_; }

 private:
  void updateCoefficients();

  int sampleRate_ = 44100;
  int channels_ = 2;
  SpatialConfig target_{};
  double x_ = 0.0, y_ = 0.0;
  double smooth_ = 0.0;
  bool configured_ = false;
  bool wasEnabled_ = false;

  // Per-channel delay lines for ITD.
  static constexpr size_t kMaxDelay = 256;
  std::vector<float> delayL_, delayR_;
  size_t delayPosL_ = 0, delayPosR_ = 0;

  // Rear high-frequency shelf, one state per channel.
  Biquad shelfL_, shelfR_;
  int shelfRate_ = 0;
};

}  // namespace phq
