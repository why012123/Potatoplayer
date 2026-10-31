// potatoHQ — filter design (Kaiser-windowed sinc, half-band, RBJ biquads).
#pragma once

#include <cmath>
#include <cstddef>
#include <vector>

namespace phq {

double besselI0(double x);
double kaiserBetaForAttenuation(double attenuationDb);

// Designs a linear-phase low-pass with unity DC gain.
//   taps: output, length n
//   cutoff: normalized to the sample rate (cycles/sample), e.g. 0.5/16 for 16x upsampling
//   attenuationDb: stop-band attenuation target
void designLowpass(std::vector<double>& taps, size_t n, double cutoff, double attenuationDb);

// Designs `phases` * `tapsPerPhase` prototype taps for polyphase resampling and
// normalizes so that sum(h) == phases (compensates zero-stuffing attenuation).
void designPolyphase(std::vector<double>& h, int phases, int tapsPerPhase, double cutoff,
                     double attenuationDb);

// RBJ biquad, double precision, transposed direct form II.
struct Biquad {
  double b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
  double z1 = 0, z2 = 0;

  void reset() { z1 = z2 = 0.0; }
  inline double process(double x) {
    const double y = b0 * x + z1;
    z1 = b1 * x - a1 * y + z2;
    z2 = b2 * x - a2 * y;
    return y;
  }

  static Biquad peaking(double fs, double freq, double q, double gainDb);
  static Biquad lowShelf(double fs, double freq, double slope, double gainDb);
  static Biquad highShelf(double fs, double freq, double slope, double gainDb);
  static Biquad lowpass(double fs, double freq, double q);
  static Biquad highpass(double fs, double freq, double q);
};

}  // namespace phq
