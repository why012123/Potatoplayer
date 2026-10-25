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
}
