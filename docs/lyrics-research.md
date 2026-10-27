> **Ultra note (2026-10-27):** this document is the historical research that led to the word-aware lyric payload. The old `lyric-3d-lab/` prototype has been removed; Ultra's implementation is documented in [`lyrics-stage.md`](lyrics-stage.md). The format and licensing findings below remain the reference for the parser.

# Word-Level / Character-Level Timed Lyrics — Research Report

Scope: practical karaoke-style highlighting for a **desktop player** (Potatoplayer: Java 21 backend + Electron/React + local library).
Research date: 2026-10-25. GitHub HTML/`raw.githubusercontent.com` were unreachable here, so metadata came from the GitHub REST API and file contents via a raw proxy. **✅ = read from the repo/source/spec**; 💡 = suggestion/estimate.

---

## 1. Formats with sub-line timestamps

| Format | Timing unit | Where it comes from | Status |
|---|---|---|---|
| **Enhanced LRC (A2)** | word/syllable | de-facto extension of LRC | widely readable, plain text, no spec body |
| **ESLyric word LRC** | word | foobar2000 ESLyric plugin convention | same `.lrc` file, different tag style |
| **TTML (Apple Music)** | word/syllable + ruby | Apple Music / iTunes delivery | the richest open-readable format |
| **QRC** | character | QQ Music | plaintext, community-documented |
| **YRC** | character | NetEase Cloud Music | plaintext, community-documented |
| **KRC** | character | Kugou | **obfuscated, no public spec** |
| **ASS karaoke** | syllable (`\k`) | Aegisub/libass subtitle ecosystem | renderer-driven, centisecond precision |
| **WebVTT** | cue (+ inline timestamps) | W3C | wrong tool for lyric authoring |

### Enhanced LRC / A2 ✅
Verified in AMLL's parser: the line starts with `[mm:ss.xx]`, each syllable is preceded by `<mm:ss.xx>`, and a trailing timestamp sets an explicit line end (both `<>`/`[]` and `.`/`:` fractions accepted).
Example: `[00:12.00]<00:12.00>Hel<00:12.30>lo <00:12.60>world[00:13.10]`
There is no canonical spec; treat [lrc/parser.ts](https://github.com/amll-dev/applemusic-like-lyrics/blob/main/packages/lyric/src/formats/lrc/parser.ts) as the reference implementation.

### TTML / DFXP (Apple Music style) ✅
Apple's own delivery documentation is public and is the best primary source: line-by-line timing on `<p begin end>`, **beat-by-beat timing on inline `<span begin end>`**. Timing values are SMIL clock values (`hh:mm:ss.fff`), `begin`+`end` are both required, and child timings must nest inside the parent. Apple extensions: `itunes:song-part` on `<div>`, `ttm:agent` on `<p>`/`<span>` to attribute a singer.
- [Apple — Overview of TTML for Lyrics](https://help.apple.com/itc/videoaudioassetguide/en.lproj/itcd7579a252.html) · [real beat-by-beat example](https://help.apple.com/itc/videoaudioassetguide/en.lproj/itcbdfa5d43b.html) · [W3C TTML2](https://www.w3.org/TR/ttml2/)

Community extensions (verified in AMLL): `ttm:role="x-bg"` background vocals, `x-translation`, `x-roman`, `itunes:key` line IDs, `tts:ruby` furigana, `xmlns:amll` metadata. Namespaces differ — Apple's sample uses `http://itunes.apple.com/lyric-ttml-extensions`, AMLL `http://music.apple.com/lyric-ttml-internal`; parse leniently. Sources: [AMLL TTML guide](https://github.com/amll-dev/applemusic-like-lyrics/blob/main/packages/docs/src/content/docs/en/guides/lyric/ttml.md), [amll-ttml-db spec](https://github.com/lerdb/amll-ttml-db/blob/main/instructions/ttml-specification-en.md).

### QRC ✅ and YRC ✅
Both are plaintext; syntax verified in AMLL source:
- QRC: `[lineStartMs,lineDurMs]word(startMs,durMs)word(...)` — [qrc.ts](https://github.com/amll-dev/applemusic-like-lyrics/blob/main/packages/lyric/src/formats/qrc.ts)
- YRC: `[lineStartMs,lineDurMs](startMs,durMs,0)word(...)` — [yrc.ts](https://github.com/amll-dev/applemusic-like-lyrics/blob/main/packages/lyric/src/formats/yrc.ts)
Both encode **per-character** timings; background vocals are wrapped in parentheses.

### KRC ⚠️
Kugou's KRC is compressed/obfuscated; **no official spec exists** and public descriptions are reverse-engineered blog posts. Verified fact: Lyricify's helper library parses *and* generates KRC. Recommendation: don't implement KRC first; optionally import via an existing tool.

### ASS karaoke ✅
`{\kN}` (centiseconds) per syllable inside a `Dialogue:` line; AMLL's generator emits exactly this and notes ≤10 ms rounding loss. ASS is a **render target**, not storage — you only get karaoke free if you already render with libass. [ass.ts](https://github.com/amll-dev/applemusic-like-lyrics/blob/main/packages/lyric/src/formats/ass.ts) · [Aegisub](https://aegisub.org/)

### WebVTT ⚠️
Cue-level `start --> end` is the model; inline timestamp tags exist in cue text, but it is built for captions and is a poor authoring target for lyrics ([W3C WebVTT](https://www.w3.org/TR/webvtt1/)).

**Practical takeaway:** use **Enhanced LRC/A2** as the on-disk interchange (tiny, human-editable, one file next to the MP3), keep a **JSON word model** in memory, and support **TTML import** later for Apple-grade material.

---

## 2. Open-source projects

| Project | Lang | License | Maintained | What it actually solves (verified) |
|---|---|---|---|---|
| [amll-dev/applemusic-like-lyrics](https://github.com/amll-dev/applemusic-like-lyrics) (2.2k★) | TypeScript | **AGPL-3.0** | ✅ active (pushed 2026-10-21) | Apple-Music-style lyric player + `@applemusic-like-lyrics/lyric` parser/writer for LRC, LRC A2, ESLyric, SPL, YRC, QRC, LYS, LYL, LQE, TTML (parse+generate), ASS (generate only) |
| [WXRIW/Lyricify-Lyrics-Helper](https://github.com/WXRIW/Lyricify-Lyrics-Helper) | C#/.NET | Apache-2.0 | ✅ active (2026-10-21) | Parse+generate LRC/QRC/**KRC**/YRC/LYS/LYL; parse TTML (Apple extensions), Spotify & Musixmatch JSON; search providers (QQ, NetEase, Kugou, Apple Music, LRCLIB) |
| [amll-dev/amll-ttml-tool](https://github.com/amll-dev/amll-ttml-tool) | TypeScript | **GPL-3.0** | ✅ active (2026-10-17) | Web editor for syllable lyrics → TTML (tool.amll.dev) |
| [amll-dev/amll-ttml-db](https://github.com/amll-dev/amll-ttml-db) | data/Rust | CC0-1.0 | ✅ active | Large corpus of word-level TTML lyrics; useful as a test set / reference data |
| [m-bain/whisperX](https://github.com/m-bain/whisperX) | Python | BSD-2-Clause | ✅ active (2026-10-22) | ASR + wav2vec2 phoneme forced alignment → word timestamps. `align(..., return_char_alignments=True)` gives **character**-level spans (key for CJK) |
| [jianfch/stable-ts](https://github.com/jianfch/stable-ts) | Python | MIT | ⚠️ **archived** (last push 2026-05-30) | Whisper timestamp stabilization, `align()` forced alignment, audio indexing |
| [MontrealCorpusTools/Montreal-Forced-Aligner](https://github.com/MontrealCorpusTools/Montreal-Forced-Aligner) | Python+Kaldi | MIT | ✅ active (2026-10-22) | Grapheme-to-phoneme + Kaldi forced alignment; needs pronunciation dictionaries |
| [readbeyond/aeneas](https://github.com/readbeyond/aeneas) | Python/C | **AGPL-3.0** | ⚠️ low activity (2026-07) | DTW audio/text synchronization at **fragment** level (no phoneme alignment) |
| [WorksApplications/SudachiPy](https://github.com/WorksApplications/SudachiPy) | Python | Apache-2.0 | ❌ **archived** (2022) | Japanese morphological splitter (SudachiDict); see Rust successor [Sudachi.rs](https://github.com/WorksApplications/sudachi.rs) 💡 |
| [polm/fugashi](https://github.com/polm/fugashi) | C++/Cython | MIT | ✅ (2025-10) | MeCab wrapper for Japanese tokenization + reading (`feature.pron`) |
| [mocobeta/janome](https://github.com/mocobeta/janome) | Python | Apache-2.0 | ✅ (2026-06) | Pure-Python Japanese tokenizer, no native build |

**Licensing caution (verified fields):** AMLL is **AGPL-3.0**, amll-ttml-tool **GPL-3.0** — copying either into a closed-source app forces source disclosure. Lyricify is Apache-2.0 (portable with attribution); aeneas is AGPL-3.0, so never bundle it into a proprietary binary.

---

## 3. Generation pipelines (audio + plain lyrics → word timings)

### 3.1 Forced alignment options

| Option | Level | Needs | Notes / risk |
|---|---|---|---|
| **WhisperX** ✅ | word + char (`return_char_alignments`) | Python 3, torch, wav2vec2 align model per language, ffmpeg | Best accuracy/time trade-off; README warns words with characters outside the align model's dictionary **get no timing**, and overlapping vocals are handled poorly. Heavy dependency tree. |
| **stable-ts** ✅ | word | torch/whisper | MIT but **archived** — usable, not future-proof. |
| **torchaudio CTC forced alignment** ✅ | char/phone (`MMS_FA`) | torchaudio + `torchaudio.pipelines.MMS_FA` | Lightest self-contained aligner; needs romanization for some scripts; tutorial: [CTC forced alignment API](https://docs.pytorch.org/audio/stable/tutorials/ctc_forced_alignment_api_tutorial.html). |
| **MFA** ✅ | phone/word | Kaldi + pronunciation dictionary + acoustic model | High quality on **speech**; singing + dictionary mismatch hurts; multi-GB, hard to embed. MIT. |
| **aeneas** ✅ | fragment (line/phrase) | espeak/festival TTS | Does **not** produce word timings; AGPL — avoid bundling. |
| **kotoba-whisper v2.0** | word (via WhisperX-style align) | HF model | Japanese-tuned Whisper fine-tune (Apache-2.0 per model card: [HF](https://huggingface.co/kotoba-tech/kotoba-whisper-v2.0)); improves *transcription*, not alignment 💡 |

Practical caveat (💡 but well-established): alignment on a **full mix** with drums/effects is unreliable; run alignment on a vocals stem (Demucs/UVR) and align **your existing LRC text**, not the ASR transcript, so the displayed text never changes.

### 3.2 Japanese segmentation
- Use **fugashi/MeCab** (fast, gives readings) or **Janome** (pure Python, easier install); SudachiPy is archived.
- Ruby/furigana: `feature.pron` per token (fugashi) or `Token.reading` (Janome) 💡, stored on the word record.
- Time **characters or morae**, not words; WhisperX `return_char_alignments=True` then merge chars into morphemes for display 💡.

### 3.3 Aligning *existing* line-level LRC to characters (no ASR)
Approach 💡: inside each line's `[start, nextStart]` window, compute an onset/energy envelope (librosa), then run a monotonic DP assigning each character a share of voiced energy weighted by mora/vowel count. Cheap, offline, language-agnostic, text-preserving.

Limitations: melisma and sustained notes collapse, gaps mis-assign, ±100–300 ms per-character error is normal, duets break it. Store results as a *guess* with a confidence flag; never present them as authoring-quality.

---

## 4. Integration design (Electron/React + Java)

**Data model (recommended).** Integer milliseconds, explicit ends, original line text preserved:

```json
{ "version": 1,
  "source": "lrc-a2 | ttml | yrc | qrc | generated",
  "lines": [{
    "startMs": 12000, "endMs": 13100,
    "text": "Hello world",
    "translation": "", "roman": "",
    "agent": "v1", "role": "main",
    "words": [
      {"text": "Hel", "startMs": 12000, "endMs": 12300},
      {"text": "lo ", "startMs": 12300, "endMs": 12600},
      {"text": "world", "startMs": 12600, "endMs": 13100}
    ]}]}
```
Invariants: `words` may be empty ⇒ fall back to line-level; `text === words.map(w=>w.text).join("")` so highlighting never rewrites content; ends are never before starts; unknown ends inherit the next word/line start.

**Parser layering.**
1. `parseLrcA2(text)` → word list (regex `[mm:ss.xx]` / `<mm:ss.xx>`), plus `parseLineLrc` fallback.
2. `parseTtml(xml)` (optional, later) → same model; handles `<span>`, `ttm:agent`, `x-bg`, ruby.
3. `toWordModel(payload)` in the renderer, tolerant of missing ends.

**Renderer (React).** Split the active line into `<span>`s and drive a CSS custom property (`--p`, used by `background-clip:text`) from a `requestAnimationFrame` loop on a ref — per-frame React state is too expensive. Active-line detection can stay ~10 Hz.
**Clock:** anchor to `performance.now()` and re-sync on every backend tick, or highlighting jitters (see §5).

**React vs Java split.**
| Concern | Java backend | React renderer |
|---|---|---|
| Sidecar discovery, encoding, caching | ✅ | — |
| Parse LRC/A2/TTML into word model | ✅ (single source of truth) | fallback only |
| Persisting/generated files | ✅ | — |
| Interpolation, animation, 3D stage | — | ✅ |
| Editing UI / tap-to-time | — | ✅ (send to backend to save) |

**Fallback:** if `words` absent or `source==="lrc"`, render exactly today's line UI. Keep one component with a `granularity` prop rather than two renderers.

---

## 5. Potatoplayer-specific findings

**Verified from the repo (read-only inspection):**
- `backend/src/main/java/com/potatomusic/superapp/LyricsService.java` parses **sidecar `.lrc` only** (plus `.trans.lrc/.zh.lrc/.zh-CN.lrc/.translation.lrc`), regex `\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]`, emits `Line{time,text,translation}`. **It has no word-tag support** — an A2 file today would render its `<mm:ss.xx>` tags as literal text.
- Frontend `LyricsLine {time,text,translation}` (`src/types.ts`); `NowPlaying.tsx` picks the active line with `time + 0.08` and renders one `<button>` per line.
- `PlaybackController` ticks every **500 ms** and emits `playback.time`; the renderer stores it verbatim. At 2 Hz, word-level highlighting would visibly step — interpolation is mandatory.
- `lyric-3d-lab/` is a separate standalone WebGL stage with its own `serve.py` JSON API (`/api/song` returns raw LRC), parsing LRC in `show.js`. It can consume the same word model without touching the main app.

### Recommendation table

| Path | Work | Risk | When |
|---|---|---|---|
| **A. Render word timings from existing A2/ESLyric/TTML files** | Parser + schema in Java, word renderer, interpolated clock | Low | Ship first |
| **B. Export/authoring** — "tap to time" inside the app writes A2 LRC | Renderer keyboard/seek UI + save endpoint | Low-Med | After A |
| **C. Offline generation** — dev-side Python (WhisperX + vocals stem) → A2 LRC | No runtime dependency; documented CLI | Med (accuracy on singing) | After A, optional |
| **D. In-app generation** — bundle Python/torch | 1–3 GB, codesigning/notarization, GPU/CPU perf | **High** | Avoid |
| **E. Full TTML editor** | Big UI + spec surface | High | Not now |

**Effort estimates 💡** (not measured): A ≈ 2–4 dev-days; B ≈ 3–5 days; C ≈ 2–3 days per language pipeline + tuning; D ≈ 2–3 weeks plus ongoing packaging pain.

### Recommended plan
1. **Freeze the JSON word model** above; add it to the lyrics payload as an optional `words[]` (additive, old clients ignore it).
2. **Extend `LyricsService`** to recognise A2/ESLyric tags and trailing end-stamps, keeping the line parser as fallback; add a `parseA2` unit test using the §1 example.
3. **Interpolate the clock in React** (`anchor = performance.now()` on each `playback.time`), expose `nowMs()`; this also fixes line-level jitter.
4. **Wipe only the active line** via the CSS custom property; feature-flag it (`lyricsGranularity: "line" | "word"`).
5. **Write A2 on export/save** and cache JSON by path+mtime like the existing cache.
6. **Later:** TTML import (Java XML parser: `<span begin end>`, `ttm:agent`, `x-bg`) and a dev-only WhisperX script. Do not bundle Python.
7. **Licensing:** port nothing from AMLL (AGPL) or amll-ttml-tool (GPL); Lyricify (Apache-2.0) is safe with attribution; amll-ttml-db is CC0 test data.

**Bottom line:** the smallest reliable path is *read* word-level timings — A2 is trivial to parse, already exists in the wild, and needs no ML. Generation is a separate, optional, offline concern.
