#include "dsp/resampler.h"

#include <algorithm>
#include <cstring>
#include <numeric>

#include "dsp/filters.h"

namespace phq {

bool PolyphaseResampler::configure(int fsIn, int fsOut, const ResamplerConfig& cfg,
                                   std::string* error) {
  if (fsIn <= 0 || fsOut <= 0) {
    if (error) *error = "invalid sample rate";
    return false;
  }
  fsIn_ = fsIn;
  fsOut_ = fsOut;
  channels_ = 2;
  bypass_ = (fsIn == fsOut);
  inCount_ = 0;
  outIndex_ = 0;
  latencyOut_ = 0;
  configured_ = true;
  if (bypass_) return true;

  const int g = std::gcd(fsIn, fsOut);
  L_ = fsOut / g;
  M_ = fsIn / g;
  taps_ = std::max(8, cfg.tapsPerPhase);

  const double cutoff = 0.5 * std::min(1.0 / static_cast<double>(L_), 1.0 / static_cast<double>(M_));
  // Prototype length must scale with the larger factor: a decimating filter
  // runs at the *input* rate and needs M times the taps per output.
  size_t n = static_cast<size_t>(taps_) * static_cast<size_t>(std::max(L_, M_));
  std::vector<double> h;
  designLowpass(h, n, cutoff, cfg.attenuationDb);
  for (double& v : h) v *= static_cast<double>(L_);  // compensate zero-stuffing
  taps_ = static_cast<int>((h.size() + static_cast<size_t>(L_) - 1) / static_cast<size_t>(L_));

  phaseTaps_.assign(static_cast<size_t>(L_), std::vector<double>(static_cast<size_t>(taps_), 0.0));
  for (int p = 0; p < L_; ++p) {
    for (int j = 0; j < taps_; ++j) {
      const size_t idx = static_cast<size_t>(p) + static_cast<size_t>(j) * static_cast<size_t>(L_);
      phaseTaps_[static_cast<size_t>(p)][static_cast<size_t>(j)] = idx < h.size() ? h[idx] : 0.0;
    }
  }

  // History is a linear buffer: taps_ frames of past input followed by the
  // current chunk, so the inner loop needs no modulo and no bounds branch.
  buf_.assign(static_cast<size_t>(taps_) * 2, 0.0);
  latencyOut_ = static_cast<size_t>(
      std::llround(static_cast<double>(taps_ / 2) * static_cast<double>(L_) /
                   static_cast<double>(M_)));
  return true;
}

void PolyphaseResampler::reset() {
  inCount_ = 0;
  outIndex_ = 0;
  if (!bypass_) buf_.assign(static_cast<size_t>(taps_) * 2, 0.0);
}

void PolyphaseResampler::process(const float* in, size_t frames, std::vector<float>& out) {
  if (!configured_ || frames == 0) return;
  if (bypass_) {
    out.insert(out.end(), in, in + frames * 2);
    inCount_ += static_cast<int64_t>(frames);
    outIndex_ += static_cast<int64_t>(frames);
    return;
  }

  const int64_t chunkStart = inCount_;
  const size_t oldFrames = buf_.size() / 2;
  buf_.resize((oldFrames + frames) * 2);
  for (size_t f = 0; f < frames; ++f) {
    buf_[(oldFrames + f) * 2 + 0] = static_cast<double>(in[f * 2 + 0]);
    buf_[(oldFrames + f) * 2 + 1] = static_cast<double>(in[f * 2 + 1]);
  }
  inCount_ += static_cast<int64_t>(frames);

  const size_t K = static_cast<size_t>(taps_);
  const size_t histBase = K;  // index of chunkStart in buf_
  while (true) {
    const int64_t pos = outIndex_ * static_cast<int64_t>(M_);
    const int64_t i = pos / L_;
    if (i >= inCount_) break;
    const int phase = static_cast<int>(pos % L_);
    const double* taps = phaseTaps_[static_cast<size_t>(phase)].data();
    const size_t base = static_cast<size_t>(i - chunkStart) + histBase;
    // base >= histBase >= K, so base - j is always in range for j in [0,K).
    double accL = 0.0, accR = 0.0;
    const double* src = buf_.data() + (base - (K - 1)) * 2;
    for (size_t j = 0; j < K; ++j) {
      const double t = taps[K - 1 - j];
      accL += t * src[j * 2 + 0];
      accR += t * src[j * 2 + 1];
    }
    out.push_back(static_cast<float>(accL));
    out.push_back(static_cast<float>(accR));
    ++outIndex_;
  }

  // Keep only the last K frames as history for the next call.
  const size_t total = buf_.size() / 2;
  if (total > K) {
    const size_t drop = total - K;
    std::memmove(buf_.data(), buf_.data() + drop * 2, K * 2 * sizeof(double));
    buf_.resize(K * 2);
  }
}

void PolyphaseResampler::flush(std::vector<float>& out) {
  if (!configured_ || bypass_) return;
  std::vector<float> zeros(static_cast<size_t>(taps_) * 2, 0.0f);
  process(zeros.data(), static_cast<size_t>(taps_), out);
}

}  // namespace phq
