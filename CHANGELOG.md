# Changelog

All notable changes to this project are documented here. The version follows the
original Potato Player convention: increment the smallest number for each change.

## 1.0.1 — 2026-10-25

### Added
- A full **Song editor** page with a searchable/filterable song browser, block and
  genre assignment, rating, up to 2,000-character personal notes, favorites,
  discard/save controls and previous/next stepping.
- Access from the sidebar, the top-bar pencil, the track `···` menu, and `⌘E`.
- Notes are persisted in `library.json`, imported from legacy ratings, and
  preserved across rescans.

### Fixed
- Collapsing the right-hand Now Playing panel no longer leaves a reserved empty
  column. The content area now expands to fill the window, with the Mini Player
  remaining available for playback control.

## 1.0.0 — 2026-10-25

The first **Potatoplayer Super** release — a complete UI rebuild of Potatoplayer
Java on an Electron + React renderer, with the proven Java/VLC playback core
rebuilt as a headless service.

### New shell
- Warm iOS-style frosted glass interface with three clear zones: library rail,
  content canvas, and an always-present now-playing panel.
- Dynamic ambient background derived from the current cover, with animated glass
  blobs, soft grain, and a cover-coloured accent.
- Spring page transitions, shared navigation pill, hover lift, artwork crossfades,
  animated equalizer, progress transitions, toasts and a command palette.
- Compact mini player when the now-playing panel is collapsed.
- Keyboard shortcuts and a collapsible command palette.

### Core collection system
- **Blocks** and **Genres** are first-class data, not loose metadata.
- Imports the original `ratings.json`, `blocks.json`, `genres.json`, cover cache
  and artist/title/duration cache without writing to the old library.
- Dedicated Collections page with colour-coded cards, counts, average ratings,
  duration and a Taste Profile ranking.
- Per-song block/genre editor, bulk assignment from a filtered selection, and a
  complete manager for creating, renaming, recolouring and deleting tags.
- Block and genre filters in Songs; the table surfaces both axes directly.
- User edits survive rescans; removing a tag does not resurrect it from the old
  library.

### NetEase
- Dedicated Discover page backed by a local `api-enhanced` service.
- QR login and cookie login; existing Potato Player cookie is imported read-only.
- Song search, daily recommendations, personal playlists and playlist detail.
- Download to the local library with embedded cover, `.lrc` and `.trans.lrc`
  lyrics, quality selection (Standard / High / Lossless), live progress tray and
  automatic re-indexing.
- Download bindings keep NetEase artwork and album data attached to the file
  without rewriting the audio file.

### Playback & library
- Local MP3, FLAC, M4A, AAC, OGG, Opus, WAV and AIFF scanning.
- VLCJ playback, seek, volume, mute, shuffle, repeat off/all/one and queue.
- Session restore (last track + position), favorites, user playlists, search.
- Bilingual LRC lyrics with a current-line view and click-to-seek.
- Albums/artist collections, artist pages, album pages and favorites.

### Engineering
- Java service speaks newline-delimited JSON-RPC over stdio; Electron main acts
  as the secure bridge. The renderer never sees a Java process or a secret.
- Typed React/TypeScript UI, Zustand state, Framer Motion animations.
- Self-contained backend build script downloads exact dependency jars on a cold
  machine; no Maven installation required.
- Backend unit tests, a real VLC playback smoke test, and Playwright UI tests.
