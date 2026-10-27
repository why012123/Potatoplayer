package com.potatomusic.superapp;

import java.util.ArrayList;
import java.util.List;

/** Persisted user preferences. Values are intentionally simple JSON fields. */
public class Settings {
    public String libraryRoot;
    public double volume = 0.78;
    public String repeat = "off";
    public boolean shuffle = false;
    public String lastTrackId;
    public double lastPosition = 0;
    public List<String> lastQueue = new ArrayList<>();
    public int lastQueueIndex = -1;
    public boolean reducedMotion = false;
    /** vlc | potatohq | mpv — applied on the next launch. */
    public String playbackEngine = EngineFactory.VLC;
    /** pcm | dop64 | dop128 — only potatoHQ honours this. */
    public String outputMode = "pcm";
    /** potatoHQ-only: virtual sound field (x right, y front, both -1..1). */
    public boolean spatialEnabled = false;
    public double spatialX = 0.0;
    public double spatialY = 0.0;
    /** potatoHQ-only: Hog Mode. */
    public boolean exclusive = false;
    /** potatoHQ-only: headphone crossfeed. */
    public boolean crossfeedEnabled = false;
    public double crossfeedStrength = 0.5;
    /** potatoHQ-only: follow the source sample rate on the device. */
    public boolean followSourceRate = true;
}
