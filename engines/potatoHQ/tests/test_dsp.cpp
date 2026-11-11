// potatoHQ — DSP unit tests and measurements.
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <random>
#include <string>
#include <vector>

#include "audio.h"
#include "dsp/dither.h"
#include "dsp/dop.h"
#include "dsp/eq.h"
#include "dsp/spatial.h"
#include "dsp/crossfeed.h"
#include "dsp/filters.h"
#include "dsp/resampler.h"
#include "dsp/sdm.h"
#include "io/dsf.h"
#include "json.h"
#include "io/wav.h"

using namespace phq;

namespace {

int g_failures = 0;
int g_checks = 0;

void check(bool cond, const std::string& what) {
  ++g_checks;
  if (!cond) {
    ++g_failures;
    std::printf("  [FAIL] %s\n", what.c_str());
  }
}

void checkNear(double got, double want, double tol, const std::string& what) {
  ++g_checks;
  if (std::abs(got - want) > tol) {
    ++g_failures;
    std::printf("  [FAIL] %s: got %.6f want %.6f (tol %.6f)\n", what.c_str(), got, want, tol);
  }
}

// ---------------------------------------------------------------- FFT ------
void fft(std::vector<double>& re, std::vector<double>& im) {
  const size_t n = re.size();
  for (size_t i = 1, j = 0; i < n; ++i) {
    size_t bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      std::swap(re[i], re[j]);
      std::swap(im[i], im[j]);
    }
  }
  for (size_t len = 2; len <= n; len <<= 1) {
    const double ang = -2.0 * M_PI / static_cast<double>(len);
    const double wr = std::cos(ang), wi = std::sin(ang);
    for (size_t i = 0; i < n; i += len) {
      double cr = 1.0, ci = 0.0;
      for (size_t j = 0; j < len / 2; ++j) {
        const double ur = re[i + j], ui = im[i + j];
        const double vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci;
        const double vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j] = ur + vr;
        im[i + j] = ui + vi;
        re[i + j + len / 2] = ur - vr;
        im[i + j + len / 2] = ui - vi;
        const double ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

// Least-squares projection onto a sine at `freq` (amplitude estimate).
double fitSine(const std::vector<float>& x, double fs, double freq, size_t start, size_t count) {
  if (count == 0) return 0.0;
  double a = 0.0, b = 0.0;
  const double w = 2.0 * M_PI * freq / fs;
  for (size_t i = 0; i < count; ++i) {
    const double v = x[start + i];
    a += v * std::cos(w * static_cast<double>(i));
    b += v * std::sin(w * static_cast<double>(i));
  }
  a *= 2.0 / static_cast<double>(count);
  b *= 2.0 / static_cast<double>(count);
  return std::sqrt(a * a + b * b);
}

// ------------------------------------------------------------- helpers -----
std::vector<float> sine(double fs, double freq, double amp, size_t frames) {
  std::vector<float> out(frames * 2);
  for (size_t i = 0; i < frames; ++i) {
    const float v = static_cast<float>(amp * std::sin(2.0 * M_PI * freq * static_cast<double>(i) / fs));
    out[i * 2] = v;
    out[i * 2 + 1] = v;
  }
  return out;
}

// ---------------------------------------------------------------- tests ----
void testJson() {
  std::printf("[json]\n");
  const std::string text = R"({"a":1,"b":[true,null,"x\n\"y\""],"c":{"d":-2.5e3}})";
  std::string err;
  Json j = Json::parse(text, &err);
  check(err.empty(), "parse ok");
  checkNear(j["a"].asNumber(), 1.0, 1e-12, "a");
  check(j["b"][2].asString() == "x\n\"y\"", "string escape");
  checkNear(j["c"]["d"].asNumber(), -2500.0, 1e-9, "nested number");
  const std::string round = j.dump();
  std::string err2;
  Json k = Json::parse(round, &err2);
  check(err2.empty() && k["b"][0].asBool(), "round trip");
}

void testWavRoundTrip() {
  std::printf("[wav]\n");
  const size_t frames = 4800;
  auto src = sine(48000, 1000, 0.5, frames);
  const SampleFormat formats[] = {SampleFormat::S16, SampleFormat::S24, SampleFormat::S32,
                                  SampleFormat::F32};
  for (SampleFormat f : formats) {
    AudioFormat fmt;
    fmt.sampleRate = 48000;
    fmt.channels = 2;
    fmt.format = f;
    const std::string path = "build/test_" + std::string(sampleFormatName(f)) + ".wav";
    std::string err;
    {
      WavWriter w;
      check(w.open(path, fmt, &err), "open writer " + std::string(sampleFormatName(f)) + ": " + err);
      check(w.write(src.data(), frames, &err), "write " + err);
      check(w.close(&err), "close " + err);
    }
    WavReader r;
    check(r.open(path, &err), "open reader " + err);
    check(r.format().channels == 2 && r.format().sampleRate == 48000, "format preserved");
    check(r.totalFrames() == frames, "frame count");
    std::vector<float> back(frames * 2);
    check(r.read(back.data(), frames) == frames, "read frames");
    double maxErr = 0.0;
    for (size_t i = 0; i < back.size(); ++i) maxErr = std::max(maxErr, static_cast<double>(std::fabs(back[i] - src[i])));
    const double tol = f == SampleFormat::S16 ? 1.0 / 32768.0 * 1.5
                       : f == SampleFormat::S24 ? 1.0 / 8388608.0 * 1.5
                                                : 1e-6;
    check(maxErr <= tol, std::string("round trip error ") + std::to_string(maxErr));
  }
}

void testFilters() {
  std::printf("[filters]\n");
  std::vector<double> h;
  designLowpass(h, 1023, 0.05, 120.0);
  double sum = 0.0;
  for (double v : h) sum += v;
  checkNear(sum, 1.0, 1e-9, "unity DC gain");
  // Symmetry
  bool symmetric = true;
  for (size_t i = 0; i < h.size() / 2; ++i)
    if (std::abs(h[i] - h[h.size() - 1 - i]) > 1e-12) symmetric = false;
  check(symmetric, "linear phase symmetry");

  Biquad b = Biquad::peaking(48000, 1000, 1.0, 6.0);
  // DC gain of a peaking filter is 1.
  double dc = (b.b0 + b.b1 + b.b2) / (1.0 + b.a1 + b.a2);
  checkNear(dc, 1.0, 1e-9, "peaking DC gain");
}

void testResampler() {
  std::printf("[resampler]\n");
  const int fsIn = 44100, fsOut = 705600;
  const double f = 1000.0;
  const size_t frames = 44100;  // 1 s
  auto src = sine(fsIn, f, 0.5, frames);

  ResamplerConfig cfg;
  cfg.tapsPerPhase = 128;
  PolyphaseResampler rs;
  std::string err;
  check(rs.configure(fsIn, fsOut, cfg, &err), "configure: " + err);

  std::vector<float> out;
  out.reserve(frames * 16 + 4096);
  const size_t chunk = 1024;
  for (size_t i = 0; i < frames; i += chunk) {
    const size_t n = std::min(chunk, frames - i);
    rs.process(src.data() + i * 2, n, out);
  }
  rs.flush(out);

  const size_t outFrames = out.size() / 2;
  check(outFrames >= frames * 16, "output length");

  // Skip the filter transient and measure steady state.
  const size_t skip = rs.latencyOutputFrames() + 2000;
  const size_t count = std::min<size_t>(outFrames - skip, 200000);

  std::vector<float> mono(count);
  for (size_t i = 0; i < count; ++i) mono[i] = out[(skip + i) * 2];

  const double amp = fitSine(mono, fsOut, f, 0, count);
  const double ampDb = 20.0 * std::log10(amp / 0.5);
  std::printf("  amplitude error: %.4f dB\n", ampDb);
  check(std::abs(ampDb) < 0.01, "passband flatness at 1 kHz");

  // Image at fsIn - f = 43100 Hz must be crushed.
  const double image = fitSine(mono, fsOut, fsIn - f, 0, count);
  const double imageDb = 20.0 * std::log10(image / 0.5 + 1e-15);
  std::printf("  image (43.1 kHz): %.1f dB\n", imageDb);
  check(imageDb < -95.0, "image rejection");

  // Sweep flatness across the audible band.
  double worst = 0.0;
  const double freqs[] = {20, 100, 1000, 5000, 10000, 15000, 19000, 20000};
  for (double fq : freqs) {
    auto s2 = sine(fsIn, fq, 0.25, frames / 2);
    PolyphaseResampler r2;
    r2.configure(fsIn, fsOut, cfg, &err);
    std::vector<float> o2;
    for (size_t i = 0; i < frames / 2; i += chunk) {
      const size_t n = std::min(chunk, frames / 2 - i);
      r2.process(s2.data() + i * 2, n, o2);
    }
    r2.flush(o2);
    const size_t n2 = o2.size() / 2;
    std::vector<float> m2(n2);
    for (size_t i = 0; i < n2; ++i) m2[i] = o2[i * 2];
    const size_t sk = std::min(n2 / 2, r2.latencyOutputFrames() + 2000);
    const double a2 = fitSine(m2, fsOut, fq, sk, n2 / 2);
    const double db = 20.0 * std::log10(a2 / 0.25 + 1e-15);
    worst = std::max(worst, std::abs(db));
  }
  std::printf("  worst passband deviation: %.4f dB\n", worst);
  check(worst < 0.05, "sweep flatness");
}

// In-band SNR of the 1-bit stream (20 Hz .. 20 kHz).
double sdmSnr(const std::vector<uint8_t>& planar, int channels, double dsdRate, double signalFreq,
              double* signalDbOut) {
  const size_t bytes = planar.size() / static_cast<size_t>(channels);
  const size_t bits = bytes * 8;
  const size_t n = 1u << 19;  // 524288 samples
  if (bits < n) return -999.0;
  std::vector<double> re(n), im(n, 0.0);
  // 4-term Blackman-Harris window
  for (size_t i = 0; i < n; ++i) {
    const double t = 2.0 * M_PI * static_cast<double>(i) / static_cast<double>(n);
    // 7-term Blackman-Harris (-180 dB sidelobes): needed to see SDM noise floors
    // well below the -92 dB of the 4-term window.
    const double w = 0.27105140069342 - 0.43329793923448 * std::cos(t) +
                     0.21812299954311 * std::cos(2 * t) - 0.06592544638803 * std::cos(3 * t) +
                     0.01081174209837 * std::cos(4 * t) - 0.00077658482522 * std::cos(5 * t) +
                     0.00001388721735 * std::cos(6 * t);
    const uint8_t b = planar[i / 8];
    const double v = ((b >> (i % 8)) & 1u) ? 1.0 : -1.0;
    re[i] = v * w;
  }
  fft(re, im);
  const double binHz = dsdRate / static_cast<double>(n);
  const size_t inBandBins = static_cast<size_t>(20000.0 / binHz);
  const size_t sigBin = static_cast<size_t>(std::llround(signalFreq / binHz));
  double sigPow = 0.0, noisePow = 0.0;
  for (size_t k = 1; k <= inBandBins; ++k) {
    const double p = re[k] * re[k] + im[k] * im[k];
    if (k + 10 >= sigBin && k <= sigBin + 10) sigPow += p;
    else noisePow += p;
  }
  if (signalDbOut) *signalDbOut = 10.0 * std::log10(sigPow + 1e-30);
  return 10.0 * std::log10((sigPow + 1e-30) / (noisePow + 1e-30));
}


// Time-domain in-band SNR: decimate the 1-bit stream to 44.1 kHz, subtract the
// fitted 1 kHz tone and compare residual RMS to signal RMS. This is not limited
// by window sidelobes like the FFT variant above.
double sdmSnrTime(const std::vector<uint8_t>& planar, int channels, double dsdRate, double f,
                  double* ampOut) {
  const size_t bytes = planar.size() / static_cast<size_t>(channels);
  const size_t bits = bytes * 8;
  std::vector<float> pcm(bits);
  for (size_t i = 0; i < bits; ++i) {
    const uint8_t b = planar[i / 8];
    pcm[i] = ((b >> (i % 8)) & 1u) ? 1.0f : -1.0f;
  }

  PolyphaseResampler rs;
  ResamplerConfig cfg;
  cfg.tapsPerPhase = 96;
  std::string err;
  rs.configure(static_cast<int>(dsdRate), 44100, cfg, &err);
  std::vector<float> out;
  // Feed mono as duplicated stereo.
  std::vector<float> st(2 * 4096);
  for (size_t i = 0; i < bits; i += 4096) {
    const size_t n = std::min<size_t>(4096, bits - i);
    for (size_t k = 0; k < n; ++k) { st[2 * k] = pcm[i + k]; st[2 * k + 1] = pcm[i + k]; }
    rs.process(st.data(), n, out);
  }
  rs.flush(out);
  const size_t frames = out.size() / 2;
  const size_t start = frames / 4;
  const size_t count = frames / 2;
  // Fit a*cos + b*sin at f.
  const double w = 2.0 * M_PI * f / 44100.0;
  double a = 0.0, bb = 0.0;
  for (size_t i = 0; i < count; ++i) {
    const double v = out[(start + i) * 2];
    a += v * std::cos(w * static_cast<double>(i));
    bb += v * std::sin(w * static_cast<double>(i));
  }
  a *= 2.0 / static_cast<double>(count);
  bb *= 2.0 / static_cast<double>(count);
  const double amp = std::sqrt(a * a + bb * bb);
  double res = 0.0;
  for (size_t i = 0; i < count; ++i) {
    const double model = a * std::cos(w * static_cast<double>(i)) + bb * std::sin(w * static_cast<double>(i));
    const double d = out[(start + i) * 2] - model;
    res += d * d;
  }
  res = std::sqrt(res / static_cast<double>(count));
  if (ampOut) *ampOut = amp;
  return 20.0 * std::log10((amp / std::sqrt(2.0)) / (res + 1e-18));
}

void testSdm() {
  std::printf("[sdm]\n");
  const double dsdRate = 2822400.0;
  const double f = 1000.0;
  const size_t frames = dsdRate * 2;  // 2 s
  std::vector<double> in(frames * 2);
  for (size_t i = 0; i < frames; ++i) {
    const double v = 0.5 * std::sin(2.0 * M_PI * f * static_cast<double>(i) / dsdRate);
    in[i * 2] = v;
    in[i * 2 + 1] = v;
  }

  for (int order : {3, 5, 7}) {
    SdmConfig cfg;
    cfg.order = order;
    cfg.outOfBandGain = order == 7 ? 1.8 : 2.0;
    cfg.inputGainDb = -3.0;
    SdmModulator sdm;
    check(sdm.configure(cfg, 2), "configure sdm");
    std::vector<uint8_t> packed;
    sdm.process(in.data(), frames, packed);
    double sigDb = 0.0;
    const double snr = sdmSnr(packed, 2, dsdRate, f, &sigDb);
    double amp = 0.0;
    const double snrTime = sdmSnrTime(packed, 2, dsdRate, f, &amp);
    std::printf("  order %d: SNR(fft) %.1f dB, SNR(time) %.1f dB, amp %.3f, recoveries %llu, peak fb %.3f\n",
                order, snr, snrTime, amp,
                static_cast<unsigned long long>(sdm.recoveries()), sdm.peakFeedback());
    check(snr > (order == 3 ? 75.0 : order == 5 ? 95.0 : 100.0), "sdm snr order " + std::to_string(order));
  }
}

void testDop() {
  std::printf("[dop]\n");
  std::vector<uint8_t> planar(2 * 4);  // 32 bits per channel
  // channel 0: 0xA5, 0x3C, 0x11, 0x22 ; channel 1 similar
  const uint8_t c0[4] = {0xA5, 0x3C, 0x11, 0x22};
  const uint8_t c1[4] = {0x5A, 0xC3, 0x33, 0x44};
  std::memcpy(planar.data(), c0, 4);
  std::memcpy(planar.data() + 4, c1, 4);

  DopPacker packer;
  std::vector<uint8_t> out;
  const size_t frames = packer.pack(planar, 32, 2, out, 3);
  check(frames == 2, "carrier frames");
  // frame 0, channel 0: [later=0x3C][earlier=0xA5][marker=0x05]
  check(out[0] == 0x3C && out[1] == 0xA5 && out[2] == 0x05, "frame0 ch0 layout");
  check(out[3] == 0xC3 && out[4] == 0x5A && out[5] == 0x05, "frame0 ch1 layout");
  check(out[6] == 0x22 && out[7] == 0x11, "frame1 payload order");
  check(out[8] == 0xFA, "marker alternation");

  // 24-in-32 layout
  DopPacker p2;
  std::vector<uint8_t> out2;
  p2.pack(planar, 32, 2, out2, 4);
  check(out2[0] == 0x00 && out2[1] == 0x3C && out2[2] == 0xA5 && out2[3] == 0x05, "24-in-32 layout");
}


void testDopRealtimeWords() {
  std::printf("[dop-realtime]\n");
  // The render path builds words with dopCarrierWord(payload, index); verify it
  // matches the offline packer byte-for-byte, including marker phase.
  std::vector<uint8_t> planar = {0xA5, 0x3C, 0x11, 0x22, 0x5A, 0xC3, 0x33, 0x44};
  DopPacker packer;
  std::vector<uint8_t> out;
  packer.pack(planar, 32, 2, out, 3);
  for (uint64_t f = 0; f < 2; ++f) {
    for (int c = 0; c < 2; ++c) {
      const uint8_t earlier = planar[static_cast<size_t>(c) * 4 + f * 2];
      const uint8_t later = planar[static_cast<size_t>(c) * 4 + f * 2 + 1];
      const uint32_t word = dopCarrierWord((static_cast<uint32_t>(earlier) << 8) | later, f);
      const uint8_t* packedWord = out.data() + (f * 2 + static_cast<uint64_t>(c)) * 3;
      check(packedWord[0] == (word & 0xFF) && packedWord[1] == ((word >> 8) & 0xFF) &&
                packedWord[2] == ((word >> 16) & 0xFF),
            "realtime word == packer word");
    }
  }
  check(dopCarrierWord(0x6969u, 0) >> 16 == 0x05u, "idle marker even");
  check(dopCarrierWord(0x6969u, 1) >> 16 == 0xFAu, "idle marker odd");
}

void testDopSdmRoundTrip() {
  std::printf("[dop-sdm]\n");
  const size_t bits = 2048;
  std::vector<double> in(bits * 2);
  for (size_t i = 0; i < bits; ++i) {
    const double v = 0.4 * std::sin(2.0 * M_PI * 1000.0 * static_cast<double>(i) / 2822400.0);
    in[i * 2] = v;
    in[i * 2 + 1] = v;
  }
  SdmConfig cfg;
  cfg.order = 5;
  SdmModulator sdm;
  sdm.configure(cfg, 2);
  std::vector<uint8_t> planar;
  sdm.process(in.data(), bits, planar);

  DopPacker packer;
  std::vector<uint8_t> carrier;
  const size_t frames = packer.pack(planar, bits, 2, carrier, 3);
  check(frames == bits / 16, "carrier frame count");

  // Rebuild the DSD bytes from the carrier and compare with the modulator output.
  const size_t bytesPerChannel = bits / 8;
  std::vector<uint8_t> rebuilt(planar.size(), 0);
  bool ok = true;
  for (size_t f = 0; f < frames; ++f) {
    for (int c = 0; c < 2; ++c) {
      const uint8_t* w = carrier.data() + (f * 2 + static_cast<size_t>(c)) * 3;
      const uint8_t marker = w[2];
      if (marker != ((f & 1) ? 0xFA : 0x05)) ok = false;
      rebuilt[static_cast<size_t>(c) * bytesPerChannel + f * 2] = w[1];
      rebuilt[static_cast<size_t>(c) * bytesPerChannel + f * 2 + 1] = w[0];
    }
  }
  check(ok, "marker alternation across frames");
  check(rebuilt == planar, "payload round trip");
}


void testEqCrossfade() {
  std::printf("[eq-crossfade]\n");
  const int fs = 48000;
  const int ch = 2;
  const double f = 1000.0;
  const double amp = 0.1;
  double phase = 0.0;
  auto fill = [&](std::vector<float>& buf, size_t frames) {
    buf.resize(frames * static_cast<size_t>(ch));
    for (size_t i = 0; i < frames; ++i) {
      const float v = static_cast<float>(amp * std::sin(phase));
      phase += 2.0 * M_PI * f / fs;
      buf[i * 2] = v;
      buf[i * 2 + 1] = v;
    }
  };
  auto maxDelta = [&](const std::vector<float>& buf) {
    double m = 0.0;
    for (size_t i = ch; i < buf.size(); ++i) m = std::max(m, std::fabs(static_cast<double>(buf[i]) - buf[i - ch]));
    return m;
  };
  auto measure = [&](const std::vector<float>& buf, size_t skip) {
    std::vector<float> mono;
    mono.reserve(buf.size() / 2);
    for (size_t i = skip; i < buf.size() / 2; ++i) mono.push_back(buf[i * 2]);
    return fitSine(mono, fs, f, 0, mono.size());
  };

  ChannelEq eq;
  eq.configure(fs, ch, {}, 0.0);  // bypass
  std::vector<float> warm;
  fill(warm, 4096);
  eq.process(warm.data(), 4096);
  check(std::fabs(measure(warm, 1024) - amp) < 0.002, "bypass is unity");

  // Enable +6 dB at 1 kHz mid-stream: the cross-fade must not step.
  std::vector<EqBand> bands{{f, 6.0, 1.4}};
  eq.setTarget(fs, ch, bands, 0.0);
  std::vector<float> fade;
  fill(fade, 4096);
  eq.process(fade.data(), 4096);
  const double d1 = maxDelta(fade);
  std::printf("  fade-in max sample delta: %.5f\n", d1);
  check(d1 < 0.03, "no click when enabling EQ");

  std::vector<float> settled;
  fill(settled, 8192);
  eq.process(settled.data(), 8192);
  const double boosted = measure(settled, 2048);
  // Auto headroom pulls the preamp down by the band boost, so the output level
  // must stay at the input level instead of rising 6 dB.
  std::printf("  +6 dB band with auto headroom: amplitude %.4f (headroom %.1f dB)\n",
              boosted, eq.autoHeadroomDb());
  check(std::fabs(boosted - amp) < 0.004, "boost is headroom-compensated");
  check(eq.autoHeadroomDb() > 5.0 && eq.autoHeadroomDb() < 7.0, "headroom ~= 6 dB attenuation");

  // Disable again: fade back to dry.
  eq.setTarget(fs, ch, {}, 0.0);
  std::vector<float> fadeOut;
  fill(fadeOut, 4096);
  eq.process(fadeOut.data(), 4096);
  const double d2 = maxDelta(fadeOut);
  std::printf("  fade-out max sample delta: %.5f\n", d2);
  check(d2 < 0.05, "no click when disabling EQ");

  std::vector<float> back;
  fill(back, 8192);
  eq.process(back.data(), 8192);
  check(std::fabs(measure(back, 2048) - amp) < 0.002, "returns to unity");
  check(!eq.fading(), "fade completed");
}



void testEqHeadroom() {
  std::printf("[eq-headroom]\n");
  const int fs = 48000;
  const double f = 1000.0;
  const double amp = 0.1;
  double phase = 0.0;
  auto run = [&](const std::vector<EqBand>& bands, double preampDb, std::vector<float>& buf) {
    ChannelEq eq;
    eq.configure(fs, 2, bands, preampDb);
    const size_t frames = 8192;
    buf.resize(frames * 2);
    for (size_t i = 0; i < frames; ++i) {
      const float v = static_cast<float>(amp * std::sin(phase));
      phase += 2.0 * M_PI * f / fs;
      buf[i * 2] = v;
      buf[i * 2 + 1] = v;
    }
    eq.process(buf.data(), frames);
    std::vector<float> mono;
    for (size_t i = frames / 2; i < frames; ++i) mono.push_back(buf[i * 2]);
    return fitSine(mono, fs, f, 0, mono.size());
  };
  std::vector<float> buf;

  const double flat = run({}, 0.0, buf);
  std::printf("  flat: %.4f\n", flat);
  check(std::fabs(flat - amp) < 0.003, "flat is unity");

  const double boost20 = run({{f, 20.0, 1.4}}, 0.0, buf);
  std::printf("  +20 dB band: %.4f (was 1.0 without headroom)\n", boost20);
  check(boost20 < amp * 1.1, "+20 dB cannot exceed input level");

  const double preampCut = run({}, -6.0, buf);
  std::printf("  preamp -6 dB: %.4f\n", preampCut);
  check(std::fabs(preampCut - amp * 0.5012) < 0.003, "negative preamp still applies");

  const double boostPlusPreamp = run({{f, 12.0, 1.4}}, -3.0, buf);
  std::printf("  +12 dB band with -3 dB preamp: %.4f\n", boostPlusPreamp);
  check(boostPlusPreamp < amp * 1.1, "boost + preamp stays <= input");
}

void testDsdPath() {
  std::printf("[dsd-path]\n");
  const int fsIn = 44100;
  const double dsdRate = 2822400.0;
  const double f = 1000.0;
  const size_t seconds = 1;
  const size_t inFrames = static_cast<size_t>(fsIn * seconds);
  auto src = sine(fsIn, f, 0.5, inFrames);

  for (int taps : {32, 48, 64, 96}) {
    ResamplerConfig rcfg;
    rcfg.tapsPerPhase = taps;
    PolyphaseResampler rs;
    std::string err;
    if (!rs.configure(fsIn, static_cast<int>(dsdRate), rcfg, &err)) {
      check(false, "configure resampler");
      continue;
    }
    std::vector<float> up;
    std::vector<float> chunk(src.begin(), src.end());
    rs.process(chunk.data(), inFrames, up);
    rs.flush(up);
    // Drop the interpolation latency so the tone is aligned.
    const size_t skip = rs.latencyOutputFrames();
    const size_t frames = (up.size() / 2 > skip) ? (up.size() / 2 - skip) : 0;
    std::vector<double> mod(frames * 2);
    for (size_t i = 0; i < frames * 2; ++i) mod[i] = static_cast<double>(up[skip * 2 + i]);

    SdmConfig scfg;
    scfg.order = 7;
    scfg.outOfBandGain = 1.8;
    SdmModulator sdm;
    sdm.configure(scfg, 2);
    std::vector<uint8_t> packed;
    sdm.process(mod.data(), frames, packed);
    double sigDb = 0.0;
    const double snr = sdmSnr(packed, 2, dsdRate, f, &sigDb);
    // Image at fsIn - f in the interpolated (pre-modulator) signal.
    std::vector<float> mono(frames);
    for (size_t i = 0; i < frames; ++i) mono[i] = up[(skip + i) * 2];
    const double image = fitSine(mono, dsdRate, fsIn - f, frames / 4, frames / 2);
    std::printf("  taps %2d: in-band SNR %.1f dB, 43.1 kHz image %.1f dB\n", taps, snr,
                20.0 * std::log10(image / 0.5 + 1e-15));
    check(snr > 95.0, "dsd path snr taps " + std::to_string(taps));
  }
}


void testSpatial() {
  std::printf("[spatial]\n");
  const int fs = 48000;
  const double f = 1000.0;
  const double amp = 0.2;

  // 1) Disabled must be a strict bit-exact bypass.
  {
    SpatialPanner sp;
    sp.configure(fs, 2);
    sp.setTarget({false, 1.0, 0.0});
    std::vector<float> buf;
    std::vector<float> ref;
    auto s = sine(fs, f, amp, 1024);
    ref = s;
    sp.process(s.data(), 1024);
    check(s == ref, "disabled is a bit-exact bypass");
  }

  auto rms = [&](const std::vector<float>& buf, size_t start, size_t frames, int ch) {
    double acc = 0.0;
    for (size_t i = start; i < start + frames; ++i) acc += static_cast<double>(buf[i * 2 + ch]) * buf[i * 2 + ch];
    return std::sqrt(acc / static_cast<double>(frames));
  };

  // Helper: run a sine through the panner and return the settled block.
  auto run = [&](double x, double y, double freq, size_t frames) {
    SpatialPanner sp;
    sp.configure(fs, 2);
    sp.setTarget({true, x, y});
    sp.reset();
    auto buf = sine(fs, freq, amp, frames);
    sp.process(buf.data(), frames);
    return buf;
  };

  // 2) Hard right: left channel silent, right at unity.
  {
    const size_t frames = 8192;
    auto buf = run(1.0, 0.0, f, frames);
    const double l = rms(buf, frames - 2048, 2048, 0);
    const double r = rms(buf, frames - 2048, 2048, 1);
    std::printf("  x=+1: L=%.4f R=%.4f\n", l, r);
    check(l < 0.005, "pan right silences left");
    // The rim also means "far": distance gain is 1 - 0.55 * radius.
    check(std::fabs(r - amp / std::sqrt(2.0) * 0.45) < 0.004, "pan right keeps right at distance gain");
  }

  // 3) Centre: both channels unchanged.
  {
    const size_t frames = 8192;
    auto buf = run(0.0, 0.0, f, frames);
    const double l = rms(buf, frames - 2048, 2048, 0);
    const double r = rms(buf, frames - 2048, 2048, 1);
    std::printf("  centre: L=%.4f R=%.4f (expect %.4f)\n", l, r, amp / std::sqrt(2.0));
    check(std::fabs(l - r) < 0.002, "centre is symmetric");
    check(std::fabs(l - amp / std::sqrt(2.0)) < 0.005, "centre is unity");
  }

  // 4) ITD: an impulse at x=+0.5 delays the left ear.
  {
    SpatialPanner sp;
    sp.configure(fs, 2);
    sp.setTarget({true, 0.5, 0.0});
    sp.reset();
    std::vector<float> buf(1024 * 2, 0.0f);
    buf[100 * 2] = 1.0f;
    buf[100 * 2 + 1] = 1.0f;
    sp.process(buf.data(), 1024);
    auto peak = [&](int ch) {
      size_t best = 0;
      double bestV = 0.0;
      for (size_t i = 0; i < 200; ++i) {
        if (std::fabs(buf[i * 2 + ch]) > bestV) { bestV = std::fabs(buf[i * 2 + ch]); best = i; }
      }
      return static_cast<double>(best);
    };
    const double pr = peak(1), pl = peak(0);
    std::printf("  ITD: right peak %.0f, left peak %.0f (delta %.1f samples)\n", pr, pl, pl - pr);
    check(pl - pr > 8.0, "left ear delayed by ITD");
  }

  // 5) Rear cue: high frequencies tilt down when the puck is behind.
  {
    const size_t frames = 16384;
    auto front = run(0.0, 0.0, 6000.0, frames);
    auto rear = run(0.0, -1.0, 6000.0, frames);
    auto frontLow = run(0.0, 0.0, 500.0, frames);
    auto rearLow = run(0.0, -1.0, 500.0, frames);
    const double tiltFront = 20.0 * std::log10(rms(front, frames - 4096, 4096, 0) / rms(frontLow, frames - 4096, 4096, 0));
    const double tiltRear = 20.0 * std::log10(rms(rear, frames - 4096, 4096, 0) / rms(rearLow, frames - 4096, 4096, 0));
    std::printf("  6k/500 Hz tilt: front %.1f dB, rear %.1f dB, delta %.1f dB\n", tiltFront, tiltRear, tiltRear - tiltFront);
    check(tiltRear < tiltFront - 3.0, "rear shelf attenuates highs");
  }

  // 6) Dragging must not step.
  {
    SpatialPanner sp;
    sp.configure(fs, 2);
    sp.setTarget({true, 0.0, 0.0});
    sp.reset();
    // Continuous phase across both blocks: a real stream never restarts phase.
    double phase = 0.0;
    auto gen = [&](size_t frames) {
      std::vector<float> buf(frames * 2);
      for (size_t i = 0; i < frames; ++i) {
        const float v = static_cast<float>(amp * std::sin(phase));
        phase += 2.0 * M_PI * f / fs;
        buf[i * 2] = v;
        buf[i * 2 + 1] = v;
      }
      return buf;
    };
    auto a = gen(4096);
    sp.process(a.data(), 4096);
    sp.setTarget({true, 1.0, 0.0});
    auto b = gen(4096);
    sp.process(b.data(), 4096);
    double maxDelta = 0.0;
    for (size_t i = 2; i < b.size(); ++i) maxDelta = std::max(maxDelta, std::fabs(double(b[i]) - b[i - 2]));
    std::printf("  drag 0 -> 1: max sample delta %.4f\n", maxDelta);
    check(maxDelta < 0.08, "smooth parameter drag");
  }
}


void testCrossfeed() {
  std::printf("[crossfeed]\n");
  const int fs = 48000;
  // Disabled: strict bypass.
  {
    CrossfeedProcessor cf;
    cf.configure(fs, 2);
    cf.setTarget(false, 1.0);
    auto buf = sine(fs, 1000.0, 0.2, 1024);
    auto ref = buf;
    cf.process(buf.data(), 1024);
    check(buf == ref, "disabled is a bit-exact bypass");
  }
  // Zero strength is also transparent.
  {
    CrossfeedProcessor cf;
    cf.configure(fs, 2);
    cf.setTarget(true, 0.0);
    auto buf = sine(fs, 1000.0, 0.2, 1024);
    auto ref = buf;
    cf.process(buf.data(), 1024);
    check(buf == ref, "zero strength is transparent");
  }
  // Hard-left impulse: the right ear receives delayed, low-passed energy.
  {
    CrossfeedProcessor cf;
    cf.configure(fs, 2);
    cf.setTarget(true, 1.0);
    std::vector<float> buf(2048 * 2, 0.0f);
    buf[100 * 2] = 1.0f;
    cf.process(buf.data(), 2048);
    double lPeak = 0.0, rPeak = 0.0;
    size_t lAt = 0, rAt = 0;
    for (size_t i = 0; i < 400; ++i) {
      if (std::fabs(buf[i * 2]) > lPeak) { lPeak = std::fabs(buf[i * 2]); lAt = i; }
      if (std::fabs(buf[i * 2 + 1]) > rPeak) { rPeak = std::fabs(buf[i * 2 + 1]); rAt = i; }
    }
    std::printf("  impulse: L peak %.3f @%zu, R peak %.4f @%zu\n", lPeak, lAt, rPeak, rAt);
    check(rPeak > 0.005, "opposite ear gets crossfeed energy");
    check(rAt > lAt, "crossfeed arrives after the direct sound");
  }
  // Mono stays symmetric.
  {
    CrossfeedProcessor cf;
    cf.configure(fs, 2);
    cf.setTarget(true, 1.0);
    auto buf = sine(fs, 1000.0, 0.2, 4096);
    cf.process(buf.data(), 4096);
    double diff = 0.0;
    for (size_t i = 0; i < 4096; ++i) diff = std::max(diff, std::fabs(double(buf[i * 2]) - buf[i * 2 + 1]));
    check(diff < 1e-6, "mono stays symmetric");
  }
}

void testDither() {
  std::printf("[dither]\n");
  const size_t frames = 200000;
  std::vector<float> silence(frames * 2, 0.0f);
  DitherConfig cfg;
  cfg.mode = DitherMode::Tpdf;
  cfg.bits = 16;
  Ditherer d;
  d.configure(cfg, 2);
  d.process(silence.data(), frames);
  double sum = 0.0, sumsq = 0.0;
  bool onGrid = true;
  for (float v : silence) {
    const double q = std::round(static_cast<double>(v) * 32768.0) / 32768.0;
    if (std::abs(q - v) > 1e-7) onGrid = false;
    sum += v;
    sumsq += static_cast<double>(v) * v;
  }
  const double mean = sum / static_cast<double>(silence.size());
  const double rms = std::sqrt(sumsq / static_cast<double>(silence.size()));
  std::printf("  TPDF 16-bit: mean %.3e, rms %.2f dBFS, grid %s\n", mean,
              20.0 * std::log10(rms), onGrid ? "ok" : "BAD");
  check(onGrid, "quantized to integer grid");
  check(std::abs(mean) < 1e-6, "zero mean");
  check(std::abs(20.0 * std::log10(rms) - (-96.3)) < 1.5, "TPDF rms near -96.3 dBFS");
}

void testDsfWrite() {
  std::printf("[dsf]\n");
  DsfWriter w;
  std::string err;
  check(w.open("build/test.dsf", 2, 2822400, &err), "open dsf: " + err);
  std::vector<uint8_t> planar(2 * 5000, 0xAA);
  check(w.write(planar, 40000, &err), "write dsf: " + err);
  check(w.close(&err), "close dsf: " + err);
  FILE* f = std::fopen("build/test.dsf", "rb");
  check(f != nullptr, "reopen dsf");
  if (f) {
    char magic[4];
    std::fread(magic, 1, 4, f);
    check(std::memcmp(magic, "DSD ", 4) == 0, "dsf magic");
    std::fclose(f);
  }
}

}  // namespace

int main() {
  std::printf("potatoHQ DSP tests\n==================\n");
  testJson();
  testWavRoundTrip();
  testFilters();
  testResampler();
  testSdm();
  testDop();
  testEqCrossfade();
  testEqHeadroom();
  testSpatial();
  testCrossfeed();
  testDsdPath();
  testDopRealtimeWords();
  testDopSdmRoundTrip();
  testDither();
  testDsfWrite();
  std::printf("------------------\n%d checks, %d failure(s)\n", g_checks, g_failures);
  return g_failures == 0 ? 0 : 1;
}
