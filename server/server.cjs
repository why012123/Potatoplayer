#!/usr/bin/env node
/**
 * Potatoplayer Together — a tiny room relay.
 *
 * It only carries room membership, chat and the host's playback clock. Audio
 * never passes through this process. Clients play their own local copies and
 * use the server clock to stay in sync.
 */
const http = require("node:http");
const crypto = require("node:crypto");
const { WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";
const MAX_MEMBERS = Math.max(2, Math.min(16, Number(process.env.MAX_MEMBERS || 8)));
const ROOM_TTL = 1000 * 60 * 60 * 6;
const MAX_CHAT = 120;
const MAX_TRACK_FIELD = 240;
const rooms = new Map();

function now() {
  return Date.now();
}

function text(value, limit = MAX_TRACK_FIELD) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, limit) : "";
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

function roomView(room) {
  return {
    id: room.id,
    hostId: room.hostId,
    members: members(room),
    state: room.state,
    chat: room.chat,
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
  const key = text(input.key, 200);
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

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, now: now(), uptime: process.uptime() }));
    return;
  }
  if (url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Potatoplayer Together relay\nWebSocket: /ws\nHealth: /health\n");
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found\n");
});

const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 64 * 1024 });

wss.on("connection", (ws) => {
  ws.meta = { id: crypto.randomUUID(), name: "", roomId: null, alive: true, chatTimes: [] };
  send(ws, { type: "hello", serverNow: now(), maxMembers: MAX_MEMBERS });

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
          createdAt: now(),
          emptyAt: 0,
        };
        rooms.set(room.id, room);
      } else {
        const code = text(message.roomId, 12).toUpperCase();
        room = rooms.get(code);
        if (!room) return fail(ws, "房间不存在");
        if (room.members.size >= MAX_MEMBERS) return fail(ws, "房间已满");
      }
      ws.meta.roomId = room.id;
      room.members.set(ws.meta.id, { id: ws.meta.id, name, ws });
      send(ws, {
        type: "welcome",
        selfId: ws.meta.id,
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
    if (!room.members.size && room.emptyAt && room.emptyAt < cutoff) rooms.delete(code);
  }
}, 30_000);
heartbeat.unref();

server.listen(PORT, HOST, () => {
  console.log(`[together] listening on http://${HOST}:${PORT}`);
  console.log(`[together] websocket ws://${HOST}:${PORT}/ws`);
});

function shutdown() {
  clearInterval(heartbeat);
  for (const ws of wss.clients) ws.close(1001, "server shutting down");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
