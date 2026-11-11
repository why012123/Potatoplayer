package com.potatomusic.superapp;

import com.fasterxml.jackson.databind.JsonNode;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

/**
 * potatoHQ 原生引擎的客户端:拉起 {@code potatohq rpc},走行式 JSON-RPC。
 *
 * <p>协议与 Super 的 RpcServer 同构:请求 {@code {"id","method","params"}},
 * 响应 {@code {"id","result"}},事件 {@code {"event","data"}}。</p>
 */
public final class PotatoHqPlaybackEngine implements PlaybackEngine {
    /** VLC's equalizer applies a 0.25 dry factor: preamp 12 dB == unity gain. */
    static final double VLC_UNITY_DB = 12.0412;

    private static final List<Float> FREQUENCIES = List.of(
            31.25f, 62.5f, 125f, 250f, 500f, 1000f, 2000f, 4000f, 8000f, 16000f);

    private final Process process;
    private final BufferedWriter writer;
    private final ConcurrentHashMap<Long, CompletableFuture<JsonNode>> pending = new ConcurrentHashMap<>();
    private final AtomicLong nextId = new AtomicLong(1);
    private final Thread reader;
    private volatile Listener listener;
    private volatile String initError;
    private volatile double cachedTime = 0;
    private volatile double cachedDuration = 0;
    private volatile boolean playing = false;
    private volatile boolean paused = false;
    private volatile double volume = 0.3;
    private volatile int dsdMult = 0;

    public PotatoHqPlaybackEngine() {
        String binary = EngineFactory.findPotatohqBinary();
        Process started = null;
        BufferedWriter out = null;
        String error = null;
        if (binary == null) {
            error = "未找到 potatohq 可执行文件(设置 POTATOHQ_BIN 或放到 potatoHQ/build)";
        } else {
            try {
                started = new ProcessBuilder(binary, "rpc")
                        .redirectError(ProcessBuilder.Redirect.DISCARD)
                        .start();
                out = new BufferedWriter(new OutputStreamWriter(started.getOutputStream(), StandardCharsets.UTF_8));
            } catch (Exception e) {
                error = "无法启动 potatohq: " + e.getMessage();
            }
        }
        this.process = started;
        this.writer = out;
        this.initError = error;
        if (started != null) {
            this.reader = new Thread(this::readLoop, "potatohq-rpc");
            this.reader.setDaemon(true);
            this.reader.start();
        } else {
            this.reader = null;
        }
    }

    @Override
    public String id() {
        return EngineFactory.POTATOHQ;
    }

    @Override
    public void setListener(Listener listener) {
        this.listener = listener;
    }

    @Override
    public boolean available() {
        return process != null && process.isAlive() && initError == null;
    }

    @Override
    public String error() {
        return initError;
    }

    private void readLoop() {
        try (BufferedReader in = new BufferedReader(
                new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = in.readLine()) != null) {
                if (line.isBlank()) continue;
                JsonNode message;
                try {
                    message = Json.MAPPER.readTree(line);
                } catch (Exception ignored) {
                    continue;
                }
                if (message.has("event")) {
                    handleEvent(message.path("event").asText(), message.path("data"));
                } else if (message.has("id")) {
                    CompletableFuture<JsonNode> future = pending.remove(message.path("id").asLong());
                    if (future != null) future.complete(message);
                }
            }
        } catch (Exception ignored) {
            // Process ended; availability() will report it.
        }
    }

    private void handleEvent(String event, JsonNode data) {
        switch (event) {
            case "playback.time" -> {
                // A time event can already be in flight when the user pauses;
                // applying it afterwards made the UI look like it kept playing.
                if (!paused) {
                    cachedTime = data.path("time").asDouble(cachedTime);
                    cachedDuration = data.path("duration").asDouble(cachedDuration);
                    playing = data.path("playing").asBoolean(true);
                }
            }
            case "playback.state" -> {
                cachedTime = data.path("position").asDouble(cachedTime);
                cachedDuration = data.path("duration").asDouble(cachedDuration);
                boolean active = data.path("active").asBoolean(false);
                playing = data.path("playing").asBoolean(false) && active;
                paused = data.path("paused").asBoolean(false);
            }
            case "engine.spectrum" -> {
                List<Double> bars = new ArrayList<>();
                for (JsonNode node : data.path("bars")) bars.add(node.asDouble());
                Listener l = listener;
                if (l != null) l.onSpectrum(bars);
            }
            case "playback.track" -> {
                if (data.path("gapless").asBoolean(false)) {
                    String path = data.path("path").asText("");
                    Listener l = listener;
                    if (l != null) l.onAdvanced(path);
                }
            }
            case "playback.finished" -> {
                playing = false;
                Listener l = listener;
                if (l != null) l.onFinished();
            }
            case "toast" -> {
                String message = data.path("message").asText("potatoHQ 播放错误");
                Listener l = listener;
                if (l != null) l.onError(message);
            }
            default -> {
            }
        }
    }

    private JsonNode call(String method, Map<String, Object> params) {
        if (writer == null) throw new IllegalStateException(error());
        long id = nextId.getAndIncrement();
        CompletableFuture<JsonNode> future = new CompletableFuture<>();
        pending.put(id, future);
        Map<String, Object> request = new LinkedHashMap<>();
        request.put("id", id);
        request.put("method", method);
        request.put("params", params == null ? Map.of() : params);
        try {
            synchronized (writer) {
                writer.write(Json.stringify(request));
                writer.newLine();
                writer.flush();
            }
            JsonNode reply = future.get(3, TimeUnit.SECONDS);
            if (reply.has("error")) {
                String message = reply.path("error").path("message").asText("engine error");
                throw new IllegalStateException(message);
            }
            return reply.path("result");
        } catch (Exception e) {
            pending.remove(id);
            if (e instanceof IllegalStateException ise) throw ise;
            throw new IllegalStateException("potatoHQ RPC 超时: " + method, e);
        }
    }

    @Override
    public boolean supportsGapless() {
        return true;
    }

    @Override
    public void setNext(String path) {
        try {
            call("playback.setNext", Map.of("path", path == null ? "" : path));
        } catch (Exception ignored) {
            // Preloading is an optimisation; a failure just means no gapless.
        }
    }

    @Override
    public void setFollowSourceRate(boolean enabled) {
        try {
            call("engine.setFollowRate", Map.of("enabled", enabled));
        } catch (Exception ignored) {
        }
    }

    @Override
    public void setCrossfeed(boolean enabled, double strength) {
        try {
            Map<String, Object> params = new LinkedHashMap<>();
            params.put("enabled", enabled);
            params.put("strength", strength);
            call("engine.setCrossfeed", params);
        } catch (Exception ignored) {
        }
    }

    @Override
    public void setVisualization(boolean enabled) {
        try {
            call("engine.setVisualization", Map.of("enabled", enabled));
        } catch (Exception ignored) {
        }
    }

    @Override
    public void setSpatial(boolean enabled, double x, double y) {
        try {
            Map<String, Object> params = new LinkedHashMap<>();
            params.put("enabled", enabled);
            params.put("x", x);
            params.put("y", y);
            call("engine.setSpatial", params);
        } catch (Exception ignored) {
            // Spatial is an effect; a failure must not stop playback.
        }
    }

    @Override
    public void setExclusive(boolean enabled) {
        try {
            call("engine.setExclusive", Map.of("enabled", enabled));
        } catch (Exception ignored) {
        }
    }

    @Override
    public void setDsdMode(int mult) {
        dsdMult = (mult == 64 || mult == 128 || mult == 256) ? mult : 0;
    }

    @Override
    public void play(String path) {
        call("playback.volume", Map.of("volume", volume));
        if (dsdMult > 0) {
            call("engine.setDsd", Map.of("dsd", dsdMult));
        } else {
            call("engine.setDsd", Map.of("dsd", 0));
        }
        JsonNode result = call("playback.play", Map.of("path", path));
        cachedDuration = result.path("duration").asDouble(cachedDuration);
        cachedTime = result.path("position").asDouble(0);
        playing = true;
        paused = false;
    }

    @Override
    public void pause() {
        call("playback.pause", Map.of());
        paused = true;
        playing = false;
    }

    @Override
    public void resume() {
        call("playback.resume", Map.of());
        paused = false;
        playing = true;
    }

    @Override
    public void stop() {
        try {
            call("playback.stop", Map.of());
        } catch (Exception ignored) {
            // Stop is best-effort; the process may already be gone.
        }
        playing = false;
        paused = false;
        cachedTime = 0;
    }

    @Override
    public void seek(double seconds) {
        call("playback.seek", Map.of("seconds", Math.max(0, seconds)));
        cachedTime = Math.max(0, seconds);
    }

    @Override
    public double time() {
        return cachedTime;
    }

    @Override
    public double length() {
        return cachedDuration;
    }

    @Override
    public boolean isPlaying() {
        return playing && !paused;
    }

    @Override
    public void setVolume(double value) {
        volume = Math.max(0, Math.min(1, value));
        try {
            call("playback.volume", Map.of("volume", volume));
        } catch (Exception ignored) {
            // Applying volume before the engine is ready is not fatal.
        }
    }

    @Override
    public boolean eqAvailable() {
        return true;
    }

    @Override
    public void applyEq(EqPreset preset, boolean on) {
        List<Map<String, Object>> bands = new ArrayList<>();
        for (int i = 0; i < EqPreset.BANDS; i++) {
            double gain = (on && preset != null) ? EqPreset.clamp(preset.bands[i]) : 0.0;
            Map<String, Object> band = new LinkedHashMap<>();
            band.put("freq", FREQUENCIES.get(Math.min(i, FREQUENCIES.size() - 1)));
            band.put("gain", gain);
            bands.add(band);
        }
        // Super's preamp uses VLC semantics: 12 dB is unity because VLC scales by
        // 0.25 dry. Convert to a true dB gain, then let the engine auto-headroom.
        double preamp = (on && preset != null) ? EqPreset.clamp(preset.preamp) - VLC_UNITY_DB : 0.0;
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("bands", bands);
        params.put("preamp", preamp);
        call("engine.setEq", params);
    }

    @Override
    public List<Float> eqFrequencies() {
        return FREQUENCIES;
    }

    @Override
    public List<String> eqFactoryPresetNames() {
        return List.of();
    }

    @Override
    public EqCurve eqFactoryPreset(String name) {
        return null;
    }

    @Override
    public void release() {
        try {
            call("engine.shutdown", Map.of());
        } catch (Exception ignored) {
            // Best effort.
        }
        if (process != null) {
            process.destroy();
            try {
                if (!process.waitFor(2, TimeUnit.SECONDS)) process.destroyForcibly();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
    }
}
