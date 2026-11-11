package com.potatomusic.superapp;

import java.util.ArrayList;
import java.util.List;

/** A user-created playlist. Track order is preserved. */
public class Playlist {
    public String id;
    public String name;
    public List<String> trackIds = new ArrayList<>();
    public long createdAt;

    public Playlist() {
    }

    public Playlist(String id, String name) {
        this.id = id;
        this.name = name;
        this.createdAt = System.currentTimeMillis();
    }
}
