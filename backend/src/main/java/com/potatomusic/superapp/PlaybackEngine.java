package com.potatomusic.superapp;

import uk.co.caprica.vlcj.factory.MediaPlayerFactory;
import uk.co.caprica.vlcj.factory.discovery.NativeDiscovery;
import uk.co.caprica.vlcj.player.base.Equalizer;
import uk.co.caprica.vlcj.player.base.MediaPlayer;
import uk.co.caprica.vlcj.player.base.MediaPlayerEventAdapter;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Thin, defensive wrapper around VLCJ. Audio only; no video surface is needed. */
public final class PlaybackEngine {
    public interface Listener {
        void onFinished();

        void onError(String message);
    }

    public record EqCurve(float preamp, float[] bands) {
    }

    private final MediaPlayerFactory factory;
    private final MediaPlayer player;
    private final Equalizer equalizer;
    private final String initError;
    private volatile Listener listener;

    public PlaybackEngine() {
        MediaPlayerFactory createdFactory = null;
        MediaPlayer createdPlayer = null;
        Equalizer createdEqualizer = null;
        String error = null;
        try {
            boolean discovered = new NativeDiscovery().discover();
            if (!discovered) {
                String libDir = libvlcDir();
                if (libDir != null) {
                    System.setProperty("jna.library.path", libDir);
                }
            }
            createdFactory = new MediaPlayerFactory();
            createdPlayer = createdFactory.mediaPlayers().newMediaPlayer();
            try {
                createdEqualizer = createdFactory.equalizer().newEqualizer();
            } catch (Throwable ignored) {
                // Old libVLC builds may not expose the equalizer API.
            }
            createdPlayer.events().addMediaPlayerEventListener(new MediaPlayerEventAdapter() {
                @Override
                public void finished(MediaPlayer mediaPlayer) {
                    Listener l = listener;
                    if (l != null) {
                        l.onFinished();
                    }
                }

                @Override
                public void error(MediaPlayer mediaPlayer) {
                    Listener l = listener;
                    if (l != null) {
                        l.onError("VLC could not play this file.");
                    }
                }
            });
        } catch (Throwable t) {
            error = friendlyError(t);
            if (createdPlayer != null) {
                try {
                    createdPlayer.release();
                } catch (Throwable ignored) {
                }
            }
            if (createdFactory != null) {
                try {
                    createdFactory.release();
                } catch (Throwable ignored) {
                }
            }
            createdFactory = null;
            createdPlayer = null;
        }
        this.factory = createdFactory;
        this.player = createdPlayer;
        this.equalizer = createdEqualizer;
        this.initError = error;
    }

    public void setListener(Listener listener) {
        this.listener = listener;
    }

    public boolean available() {
        return player != null;
    }

    public String error() {
        return initError;
    }

    public void play(String path) {
        requireAvailable();
        player.media().play(path);
    }

    public void pause() {
        if (player != null) {
            player.controls().pause();
        }
    }

    public void resume() {
        if (player != null) {
            player.controls().play();
        }
    }

    public void stop() {
        if (player != null) {
            player.controls().stop();
        }
    }

    public void seek(double seconds) {
        if (player != null) {
            player.controls().setTime(Math.max(0, (long) (seconds * 1000)));
        }
    }

    public double time() {
        if (player == null) {
            return 0;
        }
        long ms = player.status().time();
        return ms >= 0 ? ms / 1000.0 : 0;
    }

    public double length() {
        if (player == null) {
            return 0;
        }
        long ms = player.status().length();
        return ms > 0 ? ms / 1000.0 : 0;
    }

    public boolean isPlaying() {
        return player != null && player.status().isPlaying();
    }

    public void setVolume(double volume) {
        if (player != null) {
            player.audio().setVolume((int) Math.round(Math.max(0, Math.min(1.2, volume)) * 100));
        }
    }

    public boolean eqAvailable() {
        return player != null && equalizer != null;
    }

    public void applyEq(EqPreset preset, boolean on) {
        if (player == null || equalizer == null) return;
        try {
            if (preset != null) {
                int count = Math.min(EqPreset.BANDS, equalizer.bandCount());
                for (int i = 0; i < count; i++) {
                    equalizer.setAmp(i, EqPreset.clamp(preset.bands[i]));
                }
                equalizer.setPreamp(EqPreset.clamp(preset.preamp));
            }
            player.audio().setEqualizer(on && preset != null ? equalizer : null);
        } catch (Throwable e) {
            System.err.println("[eq] unable to apply equalizer: " + e.getMessage());
        }
    }

    public List<Float> eqFrequencies() {
        try {
            if (factory != null) return factory.equalizer().bands();
        } catch (Throwable ignored) {
        }
        return List.of(31.25f, 62.5f, 125f, 250f, 500f, 1000f, 2000f, 4000f, 8000f, 16000f);
    }

    public List<String> eqFactoryPresetNames() {
        try {
            if (factory != null) return factory.equalizer().presets();
        } catch (Throwable ignored) {
        }
        return List.of();
    }

    public EqCurve eqFactoryPreset(String name) {
        if (factory == null || name == null || name.isBlank()) return null;
        try {
            Equalizer preset = factory.equalizer().newEqualizer(name);
            if (preset == null) return null;
            float[] bands = new float[EqPreset.BANDS];
            int count = Math.min(EqPreset.BANDS, preset.bandCount());
            for (int i = 0; i < count; i++) bands[i] = preset.amp(i);
            return new EqCurve(preset.preamp(), bands);
        } catch (Throwable e) {
            return null;
        }
    }

    public void release() {
        if (player != null) {
            try {
                player.release();
            } catch (Throwable ignored) {
            }
        }
        if (factory != null) {
            try {
                factory.release();
            } catch (Throwable ignored) {
            }
        }
    }

    private void requireAvailable() {
        if (player == null) {
            throw new IllegalStateException(initError == null ? "VLC is unavailable." : initError);
        }
    }

    private static String friendlyError(Throwable t) {
        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        String hint = os.contains("mac")
                ? "Install VLC from videolan.org (the app looks for /Applications/VLC.app)."
                : "Install the VLC desktop app and make sure libvlc is on the library path.";
        String message = t.getMessage();
        return "VLC could not be loaded. " + hint + (message == null ? "" : " (" + message + ")");
    }

    static String libvlcDir() {
        String override = System.getProperty("potatomusic.libvlcDir");
        if (override != null && !override.isBlank()) {
            return override.trim();
        }
        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        String[] candidates;
        if (os.contains("mac")) {
            candidates = new String[]{
                    "/Applications/VLC.app/Contents/MacOS/lib",
                    System.getProperty("user.home") + "/Applications/VLC.app/Contents/MacOS/lib"
            };
        } else if (os.contains("win")) {
            String pf = System.getenv("ProgramFiles");
            String pf86 = System.getenv("ProgramFiles(x86)");
            candidates = new String[]{
                    (pf == null ? "C:\\Program Files" : pf) + "\\VideoLAN\\VLC",
                    (pf86 == null ? "C:\\Program Files (x86)" : pf86) + "\\VideoLAN\\VLC"
            };
        } else {
            candidates = new String[]{
                    "/usr/lib/x86_64-linux-gnu", "/usr/lib/aarch64-linux-gnu",
                    "/usr/lib64", "/usr/lib", "/usr/local/lib", "/snap/vlc/current/usr/lib"
            };
        }
        for (String candidate : candidates) {
            if (new File(candidate).isDirectory()) {
                return candidate;
            }
        }
        return null;
    }
}
