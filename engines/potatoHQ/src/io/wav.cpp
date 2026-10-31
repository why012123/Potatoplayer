#include "io/wav.h"

#include <cstring>

namespace phq {
namespace {

uint16_t rd16(const uint8_t* p) { return static_cast<uint16_t>(p[0] | (p[1] << 8)); }
uint32_t rd32(const uint8_t* p) {
  return static_cast<uint32_t>(p[0]) | (static_cast<uint32_t>(p[1]) << 8) |
         (static_cast<uint32_t>(p[2]) << 16) | (static_cast<uint32_t>(p[3]) << 24);
}
void wr16(FILE* f, uint16_t v) {
  uint8_t b[2] = {static_cast<uint8_t>(v), static_cast<uint8_t>(v >> 8)};
  std::fwrite(b, 1, 2, f);
}
void wr32(FILE* f, uint32_t v) {
  uint8_t b[4] = {static_cast<uint8_t>(v), static_cast<uint8_t>(v >> 8),
                  static_cast<uint8_t>(v >> 16), static_cast<uint8_t>(v >> 24)};
  std::fwrite(b, 1, 4, f);
}

}  // namespace

WavReader::~WavReader() { close(); }

void WavReader::close() {
  if (file_) {
    std::fclose(file_);
    file_ = nullptr;
  }
  data_.clear();
  cursor_ = 0;
}

bool WavReader::open(const std::string& path, std::string* error) {
  close();
  file_ = std::fopen(path.c_str(), "rb");
  if (!file_) {
    if (error) *error = "cannot open " + path;
    return false;
  }
  if (std::fseek(file_, 0, SEEK_END) != 0) {
    if (error) *error = "seek failed";
    return false;
  }
  const long size = std::ftell(file_);
  if (size <= 0) {
    if (error) *error = "empty file";
    return false;
  }
  std::fseek(file_, 0, SEEK_SET);
  data_.resize(static_cast<size_t>(size));
  if (std::fread(data_.data(), 1, data_.size(), file_) != data_.size()) {
    if (error) *error = "short read";
    return false;
  }

  if (data_.size() < 12 || std::memcmp(data_.data(), "RIFF", 4) != 0 ||
      std::memcmp(data_.data() + 8, "WAVE", 4) != 0) {
    if (error) *error = "not a RIFF/WAVE file";
    return false;
  }

  uint16_t formatTag = 0, channels = 0, bits = 0, blockAlign = 0;
  uint32_t rate = 0;
  size_t pos = 12;
  bool haveFmt = false;
  dataOffset_ = 0;
  dataBytes_ = 0;

  while (pos + 8 <= data_.size()) {
    const char* id = reinterpret_cast<const char*>(data_.data() + pos);
    const uint32_t chunkSize = rd32(data_.data() + pos + 4);
    const size_t body = pos + 8;
    if (body + chunkSize > data_.size()) break;  // truncated chunk

    if (std::memcmp(id, "fmt ", 4) == 0 && chunkSize >= 16) {
      formatTag = rd16(data_.data() + body);
      channels = rd16(data_.data() + body + 2);
      rate = rd32(data_.data() + body + 4);
      blockAlign = rd16(data_.data() + body + 12);
      bits = rd16(data_.data() + body + 14);
      if (formatTag == 0xFFFE && chunkSize >= 40) {
        // Extensible: subformat GUID starts at +24, first two bytes hold the tag.
        formatTag = rd16(data_.data() + body + 24);
      }
      haveFmt = true;
    } else if (std::memcmp(id, "data", 4) == 0) {
      dataOffset_ = body;
      dataBytes_ = chunkSize;
    }
    pos = body + chunkSize + (chunkSize & 1u);  // word alignment
  }

  if (!haveFmt || dataOffset_ == 0 || channels == 0 || rate == 0) {
    if (error) *error = "missing fmt/data chunk";
    return false;
  }

  if (formatTag == 1) {
    if (bits == 16) format_.format = SampleFormat::S16;
    else if (bits == 24) format_.format = SampleFormat::S24;
    else if (bits == 32) format_.format = SampleFormat::S32;
    else {
      if (error) *error = "unsupported PCM bit depth";
      return false;
    }
  } else if (formatTag == 3 && bits == 32) {
    format_.format = SampleFormat::F32;
  } else {
    if (error) *error = "unsupported WAV encoding";
    return false;
  }

  format_.sampleRate = static_cast<int>(rate);
  format_.channels = channels;
  (void)blockAlign;
  totalFrames_ = dataBytes_ / format_.frameBytes();
  return true;
}

size_t WavReader::read(float* dst, size_t frames) {
  if (data_.empty() || cursor_ >= totalFrames_) return 0;
  const size_t n = static_cast<size_t>(
      std::min<uint64_t>(frames, totalFrames_ - cursor_));
  const size_t ch = static_cast<size_t>(format_.channels);
  const uint8_t* src = data_.data() + dataOffset_ + cursor_ * format_.frameBytes();
  size_t samples = n * ch;
  switch (format_.format) {
    case SampleFormat::S16: {
      const int16_t* s = reinterpret_cast<const int16_t*>(src);
      for (size_t i = 0; i < samples; ++i) dst[i] = static_cast<float>(s[i] / 32768.0);
      break;
    }
    case SampleFormat::S24: {
      for (size_t i = 0; i < samples; ++i) {
        const uint8_t* p = src + i * 3;
        int32_t v = static_cast<int32_t>(p[0]) | (static_cast<int32_t>(p[1]) << 8) |
                    (static_cast<int32_t>(p[2]) << 16);
        if (v & 0x800000) v |= ~0xFFFFFF;
        dst[i] = static_cast<float>(v / 8388608.0);
      }
      break;
    }
    case SampleFormat::S32: {
      const int32_t* s = reinterpret_cast<const int32_t*>(src);
      for (size_t i = 0; i < samples; ++i) dst[i] = static_cast<float>(s[i] / 2147483648.0);
      break;
    }
    case SampleFormat::F32: {
      std::memcpy(dst, src, samples * sizeof(float));
      break;
    }
    case SampleFormat::DSD_U8:
      return 0;
  }
  cursor_ += n;
  return n;
}

bool WavReader::seekFrame(uint64_t frame) {
  if (frame > totalFrames_) return false;
  cursor_ = frame;
  return true;
}

WavWriter::~WavWriter() {
  std::string ignored;
  close(&ignored);
}

bool WavWriter::open(const std::string& path, const AudioFormat& format, std::string* error) {
  file_ = std::fopen(path.c_str(), "wb");
  if (!file_) {
    if (error) *error = "cannot create " + path;
    return false;
  }
  format_ = format;
  framesWritten_ = 0;
  failed_ = false;
  path_ = path;

  const uint16_t tag = format_.format == SampleFormat::F32 ? 3 : 1;
  const uint16_t bits = static_cast<uint16_t>(format_.bits());
  const uint16_t blockAlign = static_cast<uint16_t>(format_.frameBytes());
  const uint32_t byteRate = static_cast<uint32_t>(format_.sampleRate * blockAlign);

  std::fwrite("RIFF", 1, 4, file_);
  wr32(file_, 0);  // patched on close
  std::fwrite("WAVE", 1, 4, file_);
  std::fwrite("fmt ", 1, 4, file_);
  wr32(file_, 16);
  wr16(file_, tag);
  wr16(file_, static_cast<uint16_t>(format_.channels));
  wr32(file_, static_cast<uint32_t>(format_.sampleRate));
  wr32(file_, byteRate);
  wr16(file_, blockAlign);
  wr16(file_, bits);
  std::fwrite("data", 1, 4, file_);
  wr32(file_, 0);  // patched on close
  return true;
}

bool WavWriter::write(const float* src, size_t frames, std::string* error) {
  if (!file_) {
    if (error) *error = "writer not open";
    return false;
  }
  if (failed_) return false;
  const size_t ch = static_cast<size_t>(format_.channels);
  const size_t samples = frames * ch;
  std::vector<uint8_t> tmp(samples * format_.bytesPerSample());
  uint8_t* out = tmp.data();
  switch (format_.format) {
    case SampleFormat::S16: {
      int16_t* s = reinterpret_cast<int16_t*>(out);
      for (size_t i = 0; i < samples; ++i) {
        double v = clampd(src[i], -1.0, 1.0) * 32767.0;
        s[i] = static_cast<int16_t>(std::lround(v));
      }
      break;
    }
    case SampleFormat::S24: {
      for (size_t i = 0; i < samples; ++i) {
        const double v = clampd(src[i], -1.0, 1.0);
        int32_t q = static_cast<int32_t>(std::lround(v * 8388607.0));
        if (q > 8388607) q = 8388607;
        if (q < -8388608) q = -8388608;
        out[i * 3 + 0] = static_cast<uint8_t>(q & 0xFF);
        out[i * 3 + 1] = static_cast<uint8_t>((q >> 8) & 0xFF);
        out[i * 3 + 2] = static_cast<uint8_t>((q >> 16) & 0xFF);
      }
      break;
    }
    case SampleFormat::S32: {
      int32_t* s = reinterpret_cast<int32_t*>(out);
      for (size_t i = 0; i < samples; ++i) {
        double v = clampd(src[i], -1.0, 1.0) * 2147483647.0;
        s[i] = static_cast<int32_t>(std::llround(v));
      }
      break;
    }
    case SampleFormat::F32:
      std::memcpy(out, src, samples * sizeof(float));
      break;
    case SampleFormat::DSD_U8:
      if (error) *error = "DSD must use the DSF writer";
      return false;
  }
  if (std::fwrite(tmp.data(), 1, tmp.size(), file_) != tmp.size()) {
    failed_ = true;
    if (error) *error = "write failed";
    return false;
  }
  framesWritten_ += frames;
  return true;
}

bool WavWriter::writeRaw(const void* data, size_t frames, std::string* error) {
  if (!file_) {
    if (error) *error = "writer not open";
    return false;
  }
  const size_t bytes = frames * format_.frameBytes();
  if (std::fwrite(data, 1, bytes, file_) != bytes) {
    failed_ = true;
    if (error) *error = "write failed";
    return false;
  }
  framesWritten_ += frames;
  return true;
}

bool WavWriter::close(std::string* error) {
  if (!file_) return true;
  const uint32_t dataBytes = static_cast<uint32_t>(framesWritten_ * format_.frameBytes());
  const bool ok = !failed_ && std::fseek(file_, 4, SEEK_SET) == 0;
  if (ok) {
    wr32(file_, 36 + dataBytes);
    std::fseek(file_, 40, SEEK_SET);
    wr32(file_, dataBytes);
  }
  if (std::fclose(file_) != 0) {
    if (error) *error = "close failed";
    file_ = nullptr;
    return false;
  }
  file_ = nullptr;
  if (!ok && error) *error = "incomplete WAV: " + path_;
  return ok;
}

}  // namespace phq
