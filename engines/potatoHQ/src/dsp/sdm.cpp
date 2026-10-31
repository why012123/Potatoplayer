#include "dsp/sdm.h"

#include <algorithm>
#include <cmath>

#include "audio.h"

namespace phq {

void SdmModulator::designNtf() {
  const int n = std::clamp(cfg_.order, 1, 8);
  num_.assign(static_cast<size_t>(n), 0.0);
  den_.assign(static_cast<size_t>(n), 0.0);
  const double peak = std::max(1.01, cfg_.outOfBandGain);
  const double r = 2.0 / std::pow(peak, 1.0 / static_cast<double>(n)) - 1.0;
  double binomial = 1.0;
  for (int t = 1; t <= n; ++t) {
    binomial *= static_cast<double>(n - t + 1) / static_cast<double>(t);
    const double d = binomial * std::pow(-r, t);
    const double nn = binomial * std::pow(-1.0, t);
    den_[static_cast<size_t>(t - 1)] = d;
    // The code stores err = decision - quantized (the negated quantizer
    // error), so the loop needs F = 1 - H to realise NTF = H.
    num_[static_cast<size_t>(t - 1)] = d - nn;
  }
}

bool SdmModulator::configure(const SdmConfig& cfg, int channels) {
  cfg_ = cfg;
  cfg_.order = std::clamp(cfg.order, 1, 8);
  channels_ = channels < 1 ? 1 : channels;
  designNtf();
  inputGain_ = dbToGain(cfg_.inputGainDb);
  idleFrames_ = static_cast<uint32_t>(std::max(0.0, cfg_.idleLockSeconds) * 2822400.0);
  state_.assign(static_cast<size_t>(channels_), ChannelState{});
  for (auto& st : state_) {
    st.error.assign(static_cast<size_t>(cfg_.order), 0.0);
    st.feedback.assign(static_cast<size_t>(cfg_.order), 0.0);
  }
  recoveries_ = 0;
  peakFeedback_ = 0.0;
  return true;
}

void SdmModulator::resetChannel(ChannelState& st) {
  std::fill(st.error.begin(), st.error.end(), 0.0);
  std::fill(st.feedback.begin(), st.feedback.end(), 0.0);
  st.previous = 0.0;
}

void SdmModulator::reset() {
  for (auto& st : state_) {
    resetChannel(st);
    st.idleRun = 0;
    st.idleLocked = false;
    st.pendingByte = 0;
    st.pendingBits = 0;
  }
  recoveries_ = 0;
  peakFeedback_ = 0.0;
}

void SdmModulator::process(const double* in, size_t frames, std::vector<uint8_t>& outPlanar) {
  const size_t ch = static_cast<size_t>(channels_);
  const size_t order = static_cast<size_t>(cfg_.order);
  const size_t outBytes = (frames + 7) / 8;
  outPlanar.assign(outBytes * ch, 0x69);

  for (size_t f = 0; f < frames; ++f) {
    for (size_t c = 0; c < ch; ++c) {
      ChannelState& st = state_[c];
      const double raw = static_cast<double>(in[f * ch + c]) * inputGain_;

      // Idle lock: freeze the modulator on digital silence to avoid limit cycles.
      const double mag = std::abs(raw);
      if (mag <= idleThresholdIn_) {
        if (st.idleRun < 0xFFFFFFFFu) ++st.idleRun;
        if (!st.idleLocked && idleFrames_ > 0 && st.idleRun >= idleFrames_) {
          st.idleLocked = true;
          resetChannel(st);
        }
      } else {
        st.idleRun = 0;
        if (st.idleLocked && mag > idleThresholdOut_) st.idleLocked = false;
      }

      uint8_t bit = 0;
      if (!st.idleLocked) {
        const double u = clampd(raw, -0.98, 0.98);
        double fb = 0.0;
        for (size_t t = 0; t < order; ++t) {
          fb += num_[t] * st.error[t];
          fb -= den_[t] * st.feedback[t];
        }
        if (!std::isfinite(fb) || std::abs(fb) > 4.0) {
          resetChannel(st);
          fb = 0.0;
          ++recoveries_;
        }
        peakFeedback_ = std::max(peakFeedback_, std::abs(fb));

        // Tiny dither decorrelates the quantizer from the signal.
        double decision = u + fb;
        if (cfg_.ditherAmplitude > 0.0) {
          static thread_local uint32_t s = 0x12345678u;
          s ^= s << 13;
          s ^= s >> 17;
          s ^= s << 5;
          const double d = (static_cast<double>(s) / 4294967296.0 - 0.5) * 2.0;
          decision += d * cfg_.ditherAmplitude;
        }
        decision = clampd(decision, -cfg_.stabilityLimit, cfg_.stabilityLimit);
        const bool one = decision >= 0.0;
        const double q = one ? 1.0 : -1.0;
        const double err = decision - q;

        for (size_t t = order; t-- > 1;) {
          st.error[t] = st.error[t - 1];
          st.feedback[t] = st.feedback[t - 1];
        }
        if (order > 0) {
          st.error[0] = err;
          st.feedback[0] = fb;
        }
        st.previous = u;
        bit = one ? 1u : 0u;
      }

      // LSB-first packing (DSF native order).
      if (bit) st.pendingByte = static_cast<uint8_t>(st.pendingByte | (1u << st.pendingBits));
      if (++st.pendingBits == 8) {
        const size_t byteIndex = f / 8;
        outPlanar[c * outBytes + byteIndex] = st.pendingByte;
        st.pendingByte = 0;
        st.pendingBits = 0;
      }
    }
  }
}

}  // namespace phq
