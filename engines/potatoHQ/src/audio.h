// potatoHQ — core audio types.
#pragma once

#include <atomic>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>

namespace phq {

enum class SampleFormat {
  S16,      // signed 16-bit LE
  S24,      // signed 24-bit packed LE
  S32,      // signed 32-bit LE
  F32,      // IEEE float 32
  DSD_U8,   // 1-bit packed, 8 bits per byte (native DSD)
};

struct AudioFormat {
  int sampleRate = 44100;
  int channels = 2;
  SampleFormat format = SampleFormat::S16;

  int bits() const {
    switch (format) {
      case SampleFormat::S16: return 16;
      case SampleFormat::S24: return 24;
      case SampleFormat::S32: return 32;
      case SampleFormat::F32: return 32;
      case SampleFormat::DSD_U8: return 1;
    }
    return 16;
  }
  size_t bytesPerSample() const {
    switch (format) {
      case SampleFormat::S16: return 2;
      case SampleFormat::S24: return 3;
      case SampleFormat::S32: return 4;
      case SampleFormat::F32: return 4;
      case SampleFormat::DSD_U8: return 1;
    }
    return 2;
  }
  size_t frameBytes() const { return bytesPerSample() * static_cast<size_t>(channels); }
  bool isDsd() const { return format == SampleFormat::DSD_U8; }
};

inline const char* sampleFormatName(SampleFormat f) {
  switch (f) {
    case SampleFormat::S16: return "s16";
    case SampleFormat::S24: return "s24";
    case SampleFormat::S32: return "s32";
    case SampleFormat::F32: return "f32";
    case SampleFormat::DSD_U8: return "dsd_u8";
  }
  return "?";
}

// A block of interleaved float samples (used by decode + DSP + file output).
struct AudioBlock {
  std::vector<float> samples;  // interleaved
  int channels = 2;

  size_t frames() const { return channels > 0 ? samples.size() / static_cast<size_t>(channels) : 0; }
  void resizeFrames(size_t n) { samples.assign(n * static_cast<size_t>(channels), 0.0f); }
  float* data() { return samples.data(); }
  const float* data() const { return samples.data(); }
};

// Single-producer / single-consumer ring of interleaved float frames.
class FloatRing {
 public:
  void reset(size_t capacityFrames, int channels) {
    channels_ = channels < 1 ? 1 : channels;
    capacity_ = capacityFrames < 1 ? 1 : capacityFrames;
    data_.assign(capacity_ * static_cast<size_t>(channels_), 0.0f);
    readPos_.store(0, std::memory_order_relaxed);
    writePos_.store(0, std::memory_order_relaxed);
  }

  size_t available() const {
    const size_t w = writePos_.load(std::memory_order_acquire);
    const size_t r = readPos_.load(std::memory_order_relaxed);
    return w - r;
  }
  size_t space() const { return capacity_ - available(); }

  // Producer side. Returns frames written.
  size_t write(const float* src, size_t frames) {
    const size_t w = writePos_.load(std::memory_order_relaxed);
    const size_t r = readPos_.load(std::memory_order_acquire);
    const size_t freeFrames = capacity_ - (w - r);
    const size_t n = frames < freeFrames ? frames : freeFrames;
    if (n == 0) return 0;
    const size_t ch = static_cast<size_t>(channels_);
    for (size_t i = 0; i < n; ++i) {
      const size_t dst = ((w + i) % capacity_) * ch;
      std::memcpy(&data_[dst], src + i * ch, ch * sizeof(float));
    }
    writePos_.store(w + n, std::memory_order_release);
    return n;
  }

  // Consumer side. Returns frames read; unfilled tail is zeroed.
  size_t read(float* dst, size_t frames) {
    const size_t r = readPos_.load(std::memory_order_relaxed);
    const size_t w = writePos_.load(std::memory_order_acquire);
    const size_t avail = w - r;
    const size_t n = frames < avail ? frames : avail;
    const size_t ch = static_cast<size_t>(channels_);
    for (size_t i = 0; i < n; ++i) {
      const size_t src = ((r + i) % capacity_) * ch;
      std::memcpy(dst + i * ch, &data_[src], ch * sizeof(float));
    }
    if (n < frames) std::memset(dst + n * ch, 0, (frames - n) * ch * sizeof(float));
    readPos_.store(r + n, std::memory_order_release);
    return n;
  }

  void clear() {
    readPos_.store(0, std::memory_order_relaxed);
    writePos_.store(0, std::memory_order_relaxed);
  }

  int channels() const { return channels_; }
  size_t capacityFrames() const { return capacity_; }

 private:
  std::vector<float> data_;
  size_t capacity_ = 0;
  int channels_ = 2;
  std::atomic<size_t> readPos_{0};
  std::atomic<size_t> writePos_{0};
};


// SPSC ring of 32-bit carrier payloads (DoP: earlier/later DSD bytes per frame).
class Int32Ring {
 public:
  void reset(size_t capacityFrames, int channels) {
    channels_ = channels < 1 ? 1 : channels;
    capacity_ = capacityFrames < 1 ? 1 : capacityFrames;
    data_.assign(capacity_ * static_cast<size_t>(channels_), 0u);
    readPos_.store(0, std::memory_order_relaxed);
    writePos_.store(0, std::memory_order_relaxed);
  }
  size_t available() const {
    const size_t w = writePos_.load(std::memory_order_acquire);
    const size_t r = readPos_.load(std::memory_order_relaxed);
    return w - r;
  }
  size_t write(const uint32_t* src, size_t frames) {
    const size_t w = writePos_.load(std::memory_order_relaxed);
    const size_t r = readPos_.load(std::memory_order_acquire);
    const size_t freeFrames = capacity_ - (w - r);
    const size_t n = frames < freeFrames ? frames : freeFrames;
    if (n == 0) return 0;
    const size_t ch = static_cast<size_t>(channels_);
    for (size_t i = 0; i < n; ++i) {
      const size_t dst = ((w + i) % capacity_) * ch;
      std::memcpy(&data_[dst], src + i * ch, ch * sizeof(uint32_t));
    }
    writePos_.store(w + n, std::memory_order_release);
    return n;
  }
  // Zero-fills the tail; caller decides what silence payload means.
  size_t read(uint32_t* dst, size_t frames) {
    const size_t r = readPos_.load(std::memory_order_relaxed);
    const size_t w = writePos_.load(std::memory_order_acquire);
    const size_t avail = w - r;
    const size_t n = frames < avail ? frames : avail;
    const size_t ch = static_cast<size_t>(channels_);
    for (size_t i = 0; i < n; ++i) {
      const size_t src = ((r + i) % capacity_) * ch;
      std::memcpy(dst + i * ch, &data_[src], ch * sizeof(uint32_t));
    }
    if (n < frames) std::memset(dst + n * ch, 0, (frames - n) * ch * sizeof(uint32_t));
    readPos_.store(r + n, std::memory_order_release);
    return n;
  }
  void clear() {
    readPos_.store(0, std::memory_order_relaxed);
    writePos_.store(0, std::memory_order_relaxed);
  }
  int channels() const { return channels_; }

 private:
  std::vector<uint32_t> data_;
  size_t capacity_ = 0;
  int channels_ = 2;
  std::atomic<size_t> readPos_{0};
  std::atomic<size_t> writePos_{0};
};

inline double dbToGain(double db) { return std::pow(10.0, db / 20.0); }
inline double gainToDb(double g) { return g > 0.0 ? 20.0 * std::log10(g) : -200.0; }
inline double clampd(double v, double lo, double hi) { return v < lo ? lo : (v > hi ? hi : v); }

}  // namespace phq
