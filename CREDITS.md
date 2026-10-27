# Credits and inspiration

## Folia

Potatoplayer Ultra's lyric stage is explicitly inspired by
[Folia](https://github.com/chthollyphile/folia-major), created by
**chthollyphile** and its contributors. Folia is licensed under
**AGPL-3.0**.

The ideas we studied and adapted in product terms:

- treating full-screen lyrics as the performance, not as a side panel;
- keeping the active line in focus while surrounding lines fall back;
- word-by-word / character-by-character highlight when the lyric file
  provides sub-line timing;
- translation that follows the active line;
- several visual stage moods, layouts and tunable type/glow parameters;
- a local-first lyric library that reads rich sidecar formats instead of
  requiring a streaming service.

These are interaction and presentation concepts. **No Folia source code,
styles, fonts, images or generated bundles were copied into Ultra.** The
Java parsers, React `LyricStage`, CSS stage, preference model and
`LyricsPayload` extensions in this repository are original implementations.

If future work directly ports code from Folia, that code must be handled
under Folia's AGPL-3.0 terms. Reading Folia's public documentation and
studying its behavior for product inspiration is not the same as copying
its implementation.

Thank you to chthollyphile and the Folia community for making lyric
presentation feel like a first-class part of a music player.

## Lyric format references

The word-level format support was implemented from public format
descriptions and independent testing. Useful public references include:

- [Apple Music-like Lyrics (AMLL)](https://github.com/amll-dev/applemusic-like-lyrics)
  and its public documentation of LRC A2, TTML, QRC and YRC shapes;
- [Lyricify Lyrics Helper](https://github.com/WXRIW/Lyricify-Lyrics-Helper)
  for public notes about QRC/YRC/KRC tooling;
- the W3C TTML and WebVTT specifications.

No parser source from those projects was copied into Ultra. KRC remains
unsupported because it is an obfuscated format without a public,
authoritative specification.

## Potatoplayer lineage

Ultra is built on **Potatoplayer Super** `s1.1.0` (commit `8bcea69`),
which in turn rebuilt the original Java Potatoplayer. The original
Potatoplayer Java/Python work, VLCJ/libVLC, Electron, React and the
other dependencies retain their own credits and licenses. See
[`README.md`](README.md#致谢) for the full dependency acknowledgements.
