# Attribution

This directory is a fork of **RhineLabUI** by LBEILC, used as the visual and
interaction base for Potatoplayer Ultra.

- Upstream: https://github.com/LBEILC/RhineLabUI
- Upstream commit: 12cc5e4 (2026-10-08)
- License: MIT (see `LICENSE`); original code, Blender sources, GLB models and
  original audio are MIT for the author-owned parts.
- The Arknights / Rhine Lab names, logo, original PV, visual identity and audio
  samples are **not** covered by that MIT grant. This fork is for local,
  personal use; do not redistribute it as an official Arknights product.

Local modifications:

- `vite.config.ts` uses a relative base so the build can be opened from
  Electron's `file://` URL.
- `scripts/generate-music-archives.mjs` replaces the 40 sample archive records
  with the five largest named blocks of the local Potatoplayer library (eight
  highest-rated tracks each) and keeps `trackId` for playback.
- `src/main.ts` starts playback when a file is opened, adds a PLAY/PAUSE button,
  maps Space to playback, and skips PWA registration outside HTTP.
- `src/data.ts` records carry an optional `trackId`.
- `src/potato.d.ts` declares the Electron preload bridge.
- PWA/service-worker generation is disabled for the Electron build.
