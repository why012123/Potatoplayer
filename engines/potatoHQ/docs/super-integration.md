# 把 potatoHQ 接进 Potatoplayer Super(不改 Super 现有代码)

Super 的播放内核只有一层:`backend/src/main/java/com/potatomusic/superapp/PlaybackEngine.java`(270 行,VLCJ 封装)。
队列、自动切歌、随机/循环、持久化都在 `PlaybackController.java` 里,不碰音频。

所以引擎切换的**最小切割面**就是替换 `PlaybackEngine` 的实现,保留它的公开方法签名:

```java
public final class PlaybackEngine {
  public interface Listener { void onFinished(); void onError(String message); }
  public record EqCurve(float preamp, float[] bands) {}
  public PlaybackEngine();
  public void setListener(Listener listener);
  public boolean available();
  public String error();
  public void play(String path);
  public void pause();
  public void resume();
  public void stop();
  public void seek(double seconds);
  public double time();
  public double length();
  public boolean isPlaying();
  public void setVolume(double volume);
  public boolean eqAvailable();
  public void applyEq(EqPreset preset, boolean on);
  public List<Float> eqFrequencies();
  public List<String> eqFactoryPresetNames();
  public EqCurve eqFactoryPreset(String name);
  public void release();
}
```

## 方案 A(推荐):RPC 客户端替换 `PlaybackEngine`

新增一个类(例如 `PotatoHqEngine`),内部 `ProcessBuilder` 拉起
`engines/potatoHQ/build/potatohq rpc`,按行读写 JSON。然后把 `Backend` 里创建 `PlaybackEngine` 的那一行
换成 `new PotatoHqEngine(...)` 即可——**其余 Super 代码零改动**。

```java
final class PotatoHqEngine implements AutoCloseable {
  private final Process process;
  private final BufferedWriter in;
  private final Thread reader;
  private final AtomicLong nextId = new AtomicLong(1);
  private final Map<Long, CompletableFuture<JsonNode>> pending = new ConcurrentHashMap<>();
  private volatile double time, length;
  private volatile boolean playing;
  private PlaybackEngine.Listener listener;

  PotatoHqEngine(String binaryPath) throws IOException {
    process = new ProcessBuilder(binaryPath, "rpc")
        .redirectError(ProcessBuilder.Redirect.INHERIT)
        .start();
    in = new BufferedWriter(new OutputStreamWriter(process.getOutputStream(), UTF_8));
    reader = new Thread(this::readLoop, "potatohq-rpc");
    reader.setDaemon(true);
    reader.start();
  }

  private void readLoop() {
    try (BufferedReader out = new BufferedReader(
        new InputStreamReader(process.getInputStream(), UTF_8))) {
      String line;
      while ((line = out.readLine()) != null) {
        JsonNode msg = Json.MAPPER.readTree(line);
        if (msg.has("event")) {
          String event = msg.path("event").asText();
          JsonNode data = msg.path("data");
          switch (event) {
            case "playback.time" -> { time = data.path("time").asDouble(); playing = data.path("playing").asBoolean(); }
            case "playback.state" -> { time = data.path("position").asDouble(); length = data.path("duration").asDouble(); }
            case "playback.finished" -> { playing = false; if (listener != null) listener.onFinished(); }
            case "toast" -> { if (listener != null) listener.onError(data.path("message").asText("engine error")); }
            default -> { }
          }
        } else {
          CompletableFuture<JsonNode> f = pending.remove(msg.path("id").asLong());
          if (f != null) f.complete(msg);
        }
      }
    } catch (Exception ignored) {
    }
  }

  private JsonNode call(String method, Map<String, Object> params) {
    long id = nextId.getAndIncrement();
    CompletableFuture<JsonNode> f = new CompletableFuture<>();
    pending.put(id, f);
    try {
      in.write(Json.MAPPER.writeValueAsString(Map.of("id", id, "method", method, "params", params)));
      in.newLine();
      in.flush();
      JsonNode reply = f.get(5, TimeUnit.SECONDS);
      if (reply.has("error")) throw new IllegalStateException(reply.path("error").path("message").asText());
      return reply.path("result");
    } catch (Exception e) {
      pending.remove(id);
      throw new IllegalStateException(e.getMessage(), e);
    }
  }

  // ---- PlaybackEngine 语义 ----
  void play(String path) { call("playback.play", Map.of("path", path, "startAt", 0)); }
  void pause() { call("playback.pause", Map.of()); }
  void resume() { call("playback.resume", Map.of()); }
  void stop() { call("playback.stop", Map.of()); }
  void seek(double s) { call("playback.seek", Map.of("seconds", s)); }
  double time() { return time; }
  double length() { return length; }
  boolean isPlaying() { return playing; }
  void setVolume(double v) { call("playback.volume", Map.of("volume", v)); }
  void setDsd(int mult) { call("engine.setDsd", Map.of("dsd", mult)); }  // 0=PCM, 64/128=DoP

  void applyEq(EqPreset preset, boolean on) {
    List<Map<String, Object>> bands = new ArrayList<>();
    for (int i = 0; i < EqPreset.BANDS; i++) {
      bands.add(Map.of("freq", EQ_FREQS[i], "gain", on ? preset.bands[i] : 0.0f));
    }
    call("engine.setEq", Map.of("bands", bands, "preamp", on ? preset.preamp : 0.0));
  }

  void release() {
    try { call("engine.shutdown", Map.of()); } catch (Exception ignored) { }
    process.destroy();
  }

  static final double[] EQ_FREQS = {31.25, 62.5, 125, 250, 500, 1000, 2000, 4000, 8000, 16000};
}
```

### 需要同步改的只有三处

1. `Backend.java` 里 `new PlaybackEngine()` → `new PotatoHqEngine(...)`(以及 `available()/error()` 的映射)。
2. 把 `engines/potatoHQ/build/potatohq` 放进应用资源目录(`resources/audio-engine/` 之类),打包时带签名。
3. `PlaybackEngine.setVolume` 的语义:Super 的 `volume` 是 0–1.2 的 UI 范围,potatoHQ 钳到 0–1。

### 行为差异(必须知道)

| 点 | VLCJ | potatoHQ |
|---|---|---|
| 打开失败 | `onError("VLC could not play this file.")` | RPC 返回 `error`,适配层转 `onError` |
| `time()` | 实时问 VLC | 由 `playback.time` 事件缓存(~0.5 s 粒度) |
| `length()` | 问 VLC | play 之后由 `state.duration` 得到 |
| seek | 不重开 | 重开设备(50–200 ms 中断) |
| 队列/自动切歌 | `PlaybackController` 用 `onFinished` 推进 | **不变**,仍然由 Super 推进 |
| EQ | VLC 10 段 | 10 段 RBJ,频点一致,听感略有差异 |

## 方案 B:RPC 直连(不进 Java 进程)

如果以后希望在 Electron 主进程直接切引擎,可以让 `electron/backend.cjs` 同时拉起两个子进程,
把 `playback.*` 转发给 potatoHQ、把 `library.*/netease.*` 留给 Java。代价是播放权威分裂,
需要额外同步 `playback.state`。不推荐作为第一步。

## 方案 C:只借代码

不引入进程,把 `dsp/` 与 `out/coreaudio_out.cpp` 作为参考实现,自己在 Java 侧用 JNA 调 CoreAudio。
工作量最大、可控性最高,适合只想要"独占输出"而不想要整引擎的场景。

## 验证清单(切换后)

1. `engine.devices` 能列出设备,Hog 开关生效(`state.hog` 为 true)。
2. 44.1k 源 + 48k 设备:`state.sourceRate=44100`、`outputRate=48000`,`position` 匀速。
3. 暂停/恢复/seek 后 `time()` 与 UI 一致(±0.6 s,受 500 ms tick 影响)。
4. 播完触发 `playback.finished` → Super 自动下一首。
5. `state.underruns` 长时间为 0。
