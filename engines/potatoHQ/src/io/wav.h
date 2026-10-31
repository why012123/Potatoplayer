// potatoHQ — WAV / AIFF-ish container I/O (RIFF PCM 16/24/32, IEEE float 32).
#pragma once

#include <cstdio>
#include <string>
#include <vector>

#include "audio.h"

namespace phq {

class WavReader {
 public:
  ~WavReader();
  bool open(const std::string& path, std::string* error);
  void close();

  const AudioFormat& format() const { return format_; }
  uint64_t totalFrames() const { return totalFrames_; }
  // Reads up to `frames` frames, converting to float. Returns frames read.
  size_t read(float* dst, size_t frames);
  bool seekFrame(uint64_t frame);
  bool eof() const { return cursor_ >= totalFrames_; }

 private:
  std::vector<uint8_t> data_;
  AudioFormat format_;
  size_t dataOffset_ = 0;
  size_t dataBytes_ = 0;
  uint64_t totalFrames_ = 0;
  uint64_t cursor_ = 0;
  FILE* file_ = nullptr;
};

class WavWriter {
 public:
  ~WavWriter();
  bool open(const std::string& path, const AudioFormat& format, std::string* error);
  bool write(const float* src, size_t frames, std::string* error);
  // Writes already-encoded frames verbatim (used for exact 24-bit DoP carriers).
  bool writeRaw(const void* data, size_t frames, std::string* error);
  bool close(std::string* error);
  bool isOpen() const { return file_ != nullptr; }

 private:
  FILE* file_ = nullptr;
  AudioFormat format_;
  uint64_t framesWritten_ = 0;
  std::string path_;
  bool failed_ = false;
};

}  // namespace phq
