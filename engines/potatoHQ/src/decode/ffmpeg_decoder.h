// potatoHQ — FFmpeg-backed decoder (all formats libavformat supports, float32 out).
#pragma once

#include <cstdint>
#include <string>
#include <vector>

struct AVFormatContext;
struct AVCodecContext;
struct SwrContext;
struct AVPacket;
struct AVFrame;

namespace phq {

class FfmpegDecoder {
 public:
  FfmpegDecoder() = default;
  ~FfmpegDecoder();
  FfmpegDecoder(const FfmpegDecoder&) = delete;
  FfmpegDecoder& operator=(const FfmpegDecoder&) = delete;

  bool open(const std::string& path, std::string* error);
  void close();

  bool isOpen() const { return format_ != nullptr && codec_ != nullptr; }
  int sampleRate() const { return sampleRate_; }
  int channels() const { return channels_; }
  double durationSeconds() const { return duration_; }
  const std::string& codecName() const { return codecName_; }
  const std::string& containerName() const { return containerName_; }

  // Reads up to `frames` interleaved float frames. Returns 0 on EOF.
  size_t read(float* out, size_t frames, std::string* error);
  bool seek(double seconds, std::string* error);
  // Pops one tag pair; returns false when exhausted.
  bool nextTag(std::string* key, std::string* value);

 private:
  bool decodePacket(std::string* error);
  bool fillPending(std::string* error);

  AVFormatContext* format_ = nullptr;
  AVCodecContext* codec_ = nullptr;
  SwrContext* swr_ = nullptr;
  AVPacket* packet_ = nullptr;
  AVFrame* frame_ = nullptr;
  int streamIndex_ = -1;
  int sampleRate_ = 0;
  int channels_ = 0;
  double duration_ = 0.0;
  bool eof_ = false;
  bool draining_ = false;
  std::string codecName_;
  std::string containerName_;
  std::string path_;

  std::vector<float> pending_;  // interleaved, already resampled to native layout
  size_t pendingPos_ = 0;
  std::vector<std::pair<std::string, std::string>> tags_;
  size_t tagPos_ = 0;
};

}  // namespace phq
