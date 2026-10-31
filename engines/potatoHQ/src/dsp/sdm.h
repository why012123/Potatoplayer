// potatoHQ — delta-sigma (SDM) modulator: 1-bit output at the DSD rate.
//
// Error-feedback topology with an analytic NTF:
//   H(z) = ((1 - z^-1) / (1 - r z^-1))^N ,  r chosen from the target
//   out-of-band gain; the feedback filter is F(z) = 1 - H(z) = (D-N)/D.
#pragma once

#include <cstdint>
#include <vector>

namespace phq {

struct SdmConfig {
  int order = 5;                 // 3..8
  double outOfBandGain = 1.5;    // NTF peak gain (stability vs. noise floor)
  double inputGainDb = -3.0;     // headroom before modulation
  double stabilityLimit = 3.5;   // decision clamp
  double ditherAmplitude = 1e-7;
  double idleLockSeconds = 0.05; // emit 0x69 after this much digital silence
};

class SdmModulator {
 public:
  bool configure(const SdmConfig& cfg, int channels);
  void reset();

  // in: interleaved double at the DSD rate (frames per channel).
  // out: planar packed bytes, channels * (frames/8) bytes, LSB-first bit order.
  void process(const double* in, size_t frames, std::vector<uint8_t>& outPlanar);

  int order() const { return cfg_.order; }
  double ntfPeakGain() const { return cfg_.outOfBandGain; }
  uint64_t recoveries() const { return recoveries_; }
  double peakFeedback() const { return peakFeedback_; }
  size_t latencyBits() const { return 0; }

 private:
  struct ChannelState {
    std::vector<double> error;
    std::vector<double> feedback;
    double previous = 0.0;
    uint32_t idleRun = 0;
    bool idleLocked = false;
    uint8_t pendingByte = 0;
    int pendingBits = 0;
  };

  void resetChannel(ChannelState& st);
  void designNtf();

  SdmConfig cfg_;
  int channels_ = 2;
  std::vector<double> num_;
  std::vector<double> den_;
  double inputGain_ = 1.0;
  double idleThresholdIn_ = 1e-7;
  double idleThresholdOut_ = 2e-6;
  uint32_t idleFrames_ = 0;
  std::vector<ChannelState> state_;
  uint64_t recoveries_ = 0;
  double peakFeedback_ = 0.0;
};

}  // namespace phq
