#include "dsp/eq.h"

#include <algorithm>
#include <cmath>
#include <complex>

#include "audio.h"

namespace phq {

const std::vector<double>& ChannelEq::defaultFrequencies() {
  static const std::vector<double> f = {31.25, 62.5, 125.0, 250.0, 500.0,
                                        1000.0, 2000.0, 4000.0, 8000.0, 16000.0};
  return f;
}

namespace {
// Magnitude of one biquad at normalized angular frequency w.
std::complex<double> biquadResponse(const Biquad& b, double w) {
  const std::complex<double> z1 = std::polar(1.0, -w);
  const std::complex<double> z2 = std::polar(1.0, -2.0 * w);
  const std::complex<double> num = b.b0 + b.b1 * z1 + b.b2 * z2;
  const std::complex<double> den = 1.0 + b.a1 * z1 + b.a2 * z2;
  return num / den;
}
}  // namespace

void ChannelEq::Bank::build(int fs, int channels, const std::vector<EqBand>& bands,
                            double preampDb) {
  active = std::abs(preampDb) > 0.01;
  peakGainDb = 0.0;
  autoHeadroomDb = 0.0;
  preamp = 1.0;
  filters.assign(static_cast<size_t>(channels) * bands.size(), Biquad{});
  for (size_t b = 0; b < bands.size(); ++b) {
    if (std::abs(bands[b].gainDb) > 0.01) active = true;
    for (int c = 0; c < channels; ++c) {
      filters[static_cast<size_t>(c) * bands.size() + b] =
          Biquad::peaking(static_cast<double>(fs), bands[b].freq, bands[b].q, bands[b].gainDb);
    }
  }
  if (!active || bands.empty()) {
    preamp = dbToGain(preampDb);
    return;
  }

  // Measure the cascade peak on a log grid (20 Hz .. min(20 kHz, 0.45 fs)).
  const double top = std::min(20000.0, 0.45 * static_cast<double>(fs));
  const int points = 256;
  for (int i = 0; i <= points; ++i) {
    const double t = static_cast<double>(i) / points;
    const double f = 20.0 * std::pow(top / 20.0, t);
    const double w = 2.0 * M_PI * f / static_cast<double>(fs);
    std::complex<double> h(1.0, 0.0);
    for (size_t b = 0; b < bands.size(); ++b) h *= biquadResponse(filters[b], w);
    const double db = 20.0 * std::log10(std::abs(h) + 1e-12);
    peakGainDb = std::max(peakGainDb, db);
  }

  // Never boost above 0 dBFS, whatever the preset asks for. This is the
  // difference between "an EQ" and "a sudden 20 dB blast in someone's ears".
  const double requested = preampDb;
  const double allowed = std::min(0.0, -peakGainDb);
  const double effective = std::min(requested, allowed);
  autoHeadroomDb = requested - effective;
  preamp = dbToGain(effective);
}

void ChannelEq::configure(int sampleRate, int channels, const std::vector<EqBand>& bands,
                          double preampDb) {
  sampleRate_ = sampleRate;
  channels_ = channels < 1 ? 1 : channels;
  bands_ = bands.size();
  current_.build(sampleRate_, channels_, bands, preampDb);
  next_ = Bank{};
  fading_ = false;
  fadeRemaining_ = 0;
}

void ChannelEq::setTarget(int sampleRate, int channels, const std::vector<EqBand>& bands,
                          double preampDb) {
  const int ch = channels < 1 ? 1 : channels;
  if (sampleRate != sampleRate_ || ch != channels_ || bands.size() != bands_) {
    configure(sampleRate, ch, bands, preampDb);
    return;
  }
  next_.build(sampleRate, ch, bands, preampDb);
  fading_ = true;
  fadeTotal_ = kFadeFrames;
  fadeRemaining_ = kFadeFrames;
}

void ChannelEq::reset() {
  for (auto& f : current_.filters) f.reset();
  for (auto& f : next_.filters) f.reset();
  fading_ = false;
  fadeRemaining_ = 0;
}

void ChannelEq::process(float* interleaved, size_t frames) {
  if (interleaved == nullptr || frames == 0) return;
  if (!current_.active && !fading_) return;
  const size_t ch = static_cast<size_t>(channels_);
  const size_t bands = bands_;

  for (size_t f = 0; f < frames; ++f) {
    double w = 1.0;
    if (fading_) {
      w = 1.0 - static_cast<double>(fadeRemaining_) / static_cast<double>(fadeTotal_);
      w = clampd(w, 0.0, 1.0);
    }
    for (size_t c = 0; c < ch; ++c) {
      const size_t idx = f * ch + c;
      const double x = interleaved[idx];
      const double yCur = current_.active ? current_.run(x, c, bands) : x;
      double y = yCur;
      if (fading_) {
        const double yNext = next_.active ? next_.run(x, c, bands) : x;
        y = yCur * (1.0 - w) + yNext * w;
      }
      y = clampd(y, -1.0, 1.0);
      interleaved[idx] = static_cast<float>(y);
    }
    if (fading_) {
      --fadeRemaining_;
      if (fadeRemaining_ <= 0) {
        current_ = std::move(next_);
        next_ = Bank{};
        fading_ = false;
        fadeRemaining_ = 0;
      }
    }
  }
}

}  // namespace phq
