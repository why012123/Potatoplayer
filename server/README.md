# Potatoplayer Together server

A small WebSocket relay for the **Together** room feature. It stores room
membership, chat, the host's playback clock and a short-lived cache for tracks
that a room member already owns.

It never downloads from NetEase, QQ Music or any other music service. A client
must upload an existing local file; other members of the same room can then
download that cached copy.

## Run

```bash
cd server
npm install
npm start
```

Default: `http://0.0.0.0:8787`, WebSocket `ws://host:8787/ws`.

Environment:

| Variable | Default | Meaning |
|---|---:|---|
| `PORT` | `8787` | HTTP + WebSocket port |
| `HOST` | `0.0.0.0` | Bind address |
| `MAX_MEMBERS` | `8` | Room size limit |
| `MAX_FILE_MB` | `300` | Per-file upload limit |
| `MAX_ROOM_MB` | `2048` | Total cached bytes per room |
| `FILE_DIR` | `./data` | Ephemeral room-file cache |

Health check: `GET /health`.

## Room files

Each member receives a random token at `welcome`. File requests require it:

```text
POST /rooms/:code/files?key=...    upload a local file
GET  /rooms/:code/files?key=...    download a cached file (Range supported)
Authorization: Bearer <member token>
```

Files are content-addressed by SHA-256 on disk. The client verifies the hash
again after download and plays the copy through the backend's temporary-track
path, so no re-encoding happens.

The cache is intentionally ephemeral:

- a room can hold at most `MAX_ROOM_MB` of cached audio (default 2 GB);
- files are deleted 10 minutes after a room becomes empty;
- restarting the relay deletes `FILE_DIR` and every room;
- there is no public file listing;
- only connected room members can upload or download.

Uploads stop with HTTP 413 as soon as the room quota is exceeded, so a member
cannot fill the disk by opening several rooms.

## Put it behind HTTPS

For a friend outside your LAN, do not expose port 8787 directly. Put Caddy,
Nginx or Cloudflare Tunnel in front and use `wss://`:

```text
https://together.example.com  ->  http://127.0.0.1:8787
```

Then clients enter `wss://together.example.com/ws`.

Cloudflare's free HTTP proxy limits a single upload to about 100 MB. If you
need larger FLAC files, use Caddy/nginx directly instead of Cloudflare's proxy,
or raise `MAX_FILE_MB` only when the path supports it.

## Security and copyright

- A six-character room code plus a per-member token is the only access control.
  Do not treat it as an account system.
- The server is a private relay, not a public music library.
- Only upload files you own or have explicit permission to share. The server
  does not verify ownership and is not a license to redistribute music.
- TLS is required in front of this process for internet use.
