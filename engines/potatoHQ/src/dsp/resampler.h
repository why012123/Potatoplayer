// potatoHQ — rational polyphase FIR sample-rate converter (double precision).
#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace phq {

struct ResamplerConfig {
  // Taps per polyphase branch. 64 ~= 80 dB, 128 ~= 120 dB, 192 ~= 140 dB
  // (Kaiser design, 0.45/0.5 transition relative to the lower Nyquist).
  int tapsPerPhase = 128;
  double attenuationDb = 120.0;
  double passbandEdge = 0.45;  // fraction of the lower Nyquist
};

class PolyphaseResampler {
 public:
  bool configure(int fsIn, int fsOut, const ResamplerConfig& cfg, std::string* error);
  void reset();

  // Streams interleaved float frames in -> interleaved float frames out.
  void process(const float* in, size_t frames, std::vector<float>& out);

  // Feeds zero padding so the FIR tail drains. Output may be trimmed by caller.
  void flush(std::vector<float>& out);

  bool bypass() const { return bypass_; }
  int inputRate() const { return fsIn_; }
  int outputRate() const { return fsOut_; }
  int upFactor() const { return L_; }
  int downFactor() const { return M_; }
  // Group delay expressed in output frames.
  size_t latencyOutputFrames() const { return latencyOut_; }
  uint64_t producedFrames() const { return outIndex_; }
  uint64_t consumedFrames() const { return inCount_; }

 private:
  void produce(std::vector<float>& out);

  bool bypass_ = false;
  int fsIn_ = 0, fsOut_ = 0, channels_ = 2;
  int L_ = 1, M_ = 1;
  int taps_ = 0;  // K
  int64_t inCount_ = 0;
  int64_t outIndex_ = 0;
  size_t latencyOut_ = 0;
  std::vector<std::vector<double>> phaseTaps_;  // [L][K]
  // Linear history: K frames of past input, then the incoming chunk.
  std::vector<double> buf_;
  bool configured_ = false;
};

}  // namespace phq
