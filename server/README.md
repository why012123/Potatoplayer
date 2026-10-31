# Potatoplayer Together server

A small WebSocket relay for the **Together** room feature. It stores room
membership, chat and the host's playback clock in memory. It does **not**
store, download or relay audio.

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

Health check: `GET /health`.

## Put it behind HTTPS

For a friend outside your LAN, do not expose port 8787 directly. Put Caddy,
Nginx or Cloudflare Tunnel in front and use `wss://`:

```text
https://together.example.com  ->  http://127.0.0.1:8787
```

Then clients enter `wss://together.example.com/ws`.

## What it does not do

- No accounts; a six-character room code is the only access control.
- No persistence; restarting the process clears rooms.
- No audio transfer. Every client plays its own local copy. If a guest does
  not own a track, the client shows it as missing instead of downloading it.

The audio-transfer phase is intentionally separate: it needs explicit
ownership/authorization and a storage policy, not just a relay.
