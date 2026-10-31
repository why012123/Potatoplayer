// potatoHQ — dCS DoP v1.1 packer (24-bit carrier, alternating 0x05/0xFA markers).
#pragma once

#include <cstdint>
#include <vector>

namespace phq {

// DoP carrier word for one frame/channel: marker in bits 23..16, payload (the two
// DSD bytes) in bits 15..0. The marker alternates per carrier frame.
inline uint32_t dopCarrierWord(uint32_t payload, uint64_t frameIndex) {
  const uint32_t marker = (frameIndex & 1u) ? 0xFAu : 0x05u;
  return (marker << 16) | (payload & 0xFFFFu);
}

class DopPacker {
 public:
  void reset() { markerIndex_ = 0; }
  // in: planar packed DSD bytes (LSB-first), `bits` per channel (multiple of 16).
  // out: interleaved carrier words, `bytesPerSample` = 3 (packed) or 4 (24-in-32).
  // Returns the number of carrier frames written.
  size_t pack(const std::vector<uint8_t>& planar, size_t bits, int channels,
              std::vector<uint8_t>& out, int bytesPerSample);
  uint64_t markerIndex() const { return markerIndex_; }

 private:
  uint64_t markerIndex_ = 0;
};

}  // namespace phq
