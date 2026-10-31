#include "dsp/crossfeed.h"

#include <algorithm>
#include <cmath>

#include "audio.h"

namespace phq {

void CrossfeedProcessor::configure(int sampleRate, int channels) {
  sampleRate_ = std::max(8000, sampleRate);
  channels_ = std::clamp(channels, 1, 2);
  delaySamples_ = std::max<size_t>(1, static_cast<size_t>(0.0003 * sampleRate_));
  const size_t size = delaySamples_ + 4;
  delayL_.assign(size, 0.0f);
  delayR_.assign(size, 0.0f);
  delayPos_ = 0;
  lpL_ = Biquad::lowpass(static_cast<double>(sampleRate_), 700.0, 0.707);
  lpR_ = lpL_;
  configured_ = 1;
  reset();
}

void CrossfeedProcessor::reset() {
  std::fill(delayL_.begin(), delayL_.end(), 0.0f);
  std::fill(delayR_.begin(), delayR_.end(), 0.0f);
  delayPos_ = 0;
  lpL_.reset();
  lpR_.reset();
}

void CrossfeedProcessor::setTarget(bool enabled, double strength) {
  enabled_ = enabled;
  strength_ = clampd(strength, 0.0, 1.0);
  gain_ = 0.5 * strength_;
  mix_ = 1.0 / (1.0 + gain_);
}

void CrossfeedProcessor::process(float* interleaved, size_t frames) {
  if (!configured_ || !enabled_ || channels_ < 2 || interleaved == nullptr) return;
  const size_t n = delayL_.size();
  for (size_t f = 0; f < frames; ++f) {
    const float inL = interleaved[f * 2];
    const float inR = interleaved[f * 2 + 1];
    const size_t read = (delayPos_ + n - delaySamples_) % n;
    // Cross path: delayed copy of the opposite channel, low-passed per ear.
    const double crossL = lpL_.process(delayR_[read]);
    const double crossR = lpR_.process(delayL_[read]);
    delayL_[delayPos_] = inL;
    delayR_[delayPos_] = inR;
    interleaved[f * 2] = static_cast<float>((inL + gain_ * crossL) * mix_);
    interleaved[f * 2 + 1] = static_cast<float>((inR + gain_ * crossR) * mix_);
    delayPos_ = (delayPos_ + 1) % n;
  }
}

}  // namespace phq
