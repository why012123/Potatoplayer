package com.potatomusic.superapp;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** The on-disk library index plus lightweight user state. */
public class LibraryState {
    public String libraryRoot;
    public List<Track> tracks = new ArrayList<>();
    public Set<String> favorites = new LinkedHashSet<>();
    public List<Playlist> playlists = new ArrayList<>();
    public List<Tag> blocks = new ArrayList<>();
    public List<Tag> genres = new ArrayList<>();
    public int schemaVersion = 0;
    public long scannedAt;
}
