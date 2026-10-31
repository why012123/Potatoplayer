#include "out/coreaudio_out.h"

#include <unistd.h>

#include <algorithm>
#include <cmath>
#include <cstring>

namespace phq {
namespace {

std::string cfToUtf8(CFStringRef s) {
  if (!s) return {};
  const CFIndex len =
      CFStringGetMaximumSizeForEncoding(CFStringGetLength(s), kCFStringEncodingUTF8) + 1;
  std::string out(static_cast<size_t>(len), '\0');
  if (!CFStringGetCString(s, out.data(), len, kCFStringEncodingUTF8)) return {};
  out.resize(std::strlen(out.c_str()));
  return out;
}

std::string deviceNameOf(AudioDeviceID dev) {
  AudioObjectPropertyAddress addr{kAudioObjectPropertyName, kAudioObjectPropertyScopeGlobal,
                                  kAudioObjectPropertyElementMain};
  CFStringRef name = nullptr;
  UInt32 size = sizeof(name);
  if (AudioObjectGetPropertyData(dev, &addr, 0, nullptr, &size, &name) != noErr || !name) return {};
  std::string out = cfToUtf8(name);
  CFRelease(name);
  return out;
}

std::string deviceUid(AudioDeviceID dev) {
  AudioObjectPropertyAddress addr{kAudioDevicePropertyDeviceUID, kAudioObjectPropertyScopeGlobal,
                                  kAudioObjectPropertyElementMain};
  CFStringRef uid = nullptr;
  UInt32 size = sizeof(uid);
  if (AudioObjectGetPropertyData(dev, &addr, 0, nullptr, &size, &uid) != noErr || !uid) return {};
  std::string out = cfToUtf8(uid);
  CFRelease(uid);
  return out;
}

int outputChannels(AudioDeviceID dev) {
  AudioObjectPropertyAddress addr{kAudioDevicePropertyStreamConfiguration,
                                  kAudioDevicePropertyScopeOutput,
                                  kAudioObjectPropertyElementMain};
  UInt32 size = 0;
  if (AudioObjectGetPropertyDataSize(dev, &addr, 0, nullptr, &size) != noErr || size == 0) return 0;
  std::vector<uint8_t> buf(size);
  auto* list = reinterpret_cast<AudioBufferList*>(buf.data());
  if (AudioObjectGetPropertyData(dev, &addr, 0, nullptr, &size, list) != noErr) return 0;
  int total = 0;
  for (UInt32 i = 0; i < list->mNumberBuffers; ++i)
    total += static_cast<int>(list->mBuffers[i].mNumberChannels);
  return total;
}

double nominalRate(AudioDeviceID dev) {
  AudioObjectPropertyAddress addr{kAudioDevicePropertyNominalSampleRate,
                                  kAudioObjectPropertyScopeGlobal,
                                  kAudioObjectPropertyElementMain};
  Float64 rate = 0;
  UInt32 size = sizeof(rate);
  if (AudioObjectGetPropertyData(dev, &addr, 0, nullptr, &size, &rate) != noErr) return 0.0;
  return rate;
}

bool setNominalRate(AudioDeviceID dev, double rate) {
  AudioObjectPropertyAddress addr{kAudioDevicePropertyNominalSampleRate,
                                  kAudioObjectPropertyScopeGlobal,
                                  kAudioObjectPropertyElementMain};
  if (!AudioObjectHasProperty(dev, &addr) || !AudioObjectIsPropertySettable(dev, &addr, nullptr)) {
    return false;
  }
  const double current = nominalRate(dev);
  if (std::abs(current - rate) < 1.0) return true;
  if (AudioObjectSetPropertyData(dev, &addr, 0, nullptr, sizeof(double), &rate) != noErr) return false;
  // The HAL reports the new rate asynchronously; poll until it settles.
  for (int i = 0; i < 100; ++i) {
    usleep(10000);
    if (std::abs(nominalRate(dev) - rate) < 1.0) return true;
  }
  return std::abs(nominalRate(dev) - rate) < 1.0;
}

std::vector<int> availableRates(AudioDeviceID dev) {
  std::vector<int> out;
  AudioObjectPropertyAddress addr{kAudioDevicePropertyAvailableNominalSampleRates,
                                  kAudioObjectPropertyScopeGlobal,
                                  kAudioObjectPropertyElementMain};
  UInt32 size = 0;
  if (AudioObjectGetPropertyDataSize(dev, &addr, 0, nullptr, &size) != noErr || size == 0) return out;
  std::vector<AudioValueRange> ranges(size / sizeof(AudioValueRange));
  if (AudioObjectGetPropertyData(dev, &addr, 0, nullptr, &size, ranges.data()) != noErr) return out;
  for (const auto& r : ranges) {
    for (int candidate : {44100, 48000, 88200, 96000, 176400, 192000, 352800, 384000, 705600, 768000}) {
      if (candidate >= r.mMinimum - 1.0 && candidate <= r.mMaximum + 1.0 &&
          std::find(out.begin(), out.end(), candidate) == out.end()) {
        out.push_back(candidate);
      }
    }
  }
  std::sort(out.begin(), out.end());
  return out;
}

bool rateSupported(AudioDeviceID dev, int rate) {
  AudioObjectPropertyAddress addr{kAudioDevicePropertyAvailableNominalSampleRates,
                                  kAudioObjectPropertyScopeGlobal,
                                  kAudioObjectPropertyElementMain};
  UInt32 size = 0;
  if (AudioObjectGetPropertyDataSize(dev, &addr, 0, nullptr, &size) != noErr || size == 0) {
    return std::abs(nominalRate(dev) - static_cast<double>(rate)) < 1.0;
  }
  std::vector<AudioValueRange> ranges(size / sizeof(AudioValueRange));
  if (AudioObjectGetPropertyData(dev, &addr, 0, nullptr, &size, ranges.data()) != noErr) {
    return std::abs(nominalRate(dev) - static_cast<double>(rate)) < 1.0;
  }
  for (const auto& r : ranges) {
    if (static_cast<double>(rate) >= r.mMinimum - 1.0 &&
        static_cast<double>(rate) <= r.mMaximum + 1.0) {
      return true;
    }
  }
  return false;
}

AudioDeviceID defaultOutputDevice() {
  AudioObjectPropertyAddress addr{kAudioHardwarePropertyDefaultOutputDevice,
                                  kAudioObjectPropertyScopeGlobal,
                                  kAudioObjectPropertyElementMain};
  AudioDeviceID dev = 0;
  UInt32 size = sizeof(dev);
  if (AudioObjectGetPropertyData(kAudioObjectSystemObject, &addr, 0, nullptr, &size, &dev) != noErr)
    return 0;
  return dev;
}

AudioDeviceID findDeviceByUid(const std::string& uid) {
  AudioObjectPropertyAddress addr{kAudioHardwarePropertyDevices, kAudioObjectPropertyScopeGlobal,
                                  kAudioObjectPropertyElementMain};
  UInt32 size = 0;
  if (AudioObjectGetPropertyDataSize(kAudioObjectSystemObject, &addr, 0, nullptr, &size) != noErr)
    return 0;
  const UInt32 count = size / sizeof(AudioDeviceID);
  std::vector<AudioDeviceID> devices(count);
  if (AudioObjectGetPropertyData(kAudioObjectSystemObject, &addr, 0, nullptr, &size, devices.data()) !=
      noErr)
    return 0;
  for (AudioDeviceID d : devices) {
    if (deviceUid(d) == uid) return d;
  }
  return 0;
}

AudioDeviceID resolveDevice(const std::string& deviceId) {
  return deviceId.empty() ? defaultOutputDevice() : findDeviceByUid(deviceId);
}

}  // namespace

CoreAudioOutput::~CoreAudioOutput() { close(); }

std::vector<DeviceInfo> CoreAudioOutput::enumerate() {
  std::vector<DeviceInfo> out;
  AudioObjectPropertyAddress addr{kAudioHardwarePropertyDevices, kAudioObjectPropertyScopeGlobal,
                                  kAudioObjectPropertyElementMain};
  UInt32 size = 0;
  if (AudioObjectGetPropertyDataSize(kAudioObjectSystemObject, &addr, 0, nullptr, &size) != noErr)
    return out;
  const UInt32 count = size / sizeof(AudioDeviceID);
  std::vector<AudioDeviceID> devices(count);
  if (AudioObjectGetPropertyData(kAudioObjectSystemObject, &addr, 0, nullptr, &size, devices.data()) !=
      noErr)
    return out;
  const AudioDeviceID def = defaultOutputDevice();
  for (AudioDeviceID d : devices) {
    const int ch = outputChannels(d);
    if (ch <= 0) continue;
    DeviceInfo info;
    info.id = deviceUid(d);
    info.name = deviceNameOf(d);
    info.outputChannels = ch;
    info.sampleRate = nominalRate(d);
    info.supportedRates = availableRates(d);
    info.isDefault = (d == def);
    out.push_back(std::move(info));
  }
  std::sort(out.begin(), out.end(), [](const DeviceInfo& a, const DeviceInfo& b) {
    if (a.isDefault != b.isDefault) return a.isDefault;
    return a.name < b.name;
  });
  return out;
}

std::string CoreAudioOutput::defaultDeviceId() {
  const AudioDeviceID d = defaultOutputDevice();
  return d ? deviceUid(d) : std::string();
}

bool CoreAudioOutput::supportsSampleRate(const std::string& deviceId, int rate) {
  const AudioDeviceID d = resolveDevice(deviceId);
  return d != 0 && rateSupported(d, rate);
}

std::vector<int> CoreAudioOutput::supportedRates(const std::string& deviceId) {
  const AudioDeviceID d = resolveDevice(deviceId);
  return d == 0 ? std::vector<int>{} : availableRates(d);
}

OSStatus CoreAudioOutput::renderProc(void* refCon, AudioUnitRenderActionFlags* actionFlags,
                                     const AudioTimeStamp* timeStamp, UInt32 bus, UInt32 frames,
                                     AudioBufferList* ioData) {
  (void)actionFlags;
  (void)timeStamp;
  (void)bus;
  auto* self = static_cast<CoreAudioOutput*>(refCon);
  if (!self || !ioData || ioData->mNumberBuffers == 0) return noErr;
  self->renderInternal(ioData->mBuffers[0].mData, frames);
  return noErr;
}

void CoreAudioOutput::renderInternal(void* data, size_t frames) {
  callbacks_.fetch_add(1, std::memory_order_relaxed);
  if (render_) {
    render_(data, frames);
    return;
  }
  std::memset(data, 0, frames * 4 * static_cast<size_t>(channels_));
}

bool CoreAudioOutput::open(const std::string& deviceId, int channels, bool hog, ClientFormat format,
                           int requestedRate, std::string* error) {
  close();
  channels_ = std::max(1, channels);
  format_ = format;

  AudioDeviceID dev = resolveDevice(deviceId);
  // A saved USB/Bluetooth device may disappear between sessions. Falling back
  // to the current default output is safer than making playback unavailable.
  if (dev == 0 && !deviceId.empty()) dev = defaultOutputDevice();
  if (dev == 0) {
    if (error) *error = "output device not found: " + (deviceId.empty() ? "(default)" : deviceId);
    return false;
  }
  deviceId_ = dev;
  deviceName_ = deviceNameOf(dev);

  if (requestedRate > 0) {
    const double previous = nominalRate(dev);
    bool switched = std::abs(previous - static_cast<double>(requestedRate)) < 1.0;
    if (!switched && rateSupported(dev, requestedRate)) {
      switched = setNominalRate(dev, static_cast<double>(requestedRate));
    }
    // Bluetooth headsets in a call expose a mono HFP route and refuse 44.1k.
    // Try 48k once (the usual A2DP rate), then continue at whatever the device
    // currently offers; the engine resamples instead of failing the track.
    if (!switched && requestedRate != 48000 && rateSupported(dev, 48000)) {
      switched = setNominalRate(dev, 48000.0);
    }
    if (switched && std::abs(previous - nominalRate(dev)) > 1.0) {
      restoreRate_ = previous;
    } else {
      restoreRate_ = 0.0;
    }
  }
  const double rate = nominalRate(dev);
  sampleRate_ = rate > 0 ? static_cast<int>(std::llround(rate)) : 44100;

  if (hog) {
    pid_t pid = getpid();
    AudioObjectPropertyAddress hogAddr{kAudioDevicePropertyHogMode, kAudioObjectPropertyScopeGlobal,
                                       kAudioObjectPropertyElementMain};
    if (AudioObjectSetPropertyData(dev, &hogAddr, 0, nullptr, sizeof(pid), &pid) == noErr) {
      pid_t owner = -1;
      UInt32 size = sizeof(owner);
      if (AudioObjectGetPropertyData(dev, &hogAddr, 0, nullptr, &size, &owner) == noErr && owner == pid)
        hogAcquired_ = true;
    }
  }

  AudioComponentDescription desc{};
  desc.componentType = kAudioUnitType_Output;
  desc.componentSubType = kAudioUnitSubType_HALOutput;
  desc.componentManufacturer = kAudioUnitManufacturer_Apple;
  AudioComponent comp = AudioComponentFindNext(nullptr, &desc);
  if (!comp) {
    if (error) *error = "HAL output unit unavailable";
    return false;
  }
  AudioUnit unit = nullptr;
  if (AudioComponentInstanceNew(comp, &unit) != noErr || !unit) {
    if (error) *error = "cannot instantiate output unit";
    return false;
  }
  unit_ = unit;

  UInt32 enable = 1, disable = 0;
  AudioUnitSetProperty(unit, kAudioOutputUnitProperty_EnableIO, kAudioUnitScope_Output, 0, &enable,
                       sizeof(enable));
  AudioUnitSetProperty(unit, kAudioOutputUnitProperty_EnableIO, kAudioUnitScope_Input, 1, &disable,
                       sizeof(disable));
  AudioUnitSetProperty(unit, kAudioOutputUnitProperty_CurrentDevice, kAudioUnitScope_Global, 0, &dev,
                       sizeof(dev));

  AudioStreamBasicDescription fmt{};
  fmt.mSampleRate = static_cast<double>(sampleRate_);
  fmt.mFormatID = kAudioFormatLinearPCM;
  fmt.mChannelsPerFrame = static_cast<UInt32>(channels_);
  fmt.mBytesPerPacket = static_cast<UInt32>(4 * channels_);
  fmt.mFramesPerPacket = 1;
  fmt.mBytesPerFrame = static_cast<UInt32>(4 * channels_);
  if (format_ == ClientFormat::Float32) {
    fmt.mFormatFlags = kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked;
    fmt.mBitsPerChannel = 32;
  } else {
    // 24 valid bits inside a 32-bit container; the DoP marker lives in the top byte.
    fmt.mFormatFlags = kAudioFormatFlagIsSignedInteger | kAudioFormatFlagIsPacked;
    fmt.mBitsPerChannel = 24;
  }
  if (AudioUnitSetProperty(unit, kAudioUnitProperty_StreamFormat, kAudioUnitScope_Input, 0, &fmt,
                           sizeof(fmt)) != noErr) {
    if (error) *error = format_ == ClientFormat::Float32
                            ? "device rejected float32 client format"
                            : "device rejected 24-in-32 integer client format (DoP unsupported)";
    close();
    return false;
  }

  UInt32 maxFrames = 4096;
  AudioUnitSetProperty(unit, kAudioUnitProperty_MaximumFramesPerSlice, kAudioUnitScope_Global, 0,
                       &maxFrames, sizeof(maxFrames));

  AURenderCallbackStruct cb{};
  cb.inputProc = &CoreAudioOutput::renderProc;
  cb.inputProcRefCon = this;
  if (AudioUnitSetProperty(unit, kAudioUnitProperty_SetRenderCallback, kAudioUnitScope_Input, 0, &cb,
                           sizeof(cb)) != noErr) {
    if (error) *error = "cannot install render callback";
    close();
    return false;
  }
  if (AudioUnitInitialize(unit) != noErr) {
    if (error) *error = "cannot initialize output unit";
    close();
    return false;
  }
  actualFormat_ = std::string(format_ == ClientFormat::Float32 ? "float32 " : "int24-in-32 ") +
                  std::to_string(sampleRate_) + " Hz " + std::to_string(channels_) + " ch" +
                  (hogAcquired_ ? " (hog)" : "");
  return true;
}

bool CoreAudioOutput::start(std::string* error) {
  if (!unit_) {
    if (error) *error = "output not open";
    return false;
  }
  if (AudioOutputUnitStart(static_cast<AudioUnit>(unit_)) != noErr) {
    if (error) *error = "cannot start output unit";
    return false;
  }
  return true;
}

void CoreAudioOutput::stop() {
  if (unit_) AudioOutputUnitStop(static_cast<AudioUnit>(unit_));
}

void CoreAudioOutput::close() {
  if (unit_) {
    AudioOutputUnitStop(static_cast<AudioUnit>(unit_));
    AudioUnitUninitialize(static_cast<AudioUnit>(unit_));
    AudioComponentInstanceDispose(static_cast<AudioUnit>(unit_));
    unit_ = nullptr;
  }
  if (restoreRate_ > 0.0 && deviceId_ != 0) {
    setNominalRate(deviceId_, restoreRate_);
    restoreRate_ = 0.0;
  }
  if (hogAcquired_ && deviceId_ != 0) {
    pid_t pid = -1;
    AudioObjectPropertyAddress hogAddr{kAudioDevicePropertyHogMode, kAudioObjectPropertyScopeGlobal,
                                       kAudioObjectPropertyElementMain};
    AudioObjectSetPropertyData(deviceId_, &hogAddr, 0, nullptr, sizeof(pid), &pid);
    hogAcquired_ = false;
  }
  deviceId_ = 0;
}

}  // namespace phq
