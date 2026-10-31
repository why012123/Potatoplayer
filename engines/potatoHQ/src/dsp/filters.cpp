#include "dsp/filters.h"

#include <algorithm>

namespace phq {

double besselI0(double x) {
  // Modified Bessel function of the first kind, order 0 (power series).
  double sum = 1.0;
  double term = 1.0;
  const double halfX = x * 0.5;
  for (int k = 1; k < 64; ++k) {
    term *= (halfX / k) * (halfX / k);
    sum += term;
    if (term < sum * 1e-17) break;
  }
  return sum;
}

double kaiserBetaForAttenuation(double attenuationDb) {
  const double a = attenuationDb;
  if (a > 50.0) return 0.1102 * (a - 8.7);
  if (a >= 21.0) return 0.5842 * std::pow(a - 21.0, 0.4) + 0.07886 * (a - 21.0);
  return 0.0;
}

namespace {
inline double sinc(double x) {
  if (std::abs(x) < 1e-12) return 1.0;
  const double px = M_PI * x;
  return std::sin(px) / px;
}
}  // namespace

void designLowpass(std::vector<double>& taps, size_t n, double cutoff, double attenuationDb) {
  if (n < 3) n = 3;
  if (n % 2 == 0) ++n;  // odd length -> integer group delay, symmetric
  taps.assign(n, 0.0);
  const double beta = kaiserBetaForAttenuation(attenuationDb);
  const double denom = besselI0(beta);
  const double center = (static_cast<double>(n) - 1.0) * 0.5;
  double sum = 0.0;
  for (size_t i = 0; i < n; ++i) {
    const double m = static_cast<double>(i) - center;
    const double r = (2.0 * m) / (static_cast<double>(n) - 1.0);
    const double w = besselI0(beta * std::sqrt(std::max(0.0, 1.0 - r * r))) / denom;
    const double h = 2.0 * cutoff * sinc(2.0 * cutoff * m) * w;
    taps[i] = h;
    sum += h;
  }
  if (sum != 0.0) {
    for (double& v : taps) v /= sum;  // unity DC gain
  }
}

void designPolyphase(std::vector<double>& h, int phases, int tapsPerPhase, double cutoff,
                     double attenuationDb) {
  if (phases < 1) phases = 1;
  if (tapsPerPhase < 4) tapsPerPhase = 4;
  const size_t n = static_cast<size_t>(phases) * static_cast<size_t>(tapsPerPhase);
  designLowpass(h, n, cutoff, attenuationDb);
  // Unity DC gain per phase would be wrong; the prototype must sum to `phases`
  // so that the interpolator output keeps the input amplitude.
  for (double& v : h) v *= static_cast<double>(phases);
}

Biquad Biquad::peaking(double fs, double freq, double q, double gainDb) {
  Biquad b;
  const double A = std::pow(10.0, gainDb / 40.0);
  const double w0 = 2.0 * M_PI * freq / fs;
  const double alpha = std::sin(w0) / (2.0 * std::max(0.05, q));
  const double cw = std::cos(w0);
  const double a0 = 1.0 + alpha / A;
  b.b0 = (1.0 + alpha * A) / a0;
  b.b1 = (-2.0 * cw) / a0;
  b.b2 = (1.0 - alpha * A) / a0;
  b.a1 = (-2.0 * cw) / a0;
  b.a2 = (1.0 - alpha / A) / a0;
  return b;
}

Biquad Biquad::lowShelf(double fs, double freq, double slope, double gainDb) {
  Biquad b;
  const double A = std::pow(10.0, gainDb / 40.0);
  const double w0 = 2.0 * M_PI * freq / fs;
  const double cw = std::cos(w0);
  const double sw = std::sin(w0);
  const double alpha = sw / 2.0 * std::sqrt((A + 1.0 / A) * (1.0 / std::max(0.1, slope) - 1.0) + 2.0);
  const double twoSqrtAalpha = 2.0 * std::sqrt(A) * alpha;
  const double a0 = (A + 1.0) + (A - 1.0) * cw + twoSqrtAalpha;
  b.b0 = A * ((A + 1.0) - (A - 1.0) * cw + twoSqrtAalpha) / a0;
  b.b1 = 2.0 * A * ((A - 1.0) - (A + 1.0) * cw) / a0;
  b.b2 = A * ((A + 1.0) - (A - 1.0) * cw - twoSqrtAalpha) / a0;
  b.a1 = -2.0 * ((A - 1.0) + (A + 1.0) * cw) / a0;
  b.a2 = ((A + 1.0) + (A - 1.0) * cw - twoSqrtAalpha) / a0;
  return b;
}

Biquad Biquad::highShelf(double fs, double freq, double slope, double gainDb) {
  Biquad b;
  const double A = std::pow(10.0, gainDb / 40.0);
  const double w0 = 2.0 * M_PI * freq / fs;
  const double cw = std::cos(w0);
  const double sw = std::sin(w0);
  const double alpha = sw / 2.0 * std::sqrt((A + 1.0 / A) * (1.0 / std::max(0.1, slope) - 1.0) + 2.0);
  const double twoSqrtAalpha = 2.0 * std::sqrt(A) * alpha;
  const double a0 = (A + 1.0) - (A - 1.0) * cw + twoSqrtAalpha;
  b.b0 = A * ((A + 1.0) + (A - 1.0) * cw + twoSqrtAalpha) / a0;
  b.b1 = -2.0 * A * ((A - 1.0) + (A + 1.0) * cw) / a0;
  b.b2 = A * ((A + 1.0) + (A - 1.0) * cw - twoSqrtAalpha) / a0;
  b.a1 = 2.0 * ((A - 1.0) - (A + 1.0) * cw) / a0;
  b.a2 = ((A + 1.0) - (A - 1.0) * cw - twoSqrtAalpha) / a0;
  return b;
}

Biquad Biquad::lowpass(double fs, double freq, double q) {
  Biquad b;
  const double w0 = 2.0 * M_PI * freq / fs;
  const double cw = std::cos(w0);
  const double alpha = std::sin(w0) / (2.0 * std::max(0.05, q));
  const double a0 = 1.0 + alpha;
  b.b0 = (1.0 - cw) / 2.0 / a0;
  b.b1 = (1.0 - cw) / a0;
  b.b2 = b.b0;
  b.a1 = -2.0 * cw / a0;
  b.a2 = (1.0 - alpha) / a0;
  return b;
}

Biquad Biquad::highpass(double fs, double freq, double q) {
  Biquad b;
  const double w0 = 2.0 * M_PI * freq / fs;
  const double cw = std::cos(w0);
  const double alpha = std::sin(w0) / (2.0 * std::max(0.05, q));
  const double a0 = 1.0 + alpha;
  b.b0 = (1.0 + cw) / 2.0 / a0;
  b.b1 = -(1.0 + cw) / a0;
  b.b2 = b.b0;
  b.a1 = -2.0 * cw / a0;
  b.a2 = (1.0 - alpha) / a0;
  return b;
}

}  // namespace phq
