// potatoHQ — newline-delimited JSON-RPC daemon (Super-compatible playback surface).
#pragma once

#include <atomic>
#include <string>
#include <thread>

#include "engine.h"
#include "json.h"

namespace phq {

class RpcServer {
 public:
  explicit RpcServer(Engine& engine) : engine_(engine) {}
  ~RpcServer();

  // Reads stdin until EOF / "engine.shutdown". Returns process exit code.
  int run();

 private:
  void handleLine(const std::string& line);
  Json dispatch(const std::string& method, const Json& params);
  void send(const Json& message);
  void emit(const std::string& event, const Json& data);
  void emitState();
  void startTicker();
  void stopTicker();

  Engine& engine_;
  std::atomic<bool> running_{true};
  std::thread ticker_;
  bool lastFinished_ = false;
  bool lastPlaying_ = false;
};

}  // namespace phq
