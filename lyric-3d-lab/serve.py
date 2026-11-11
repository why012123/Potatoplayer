#!/usr/bin/env python3
"""Standalone, track-driven server for the 3D lyric stage.

There is no song hard-coded here. Tracks, covers and LRC files are resolved
from the local Potatoplayer library. Pick any track with timed lyrics.
"""
from __future__ import annotations

import json
import mimetypes
import os
import re
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
DATA_HOME = Path(os.environ.get("POTATO_HOME", str(Path.home() / ".potatoplayer-super"))).expanduser()
LIBRARY_FILE = Path(os.environ.get("POTATO_LIBRARY_FILE", str(DATA_HOME / "library.json"))).expanduser()
PORT = int(os.environ.get("PORT", "4174"))


def load_library() -> dict:
    try:
        return json.loads(LIBRARY_FILE.read_text())
    except Exception as exc:
        print(f"[3d-lab] cannot read library: {exc}", file=sys.stderr)
        return {"tracks": []}


def track_index() -> dict:
    data = load_library()
    return {str(t.get("id")): t for t in data.get("tracks", []) if t.get("id")}


def lyric_paths(track: dict) -> tuple[Path | None, Path | None]:
    raw = track.get("path")
    if not raw:
        return None, None
    audio = Path(raw)
    candidates = [audio.parent.parent / "lyrics" / (audio.stem + ".lrc")]
    candidates.append(audio.parent / (audio.stem + ".lrc"))
    lrc = next((p for p in candidates if p.is_file()), None)
    if lrc is None:
        return None, None
    trans = lrc.with_name(lrc.stem + ".trans.lrc")
    return lrc, trans if trans.is_file() else None


def read_text(path: Path | None) -> str:
    if path is None:
        return ""
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return ""


def public_track(track: dict, with_lyrics: bool = False) -> dict:
    lrc, trans = lyric_paths(track)
    out = {
        "id": str(track.get("id")),
        "title": track.get("title") or "Untitled",
        "artist": track.get("artist") or "Unknown artist",
        "album": track.get("album") or "",
        "duration": track.get("duration") or 0,
        "hasLyrics": lrc is not None,
    }
    if lrc and with_lyrics:
        out["lrc"] = read_text(lrc)
        out["translation"] = read_text(trans)
    return out


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.api(parsed)
            return
        super().do_GET()

    def do_HEAD(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.api(parsed, head=True)
            return
        super().do_HEAD()

    def api(self, parsed, head: bool = False):
        qs = parse_qs(parsed.query)
        track_id = (qs.get("id") or [""])[0]
        tracks = track_index()

        if parsed.path == "/api/tracks":
            items = [public_track(t) for t in tracks.values()]
            items.sort(key=lambda t: (not t["hasLyrics"], t["artist"].lower(), t["title"].lower()))
            self.send_json({"tracks": items}, head)
            return

        track = tracks.get(track_id)
        if not track:
            self.send_error(404, "Unknown track")
            return

        if parsed.path == "/api/song":
            self.send_json(public_track(track, with_lyrics=True), head)
            return

        if parsed.path == "/api/audio":
            raw = track.get("path")
            path = Path(raw) if raw else None
            if not path or not path.is_file():
                self.send_error(404, "Audio file missing")
                return
            mime = "audio/flac" if path.suffix.lower() == ".flac" else (mimetypes.guess_type(str(path))[0] or "application/octet-stream")
            self.serve_file(path, mime, head)
            return

        if parsed.path == "/api/cover":
            raw = track.get("coverPath")
            path = Path(raw) if raw else None
            if not path or not path.is_file():
                self.send_error(404, "Cover missing")
                return
            mime = mimetypes.guess_type(str(path))[0] or "image/jpeg"
            self.serve_file(path, mime, head)
            return

        self.send_error(404, "Unknown API route")

    def send_json(self, data, head: bool = False):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if not head:
            self.wfile.write(body)

    def serve_file(self, path: Path, mime: str, head: bool = False):
        size = path.stat().st_size
        start, end, partial = 0, size - 1, False
        range_header = self.headers.get("Range")
        if range_header:
            match = re.match(r"bytes=(\d*)-(\d*)", range_header.strip())
            if match:
                if match.group(1):
                    start = int(match.group(1))
                    end = int(match.group(2)) if match.group(2) else size - 1
                elif match.group(2):
                    start = max(0, size - int(match.group(2)))
                start = max(0, min(start, size - 1))
                end = max(start, min(end, size - 1))
                partial = True
        length = end - start + 1
        self.send_response(206 if partial else 200)
        self.send_header("Content-Type", mime)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(length))
        self.send_header("Cache-Control", "no-store")
        if partial:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()
        if head:
            return
        with path.open("rb") as source:
            source.seek(start)
            remaining = length
            while remaining > 0:
                chunk = source.read(min(512 * 1024, remaining))
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                except (BrokenPipeError, ConnectionResetError):
                    return
                remaining -= len(chunk)

    def log_message(self, fmt, *args):
        sys.stderr.write("[3d-lab] " + (fmt % args) + "\n")


def main():
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"3D Lyric Stage → http://127.0.0.1:{PORT}")
    print(f"Library: {LIBRARY_FILE}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
