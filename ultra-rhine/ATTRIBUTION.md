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
- `scripts/generate-music-archives.mjs` replaces the sample archive with every
  local track, grouped into all named blocks (plus "未分组"), keeps `trackId`
  and `coverPath` for playback/stickers, and expands the layout to eight
  scrollable columns while keeping the original five-by-eight viewport.
- `src/main.ts` starts playback when a file is opened, adds a PLAY/PAUSE button,
  maps Space to playback, shows the song title as the large heading and the
  artist below it, and skips PWA registration outside HTTP.
- `src/scene.ts` adds a cover sticker plane (white border, shadow, slight
  rotation) in front of the extracted cassette and its detail/assembly model.
- Hidden/automation windows use `?silent=1`: app audio off and backend muted.
- `src/data.ts` records carry an optional `trackId`.
- `src/potato.d.ts` declares the Electron preload bridge.
- PWA/service-worker generation is disabled for the Electron build.
