// potatoHQ — dither and noise shaping for integer PCM output.
#pragma once

#include <cstdint>
#include <vector>

namespace phq {

enum class DitherMode { None, Tpdf, TpdfHighpass, NoiseShaped };

struct DitherConfig {
  DitherMode mode = DitherMode::Tpdf;
  int bits = 24;  // target integer depth
};

class Ditherer {
 public:
  void configure(const DitherConfig& cfg, int channels);
  void reset();
  // Applies dither + quantization in place; output values land exactly on the
  // target integer grid so a following integer writer cannot re-quantize.
  void process(float* interleaved, size_t frames);
  DitherMode mode() const { return cfg_.mode; }
  int bits() const { return cfg_.bits; }

 private:
  double nextUniform();
  DitherConfig cfg_;
  int channels_ = 2;
  double scale_ = 8388608.0;
  std::vector<uint32_t> rng_;
  std::vector<double> prevNoise_;
  std::vector<double> err1_, err2_;
};

}  // namespace phq
