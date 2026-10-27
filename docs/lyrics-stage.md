# Lyric Stage

This document describes the lyric presentation that replaces the old
iframe-based 3D stage in Potatoplayer Ultra.

## Why it changed

The 3D stage was a separate WebGL application loaded in an iframe. It had
its own parser, its own visual system and a large vendored Three.js tree.
That made lyric improvements expensive: a new timing format had to be
implemented twice, and the main app could not reuse the stage's state.

Ultra keeps the main app in charge. The Java service parses lyrics into one
small word-aware payload; React renders that payload directly. The result is
easier to test, respects the app's reduced-motion setting and works with the
same playback clock as the rest of the interface.

## Supported lyric inputs

| Source | Line timing | Sub-line timing |
| --- | --- | --- |
| Plain LRC | Yes | No; the whole line is highlighted |
| Enhanced LRC / A2 | Yes | `<mm:ss.xx>` word tags; trailing `[mm:ss.xx]` line end |
| TTML | `<p begin end>` | `<span begin end>`; translation/roman spans when marked |
| QRC | `[start,duration]` | `(start,duration)` tags are relative to the line |
| YRC | `[start,duration]` | `(start,duration,0)` tags are absolute timestamps |
| WebVTT | cue start/end | Cue-level only |

Sidecar candidates are searched next to the audio and in the library's
`lyrics` folder. The parser picks the file with the strongest word timing;
plain LRC remains the fallback. Translation files are merged by nearest
line time.

KRC is intentionally not implemented. It is an obfuscated format without a
public, authoritative specification. The stage never invents word timing
for a plain LRC file; if a file has no sub-line data, the active line gets a
line-level highlight instead.

## Payload

`lyrics.get` keeps the old fields and adds optional data:

```json
{
  "found": true,
  "translated": true,
  "format": "TTML",
  "lines": [
    {
      "time": 12.0,
      "end": 15.2,
      "text": "Hello world",
      "translation": "你好，世界",
      "words": [
        { "time": 12.0, "end": 12.4, "text": "Hello" },
        { "time": 12.4, "end": 15.2, "text": " world" }
      ]
    }
  ]
}
```

Invariants:

- `time` and `end` are seconds;
- `words` may be missing or empty;
- word text concatenates to the displayed line;
- `end` is never before `time`; missing ends inherit the next line's start.

The fields are additive, so an older client can still render `text` and
`translation`.

## Clock and rendering

The Java playback controller reports time every 500 ms. The stage anchors
each report to `performance.now()` and interpolates between reports with
`requestAnimationFrame` (throttled to roughly 30 fps). This removes the
visible 500 ms stair-step from word highlighting and keeps the progress bar
smooth.

The stage has three layouts:

- **Cinema** — active line, nearby context, distant lines blurred out;
- **Focus** — active line and one neighbour on each side;
- **Minimal** — active line only.

Visual controls are stored in `potato:immersive-preferences:v1` alongside
the classic immersive preferences. The old `"3d"` value is migrated to
`"stage"` on load.

## Accessibility and performance

- `prefers-reduced-motion` and the app's Reduce motion setting disable
  ambient drift and line motion.
- Clicking a line seeks to its timestamp; the stage uses real buttons and
  exposes `aria-current` for the active line.
- Only one React stage is mounted; no iframe or WebGL context is created.
- The stage respects the existing translation, cover, info, header, progress
  and favorite visibility toggles.

## Folia attribution

The product direction — full-screen lyric performance, active-line focus,
context falloff, word-level highlighting and a translation that follows the
singer — was inspired by
[Folia](https://github.com/chthollyphile/folia-major) by chthollyphile and
contributors (AGPL-3.0).

Ultra's parser, payload, React stage and CSS are original work. No Folia
source, styles, fonts, assets or generated bundles were copied. See
[`CREDITS.md`](../CREDITS.md) for the full acknowledgement and the
AGPL-3.0 note.
