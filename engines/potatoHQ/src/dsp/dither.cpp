#include "dsp/dither.h"

#include <cmath>
#include <cstring>

#include "audio.h"

namespace phq {

void Ditherer::configure(const DitherConfig& cfg, int channels) {
  cfg_ = cfg;
  channels_ = channels < 1 ? 1 : channels;
  int bits = cfg.bits;
  if (bits < 8) bits = 8;
  if (bits > 32) bits = 32;
  scale_ = std::pow(2.0, bits - 1);
  rng_.assign(static_cast<size_t>(channels_), 0x9E3779B9u);
  for (size_t c = 0; c < rng_.size(); ++c)
    rng_[c] = 0x9E3779B9u + static_cast<uint32_t>(c) * 0x85EBCA6Bu;
  prevNoise_.assign(static_cast<size_t>(channels_), 0.0);
  err1_.assign(static_cast<size_t>(channels_), 0.0);
  err2_.assign(static_cast<size_t>(channels_), 0.0);
}

void Ditherer::reset() {
  for (size_t c = 0; c < rng_.size(); ++c)
    rng_[c] = 0x9E3779B9u + static_cast<uint32_t>(c) * 0x85EBCA6Bu;
  std::fill(prevNoise_.begin(), prevNoise_.end(), 0.0);
  std::fill(err1_.begin(), err1_.end(), 0.0);
  std::fill(err2_.begin(), err2_.end(), 0.0);
}

double Ditherer::nextUniform() {
  // xorshift32 -> [0,1)
  uint32_t& s = rng_[0];
  s ^= s << 13;
  s ^= s >> 17;
  s ^= s << 5;
  return static_cast<double>(s) / 4294967296.0;
}

void Ditherer::process(float* interleaved, size_t frames) {
  if (cfg_.mode == DitherMode::None || interleaved == nullptr) return;
  const size_t ch = static_cast<size_t>(channels_);
  const double lsb = 1.0 / scale_;
  for (size_t f = 0; f < frames; ++f) {
    for (size_t c = 0; c < ch; ++c) {
      uint32_t& s = rng_[c];
      s ^= s << 13;
      s ^= s >> 17;
      s ^= s << 5;
      const double u1 = static_cast<double>(s) / 4294967296.0;
      s ^= s << 13;
      s ^= s >> 17;
      s ^= s << 5;
      const double u2 = static_cast<double>(s) / 4294967296.0;

      const double x = static_cast<double>(interleaved[f * ch + c]);
      double dither = (u1 - u2) * lsb;  // TPDF, 1 LSB peak-to-peak
      if (cfg_.mode == DitherMode::TpdfHighpass) {
        const double hp = dither - prevNoise_[c];
        prevNoise_[c] = dither;
        dither = hp;
      }

      double shaped = x;
      if (cfg_.mode == DitherMode::NoiseShaped) {
        // Second-order error feedback (moderate, stable at any bit depth).
        shaped += 2.0 * err1_[c] - err2_[c];
      }

      double q = std::round((shaped + dither) * scale_) / scale_;
      if (q > 1.0 - lsb) q = 1.0 - lsb;
      if (q < -1.0) q = -1.0;

      if (cfg_.mode == DitherMode::NoiseShaped) {
        const double err = q - shaped;
        err2_[c] = err1_[c];
        err1_[c] = err;
      }
      interleaved[f * ch + c] = static_cast<float>(q);
    }
  }
}

}  // namespace phq
