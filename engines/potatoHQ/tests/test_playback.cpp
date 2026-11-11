// Digital playback regression: real decoder/engine, captured output (no speaker access).
#include "engine.h"
#include "decode/ffmpeg_decoder.h"
#include "io/wav.h"
#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <random>
#include <thread>

using namespace phq;
namespace {
CoreAudioOutput::RenderFn render;
int failures = 0, checks = 0;
void check(bool ok, const char* name) { ++checks; if (!ok) { ++failures; std::printf("FAIL: %s\n", name); } }
std::string fixture(const std::vector<float>& data, int channels, int rate = 44100) {
  std::string path = "build/playback-fixture.wav", error;
  WavWriter w;
  check(w.open(path, {rate, channels, SampleFormat::F32}, &error), "write fixture header");
  check(w.write(data.data(), data.size()/channels, &error) && w.close(&error), "write fixture samples");
  return path;
}
std::vector<float> decode(const std::string& path, int channels = 2) {
  FfmpegDecoder d; std::string e; std::vector<float> out, block(1024*channels);
  if (!d.open(path, &e, channels)) { check(false, e.c_str()); return out; }
  size_t n; while ((n=d.read(block.data(),1024,&e))) out.insert(out.end(),block.begin(),block.begin()+n*channels);
  check(e.empty(), "decoder completes without errors");
  return out;
}
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
bool CoreAudioOutput::open(const std::string&,int ch,bool,ClientFormat fmt,int rate,std::string*){channels_=ch;format_=fmt;sampleRate_=rate?rate:48000;return true;}
bool CoreAudioOutput::start(std::string*){render=render_;return true;}
void CoreAudioOutput::stop(){render={};}
void CoreAudioOutput::close(){stop();}
}
int main(){decoderTests();engineTest(false,false);engineTest(false);engineTest(true);std::printf("%d checks, %d failures\n",checks,failures);return failures?1:0;}
