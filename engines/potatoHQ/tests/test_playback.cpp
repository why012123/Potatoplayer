// Digital playback regression: real decoder/engine, captured output (no speaker access).
#include "engine.h"
#include "decode/ffmpeg_decoder.h"
#include "io/wav.h"
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <mutex>
#include <random>
#include <string>
#include <thread>
#include <vector>

using namespace phq;
namespace {
CoreAudioOutput::RenderFn render;  // installed by the stub start(), pumped by tests
std::mutex renderMutex;            // guards `render` between the pump and the stub
int failures = 0, checks = 0;
// Stub hardware counters: a same-rate switch must keep the unit open, a real
// rate change must close exactly one unit and start one new one.
std::atomic<int> stubOpens{0};
std::atomic<int> stubStarts{0};
std::atomic<int> stubCloses{0};

void check(bool ok, const char* name) { ++checks; if (!ok) { ++failures; std::printf("FAIL: %s\n", name); } }
std::string fixture(const std::vector<float>& data, int channels, int rate = 44100) {
  std::string path = "build/playback-fixture.wav", error;
  WavWriter w;
  check(w.open(path, {rate, channels, SampleFormat::F32}, &error), "write fixture header");
  check(w.write(data.data(), data.size()/channels, &error) && w.close(&error), "write fixture samples");
  return path;
}
// Constant stereo fixture: switch transitions are analysed by their sample steps.
std::string constantFixture(const std::string& name, double seconds, float value, int rate) {
  std::string path = "build/" + name, error;
  WavWriter writer;
  const size_t frames = static_cast<size_t>(seconds * rate);
  std::vector<float> samples(frames * 2, value);
  check(writer.open(path, {rate, 2, SampleFormat::F32}, &error), "write switch fixture header");
  check(writer.write(samples.data(), frames, &error) && writer.close(&error), "write switch fixture samples");
  return path;
}
std::vector<float> decode(const std::string& path, int channels = 2) {
  FfmpegDecoder d; std::string e; std::vector<float> out, block(1024*channels);
  if (!d.open(path, &e, channels)) { check(false, e.c_str()); return out; }
  size_t n; while ((n=d.read(block.data(),1024,&e))) out.insert(out.end(),block.begin(),block.begin()+n*channels);
  check(e.empty(), "decoder completes without errors");
  return out;
}
// Pumps the captured render callback like a (fast) audio device and records every
// frame, so a click at the switch shows up as a large adjacent-sample step.
struct RenderPump {
  std::atomic<bool> running{false};
  std::atomic<uint64_t> blocks{0};
  std::thread thread;
  std::mutex mutex;
  std::vector<float> samples;

  void start(size_t blockFrames = 256) {
    running.store(true, std::memory_order_release);
    thread = std::thread([this, blockFrames] {
      std::vector<float> block(blockFrames * 2);
      while (running.load(std::memory_order_acquire)) {
        CoreAudioOutput::RenderFn fn;
        {
          std::lock_guard lock(renderMutex);
          fn = render;
        }
        if (fn) {
          fn(block.data(), blockFrames);
          std::lock_guard lock(mutex);
          samples.insert(samples.end(), block.begin(), block.end());
        }
        blocks.fetch_add(1, std::memory_order_relaxed);
        std::this_thread::sleep_for(std::chrono::milliseconds(2));
      }
    });
  }
  void stop() {
    running.store(false, std::memory_order_release);
    if (thread.joinable()) thread.join();
  }
  std::vector<float> snapshot() {
    std::lock_guard lock(mutex);
    return samples;
  }
  size_t frameCount() {
    std::lock_guard lock(mutex);
    return samples.size() / 2;
  }
  double channelMean(const std::vector<float>& data, size_t fromFrame) {
    double sum = 0.0;
    size_t count = 0;
    for (size_t i = fromFrame; i * 2 + 1 < data.size(); ++i, ++count) sum += data[i * 2];
    return count ? sum / static_cast<double>(count) : 0.0;
  }
};
void decoderTests() {
  std::mt19937 rng(42);
  for (int bits : {16,24}) {
    std::vector<float> expected; std::vector<unsigned char> raw;
    const int scale = 1 << (bits-1);
    for (int i=0;i<200000;++i) {
      int value = int(rng() % (2u*scale))-scale;
      expected.push_back(float(value)/scale);
      for (int b=0;b<bits/8;++b) raw.push_back((uint32_t(value)>>(8*b))&255);
    }
    std::string e; WavWriter w;
    check(w.open("build/playback-pcm.wav",{44100,2,bits==16?SampleFormat::S16:SampleFormat::S24},&e),"PCM header");
    check(w.writeRaw(raw.data(),expected.size()/2,&e)&&w.close(&e),"PCM raw data");
    check(decode("build/playback-pcm.wav")==expected,"16/24-bit PCM exact decode");
  }
  std::vector<float> mono(4096,0.25f);
  auto stereo=decode(fixture(mono,1));
  check(stereo==std::vector<float>(8192,0.25f),"mono unity duplication");
  // FFmpeg default 5.1: FL FR FC LFE BL BR. Separate impulses reveal missing channels.
  std::vector<float> surround(4096*6,0);
  for (int c=0;c<6;++c) surround[(100+c*100)*6+c]=0.5f;
  auto mixed=decode(fixture(surround,6));
  check(mixed.size()==8192,"5.1 frame count");
  if(mixed.size()==8192) {
    for(int c=0;c<6;++c) check(std::abs(mixed[(100+c*100)*2])+std::abs(mixed[(100+c*100)*2+1])>0.01,"every surround channel contributes");
    check(mixed[200]>0 && mixed[201]==0,"front left routing");
    check(mixed[400]==0 && mixed[401]>0,"front right routing");
    check(mixed[600]>0 && mixed[600]==mixed[601],"center routes equally to both ears");
  }
  auto full=decode(fixture(std::vector<float>(4096*6,1),6));
  check(!full.empty() && *std::max_element(full.begin(),full.end())<=1.000001f,"downmix normalized headroom");
}
// Same device/rate/channels/format: the AUHAL unit stays open and only the decode
// source is swapped, with a 15 ms (test-set) gain ramp on both sides of the seam.
void sameRateSwitchTest() {
  stubOpens = 0; stubStarts = 0; stubCloses = 0;
  const std::string first = constantFixture("playback-switch-a.wav", 6.0, 0.25f, 44100);
  const std::string second = constantFixture("playback-switch-b.wav", 6.0, -0.25f, 44100);
  Engine engine;
  engine.setVolume(1.0);
  engine.setFollowSourceRate(true);
  engine.setSwitchFadeFrames(512);  // deterministic ramp length for the capture
  std::string error;
  check(engine.play(first, 0, &error), "same-rate: initial play");

  RenderPump pump;
  pump.start();
  std::this_thread::sleep_for(std::chrono::milliseconds(25));

  const Json before = engine.status();
  const int opens0 = static_cast<int>(before["outputOpens"].asInt());
  const int reopens0 = static_cast<int>(before["outputReopens"].asInt());
  const int reuses0 = static_cast<int>(before["outputReuses"].asInt());
  const int64_t callbacks0 = before["callbacks"].asInt();
  const uint64_t blocks0 = pump.blocks.load(std::memory_order_relaxed);
  const size_t mark = pump.frameCount();

  check(engine.play(second, 0, &error), "same-rate: switch to the next track");

  const Json after = engine.status();
  check(after["outputReopens"].asInt() - reopens0 == 0, "same-rate switch reopens zero outputs");
  check(after["outputOpens"].asInt() - opens0 == 0, "same-rate switch opens zero outputs");
  check(after["outputReuses"].asInt() - reuses0 == 1, "same-rate switch reuses the live unit");
  check(after["outputOpen"].asBool(false), "same-rate switch keeps the unit open");
  check(after["outputRate"].asInt() == 44100, "same-rate switch keeps the output rate");
  check(after["device"].asString("") == "capture", "same-rate switch keeps the same device");
  check(stubOpens.load() == 1, "same-rate switch never calls open()");
  check(stubStarts.load() == 1, "same-rate switch never restarts the unit");
  check(stubCloses.load() == 0, "same-rate switch never closes the unit");
  check(pump.blocks.load(std::memory_order_relaxed) > blocks0, "render callbacks continue across the switch");
  check(after["callbacks"].asInt() > callbacks0, "output callback counter keeps advancing");

  std::this_thread::sleep_for(std::chrono::milliseconds(45));
  const std::vector<float> samples = pump.snapshot();
  // A hard cut from +0.25 to -0.25 would step by 0.5; the ramp keeps every step tiny.
  double maxStep = 0.0;
  for (size_t i = std::max<size_t>(1, mark); i < samples.size(); ++i) {
    maxStep = std::max(maxStep, std::abs(double(samples[i]) - samples[i - 1]));
  }
  check(maxStep < 0.01, "faded same-rate switch has no sample step (click-free)");
  const size_t frames = samples.size() / 2;
  check(mark * 2 < samples.size() && std::abs(double(samples[mark * 2]) - 0.25) < 0.05,
        "switch window starts on the old track");
  const double lastMean = frames > 32 ? pump.channelMean(samples, frames - 32) : 0.0;
  check(std::abs(lastMean + 0.25) < 5e-3, "new track content is present after the fade");

  // Several switches in a row must keep reusing the same live unit and stay
  // click-free: this catches stuck gates/gains that a single swap would hide.
  const size_t mark2 = pump.frameCount();
  for (int i = 0; i < 4; ++i) {
    check(engine.play(i % 2 ? first : second, 0, &error), "rapid same-rate switch");
  }
  const Json rapid = engine.status();
  check(rapid["outputReopens"].asInt() - reopens0 == 0, "rapid switches still reopen zero outputs");
  check(stubOpens.load() == 1, "rapid switches keep the one open unit");
  check(stubStarts.load() == 1 && stubCloses.load() == 0, "rapid switches never restart or close the unit");
  std::this_thread::sleep_for(std::chrono::milliseconds(45));
  const std::vector<float> rapidSamples = pump.snapshot();
  double rapidStep = 0.0;
  for (size_t i = std::max<size_t>(1, mark2); i < rapidSamples.size(); ++i) {
    rapidStep = std::max(rapidStep, std::abs(double(rapidSamples[i]) - rapidSamples[i - 1]));
  }
  check(rapidStep < 0.01, "rapid same-rate switches stay click-free");
  const size_t rapidFrames = rapidSamples.size() / 2;
  check(rapidFrames > 32 && std::abs(pump.channelMean(rapidSamples, rapidFrames - 32) - 0.25) < 5e-3,
        "rapid switches land on the last requested track");

  pump.stop();
  engine.stop();
}

// recover() exists for a stalled unit / route change: it must rebuild the
// hardware path even when the configuration looks reusable, exactly once.
void recoverTest() {
  stubOpens = 0; stubStarts = 0; stubCloses = 0;
  const std::string track = constantFixture("playback-recover.wav", 6.0, 0.15f, 44100);
  Engine engine;
  engine.setVolume(1.0);
  engine.setFollowSourceRate(true);
  engine.setSwitchFadeFrames(128);
  std::string error;
  check(engine.play(track, 0, &error), "recover: initial play");
  const Json before = engine.status();
  const int reopens0 = static_cast<int>(before["outputReopens"].asInt());
  check(engine.recover(0.25, &error), "recover: restarts the same track in place");
  const Json after = engine.status();
  check(after["outputReopens"].asInt() - reopens0 == 1, "recover rebuilds the output exactly once");
  check(stubOpens.load() == 2 && stubStarts.load() == 2, "recover opens and starts one new unit");
  check(stubCloses.load() == 1, "recover closes the old unit once");
  check(after["outputRate"].asInt() == 44100 && after["outputOpen"].asBool(false),
        "recover keeps the same rate and an open unit");
  check(std::abs(after["position"].asNumber() - 0.25) < 0.2, "recover keeps the requested position");
  engine.stop();
}
// A real rate change (44.1k -> 48k -> 44.1k) must rebuild the hardware path
// exactly once per switch, through the single close/open pair.
void rateChangeSwitchTest() {
  stubOpens = 0; stubStarts = 0; stubCloses = 0;
  const std::string first = constantFixture("playback-rate-a.wav", 6.0, 0.2f, 44100);
  const std::string second = constantFixture("playback-rate-b.wav", 6.0, -0.2f, 48000);
  Engine engine;
  engine.setVolume(1.0);
  engine.setFollowSourceRate(true);
  engine.setSwitchFadeFrames(256);
  std::string error;
  check(engine.play(first, 0, &error), "rate-change: initial play");
  const Json start = engine.status();
  check(start["outputRate"].asInt() == 44100, "rate-change: first track runs at 44.1k");

  // No capture pumping here: the hardware path is what is under test, and the
  // ramp waits simply expire while no callbacks are being produced.
  const int opens0 = static_cast<int>(start["outputOpens"].asInt());
  const int reopens0 = static_cast<int>(start["outputReopens"].asInt());
  const int reuses0 = static_cast<int>(start["outputReuses"].asInt());
  check(engine.play(second, 0, &error), "rate-change: switch to a 48 kHz track");
  const Json after = engine.status();
  check(after["outputRate"].asInt() == 48000, "rate-change: switch follows the new source rate");
  check(after["outputReopens"].asInt() - reopens0 == 1, "rate-change switch reopens exactly once");
  check(after["outputOpens"].asInt() - opens0 == 1, "rate-change switch opens the new rate once");
  check(after["outputReuses"].asInt() - reuses0 == 0, "rate-change switch cannot reuse the unit");
  check(stubOpens.load() == 2, "rate-change switch calls open() once");
  check(stubStarts.load() == 2, "rate-change switch starts the rebuilt unit");
  check(stubCloses.load() == 1, "rate-change switch closes the old unit once");

  RenderPump pump;
  pump.start();
  std::this_thread::sleep_for(std::chrono::milliseconds(45));
  const std::vector<float> samples = pump.snapshot();
  pump.stop();
  const size_t frames = samples.size() / 2;
  const double lastMean = frames > 32 ? pump.channelMean(samples, frames - 32) : 0.0;
  check(std::abs(lastMean + 0.2) < 5e-3, "rate-change: new content is present after the fade");

  // And back: exactly one more reopen, never a rate thrash.
  const int reopens1 = static_cast<int>(after["outputReopens"].asInt());
  check(engine.play(first, 0, &error), "rate-change: switch back to 44.1k");
  const Json back = engine.status();
  check(back["outputRate"].asInt() == 44100, "rate-change: switched back to 44.1k");
  check(back["outputReopens"].asInt() - reopens1 == 1, "switch back reopens exactly once");
  check(stubCloses.load() == 2, "switch back closes one more unit");
  engine.stop();
}
void engineTest(bool effects, bool resample = true) {
  std::vector<float> input(8192*2);
  for(size_t f=0;f<input.size()/2;++f) {
    input[f*2]=float(0.2*std::sin(f*0.19));
    input[f*2+1]=float(0.13*std::cos(f*0.11));
  }
  auto path=fixture(input,2);
  PolyphaseResampler rs; ResamplerConfig cfg; std::string e;
  rs.configure(44100,48000,cfg,&e);
  std::vector<float> expected;
  if (resample) { rs.process(input.data(),input.size()/2,expected); rs.flush(expected); }
  else expected = input;
  if(effects) {
    ChannelEq eq; eq.configure(48000,2,{},-6); eq.process(expected.data(),expected.size()/2);
    CrossfeedProcessor cf; cf.configure(48000,2); cf.setTarget(true,0.5); cf.process(expected.data(),expected.size()/2);
    SpatialPanner sp; sp.configure(48000,2); sp.setTarget({true,0.4,-0.3}); sp.process(expected.data(),expected.size()/2);
  }
  Engine engine; engine.setVolume(1); engine.setFollowSourceRate(!resample);
  if(effects) { engine.applyEq({},-6); engine.setCrossfeed(true,0.5); engine.setSpatial(true,0.4,-0.3); }
  check(engine.play(path,0,&e),"start captured playback");
  std::vector<float> actual;
  for(int i=0;i<3000 && !engine.finished();++i) {
    std::vector<float> block(256*2); if(render) render(block.data(),256);
    actual.insert(actual.end(),block.begin(),block.end());
    std::this_thread::sleep_for(std::chrono::milliseconds(1));
  }
  check(engine.finished(),"captured playback finishes");
  engine.stop();
  check(actual.size()>=expected.size(),"full resampler tail delivered");
  double error=0;
  for(size_t i=0;i<std::min(actual.size(),expected.size());++i) error=std::max(error,double(std::abs(actual[i]-expected[i])));
  std::printf("%s playback max error: %.9g\n",effects?"effects + tail":resample?"resampled":"same rate bypass",error);
  check(error<1e-6,"output including tail matches offline chain");
}
}
// Substitute the device boundary only; decode, buffering, DSP and render are production code.
namespace phq {
CoreAudioOutput::~CoreAudioOutput(){close();}
std::vector<DeviceInfo> CoreAudioOutput::enumerate(){return {};}
bool CoreAudioOutput::supportsSampleRate(const std::string&,int){return true;}
std::vector<int> CoreAudioOutput::supportedRates(const std::string&){return {44100,48000,96000};}
std::string CoreAudioOutput::defaultDeviceId(){return "capture";}
bool CoreAudioOutput::canReuse(const std::string& deviceId,int ch,bool hog,ClientFormat fmt,int rate) const {
  if (!unit_) return false;
  const std::string wanted = deviceId.empty() ? "capture" : deviceId;
  if (deviceName_ != wanted) return false;
  if (ch != channels_ || fmt != format_ || hog != hogRequested_) return false;
  if (rate > 0 && rate != sampleRate_) return false;
  return true;
}
bool CoreAudioOutput::open(const std::string& deviceId,int ch,bool hog,ClientFormat fmt,int rate,std::string*){
  ++stubOpens;
  unit_=reinterpret_cast<void*>(1);
  deviceName_=deviceId.empty()?"capture":deviceId;
  channels_=ch; format_=fmt; hogRequested_=hog; requestedRate_=rate;
  sampleRate_=rate?rate:48000;
  callbacks_.store(0);
  return true;
}
bool CoreAudioOutput::start(std::string*){
  if (!unit_) return false;
  ++stubStarts;
  std::lock_guard lock(renderMutex);
  render=[this](void* data,size_t frames){
    callbacks_.fetch_add(1,std::memory_order_relaxed);
    if (render_) render_(data,frames);
  };
  return true;
}
void CoreAudioOutput::stop(){std::lock_guard lock(renderMutex);render={};}
void CoreAudioOutput::close(bool){
  stop();
  if (unit_) { ++stubCloses; unit_=nullptr; }
}
}
int main(){
  decoderTests();
  sameRateSwitchTest();
  rateChangeSwitchTest();
  recoverTest();
  engineTest(false,false);
  engineTest(false);
  engineTest(true);
  std::printf("%d checks, %d failures\n",checks,failures);
  return failures?1:0;
}
