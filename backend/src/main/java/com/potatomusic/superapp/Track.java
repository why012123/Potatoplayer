package com.potatomusic.superapp;

/** A single local audio file and the metadata shown by the UI. */
public class Track {
    public String id;
    public String path;
    public String title;
    public String artist;
    public String album;
    public String genre;
    public String block;
    public String note;
    public String coverPath;
    public int duration;
    public int year;
    public int trackNo;
    public int playCount;
    public double rating;
    public String neteaseId;
    public String qqId;
    public long addedAt;
    public long fileSize;

    public Track() {
    }

    public Track copy() {
        Track t = new Track();
        t.id = id;
        t.path = path;
        t.title = title;
        t.artist = artist;
        t.album = album;
        t.genre = genre;
        t.block = block;
        t.note = note;
        t.coverPath = coverPath;
        t.duration = duration;
        t.year = year;
        t.trackNo = trackNo;
        t.playCount = playCount;
        t.rating = rating;
        t.neteaseId = neteaseId;
        t.qqId = qqId;
        t.addedAt = addedAt;
        t.fileSize = fileSize;
        return t;
    }
}
