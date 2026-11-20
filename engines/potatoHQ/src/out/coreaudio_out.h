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
  // Side-effect-free check used by the engine to keep a live AUHAL unit across a
  // track switch: true only when the currently open unit already matches the
  // requested device / channels / hog / client format / effective rate, so no
  // stop-close-reopen cycle is needed. Mirrors open()'s device fallback and its
  // rate policy (including the 48 kHz fallback) without writing any property.
  bool canReuse(const std::string& deviceId, int channels, bool hog, ClientFormat format,
                int requestedRate) const;
  void setRender(RenderFn fn) { render_ = std::move(fn); }
  bool start(std::string* error);
  void stop();
  // `restoreRate=false` keeps the device at the current nominal rate so a track
  // switch does not restore then immediately re-apply a rate (two hardware
  // reconfigurations back to back are the usual source of pops and dead IOProcs).
  void close(bool restoreRate = true);

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
  // Set when macOS moved the default output device (headphones plugged,
  // Bluetooth route change, ...). The engine reopens the output on this.
  bool routeChanged() const { return routeChanged_.load(std::memory_order_acquire); }
  void clearRouteChange() { routeChanged_.store(false, std::memory_order_release); }
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
  bool hogRequested_ = false;   // what open() was asked for, even if Hog Mode failed
  int requestedRate_ = 0;       // rate open() asked the device for (0 = keep current)
  double restoreRate_ = 0.0;  // nominal rate before we changed it
  std::string deviceName_;
  std::string actualFormat_;
  RenderFn render_;
  std::atomic<uint64_t> underruns_{0};
  std::atomic<uint64_t> callbacks_{0};
  std::atomic<bool> routeChanged_{false};
  bool routeListenerActive_ = false;
  static OSStatus routeListener(AudioObjectID objectId, UInt32 addressCount,
                                const AudioObjectPropertyAddress* addresses, void* clientData);
};

}  // namespace phq
