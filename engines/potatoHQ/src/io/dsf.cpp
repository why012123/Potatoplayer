#include "io/dsf.h"

#include <cstring>

namespace phq {
namespace {
void wr32(FILE* f, uint32_t v) {
  uint8_t b[4] = {static_cast<uint8_t>(v), static_cast<uint8_t>(v >> 8),
                  static_cast<uint8_t>(v >> 16), static_cast<uint8_t>(v >> 24)};
  std::fwrite(b, 1, 4, f);
}
void wr64(FILE* f, uint64_t v) {
  uint8_t b[8];
  for (int i = 0; i < 8; ++i) b[i] = static_cast<uint8_t>((v >> (8 * i)) & 0xFF);
  std::fwrite(b, 1, 8, f);
}
}  // namespace

DsfWriter::~DsfWriter() {
  std::string ignored;
  close(&ignored);
}

bool DsfWriter::open(const std::string& path, int channels, int dsdRate, std::string* error) {
  file_ = std::fopen(path.c_str(), "wb");
  if (!file_) {
    if (error) *error = "cannot create " + path;
    return false;
  }
  channels_ = channels < 1 ? 1 : channels;
  dsdRate_ = dsdRate;
  bitsWritten_ = 0;
  pending_.assign(static_cast<size_t>(channels_), {});
  pendingBytes_ = 0;

  std::fwrite("DSD ", 1, 4, file_);
  wr64(file_, 28);
  wr64(file_, 0);  // total file size, patched on close
  wr64(file_, 0);  // metadata pointer

  std::fwrite("fmt ", 1, 4, file_);
  wr64(file_, 52);
  wr32(file_, 1);                                    // format version
  wr32(file_, 0);                                    // format id: DSD raw
  wr32(file_, channels_ == 1 ? 1u : (channels_ == 2 ? 2u : 6u));  // channel type
  wr32(file_, static_cast<uint32_t>(channels_));
  wr32(file_, static_cast<uint32_t>(dsdRate_));
  wr32(file_, 1);                                    // bits per sample
  wr64(file_, 0);                                    // sample count, patched on close
  wr32(file_, static_cast<uint32_t>(kBlockSize));
  wr32(file_, 0);                                    // reserved

  std::fwrite("data", 1, 4, file_);
  wr64(file_, 0);  // data chunk size, patched on close
  return true;
}

bool DsfWriter::write(const std::vector<uint8_t>& planar, size_t bitsPerChannel,
                      std::string* error) {
  if (!file_) {
    if (error) *error = "DSF writer not open";
    return false;
  }
  const size_t bytes = (bitsPerChannel + 7) / 8;
  if (planar.size() < bytes * static_cast<size_t>(channels_)) {
    if (error) *error = "short DSD block";
    return false;
  }
  for (size_t i = 0; i < bytes; ++i) {
    for (int c = 0; c < channels_; ++c) {
      pending_[static_cast<size_t>(c)].push_back(planar[static_cast<size_t>(c) * bytes + i]);
    }
    ++pendingBytes_;
    if (pendingBytes_ == kBlockSize) {
      if (!flushBlock(error)) return false;
    }
  }
  bitsWritten_ += bitsPerChannel;
  return true;
}

bool DsfWriter::flushBlock(std::string* error) {
  if (pendingBytes_ == 0) return true;
  for (int c = 0; c < channels_; ++c) {
    auto& buf = pending_[static_cast<size_t>(c)];
    buf.resize(kBlockSize, 0x69);  // DSD silence for a partial block
    if (std::fwrite(buf.data(), 1, kBlockSize, file_) != kBlockSize) {
      if (error) *error = "DSF write failed";
      return false;
    }
    buf.clear();
  }
  pendingBytes_ = 0;
  return true;
}

bool DsfWriter::close(std::string* error) {
  if (!file_) return true;
  if (!flushBlock(error)) {
    std::fclose(file_);
    file_ = nullptr;
    return false;
  }
  const uint64_t bytes = (bitsWritten_ + 7) / 8;
  const uint64_t blocks = (bytes + kBlockSize - 1) / kBlockSize;
  const uint64_t dataBytes = blocks * kBlockSize * static_cast<uint64_t>(channels_);
  const uint64_t total = 28 + 52 + 12 + dataBytes;

  std::fseek(file_, 12, SEEK_SET);
  wr64(file_, total);
  std::fseek(file_, 64, SEEK_SET);
  wr64(file_, bitsWritten_);  // sample count per channel, in bits
  std::fseek(file_, 84, SEEK_SET);
  wr64(file_, dataBytes + 12);
  const bool ok = std::fclose(file_) == 0;
  file_ = nullptr;
  if (!ok && error) *error = "DSF close failed";
  return ok;
}

}  // namespace phq
