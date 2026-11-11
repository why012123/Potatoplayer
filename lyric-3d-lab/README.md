# 3D Lyric Stage

A standalone, data-driven WebGL lyric-performance experiment. No song,
audio path, cover path, duration, lyric timeline or visual cue is hard-coded.

It reads the local Potatoplayer library through a small read-only JSON API:

- `/api/tracks` — tracks with covers / timed LRC availability
- `/api/song?id=…` — metadata + raw LRC + translation
- `/api/audio?id=…` — Range-streamed audio
- `/api/cover?id=…` — cover art

The browser parses the LRC, derives movements, themes and visual treatments
structurally, and then renders the 3D stage.

## Run

```bash
cd lyric-3d-lab
python3 serve.py
```

Open <http://127.0.0.1:4174>. Pick any track with timed lyrics from the start
screen. To deep-link a track:

```text
http://127.0.0.1:4174/?track=<track-id>
```

Override the library location with `POTATO_HOME` or `POTATO_LIBRARY_FILE`.

## Controls

- **STAGE / CLEAN** — show or hide the HUD; `H` toggles clean view
- `Space` — play/pause
- `← / →` — seek 5 seconds
- `L` — replay the current lyric
- `F` — fullscreen
- **FX** — bloom glow, depth particles, camera drift, intensity and structural
  scene cues
- The track and lyric data are resolved at runtime; selecting another track
  reloads the same engine with its own audio, cover, LRC and movement map.

Audio and cover art stay local. Nothing is uploaded.
