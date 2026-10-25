package com.potatomusic.superapp;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/** Resolves the app data directory and owns all persistence files. */
public final class DataStore {
    private final Path dataDir;
    private final Path settingsFile;
    private final Path libraryFile;
    private final Path eqFile;
    private final Path coversDir;

    public DataStore() {
        this.dataDir = resolveDataDir();
        this.settingsFile = dataDir.resolve("settings.json");
        this.libraryFile = dataDir.resolve("library.json");
        this.eqFile = dataDir.resolve("eq.json");
        this.coversDir = dataDir.resolve("covers");
    }

    public Path dataDir() {
        return dataDir;
    }

    public Path coversDir() {
        return coversDir;
    }

    public Path settingsFile() {
        return settingsFile;
    }

    public Path libraryFile() {
        return libraryFile;
    }

    public Path eqFile() {
        return eqFile;
    }

    public void ensure() throws IOException {
        Files.createDirectories(dataDir);
        Files.createDirectories(coversDir);
    }

    public Settings loadSettings() {
        try {
            if (Files.isRegularFile(settingsFile)) {
                return Json.read(Files.readString(settingsFile), Settings.class);
            }
        } catch (Exception e) {
            System.err.println("[store] unable to read settings: " + e.getMessage());
        }
        return new Settings();
    }

    public void saveSettings(Settings settings) throws IOException {
        ensure();
        Json.writeAtomic(settingsFile, settings);
    }

    public LibraryState loadLibrary() {
        try {
            if (Files.isRegularFile(libraryFile)) {
                LibraryState state = Json.read(Files.readString(libraryFile), LibraryState.class);
                if (state.tracks == null) {
                    state.tracks = new ArrayList<>();
                }
                if (state.favorites == null) {
                    state.favorites = new java.util.LinkedHashSet<>();
                }
                if (state.playlists == null) {
                    state.playlists = new ArrayList<>();
                }
                if (state.blocks == null) {
                    state.blocks = new ArrayList<>();
                }
                if (state.genres == null) {
                    state.genres = new ArrayList<>();
                }
                return state;
            }
        } catch (Exception e) {
            System.err.println("[store] unable to read library: " + e.getMessage());
        }
        return new LibraryState();
    }

    public void saveLibrary(LibraryState state) throws IOException {
        ensure();
        Json.writeAtomic(libraryFile, state);
    }

    /** Roots from which the renderer may request artwork through the custom protocol. */
    public List<String> coverRoots(Path libraryRoot) {
        List<String> roots = new ArrayList<>();
        roots.add(coversDir.toAbsolutePath().normalize().toString());
        roots.add(dataDir.toAbsolutePath().normalize().toString());
        if (libraryRoot != null) {
            roots.add(libraryRoot.toAbsolutePath().normalize().toString());
            Path parent = libraryRoot.toAbsolutePath().normalize().getParent();
            if (parent != null) {
                roots.add(parent.toString());
                Path covers = parent.resolve("covers");
                if (Files.isDirectory(covers)) {
                    roots.add(covers.toAbsolutePath().normalize().toString());
                }
            }
        }
        return roots.stream().distinct().toList();
    }

    private static Path resolveDataDir() {
        String override = System.getProperty("potatomusic.home");
        if (override == null || override.isBlank()) {
            override = System.getenv("POTATOMUSIC_HOME");
        }
        if (override != null && !override.isBlank()) {
            return Path.of(override).toAbsolutePath().normalize();
        }
        return Path.of(System.getProperty("user.home"), ".potatoplayer-super").toAbsolutePath().normalize();
    }
}
