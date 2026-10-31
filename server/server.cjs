#!/usr/bin/env node
/**
 * Potatoplayer Together — a tiny room relay.
 *
 * It carries room membership, chat, the host's playback clock and an optional
 * private file cache for tracks that a room member already owns. It never
 * downloads from a music service and it never exposes a public library.
 */
const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";
const MAX_MEMBERS = Math.max(2, Math.min(16, Number(process.env.MAX_MEMBERS || 8)));
const MAX_FILE_BYTES = Math.max(1, Math.min(2048, Number(process.env.MAX_FILE_MB || 300))) * 1024 * 1024;
const ROOM_TTL = 1000 * 60 * 10;
const FILE_ROOT = path.resolve(process.env.FILE_DIR || path.join(__dirname, "data"));
const MAX_CHAT = 120;
const MAX_TRACK_FIELD = 240;
const EXTENSIONS = new Set([".flac", ".mp3", ".m4a", ".aac", ".wav", ".aiff", ".aif", ".ogg", ".opus", ".dsf", ".dff"]);
const MIME = {
  ".flac": "audio/flac",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wav": "audio/wav",
  ".aiff": "audio/aiff",
  ".aif": "audio/aiff",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".dsf": "audio/dsf",
  ".dff": "audio/dff",
};

// Files are intentionally ephemeral: restarting the relay wipes every room
// and every cached file.
fs.rmSync(FILE_ROOT, { recursive: true, force: true });
fs.mkdirSync(FILE_ROOT, { recursive: true });

const rooms = new Map();

function now() {
  return Date.now();
}

function text(value, limit = MAX_TRACK_FIELD) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, limit) : "";
}

function keyText(value) {
  const key = text(value, 320);
  if (!key || key.includes("/") || key.includes("\\") || key.includes("..")) return "";
  return key;
}

function roomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 100; attempt++) {
    let code = "";
    for (let i = 0; i < 6; i++) code += alphabet[crypto.randomInt(alphabet.length)];
    if (!rooms.has(code)) return code;
  }
  throw new Error("No room code available");
}

function members(room) {
  return [...room.members.values()].map((member) => ({
    id: member.id,
    name: member.name,
    host: member.id === room.hostId,
  }));
}

function fileView(file) {
  return {
    key: file.key,
    size: file.size,
    sha256: file.sha256,
    ext: file.ext,
  };
}

function fileList(room) {
  return [...room.files.values()].map(fileView);
}

function roomView(room) {
  return {
    id: room.id,
    hostId: room.hostId,
    members: members(room),
    state: room.state,
    chat: room.chat,
    files: fileList(room),
    needs: [...room.needs.values()],
    serverNow: now(),
  };
}

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

function broadcast(room, payload) {
  const raw = JSON.stringify(payload);
  for (const member of room.members.values()) {
    if (member.ws.readyState === member.ws.OPEN) member.ws.send(raw);
  }
}

function announce(room) {
  broadcast(room, { type: "room", room: roomView(room) });
}

function systemChat(room, message) {
  const entry = {
    id: crypto.randomUUID(),
    system: true,
    name: "SYSTEM",
    text: text(message, 500),
    ts: now(),
  };
  room.chat.push(entry);
  if (room.chat.length > MAX_CHAT) room.chat.shift();
  broadcast(room, { type: "chat", message: entry });
}

function cleanTrack(input) {
  if (!input || typeof input !== "object") return null;
  const key = keyText(input.key);
  if (!key) return null;
  return {
    key,
    neteaseId: text(input.neteaseId, 80),
    title: text(input.title, 240),
    artist: text(input.artist, 240),
    album: text(input.album, 240),
    duration: Number.isFinite(Number(input.duration)) ? Math.max(0, Number(input.duration)) : 0,
  };
}

function cleanPlayback(input) {
  if (!input || typeof input !== "object") return null;
  const position = Math.max(0, Number(input.position) || 0);
  return {
    track: cleanTrack(input.track),
    playing: Boolean(input.playing),
    position,
    startedAt: 0,
    updatedAt: now(),
  };
}

function removeMember(room, member) {
  if (!room.members.delete(member.id)) return;
  member.roomId = null;
  if (room.hostId === member.id) {
    const next = room.members.values().next().value;
    room.hostId = next ? next.id : null;
    if (next) systemChat(room, `${next.name} 成为新房主`);
  }
  if (!room.members.size) {
    room.emptyAt = now();
    return;
  }
  announce(room);
  systemChat(room, `${member.name} 离开了房间`);
}

function findRoom(ws) {
  const room = ws.meta?.roomId ? rooms.get(ws.meta.roomId) : null;
  if (!room || !room.members.has(ws.meta.id)) return null;
  return room;
}

function fail(ws, message) {
  send(ws, { type: "error", message });
}

function json(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(payload));
}

function memberFor(room, req, url) {
  const header = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  const token = header || String(url.searchParams.get("token") || "").trim();
  if (!token) return null;
  return [...room.members.values()].find((member) => member.token === token) || null;
}

function extensionOf(fileName) {
  const ext = path.extname(text(fileName, 200)).toLowerCase();
  return EXTENSIONS.has(ext) ? ext : ".bin";
}

function removeRoomFiles(room) {
  if (room.dir) {
    try {
      fs.rmSync(room.dir, { recursive: true, force: true });
    } catch {
      // The cache is best-effort; the room still disappears.
    }
    room.dir = null;
  }
  room.files.clear();
  room.needs.clear();
}

async function uploadFile(room, key, req, res) {
  if (!key) return json(res, 400, { error: "Missing file key" });
  const existing = room.files.get(key);
  if (existing) return json(res, 200, { file: fileView(existing) });

  const declared = Number(req.headers["content-length"] || 0);
  if (declared > MAX_FILE_BYTES) {
    req.resume();
    return json(res, 413, { error: "File is larger than the relay limit" });
  }

  room.dir ??= path.join(FILE_ROOT, room.id);
  await fs.promises.mkdir(room.dir, { recursive: true });
  const temp = path.join(room.dir, `${crypto.randomUUID()}.part`);
  const hash = crypto.createHash("sha256");
  let size = 0;
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      size += chunk.length;
      if (size > MAX_FILE_BYTES) {
        callback(Object.assign(new Error("File is larger than the relay limit"), { code: "TOO_LARGE" }));
        return;
      }
      hash.update(chunk);
      callback(null, chunk);
    },
  });

  try {
    await pipeline(req, limiter, fs.createWriteStream(temp));
    const sha256 = hash.digest("hex");
    const expected = String(req.headers["x-file-sha256"] || "").toLowerCase();
    if (expected && expected !== sha256) {
      throw Object.assign(new Error("File checksum mismatch"), { code: "BAD_HASH" });
    }
    const ext = extensionOf(String(req.headers["x-file-name"] || ""));
    const final = path.join(room.dir, `${sha256}${ext}`);
    if (fs.existsSync(final)) fs.rmSync(temp, { force: true });
    else await fs.promises.rename(temp, final);

    const file = {
      key,
      sha256,
      size,
      ext,
      path: final,
      mime: MIME[ext] || "application/octet-stream",
    };
    room.files.set(key, file);
    room.needs.delete(key);
    broadcast(room, { type: "file", file: fileView(file) });
    console.log(`[together] room ${room.id} cached ${key} (${size} bytes)`);
    return json(res, 200, { file: fileView(file) });
  } catch (error) {
    fs.rmSync(temp, { force: true });
    const status = error.code === "TOO_LARGE" ? 413 : 400;
    if (!res.headersSent) json(res, status, { error: error.message });
    return undefined;
  }
}

function downloadFile(room, key, req, res) {
  const file = room.files.get(key);
  if (!file) return json(res, 404, { error: "File is not cached in this room" });
  let stat;
  try {
    stat = fs.statSync(file.path);
  } catch {
    room.files.delete(key);
    return json(res, 404, { error: "Cached file is missing" });
  }

  const headers = {
    "Content-Type": file.mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    "Content-Disposition": `attachment; filename="${file.sha256}${file.ext}"`,
  };
  const range = String(req.headers.range || "");
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (match) {
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Number(match[2]) : stat.size - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= stat.size) {
      res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
      res.end();
      return;
    }
    const safeEnd = Math.min(end, stat.size - 1);
    headers["Content-Range"] = `bytes ${start}-${safeEnd}/${stat.size}`;
    headers["Content-Length"] = String(safeEnd - start + 1);
    res.writeHead(206, headers);
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    fs.createReadStream(file.path, { start, end: safeEnd }).pipe(res);
    return;
  }

  headers["Content-Length"] = String(stat.size);
  res.writeHead(200, headers);
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  fs.createReadStream(file.path).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-File-Name, X-File-Sha256");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (url.pathname === "/health") {
    json(res, 200, { ok: true, rooms: rooms.size, maxFileBytes: MAX_FILE_BYTES, now: now(), uptime: process.uptime() });
    return;
  }
  if (url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Potatoplayer Together relay\nWebSocket: /ws\nFiles: /rooms/:code/files?key=...\nHealth: /health\n");
    return;
  }

  const match = /^\/rooms\/([A-Z0-9]{6})\/files$/.exec(url.pathname);
  if (!match) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found\n");
    return;
  }
  const room = rooms.get(match[1]);
  if (!room) {
    json(res, 404, { error: "Room not found" });
    return;
  }
  const member = memberFor(room, req, url);
  if (!member) {
    json(res, 401, { error: "Join the room first" });
    return;
  }
  const key = keyText(url.searchParams.get("key"));
  if (!key) {
    json(res, 400, { error: "Missing file key" });
    return;
  }
  if (req.method === "POST") {
    void uploadFile(room, key, req, res);
    return;
  }
  if (req.method === "GET" || req.method === "HEAD") {
    downloadFile(room, key, req, res);
    return;
  }
  json(res, 405, { error: "Method not allowed" });
});

const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 64 * 1024 });

wss.on("connection", (ws) => {
  ws.meta = {
    id: crypto.randomUUID(),
    token: crypto.randomBytes(18).toString("base64url"),
    name: "",
    roomId: null,
    alive: true,
    chatTimes: [],
  };
  send(ws, { type: "hello", serverNow: now(), maxMembers: MAX_MEMBERS, maxFileBytes: MAX_FILE_BYTES });

  ws.on("pong", () => {
    ws.meta.alive = true;
  });
  ws.on("error", () => {});

  ws.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      return fail(ws, "消息格式错误");
    }
    if (!message || typeof message.type !== "string") return fail(ws, "缺少消息类型");

    if (message.type === "create" || message.type === "join") {
      if (ws.meta.roomId) return fail(ws, "你已经在房间里了");
      const name = text(message.name, 24) || "听众";
      ws.meta.name = name;
      let room;
      if (message.type === "create") {
        room = {
          id: roomCode(),
          hostId: ws.meta.id,
          members: new Map(),
          state: { track: null, playing: false, position: 0, startedAt: 0, updatedAt: now() },
          chat: [],
          files: new Map(),
          needs: new Map(),
          createdAt: now(),
          emptyAt: 0,
          dir: null,
        };
        rooms.set(room.id, room);
      } else {
        const code = text(message.roomId, 12).toUpperCase();
        room = rooms.get(code);
        if (!room) return fail(ws, "房间不存在");
        if (room.members.size >= MAX_MEMBERS) return fail(ws, "房间已满");
      }
      ws.meta.roomId = room.id;
      room.members.set(ws.meta.id, { id: ws.meta.id, name, ws, token: ws.meta.token });
      room.emptyAt = 0;
      send(ws, {
        type: "welcome",
        selfId: ws.meta.id,
        selfToken: ws.meta.token,
        room: roomView(room),
        serverNow: now(),
      });
      announce(room);
      if (message.type === "join") systemChat(room, `${name} 加入了房间`);
      return;
    }

    const room = findRoom(ws);
    if (!room) return fail(ws, "请先加入房间");

    if (message.type === "ping") {
      send(ws, { type: "pong", t: Number(message.t) || 0, serverNow: now() });
      return;
    }

    if (message.type === "chat") {
      const body = text(message.text, 500);
      if (!body) return;
      const current = now();
      ws.meta.chatTimes = ws.meta.chatTimes.filter((t) => current - t < 5000);
      if (ws.meta.chatTimes.length >= 8) return fail(ws, "发言太快了");
      ws.meta.chatTimes.push(current);
      const entry = {
        id: crypto.randomUUID(),
        memberId: ws.meta.id,
        name: ws.meta.name,
        text: body,
        ts: current,
      };
      room.chat.push(entry);
      if (room.chat.length > MAX_CHAT) room.chat.shift();
      broadcast(room, { type: "chat", message: entry });
      return;
    }

    if (message.type === "playback") {
      if (room.hostId !== ws.meta.id) return fail(ws, "只有房主可以控制播放");
      const next = cleanPlayback(message.state);
      if (!next) return fail(ws, "播放状态无效");
      next.startedAt = next.playing ? now() : 0;
      room.state = next;
      broadcast(room, { type: "playback", state: room.state, hostId: room.hostId, serverNow: now() });
      return;
    }

    if (message.type === "need") {
      const key = keyText(message.key);
      if (!key) return;
      const cached = room.files.get(key);
      if (cached) {
        send(ws, { type: "file", file: fileView(cached) });
        return;
      }
      const track = cleanTrack(message.track);
      room.needs.set(key, { key, track, memberId: ws.meta.id, name: ws.meta.name });
      broadcast(room, { type: "need", key, track, memberId: ws.meta.id, name: ws.meta.name });
      return;
    }

    if (message.type === "leave") {
      leave(ws);
      return;
    }

    fail(ws, "未知消息类型");
  });

  ws.on("close", () => {
    const room = findRoom(ws);
    if (room) removeMember(room, ws.meta);
    ws.meta.roomId = null;
  });
});

function leave(ws) {
  const room = findRoom(ws);
  if (!room) return;
  removeMember(room, ws.meta);
  send(ws, { type: "left" });
}

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.meta?.alive) {
      ws.terminate();
      continue;
    }
    ws.meta.alive = false;
    try {
      ws.ping();
    } catch {
      ws.terminate();
    }
  }
  const cutoff = now() - ROOM_TTL;
  for (const [code, room] of rooms) {
    if (!room.members.size && room.emptyAt && room.emptyAt < cutoff) {
      removeRoomFiles(room);
      rooms.delete(code);
    }
  }
}, 30_000);
heartbeat.unref();

server.listen(PORT, HOST, () => {
  console.log(`[together] listening on http://${HOST}:${PORT}`);
  console.log(`[together] websocket ws://${HOST}:${PORT}/ws`);
  console.log(`[together] room files ${FILE_ROOT} · max ${MAX_FILE_BYTES} bytes`);
});

function shutdown() {
  clearInterval(heartbeat);
  for (const ws of wss.clients) ws.close(1001, "server shutting down");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
