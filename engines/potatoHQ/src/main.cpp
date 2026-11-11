// potatoHQ — CLI: devices / info / convert / dsd / play / rpc / selftest.
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <csignal>
#include <cstdio>
#include <cstring>
#include <map>
#include <string>
#include <thread>
#include <vector>

extern "C" {
#include <libavutil/log.h>
}

#include "audio.h"
#include "decode/ffmpeg_decoder.h"
#include "dsp/dither.h"
#include "dsp/dop.h"
#include "dsp/sdm.h"

#include "dsp/eq.h"
#include "dsp/resampler.h"
#include "dsp/sdm.h"
#include "engine.h"
#include "io/dsf.h"
#include "io/wav.h"
#include "json.h"
#include "out/coreaudio_out.h"
#include "rpc.h"

using namespace phq;

namespace {

std::atomic<bool> g_interrupted{false};
void onSignal(int) { g_interrupted.store(true); }

struct Args {
  std::map<std::string, std::string> values;
  std::vector<std::string> positional;

  bool has(const std::string& k) const { return values.count(k) != 0; }
  std::string get(const std::string& k, const std::string& def = "") const {
    auto it = values.find(k);
    return it == values.end() ? def : it->second;
  }
  double getNum(const std::string& k, double def) const {
    auto it = values.find(k);
    return it == values.end() ? def : std::atof(it->second.c_str());
  }
  int getInt(const std::string& k, int def) const { return static_cast<int>(getNum(k, def)); }
};

Args parseArgs(int argc, char** argv, int start) {
  Args a;
  for (int i = start; i < argc; ++i) {
    std::string s = argv[i];
    if (s.rfind("--", 0) == 0) {
      const std::string key = s.substr(2);
      if (i + 1 < argc && std::string(argv[i + 1]).rfind("--", 0) != 0) {
        a.values[key] = argv[++i];
      } else {
        a.values[key] = "1";
      }
    } else {
      a.positional.push_back(s);
    }
  }
  return a;
}

DitherMode parseDither(const std::string& s) {
  if (s == "none") return DitherMode::None;
  if (s == "tpdf-hp") return DitherMode::TpdfHighpass;
  if (s == "ns" || s == "noise-shaped") return DitherMode::NoiseShaped;
  return DitherMode::Tpdf;
}

void printJson(const Json& j) { std::printf("%s\n", j.dump().c_str()); }

// ------------------------------------------------------------- convert -----
bool runConvert(const Args& args, std::string* error) {
  const std::string in = args.get("in", args.positional.empty() ? "" : args.positional[0]);
  const std::string out = args.get("out");
  if (in.empty() || out.empty()) {
    *error = "usage: potatohq convert --in <file> --out <file.wav> [--rate N] [--bits 16|24|32] [...]";
    return false;
  }
  FfmpegDecoder dec;
  if (!dec.open(in, error)) return false;
  const int srcRate = dec.sampleRate();
  const int channels = dec.channels();
  const int outRate = args.getInt("rate", srcRate);
  const int bits = args.getInt("bits", 24);
  const int taps = args.getInt("taps", 128);
  const double gain = dbToGain(args.getNum("gain", 0.0));

  AudioFormat fmt;
  fmt.sampleRate = outRate;
  fmt.channels = channels;
  fmt.format = bits == 16 ? SampleFormat::S16 : (bits == 32 ? SampleFormat::S32 : SampleFormat::S24);

  WavWriter writer;
  if (!writer.open(out, fmt, error)) return false;

  ResamplerConfig rcfg;
  rcfg.tapsPerPhase = taps;
  PolyphaseResampler rs;
  const bool needResample = srcRate != outRate;
  if (needResample && !rs.configure(srcRate, outRate, rcfg, error)) return false;

  DitherConfig dcfg;
  dcfg.mode = parseDither(args.get("dither", "tpdf"));
  dcfg.bits = bits;
  Ditherer dither;
  dither.configure(dcfg, channels);

  const uint64_t totalIn = static_cast<uint64_t>(dec.durationSeconds() * srcRate);
  const uint64_t expected = needResample
                                ? static_cast<uint64_t>(std::llround(dec.durationSeconds() * outRate))
                                : totalIn;
  uint64_t written = 0;
  size_t skip = needResample ? rs.latencyOutputFrames() : 0;

  auto writeFrames = [&](std::vector<float>& buf, size_t frames) -> bool {
    if (frames == 0) return true;
    if (gain != 1.0) {
      for (size_t i = 0; i < frames * static_cast<size_t>(channels); ++i)
        buf[i] = static_cast<float>(buf[i] * gain);
    }
    dither.process(buf.data(), frames);
    const size_t n = static_cast<size_t>(std::min<uint64_t>(frames, expected - written));
    if (n > 0 && !writer.write(buf.data(), n, error)) return false;
    written += n;
    return true;
  };

  std::vector<float> inBuf(4096 * static_cast<size_t>(channels));
  std::vector<float> outBuf;
  const auto started = std::chrono::steady_clock::now();
  while (written < expected) {
    const size_t got = dec.read(inBuf.data(), 4096, error);
    if (got == 0) break;
    outBuf.clear();
    if (needResample) rs.process(inBuf.data(), got, outBuf);
    else outBuf.assign(inBuf.begin(), inBuf.begin() + static_cast<long>(got * static_cast<size_t>(channels)));
    size_t frames = outBuf.size() / static_cast<size_t>(channels);
    size_t offset = 0;
    if (skip > 0) {
      const size_t drop = std::min(skip, frames);
      skip -= drop;
      offset = drop;
      frames -= drop;
    }
    if (frames > 0) {
      if (!writeFrames(outBuf, frames)) return false;
      // writeFrames consumed the head of outBuf; skipping is handled above.
      (void)offset;
    }
  }
  if (needResample && written < expected) {
    outBuf.clear();
    rs.flush(outBuf);
    size_t frames = outBuf.size() / static_cast<size_t>(channels);
    if (skip > 0) {
      const size_t drop = std::min(skip, frames);
      skip -= drop;
      frames -= drop;
    }
    if (frames > 0) {
      if (!writeFrames(outBuf, frames)) return false;
    }
  }
  if (!writer.close(error)) return false;
  const auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
                      std::chrono::steady_clock::now() - started).count();
  std::fprintf(stderr,
               "[potatohq] %llu frames -> %d Hz / %d-bit, %s dither, %d taps, %lld ms\n",
               static_cast<unsigned long long>(written), outRate, bits,
               args.get("dither", "tpdf").c_str(), taps, static_cast<long long>(ms));
  return true;
}

// ----------------------------------------------------------------- dsd -----
bool runDsd(const Args& args, std::string* error) {
  const std::string in = args.get("in", args.positional.empty() ? "" : args.positional[0]);
  const std::string out = args.get("out");
  if (in.empty() || out.empty()) {
    *error = "usage: potatohq dsd --in <file> --out <file.dsf> [--dsd 64|128|256] [--order 5|7]";
    return false;
  }
  const int dsdMult = args.getInt("dsd", 64);
  const int dsdRate = 44100 * dsdMult;
  const int order = args.getInt("order", 7);
  const int taps = args.getInt("taps", 64);
  const double gainDb = args.getNum("gain", -3.0);

  FfmpegDecoder dec;
  if (!dec.open(in, error)) return false;
  const int srcRate = dec.sampleRate();
  const int channels = dec.channels();
  if (channels > 2) {
    *error = "DSD output currently supports 1-2 channels";
    return false;
  }

  DsfWriter writer;
  if (!writer.open(out, channels, dsdRate, error)) return false;

  ResamplerConfig rcfg;
  rcfg.tapsPerPhase = taps;
  PolyphaseResampler rs;
  if (!rs.configure(srcRate, dsdRate, rcfg, error)) return false;

  SdmConfig scfg;
  scfg.order = order;
  scfg.inputGainDb = gainDb;
  scfg.outOfBandGain = (order >= 7) ? 1.8 : 2.0;
  SdmModulator sdm;
  sdm.configure(scfg, channels);

  const uint64_t expectedBits = static_cast<uint64_t>(dec.durationSeconds() * dsdRate);
  uint64_t writtenBits = 0;
  size_t skip = rs.latencyOutputFrames();

  std::vector<float> inBuf(4096 * static_cast<size_t>(channels));
  std::vector<float> outBuf;
  std::vector<double> mono;
  std::vector<uint8_t> packed;
  const auto started = std::chrono::steady_clock::now();
  auto lastReport = started;

  auto emit = [&](std::vector<float>& buf, size_t frames) -> bool {
    if (frames == 0) return true;
    frames &= ~static_cast<size_t>(7);  // whole bytes only
    if (frames == 0) return true;
    mono.resize(frames * static_cast<size_t>(channels));
    for (size_t i = 0; i < mono.size(); ++i) mono[i] = static_cast<double>(buf[i]);
    sdm.process(mono.data(), frames, packed);
    const size_t bits = std::min<uint64_t>(frames, expectedBits - writtenBits);
    if (bits > 0 && !writer.write(packed, bits, error)) return false;
    writtenBits += bits;
    return true;
  };

  while (writtenBits < expectedBits && !g_interrupted.load()) {
    const size_t got = dec.read(inBuf.data(), 4096, error);
    if (got == 0) break;
    outBuf.clear();
    rs.process(inBuf.data(), got, outBuf);
    size_t frames = outBuf.size() / static_cast<size_t>(channels);
    if (skip > 0) {
      const size_t drop = std::min(skip, frames);
      skip -= drop;
      std::memmove(outBuf.data(), outBuf.data() + drop * static_cast<size_t>(channels),
                   (frames - drop) * static_cast<size_t>(channels) * sizeof(float));
      frames -= drop;
    }
    if (!emit(outBuf, frames)) return false;
    const auto now = std::chrono::steady_clock::now();
    if (now - lastReport > std::chrono::seconds(3)) {
      lastReport = now;
      const double pct = expectedBits ? 100.0 * static_cast<double>(writtenBits) / static_cast<double>(expectedBits) : 0.0;
      std::fprintf(stderr, "[potatohq] DSD %d: %.1f%%\n", dsdMult, pct);
    }
  }
  if (writtenBits < expectedBits) {
    outBuf.clear();
    rs.flush(outBuf);
    size_t frames = outBuf.size() / static_cast<size_t>(channels);
    if (skip > 0) {
      const size_t drop = std::min(skip, frames);
      frames -= drop;
    }
    if (frames > 0) {
      std::vector<float> tail(outBuf.begin() + static_cast<long>(skip * static_cast<size_t>(channels)),
                              outBuf.end());
      if (!emit(tail, frames)) return false;
    }
  }
  if (!writer.close(error)) return false;
  const auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
                      std::chrono::steady_clock::now() - started).count();
  std::fprintf(stderr, "[potatohq] DSD%d (%d Hz), order %d, %llu bits, %lld ms\n", dsdMult, dsdRate,
               order, static_cast<unsigned long long>(writtenBits), static_cast<long long>(ms));
  return true;
}


// -------------------------------------------------------------- dop file ---
// Writes a 24-bit DoP carrier WAV: verifiable without a DoP-capable DAC.
bool runDopFile(const Args& args, std::string* error) {
  const std::string in = args.get("in", args.positional.empty() ? "" : args.positional[0]);
  const std::string out = args.get("out");
  if (in.empty() || out.empty()) {
    *error = "usage: potatohq dop --in <file> --out <file.wav> [--dsd 64|128] [--order 5|7]";
    return false;
  }
  const int mult = args.getInt("dsd", 64);
  const int dsdRate = 44100 * mult;
  const int carrierRate = dsdRate / 16;
  const int order = args.getInt("order", 7);

  FfmpegDecoder dec;
  if (!dec.open(in, error)) return false;
  const int srcRate = dec.sampleRate();
  const int channels = dec.channels();
  if (channels > 2) { *error = "DoP supports 1-2 channels"; return false; }

  AudioFormat fmt;
  fmt.sampleRate = carrierRate;
  fmt.channels = channels;
  fmt.format = SampleFormat::S24;
  WavWriter writer;
  if (!writer.open(out, fmt, error)) return false;

  ResamplerConfig rcfg;
  rcfg.tapsPerPhase = 64;
  PolyphaseResampler rs;
  if (!rs.configure(srcRate, dsdRate, rcfg, error)) return false;

  SdmConfig scfg;
  scfg.order = order;
  scfg.inputGainDb = args.getNum("gain", -3.0);
  scfg.outOfBandGain = (order >= 7) ? 1.8 : 2.0;
  SdmModulator sdm;
  sdm.configure(scfg, channels);

  const uint64_t expectedCarrierFrames =
      static_cast<uint64_t>(std::llround(dec.durationSeconds() * carrierRate));
  uint64_t writtenFrames = 0;
  size_t skip = rs.latencyOutputFrames();
  skip = (skip / 16) * 16;

  std::vector<float> inBuf(4096 * static_cast<size_t>(channels));
  std::vector<float> pending;
  std::vector<double> block;
  std::vector<uint8_t> packed;
  std::vector<uint8_t> carrier;
  DopPacker packer;
  const size_t ch = static_cast<size_t>(channels);

  auto flushChunk = [&](size_t bits) -> bool {
    if (bits < 16) return true;
    block.resize(bits * ch);
    for (size_t i = 0; i < block.size(); ++i) block[i] = static_cast<double>(pending[i]);
    sdm.process(block.data(), bits, packed);
    const size_t carrierFrames = bits / 16;
    packer.pack(packed, bits, channels, carrier, 3);
    const size_t keep = static_cast<size_t>(std::min<uint64_t>(carrierFrames, expectedCarrierFrames - writtenFrames));
    if (keep > 0 && !writer.writeRaw(carrier.data(), keep, error)) return false;
    writtenFrames += keep;
    pending.erase(pending.begin(), pending.begin() + static_cast<long>(bits * ch));
    return true;
  };

  while (writtenFrames < expectedCarrierFrames && !g_interrupted.load()) {
    const size_t got = dec.read(inBuf.data(), 4096, error);
    if (got == 0) break;
    std::vector<float> outBuf;
    rs.process(inBuf.data(), got, outBuf);
    pending.insert(pending.end(), outBuf.begin(), outBuf.end());
    if (skip > 0) {
      const size_t drop = std::min(skip, pending.size() / ch);
      pending.erase(pending.begin(), pending.begin() + static_cast<long>(drop * ch));
      skip -= drop;
    }
    while (pending.size() / ch >= 2048) {
      if (!flushChunk(2048)) return false;
    }
  }
  {
    std::vector<float> tail;
    rs.flush(tail);
    pending.insert(pending.end(), tail.begin(), tail.end());
    if (skip > 0) {
      const size_t drop = std::min(skip, pending.size() / ch);
      pending.erase(pending.begin(), pending.begin() + static_cast<long>(drop * ch));
    }
    while (pending.size() / ch >= 16) {
      size_t bits = std::min<size_t>(2048, (pending.size() / ch) & ~static_cast<size_t>(15));
      if (bits < 16) break;
      if (!flushChunk(bits)) return false;
    }
  }
  if (!writer.close(error)) return false;
  std::fprintf(stderr, "[potatohq] DoP DSD%d -> %d Hz carrier, %llu frames\n", mult, carrierRate,
               static_cast<unsigned long long>(writtenFrames));
  return true;
}

// ---------------------------------------------------------------- play -----
int runPlay(const Args& args) {
  const std::string file = args.get("file", args.positional.empty() ? "" : args.positional[0]);
  if (file.empty()) {
    std::fprintf(stderr, "usage: potatohq play <file> [--device <uid>] [--no-exclusive] [--seconds N]\n");
    return 2;
  }
  Engine engine;
  engine.setOutputOptions(args.get("device"), !args.has("no-exclusive"));
  engine.setUpsampling(args.getInt("taps", 128));
  engine.setDsd(args.getInt("dsd", 0));
  engine.setSdmOrder(args.getInt("order", 7));
  engine.setVolume(args.getNum("volume", 0.3));
  std::string err;
  const std::string next = args.get("next");
  if (!engine.play(file, args.getNum("start", 0.0), &err, "", next, "")) {
    std::fprintf(stderr, "play failed: %s\n", err.c_str());
    return 1;
  }
  std::signal(SIGINT, onSignal);
  const auto deadline = args.getNum("seconds", 0.0);
  const auto started = std::chrono::steady_clock::now();
  while (engine.active() && !g_interrupted.load()) {
    std::this_thread::sleep_for(std::chrono::milliseconds(500));
    const Json st = engine.status();
    std::fprintf(stderr, "\r[potatohq] %s  %.2f / %.2f s  %d Hz -> %d Hz", st["playing"].asBool() ? "playing" : "idle",
                 st["position"].asNumber(), st["duration"].asNumber(), st["sourceRate"].asInt(),
                 st["outputRate"].asInt());
    if (engine.finished()) break;
    if (deadline > 0 && std::chrono::duration<double>(std::chrono::steady_clock::now() - started).count() > deadline)
      break;
  }
  std::fprintf(stderr, "\n");
  engine.stop();
  return 0;
}

// ---------------------------------------------------------------- info -----
int runInfo(const Args& args) {
  const std::string file = args.positional.empty() ? "" : args.positional[0];
  if (file.empty()) {
    std::fprintf(stderr, "usage: potatohq info <file>\n");
    return 2;
  }
  FfmpegDecoder dec;
  std::string err;
  if (!dec.open(file, &err)) {
    std::fprintf(stderr, "error: %s\n", err.c_str());
    return 1;
  }
  Json j = Json::object();
  j.set("path", file);
  j.set("codec", dec.codecName());
  j.set("container", dec.containerName());
  j.set("sampleRate", dec.sampleRate());
  j.set("channels", dec.channels());
  j.set("duration", dec.durationSeconds());
  Json tags = Json::object();
  std::string k, v;
  while (dec.nextTag(&k, &v)) tags.set(k, v);
  j.set("tags", tags);
  printJson(j);
  return 0;
}

int runDevices() {
  Json list = Json::array();
  for (const auto& d : CoreAudioOutput::enumerate()) {
    Json o = Json::object();
    o.set("id", d.id);
    o.set("name", d.name);
    o.set("channels", d.outputChannels);
    o.set("sampleRate", d.sampleRate);
    o.set("isDefault", d.isDefault);
    Json rates = Json::array();
    for (int r : d.supportedRates) rates.push(r);
    o.set("rates", rates);
    list.push(o);
  }
  printJson(list);
  return 0;
}

void usage() {
  std::printf(
      "potatoHQ %s — native audio engine\n"
      "  potatohq devices                      list CoreAudio output devices (JSON)\n"
      "  potatohq info <file>                  probe a file (JSON)\n"
      "  potatohq convert --in F --out F.wav [--rate N] [--bits 16|24|32]\n"
      "                  [--dither none|tpdf|tpdf-hp|ns] [--taps N] [--gain dB]\n"
      "  potatohq dsd --in F --out F.dsf [--dsd 64|128|256] [--order 5|7] [--taps N]\n"
      "  potatohq dop --in F --out F.wav [--dsd 64|128] [--order 5|7]   (24-bit DoP carrier)\n"
      "  potatohq play <file> [--seconds N] [--volume 0-1] [--start S] [--dsd 64|128] [--next F]\n"
      "  potatohq rpc                          JSON-RPC daemon on stdin/stdout\n",
      "1.0.0");
}

}  // namespace

int main(int argc, char** argv) {
  av_log_set_level(AV_LOG_ERROR);
  if (argc < 2) {
    usage();
    return 2;
  }
  const std::string cmd = argv[1];
  const Args args = parseArgs(argc, argv, 2);
  std::string err;

  if (cmd == "devices") return runDevices();
  if (cmd == "info") return runInfo(args);
  if (cmd == "convert") {
    if (!runConvert(args, &err)) {
      std::fprintf(stderr, "convert failed: %s\n", err.c_str());
      return 1;
    }
    return 0;
  }
  if (cmd == "dsd") {
    if (!runDsd(args, &err)) {
      std::fprintf(stderr, "dsd failed: %s\n", err.c_str());
      return 1;
    }
    return 0;
  }
  if (cmd == "dop") {
    if (!runDopFile(args, &err)) {
      std::fprintf(stderr, "dop failed: %s\n", err.c_str());
      return 1;
    }
    return 0;
  }
  if (cmd == "play") return runPlay(args);
  if (cmd == "rpc") {
    Engine engine;
    RpcServer server(engine);
    return server.run();
  }
  usage();
  return 2;
}
