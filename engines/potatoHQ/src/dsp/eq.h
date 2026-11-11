// potatoHQ — 10-band peaking EQ (Super's VLC layout) with click-free reconfiguration
// and automatic headroom so a boost can never exceed 0 dBFS.
#pragma once

#include <vector>

#include "dsp/filters.h"

namespace phq {

struct EqBand {
  double freq = 1000.0;
  double gainDb = 0.0;
  double q = 1.4;
};

class ChannelEq {
 public:
  static constexpr int kFadeFrames = 2048;  // ~46 ms at 44.1 kHz

  void configure(int sampleRate, int channels, const std::vector<EqBand>& bands, double preampDb);
  void setTarget(int sampleRate, int channels, const std::vector<EqBand>& bands, double preampDb);
  void reset();
  void process(float* interleaved, size_t frames);

  bool active() const { return current_.active || (fading_ && next_.active); }
  bool fading() const { return fading_; }
  int fadeRemaining() const { return fadeRemaining_; }
  // Attenuation applied on top of the requested preamp to keep peak <= 0 dB.
  double autoHeadroomDb() const { return current_.autoHeadroomDb; }
  double peakGainDb() const { return current_.peakGainDb; }

  static const std::vector<double>& defaultFrequencies();

 private:
  struct Bank {
    bool active = false;
    double preamp = 1.0;
    double peakGainDb = 0.0;
    double autoHeadroomDb = 0.0;
    std::vector<Biquad> filters;  // channels * bands
    void build(int fs, int channels, const std::vector<EqBand>& bands, double preampDb);
    inline double run(double x, size_t channel, size_t bands) {
      Biquad* chain = &filters[channel * bands];
      for (size_t b = 0; b < bands; ++b) x = chain[b].process(x);
      return x * preamp;
    }
  };

  Bank current_;
  Bank next_;
  bool fading_ = false;
  int fadeRemaining_ = 0;
  int fadeTotal_ = 1;
  int channels_ = 2;
  int sampleRate_ = 44100;
  size_t bands_ = 0;
};

}  // namespace phq
