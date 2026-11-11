package com.potatomusic.superapp;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.OutputStreamWriter;
import java.net.StandardProtocolFamily;
import java.net.UnixDomainSocketAddress;
import java.nio.channels.Channels;
import java.nio.channels.SocketChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

/**
 * mpv 播放引擎:子进程 + {@code --input-ipc-server} 的 JSON IPC。
 *
 * <p>mpv 负责解码和输出;EQ 通过 {@code af set lavfi=[equalizer=...]} 映射,
 * preamp 折算进 mpv 的 volume。</p>
 */
public final class MpvPlaybackEngine implements PlaybackEngine {
    static final double VLC_UNITY_DB = 12.0412;

    private static final List<Float> FREQUENCIES = List.of(
            31.25f, 62.5f, 125f, 250f, 500f, 1000f, 2000f, 4000f, 8000f, 16000f);

    private final Process process;
    private final Path socketPath;
    private final BufferedWriter writer;
    private final Thread reader;
    private final AtomicLong requestId = new AtomicLong(10);
    private volatile Listener listener;
    private volatile String initError;
    private volatile double cachedTime = 0;
    private volatile double cachedDuration = 0;
    private volatile boolean paused = true;
    private volatile boolean idleActive = true;
    private volatile boolean ended = false;
    private volatile double baseVolume = 0.3;
    private volatile double preampGain = 1.0;

    public MpvPlaybackEngine() {
        String binary = EngineFactory.findMpvBinary();
        Process started = null;
        Path socket = null;
        BufferedWriter out = null;
        String error = null;
        if (binary == null) {
            error = "未找到 mpv 可执行文件";
        } else {
            try {
                socket = Path.of(System.getProperty("java.io.tmpdir"),
                        "potatohq-mpv-" + ProcessHandle.current().pid() + ".sock");
                Files.deleteIfExists(socket);
                started = new ProcessBuilder(
                        binary,
                        "--idle=yes",
                        "--no-video",
                        "--no-terminal",
                        "--input-ipc-server=" + socket,
                        "--volume=" + Math.round(baseVolume * 100))
                        .redirectError(ProcessBuilder.Redirect.DISCARD)
                        .start();
                SocketChannel channel = connectWithRetry(socket, 3000);
                if (channel == null) {
                    error = "mpv 未在 3 秒内创建 IPC socket";
                    started.destroy();
                    started = null;
                } else {
                    out = new BufferedWriter(new OutputStreamWriter(Channels.newOutputStream(channel),
                            StandardCharsets.UTF_8));
                    this.channel = channel;
                }
            } catch (Exception e) {
                error = "无法启动 mpv: " + e.getMessage();
                if (started != null) started.destroy();
                started = null;
            }
        }
        this.process = started;
        this.socketPath = socket;
        this.writer = out;
        this.initError = error;
        if (started != null && out != null) {
            this.reader = new Thread(this::readLoop, "mpv-ipc");
            this.reader.setDaemon(true);
            this.reader.start();
            observe(1, "time-pos");
            observe(2, "duration");
            observe(3, "pause");
            observe(4, "idle-active");
        } else {
            this.reader = null;
        }
    }

    private SocketChannel channel;

    private static SocketChannel connectWithRetry(Path socket, long timeoutMs) throws Exception {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < deadline) {
            if (Files.exists(socket)) {
                try {
                    SocketChannel channel = SocketChannel.open(StandardProtocolFamily.UNIX);
                    channel.connect(UnixDomainSocketAddress.of(socket));
                    return channel;
                } catch (Exception ignored) {
                    // mpv may still be creating it.
                }
            }
            Thread.sleep(50);
        }
        return null;
    }

    @Override
    public String id() {
        return EngineFactory.MPV;
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

    private void observe(int id, String property) {
        sendCommand(id, List.of("observe_property", id, property));
    }

    private synchronized void send(Object payload) {
        if (writer == null) return;
        try {
            writer.write(Json.stringify(payload));
            writer.newLine();
            writer.flush();
        } catch (Exception ignored) {
            // Process gone; availability() reports it.
        }
    }

    private void sendCommand(long id, List<?> command) {
        ObjectNode node = Json.MAPPER.createObjectNode();
        ArrayNode array = node.putArray("command");
        for (Object item : command) {
            if (item instanceof Number n) {
                // mpv validates observe_property ids as integers: 1.0 is rejected.
                double d = n.doubleValue();
                if (d == Math.rint(d) && Math.abs(d) < 1e15) array.add(n.longValue());
                else array.add(d);
            } else if (item instanceof Boolean b) array.add(b);
            else array.add(String.valueOf(item));
        }
        node.put("request_id", id);
        send(node);
    }

    private void readLoop() {
        try (BufferedReader in = new BufferedReader(
                new java.io.InputStreamReader(Channels.newInputStream(channel), StandardCharsets.UTF_8))) {
            String line;
            while ((line = in.readLine()) != null) {
                if (line.isBlank()) continue;
                JsonNode message;
                try {
                    message = Json.MAPPER.readTree(line);
                } catch (Exception ignored) {
                    continue;
                }
                String event = message.path("event").asText("");
                switch (event) {
                    case "property-change" -> handleProperty(message.path("name").asText(""), message.get("data"));
                    case "end-file" -> {
                        String reason = message.path("reason").asText("");
                        if ("eof".equals(reason)) {
                            ended = true;
                            Listener l = listener;
                            if (l != null) l.onFinished();
                        }
                    }
                    default -> {
                    }
                }
            }
        } catch (Exception ignored) {
            // Socket closed.
        }
    }

    private void handleProperty(String name, JsonNode data) {
        if (data == null || data.isNull()) return;
        switch (name) {
            case "time-pos" -> cachedTime = data.asDouble(cachedTime);
            case "duration" -> cachedDuration = data.asDouble(cachedDuration);
            case "pause" -> paused = data.asBoolean(paused);
            case "idle-active" -> idleActive = data.asBoolean(idleActive);
            default -> {
            }
        }
    }

    @Override
    public void play(String path) {
        ended = false;
        sendCommand(requestId.incrementAndGet(), List.of("loadfile", path, "replace"));
        sendCommand(requestId.incrementAndGet(), List.of("set_property", "pause", false));
        paused = false;
        idleActive = false;
        cachedTime = 0;
    }

    @Override
    public void pause() {
        sendCommand(requestId.incrementAndGet(), List.of("set_property", "pause", true));
        paused = true;
    }

    @Override
    public void resume() {
        sendCommand(requestId.incrementAndGet(), List.of("set_property", "pause", false));
        paused = false;
    }

    @Override
    public void stop() {
        sendCommand(requestId.incrementAndGet(), List.of("stop"));
        cachedTime = 0;
        paused = true;
    }

    @Override
    public void seek(double seconds) {
        sendCommand(requestId.incrementAndGet(), List.of("seek", Math.max(0, seconds), "absolute"));
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
        return !paused && !idleActive && !ended;
    }

    @Override
    public void setVolume(double value) {
        baseVolume = Math.max(0, Math.min(1, value));
        applyEffectiveVolume();
    }

    /** Visible for the safety test: the volume actually sent to mpv. */
    double effectiveVolume() {
        return Math.min(1.0, baseVolume * preampGain);
    }

    private void applyEffectiveVolume() {
        // preampGain is <= 1 (see applyEq); never boost above the user's volume.
        double effective = Math.min(1.0, baseVolume * preampGain);
        sendCommand(requestId.incrementAndGet(), List.of("set_property", "volume", effective * 100.0));
    }

    @Override
    public boolean eqAvailable() {
        return true;
    }

    /**
     * Measured peak of the 10-band peaking cascade (RBJ, Q=1.4) on a 20 Hz–20 kHz
     * log grid. Used to pull the preamp down so a "+20 dB" band cannot clip or
     * blast the listener.
     */
    private static double peakGainDb(EqPreset preset) {
        final double fs = 44100.0;
        double peak = 0.0;
        final double top = 20000.0;
        for (int i = 0; i <= 256; i++) {
            final double f = 20.0 * Math.pow(top / 20.0, i / 256.0);
            final double w = 2.0 * Math.PI * f / fs;
            double hRe = 1.0;
            double hIm = 0.0;
            for (int b = 0; b < EqPreset.BANDS; b++) {
                double gain = EqPreset.clamp(preset.bands[b]);
                if (Math.abs(gain) < 0.01) continue;
                double freq = FREQUENCIES.get(Math.min(b, FREQUENCIES.size() - 1));
                double A = Math.pow(10.0, gain / 40.0);
                double w0 = 2.0 * Math.PI * freq / fs;
                double alpha = Math.sin(w0) / (2.0 * 1.4);
                double cw = Math.cos(w0);
                double a0 = 1.0 + alpha / A;
                double b0 = (1.0 + alpha * A) / a0;
                double b1 = (-2.0 * cw) / a0;
                double b2 = (1.0 - alpha * A) / a0;
                double a1 = (-2.0 * cw) / a0;
                double a2 = (1.0 - alpha / A) / a0;
                // H = (b0 + b1 z^-1 + b2 z^-2) / (1 + a1 z^-1 + a2 z^-2)
                double c1 = Math.cos(w), s1 = Math.sin(w);
                double c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
                double numRe = b0 + b1 * c1 + b2 * c2;
                double numIm = -(b1 * s1 + b2 * s2);
                double denRe = 1.0 + a1 * c1 + a2 * c2;
                double denIm = -(a1 * s1 + a2 * s2);
                double denMag = denRe * denRe + denIm * denIm;
                double qRe = (numRe * denRe + numIm * denIm) / denMag;
                double qIm = (numIm * denRe - numRe * denIm) / denMag;
                double nRe = hRe * qRe - hIm * qIm;
                double nIm = hRe * qIm + hIm * qRe;
                hRe = nRe;
                hIm = nIm;
            }
            double mag = Math.hypot(hRe, hIm);
            peak = Math.max(peak, 20.0 * Math.log10(Math.max(mag, 1e-9)));
        }
        return peak;
    }

    @Override
    public void applyEq(EqPreset preset, boolean on) {
        if (!on || preset == null) {
            preampGain = 1.0;
            sendCommand(requestId.incrementAndGet(), List.of("af", "set", ""));
            applyEffectiveVolume();
            return;
        }
        StringBuilder spec = new StringBuilder("lavfi=[");
        boolean first = true;
        for (int i = 0; i < EqPreset.BANDS; i++) {
            double gain = EqPreset.clamp(preset.bands[i]);
            if (Math.abs(gain) < 0.01) continue;
            if (!first) spec.append(',');
            first = false;
            double freq = FREQUENCIES.get(Math.min(i, FREQUENCIES.size() - 1));
            spec.append("equalizer=f=").append(freq)
                    .append(":width_type=o:width=1:g=").append(gain);
        }
        // Auto headroom: peak of the cascade must stay <= 0 dBFS, so the preamp
        // can only attenuate. This is what prevents the "sudden blast".
        double peakDb = first ? 0.0 : peakGainDb(preset);
        double requested = EqPreset.clamp(preset.preamp) - VLC_UNITY_DB;
        double effective = Math.min(0.0, Math.min(requested, -peakDb));
        preampGain = Math.pow(10.0, effective / 20.0);
        if (!first) {
            // alimiter catches inter-sample overs and program peaks.
            spec.append(",alimiter=limit=0.95");
        }
        spec.append(']');
        sendCommand(requestId.incrementAndGet(), List.of("af", "set", first ? "" : spec.toString()));
        applyEffectiveVolume();
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
        sendCommand(requestId.incrementAndGet(), List.of("quit"));
        try {
            if (process != null) {
                if (!process.waitFor(2, java.util.concurrent.TimeUnit.SECONDS)) process.destroyForcibly();
            }
            if (socketPath != null) Files.deleteIfExists(socketPath);
        } catch (Exception ignored) {
        }
        try {
            if (channel != null) channel.close();
        } catch (Exception ignored) {
        }
    }
}
