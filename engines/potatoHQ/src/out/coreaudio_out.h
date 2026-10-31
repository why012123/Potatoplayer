// potatoHQ — CoreAudio (AUHAL) output: device pick, Hog Mode, float32 or 24-in-32.
#pragma once

#include <AudioToolbox/AudioToolbox.h>
#include <CoreAudio/CoreAudio.h>

#include <atomic>
#include <cstdint>
#include <functional>
#include <string>
#include <vector>

namespace phq {

enum class ClientFormat {
  Float32,    // interleaved float32
  Int24In32,  // 24 valid bits in a 32-bit container (DoP carrier)
};

struct DeviceInfo {
  std::string id;  // CoreAudio device UID
  std::string name;
  int outputChannels = 0;
  double sampleRate = 0.0;
  bool isDefault = false;
  std::vector<int> supportedRates;
};

class CoreAudioOutput {
 public:
  // `data` points at the client buffer in the format negotiated by open().
  using RenderFn = std::function<void(void* data, size_t frames)>;

  CoreAudioOutput() = default;
  ~CoreAudioOutput();

  static std::vector<DeviceInfo> enumerate();
  static bool supportsSampleRate(const std::string& deviceId, int rate);
  static std::vector<int> supportedRates(const std::string& deviceId);
  static std::string defaultDeviceId();

  bool open(const std::string& deviceId, int channels, bool hog, ClientFormat format,
            int requestedRate, std::string* error);
  void setRender(RenderFn fn) { render_ = std::move(fn); }
  bool start(std::string* error);
  void stop();
  void close();

  bool isOpen() const { return unit_ != nullptr; }
  int sampleRate() const { return sampleRate_; }
  int channels() const { return channels_; }
  ClientFormat format() const { return format_; }
  bool integerFormat() const { return format_ == ClientFormat::Int24In32; }
  const std::string& deviceName() const { return deviceName_; }
  bool hogAcquired() const { return hogAcquired_; }
  uint64_t underruns() const { return underruns_.load(std::memory_order_relaxed); }
  void countUnderrun() { underruns_.fetch_add(1, std::memory_order_relaxed); }
  uint64_t callbacks() const { return callbacks_.load(std::memory_order_relaxed); }
  const std::string& actualFormat() const { return actualFormat_; }

 private:
  static OSStatus renderProc(void* refCon, AudioUnitRenderActionFlags* actionFlags,
                             const AudioTimeStamp* timeStamp, UInt32 bus, UInt32 frames,
                             AudioBufferList* ioData);
  void renderInternal(void* data, size_t frames);

  void* unit_ = nullptr;  // AudioUnit
  uint32_t deviceId_ = 0;
  int sampleRate_ = 0;
  int channels_ = 2;
  ClientFormat format_ = ClientFormat::Float32;
  bool hogAcquired_ = false;
  double restoreRate_ = 0.0;  // nominal rate before we changed it
  std::string deviceName_;
  std::string actualFormat_;
  RenderFn render_;
  std::atomic<uint64_t> underruns_{0};
  std::atomic<uint64_t> callbacks_{0};
};

}  // namespace phq
