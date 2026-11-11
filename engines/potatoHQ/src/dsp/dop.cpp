#include "dsp/dop.h"

namespace phq {

size_t DopPacker::pack(const std::vector<uint8_t>& planar, size_t bits, int channels,
                       std::vector<uint8_t>& out, int bytesPerSample) {
  if (channels < 1 || bits < 16) return 0;
  const size_t frames = bits / 16;             // carrier frames (16 DSD bits each)
  const size_t bytesPerChannel = (bits + 7) / 8;
  if (planar.size() < bytesPerChannel * static_cast<size_t>(channels)) return 0;

  out.resize(frames * static_cast<size_t>(channels) * static_cast<size_t>(bytesPerSample));
  uint8_t* dst = out.data();
  for (size_t f = 0; f < frames; ++f) {
    // Alternate the marker on every carrier frame, shared by all channels.
    const uint8_t marker = (markerIndex_ & 1u) ? 0xFA : 0x05;
    for (int c = 0; c < channels; ++c) {
      const uint8_t* src = planar.data() + static_cast<size_t>(c) * bytesPerChannel + f * 2;
      const uint8_t earlier = src[0];
      const uint8_t later = src[1];
      if (bytesPerSample == 4) {
        // 24-in-32, MSB aligned: [00][later][earlier][marker]
        *dst++ = 0x00;
        *dst++ = later;
        *dst++ = earlier;
        *dst++ = marker;
      } else {
        // Packed 24-bit little endian: [later][earlier][marker]
        *dst++ = later;
        *dst++ = earlier;
        *dst++ = marker;
      }
    }
    ++markerIndex_;
  }
  return frames;
}

}  // namespace phq
