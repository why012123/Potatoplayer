package com.potatomusic.superapp;

import java.util.List;

/**
 * Playback backend seen by {@link PlaybackController}.
 *
 * <p>Three implementations exist: the original VLCJ wrapper ({@link VlcPlaybackEngine}),
 * the native potatoHQ engine ({@link PotatoHqPlaybackEngine}) and mpv
 * ({@link MpvPlaybackEngine}). The engine is chosen at startup from
 * {@code Settings.playbackEngine}; switching requires an app restart.</p>
 */
public interface PlaybackEngine {
    interface Listener {
        void onFinished();

        void onError(String message);

        /** Gapless hand-off: the engine moved to {@code path} on its own. */
        default void onAdvanced(String path) {
        }

        /** Spectrum bars (0..1) from the native engine's visualization tap. */
        default void onSpectrum(java.util.List<Double> bars) {
        }
    }

    record EqCurve(float preamp, float[] bands) {
    }

    /** Stable identifier: {@code vlc}, {@code potatohq} or {@code mpv}. */
    String id();

    void setListener(Listener listener);

    boolean available();

    String error();

    void play(String path);

    void pause();

    void resume();

    void stop();

    void seek(double seconds);

    double time();

    double length();

    boolean isPlaying();

    void setVolume(double volume);

    boolean eqAvailable();

    void applyEq(EqPreset preset, boolean on);

    List<Float> eqFrequencies();

    List<String> eqFactoryPresetNames();

    EqCurve eqFactoryPreset(String name);

    void release();

    /** Preload the next file for a gapless hand-off (no-op when unsupported). */
    default void setNext(String path) {
    }

    /** True when {@link #setNext(String)} actually produces seamless playback. */
    default boolean supportsGapless() {
        return false;
    }

    /** 0 = PCM, 64/128 = DoP carrier (only potatoHQ implements this). */
    default void setDsdMode(int mult) {
    }

    /** Virtual sound field (potatoHQ only). */
    default void setSpatial(boolean enabled, double x, double y) {
    }

    /** Hog Mode / exclusive device access (potatoHQ only). */
    default void setExclusive(boolean enabled) {
    }

    /** Spectrum tap for the UI (potatoHQ only). */
    default void setVisualization(boolean enabled) {
    }

    /** Headphone crossfeed (potatoHQ only). */
    default void setCrossfeed(boolean enabled, double strength) {
    }

    /** Follow the source sample rate on the device (potatoHQ only). */
    default void setFollowSourceRate(boolean enabled) {
    }
}
