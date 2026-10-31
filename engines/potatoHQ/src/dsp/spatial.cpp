#include "dsp/spatial.h"

#include <algorithm>
#include <cmath>

#include "audio.h"

namespace phq {

namespace {
// Cubic Hermite interpolation of the delay line at a fractional sample delay.
double hermiteRead(const std::vector<float>& line, size_t writePos, double delay) {
  const size_t n = line.size();
  const double d = std::max(0.0, std::min(delay, static_cast<double>(n - 4)));
  const size_t i = static_cast<size_t>(std::floor(d));
  const double f = d - static_cast<double>(i);
  auto at = [&](size_t back) -> double {
    return line[(writePos + n - back) % n];
  };
  const double p0 = at(i);
  const double p1 = at(i + 1);
  const double pm1 = at(i == 0 ? n - 1 : i - 1);
  const double p2 = at(i + 2 >= n ? 0 : i + 2);
  const double c0 = p0;
  const double c1 = 0.5 * (p1 - pm1);
  const double c2 = pm1 - 2.5 * p0 + 2.0 * p1 - 0.5 * p2;
  const double c3 = 0.5 * (p2 - pm1) + 1.5 * (p0 - p1);
  return ((c3 * f + c2) * f + c1) * f + c0;
}
}  // namespace

void SpatialPanner::configure(int sampleRate, int channels) {
  sampleRate_ = std::max(8000, sampleRate);
  channels_ = std::clamp(channels, 1, 2);
  delayL_.assign(kMaxDelay, 0.0f);
  delayR_.assign(kMaxDelay, 0.0f);
  delayPosL_ = delayPosR_ = 0;
  // ~20 ms smoothing: fast enough to feel immediate, slow enough not to zip.
  smooth_ = 1.0 - std::exp(-1.0 / (static_cast<double>(sampleRate_) * 0.020));
  updateCoefficients();
  configured_ = true;
}

void SpatialPanner::updateCoefficients() {
  shelfL_ = Biquad::highShelf(static_cast<double>(sampleRate_), 3500.0, 0.7, -6.0);
  shelfR_ = shelfL_;
  shelfRate_ = sampleRate_;
}

void SpatialPanner::reset() {
  std::fill(delayL_.begin(), delayL_.end(), 0.0f);
  std::fill(delayR_.begin(), delayR_.end(), 0.0f);
  delayPosL_ = delayPosR_ = 0;
  shelfL_.reset();
  shelfR_.reset();
  x_ = target_.x;
  y_ = target_.y;
}

void SpatialPanner::setTarget(const SpatialConfig& target) {
  target_ = target;
  target_.x = clampd(target_.x, -1.0, 1.0);
  target_.y = clampd(target_.y, -1.0, 1.0);
}

void SpatialPanner::process(float* interleaved, size_t frames) {
  if (!configured_ || interleaved == nullptr || frames == 0) return;
  if (!target_.enabled) {
    if (wasEnabled_) {
      std::fill(delayL_.begin(), delayL_.end(), 0.0f);
      std::fill(delayR_.begin(), delayR_.end(), 0.0f);
      shelfL_.reset();
      shelfR_.reset();
      wasEnabled_ = false;
    }
    x_ = target_.x;
    y_ = target_.y;
    return;
  }
  if (!wasEnabled_) {
    std::fill(delayL_.begin(), delayL_.end(), 0.0f);
    std::fill(delayR_.begin(), delayR_.end(), 0.0f);
    shelfL_.reset();
    shelfR_.reset();
    wasEnabled_ = true;
  }
  if (shelfRate_ != sampleRate_) updateCoefficients();

  const size_t ch = static_cast<size_t>(channels_);
  for (size_t f = 0; f < frames; ++f) {
    x_ += (target_.x - x_) * smooth_;
    y_ += (target_.y - y_) * smooth_;

    // Feed the delay lines.
    const float inL = interleaved[f * ch];
    const float inR = ch > 1 ? interleaved[f * ch + 1] : inL;
    delayL_[delayPosL_] = inL;
    delayR_[delayPosR_] = inR;

    // ITD: delay the far ear by up to 0.6 ms, using a cubic Hermite fractional
    // delay so the cue does not step in whole samples (quality-first).
    const double maxDelay = 0.0006 * static_cast<double>(sampleRate_);
    const double dL = std::max(0.0, x_) * maxDelay;
    const double dR = std::max(0.0, -x_) * maxDelay;
    double l = hermiteRead(delayL_, delayPosL_, dL);
    double r = hermiteRead(delayR_, delayPosR_, dR);

    // ILD: equal-power pan, normalised so the near ear stays at unity and the
    // centre is unity on both sides (no level jump when enabling).
    const double a = (clampd(x_, -1.0, 1.0) + 1.0) * M_PI / 4.0;
    double gl = std::cos(a);
    double gr = std::sin(a);
    const double norm = std::max(gl, gr);
    if (norm > 1e-9) { gl /= norm; gr /= norm; }
    l *= gl;
    r *= gr;

    // Rear cue: blend towards a high-shelf-cut copy when the puck is behind.
    const double rear = clampd(-y_, 0.0, 1.0);
    const double shelfL = shelfL_.process(l);
    const double shelfR = shelfR_.process(r);
    l = l * (1.0 - rear) + shelfL * rear;
    r = r * (1.0 - rear) + shelfR * rear;

    // Distance: up to -6 dB at the rim.
    const double radius = clampd(std::hypot(x_, y_), 0.0, 1.0);
    const double gain = 1.0 - 0.55 * radius;
    l *= gain;
    r *= gain;

    interleaved[f * ch] = static_cast<float>(l);
    if (ch > 1) interleaved[f * ch + 1] = static_cast<float>(r);

    delayPosL_ = (delayPosL_ + 1) % kMaxDelay;
    delayPosR_ = (delayPosR_ + 1) % kMaxDelay;
  }
}

}  // namespace phq
