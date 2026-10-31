#include "rpc.h"

#include <chrono>
#include <cstdio>
#include <iostream>
#include <mutex>
#include <sstream>

#include "out/coreaudio_out.h"

namespace phq {
namespace {
std::mutex g_writeMutex;

const char* kVersion = "1.0.0";
}  // namespace

RpcServer::~RpcServer() { stopTicker(); }

void RpcServer::send(const Json& message) {
  std::lock_guard lock(g_writeMutex);
  std::cout << message.dump() << "\n" << std::flush;
}

void RpcServer::emit(const std::string& event, const Json& data) {
  Json msg = Json::object();
  msg.set("event", event);
  msg.set("data", data);
  send(msg);
}

void RpcServer::emitState() {
  emit("playback.state", engine_.status());
}

void RpcServer::startTicker() {
  stopTicker();
  ticker_ = std::thread([this] {
    int tick = 0;
    float bars[48];
    while (running_.load(std::memory_order_acquire)) {
      std::this_thread::sleep_for(std::chrono::milliseconds(50));
      if (!running_.load(std::memory_order_acquire)) break;
      ++tick;
      if (engine_.visualizationDemand()) {
        if (engine_.spectrumBars(bars, 48)) {
          Json data = Json::object();
          Json arr = Json::array();
          for (float v : bars) arr.push(v);
          data.set("bars", arr);
          emit("engine.spectrum", data);
        }
      }
      if (tick % 10 != 0) continue;
      const bool playing = engine_.playing() && !engine_.paused();
      if (playing) {
        Json data = Json::object();
        data.set("time", engine_.position());
        data.set("duration", engine_.duration());
        data.set("playing", true);
        emit("playback.time", data);
      }
      std::string advancedPath, advancedId;
      double advancedDuration = 0.0;
      if (engine_.consumeTrackAdvance(&advancedPath, &advancedId, &advancedDuration)) {
        Json track = Json::object();
        track.set("trackId", advancedId);
        track.set("path", advancedPath);
        track.set("gapless", true);
        emit("playback.track", track);
        emitState();
      }
      if (engine_.finished() && !lastFinished_) {
        lastFinished_ = true;
        Json data = Json::object();
        data.set("reason", "eof");
        emit("playback.finished", data);
        emitState();
      }
      if (!engine_.finished()) lastFinished_ = false;
      const bool nowPlaying = engine_.playing();
      if (nowPlaying != lastPlaying_) {
        lastPlaying_ = nowPlaying;
        emitState();
      }
    }
  });
}

void RpcServer::stopTicker() {
  running_.store(false, std::memory_order_release);
  if (ticker_.joinable()) ticker_.join();
  running_.store(true, std::memory_order_release);
}

Json RpcServer::dispatch(const std::string& method, const Json& params) {
  Json result = Json::object();

  if (method == "ping") {
    result.set("pong", true);
    return result;
  }
  if (method == "engine.version" || method == "version") {
    result.set("version", kVersion);
    return result;
  }
  if (method == "engine.capabilities") {
    result.set("engine", "potatoHQ");
    result.set("version", kVersion);
    result.set("upsampling", true);
    result.set("sdm", true);
    result.set("gapless", true);
    result.set("spatial", true);
    result.set("crossfeed", true);
    result.set("dop", true);            // realtime DoP via 24-in-32 AUHAL (needs a DoP DAC)
    result.set("exclusive", true);      // CoreAudio Hog Mode
    result.set("dsdRates", Json::array());
    result["dsdRates"].push(64);
    result["dsdRates"].push(128);
    result["dsdRates"].push(256);
    result.set("pcmMaxRate", 705600);
    return result;
  }
  if (method == "engine.devices" || method == "audio.devices") {
    Json list = Json::array();
    for (const auto& d : CoreAudioOutput::enumerate()) {
      Json o = Json::object();
      o.set("id", d.id);
      o.set("name", d.name);
      o.set("channels", d.outputChannels);
      o.set("sampleRate", d.sampleRate);
      o.set("isDefault", d.isDefault);
      list.push(o);
    }
    result.set("devices", list);
    return result;
  }
  if (method == "engine.status" || method == "playback.state") {
    return engine_.status();
  }
  if (method == "engine.setOutput") {
    const std::string deviceId = params["deviceId"].asString("");
    const bool exclusive = params.has("exclusive") ? params["exclusive"].asBool(true) : engine_.exclusive();
    engine_.setOutputOptions(deviceId, exclusive);
    result.set("accepted", true);
    result.set("deviceId", deviceId);
    result.set("exclusive", exclusive);
    result.set("note", "applies on next playback.play");
    return result;
  }
  if (method == "engine.setDsd") {
    const int mult = static_cast<int>(params["dsd"].asNumber(0));
    engine_.setDsd(mult);
    if (params.has("order")) engine_.setSdmOrder(static_cast<int>(params["order"].asNumber(7)));
    result.set("dsd", mult);
    result.set("mode", mult > 0 ? "dop" : "pcm");
    return result;
  }
  if (method == "engine.setExclusive") {
    const bool enabled = params["enabled"].asBool(false);
    engine_.setOutputOptions(engine_.deviceId(), enabled);
    result.set("exclusive", enabled);
    return result;
  }
  if (method == "engine.setFollowRate") {
    const bool follow = params["enabled"].asBool(true);
    engine_.setFollowSourceRate(follow);
    result.set("followSourceRate", follow);
    return result;
  }
  if (method == "engine.setVisualization") {
    const bool enabled = params["enabled"].asBool(false);
    engine_.setVisualization(enabled);
    result.set("enabled", enabled);
    return result;
  }
  if (method == "engine.setCrossfeed") {
    const bool enabled = params.has("enabled") ? params["enabled"].asBool(false) : true;
    const double strength = params["strength"].asNumber(0.5);
    engine_.setCrossfeed(enabled, strength);
    result.set("enabled", enabled);
    result.set("strength", strength);
    return result;
  }
  if (method == "engine.setSpatial") {
    const bool enabled = params.has("enabled") ? params["enabled"].asBool(false) : true;
    const double x = params["x"].asNumber(0.0);
    const double y = params["y"].asNumber(0.0);
    engine_.setSpatial(enabled, x, y);
    result.set("enabled", enabled);
    result.set("x", x);
    result.set("y", y);
    return result;
  }
  if (method == "engine.setUpsampling") {
    const int taps = static_cast<int>(params["tapsPerPhase"].asNumber(128));
    engine_.setUpsampling(taps);
    result.set("tapsPerPhase", taps);
    return result;
  }
  if (method == "playback.play" || method == "engine.play") {
    const std::string path = params["path"].asString();
    if (path.empty()) throw std::runtime_error("path is required");
    const double start = params.has("startAt") ? params["startAt"].asNumber()
                        : params.has("startSeconds") ? params["startSeconds"].asNumber()
                                                     : 0.0;
    if (params.has("volume")) engine_.setVolume(params["volume"].asNumber());
    if (params.has("dsd")) engine_.setDsd(static_cast<int>(params["dsd"].asNumber(0)));
    std::string err;
    const std::string nextPath = params["nextPath"].asString("");
    const std::string nextTrackId = params["nextTrackId"].asString("");
    if (!engine_.play(path, start, &err, params["trackId"].asString(""), nextPath, nextTrackId)) {
      emit("toast", Json::object());
      throw std::runtime_error(err.empty() ? "play failed" : err);
    }
    Json track = Json::object();
    track.set("trackId", params["trackId"].asString(""));
    track.set("path", path);
    emit("playback.track", track);
    lastFinished_ = false;
    lastPlaying_ = true;
    emitState();
    return engine_.status();
  }
  if (method == "playback.setNext") {
    const std::string nextPath = params["path"].asString("");
    engine_.setNext(nextPath, params["trackId"].asString(""));
    result.set("queued", !nextPath.empty());
    return result;
  }
  if (method == "playback.toggle") {
    engine_.togglePause();
    emitState();
    return engine_.status();
  }
  if (method == "playback.pause") {
    engine_.pause();
    emitState();
    return engine_.status();
  }
  if (method == "playback.resume") {
    engine_.resume();
    emitState();
    return engine_.status();
  }
  if (method == "playback.stop") {
    engine_.stop();
    emitState();
    return engine_.status();
  }
  if (method == "playback.seek") {
    const double seconds = params["seconds"].asNumber(0.0);
    std::string err;
    if (!engine_.seek(seconds, &err)) throw std::runtime_error(err);
    emitState();
    return engine_.status();
  }
  if (method == "playback.volume") {
    engine_.setVolume(params["volume"].asNumber(0.3));
    emitState();
    return engine_.status();
  }
  if (method == "engine.setVolume") {
    engine_.setVolume(params["volume"].asNumber(0.3));
    return engine_.status();
  }
  if (method == "engine.setEq") {
    std::vector<EqBand> bands;
    const Json& arr = params["bands"];
    for (size_t i = 0; i < arr.size(); ++i) {
      EqBand b;
      b.freq = arr[i]["freq"].asNumber(1000.0);
      b.gainDb = arr[i]["gain"].asNumber(0.0);
      b.q = arr[i]["q"].asNumber(1.4);
      bands.push_back(b);
    }
    engine_.applyEq(bands, params["preamp"].asNumber(0.0));
    result.set("applied", static_cast<int64_t>(bands.size()));
    result.set("live", engine_.active());
    return result;
  }
  if (method == "engine.shutdown" || method == "shutdown") {
    engine_.stop();
    running_.store(false, std::memory_order_release);
    result.set("ok", true);
    return result;
  }
  throw std::runtime_error("unknown method: " + method);
}

void RpcServer::handleLine(const std::string& line) {
  if (line.empty()) return;
  std::string parseError;
  Json request = Json::parse(line, &parseError);
  if (!parseError.empty()) {
    Json err = Json::object();
    err.set("code", "InvalidRequest");
    err.set("message", parseError);
    Json msg = Json::object();
    msg.set("id", Json());
    msg.set("error", err);
    send(msg);
    return;
  }
  const Json& id = request["id"];
  const std::string method = request["method"].asString();
  if (method.empty()) {
    Json err = Json::object();
    err.set("code", "InvalidRequest");
    err.set("message", "Missing method");
    Json msg = Json::object();
    msg.set("id", id);
    msg.set("error", err);
    send(msg);
    return;
  }
  Json params = request.has("params") ? request["params"] : Json::object();
  try {
    Json result = dispatch(method, params);
    Json msg = Json::object();
    msg.set("id", id);
    msg.set("result", result);
    send(msg);
  } catch (const std::exception& e) {
    Json err = Json::object();
    err.set("code", "BackendError");
    err.set("message", e.what());
    Json msg = Json::object();
    msg.set("id", id);
    msg.set("error", err);
    send(msg);
  }
}

int RpcServer::run() {
  Json hello = Json::object();
  hello.set("engine", "potatoHQ");
  hello.set("version", kVersion);
  hello.set("protocol", "super-compatible");
  emit("backend.ready", hello);
  startTicker();

  std::string line;
  while (running_.load(std::memory_order_acquire) && std::getline(std::cin, line)) {
    handleLine(line);
  }
  running_.store(false, std::memory_order_release);
  engine_.stop();
  stopTicker();
  return 0;
}

}  // namespace phq
