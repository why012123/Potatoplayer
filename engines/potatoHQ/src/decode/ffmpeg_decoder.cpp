#include "decode/ffmpeg_decoder.h"

#include <algorithm>
#include <cstring>

extern "C" {
#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libavutil/channel_layout.h>
#include <libavutil/dict.h>
#include <libavutil/opt.h>
#include <libswresample/swresample.h>
}

namespace phq {

FfmpegDecoder::~FfmpegDecoder() { close(); }

void FfmpegDecoder::close() {
  if (swr_) swr_free(&swr_);
  if (frame_) av_frame_free(&frame_);
  if (packet_) av_packet_free(&packet_);
  if (codec_) avcodec_free_context(&codec_);
  if (format_) avformat_close_input(&format_);
  pending_.clear();
  pendingPos_ = 0;
  eof_ = false;
  draining_ = false;
  tags_.clear();
  tagPos_ = 0;
  streamIndex_ = -1;
}

bool FfmpegDecoder::open(const std::string& path, std::string* error) {
  close();
  path_ = path;
  int rc = avformat_open_input(&format_, path.c_str(), nullptr, nullptr);
  if (rc < 0) {
    if (error) *error = "cannot open " + path;
    return false;
  }
  if (avformat_find_stream_info(format_, nullptr) < 0) {
    if (error) *error = "cannot read stream info";
    close();
    return false;
  }
  const AVCodec* decoder = nullptr;
  streamIndex_ = av_find_best_stream(format_, AVMEDIA_TYPE_AUDIO, -1, -1, &decoder, 0);
  if (streamIndex_ < 0 || decoder == nullptr) {
    if (error) *error = "no audio stream";
    close();
    return false;
  }
  AVStream* stream = format_->streams[streamIndex_];
  codec_ = avcodec_alloc_context3(decoder);
  if (!codec_ || avcodec_parameters_to_context(codec_, stream->codecpar) < 0 ||
      avcodec_open2(codec_, decoder, nullptr) < 0) {
    if (error) *error = "cannot open decoder";
    close();
    return false;
  }

  sampleRate_ = codec_->sample_rate > 0 ? codec_->sample_rate : 44100;
  channels_ = codec_->ch_layout.nb_channels > 0 ? codec_->ch_layout.nb_channels : 2;
  if (channels_ > 8) channels_ = 8;

  AVChannelLayout outLayout;
  av_channel_layout_default(&outLayout, channels_);
  SWR_OPTIONS:;
  if (swr_alloc_set_opts2(&swr_, &outLayout, AV_SAMPLE_FMT_FLT, sampleRate_, &codec_->ch_layout,
                          codec_->sample_fmt, sampleRate_, 0, nullptr) < 0 ||
      swr_init(swr_) < 0) {
    if (error) *error = "cannot init resampler";
    close();
    return false;
  }
  av_channel_layout_uninit(&outLayout);

  packet_ = av_packet_alloc();
  frame_ = av_frame_alloc();
  duration_ = (stream->duration > 0 && stream->duration != AV_NOPTS_VALUE)
                  ? static_cast<double>(stream->duration) * av_q2d(stream->time_base)
                  : (format_->duration > 0 ? static_cast<double>(format_->duration) / AV_TIME_BASE : 0.0);
  codecName_ = decoder->name ? decoder->name : "?";
  containerName_ = format_->iformat && format_->iformat->name ? format_->iformat->name : "?";

  AVDictionaryEntry* tag = nullptr;
  while ((tag = av_dict_get(stream->metadata, "", tag, AV_DICT_IGNORE_SUFFIX)) != nullptr) {
    if (tag->key && tag->value) tags_.emplace_back(tag->key, tag->value);
  }
  tag = nullptr;
  while ((tag = av_dict_get(format_->metadata, "", tag, AV_DICT_IGNORE_SUFFIX)) != nullptr) {
    if (tag->key && tag->value) tags_.emplace_back(tag->key, tag->value);
  }
  return true;
}

bool FfmpegDecoder::nextTag(std::string* key, std::string* value) {
  if (tagPos_ >= tags_.size()) return false;
  *key = tags_[tagPos_].first;
  *value = tags_[tagPos_].second;
  ++tagPos_;
  return true;
}

bool FfmpegDecoder::decodePacket(std::string* error) {
  int rc = avcodec_send_packet(codec_, nullptr);
  (void)rc;
  if (avcodec_receive_frame(codec_, frame_) == 0) {
    const int outSamples = static_cast<int>(av_rescale_rnd(
        swr_get_delay(swr_, codec_->sample_rate) + frame_->nb_samples, sampleRate_,
        codec_->sample_rate, AV_ROUND_UP));
    const size_t oldSize = pending_.size();
    pending_.resize(oldSize + static_cast<size_t>(outSamples) * static_cast<size_t>(channels_));
    uint8_t* outPtr = reinterpret_cast<uint8_t*>(pending_.data() + oldSize);
    const int converted = swr_convert(swr_, &outPtr, outSamples,
                                      const_cast<const uint8_t**>(frame_->extended_data),
                                      frame_->nb_samples);
    if (converted < 0) {
      if (error) *error = "resample failed";
      return false;
    }
    pending_.resize(oldSize + static_cast<size_t>(converted) * static_cast<size_t>(channels_));
    av_frame_unref(frame_);
    return true;
  }
  return false;
}

bool FfmpegDecoder::fillPending(std::string* error) {
  while (true) {
    if (pendingPos_ < pending_.size()) return true;
    pending_.clear();
    pendingPos_ = 0;

    int rc = avcodec_receive_frame(codec_, frame_);
    if (rc == 0) {
      const int outSamples = static_cast<int>(av_rescale_rnd(
          swr_get_delay(swr_, codec_->sample_rate) + frame_->nb_samples, sampleRate_,
          codec_->sample_rate, AV_ROUND_UP));
      pending_.resize(static_cast<size_t>(outSamples) * static_cast<size_t>(channels_));
      uint8_t* outPtr = reinterpret_cast<uint8_t*>(pending_.data());
      const int converted = swr_convert(swr_, &outPtr, outSamples,
                                        const_cast<const uint8_t**>(frame_->extended_data),
                                        frame_->nb_samples);
      av_frame_unref(frame_);
      if (converted < 0) {
        if (error) *error = "resample failed";
        return false;
      }
      pending_.resize(static_cast<size_t>(converted) * static_cast<size_t>(channels_));
      if (!pending_.empty()) return true;
      continue;
    }
    if (rc != AVERROR(EAGAIN)) {
      // EOF or hard error: flush the resampler tail once.
      if (!draining_) {
        draining_ = true;
        int n = swr_convert(swr_, nullptr, 0, nullptr, 0);
        if (n > 0) {
          pending_.resize(static_cast<size_t>(n) * static_cast<size_t>(channels_));
          uint8_t* outPtr = reinterpret_cast<uint8_t*>(pending_.data());
          n = swr_convert(swr_, &outPtr, n, nullptr, 0);
          pending_.resize(static_cast<size_t>(std::max(0, n)) * static_cast<size_t>(channels_));
          if (!pending_.empty()) return true;
        }
      }
      eof_ = true;
      return false;
    }

    if (av_read_frame(format_, packet_) < 0) {
      avcodec_send_packet(codec_, nullptr);
      continue;
    }
    if (packet_->stream_index == streamIndex_) {
      int sendRc = avcodec_send_packet(codec_, packet_);
      if (sendRc < 0 && sendRc != AVERROR(EAGAIN)) {
        av_packet_unref(packet_);
        if (error) *error = "decode failed";
        return false;
      }
    }
    av_packet_unref(packet_);
  }
}

size_t FfmpegDecoder::read(float* out, size_t frames, std::string* error) {
  if (!isOpen() || frames == 0) return 0;
  if (!fillPending(error)) return 0;
  const size_t ch = static_cast<size_t>(channels_);
  const size_t available = (pending_.size() - pendingPos_) / ch;
  const size_t n = std::min(frames, available);
  std::memcpy(out, pending_.data() + pendingPos_, n * ch * sizeof(float));
  pendingPos_ += n * ch;
  return n;
}

bool FfmpegDecoder::seek(double seconds, std::string* error) {
  if (!isOpen()) return false;
  AVStream* stream = format_->streams[streamIndex_];
  const int64_t ts = static_cast<int64_t>(seconds / av_q2d(stream->time_base));
  if (av_seek_frame(format_, streamIndex_, ts, AVSEEK_FLAG_BACKWARD) < 0) {
    if (error) *error = "seek failed";
    return false;
  }
  avcodec_flush_buffers(codec_);
  if (swr_) swr_close(swr_), swr_init(swr_);
  pending_.clear();
  pendingPos_ = 0;
  eof_ = false;
  draining_ = false;
  return true;
}

}  // namespace phq
