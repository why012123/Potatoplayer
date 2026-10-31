// potatoHQ — Sony DSF writer (1-bit, planar blocks, LSB-first).
#pragma once

#include <cstdio>
#include <cstdint>
#include <string>
#include <vector>

namespace phq {

class DsfWriter {
 public:
  ~DsfWriter();
  bool open(const std::string& path, int channels, int dsdRate, std::string* error);
  // planar: channels * bytes, each byte holds 8 consecutive DSD bits (LSB first).
  bool write(const std::vector<uint8_t>& planar, size_t bitsPerChannel, std::string* error);
  bool close(std::string* error);

 private:
  bool flushBlock(std::string* error);

  FILE* file_ = nullptr;
  int channels_ = 2;
  int dsdRate_ = 2822400;
  uint64_t bitsWritten_ = 0;
  std::vector<std::vector<uint8_t>> pending_;  // per channel block buffer
  size_t pendingBytes_ = 0;
  static constexpr size_t kBlockSize = 4096;
};

}  // namespace phq
