/**
 * End-to-end checks for the Together relay.
 *
 * Run from the server folder: `npm test`
 */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const WebSocket = require("ws");

const PORT = 19000 + Math.floor(Math.random() * 600);
const BASE = `http://127.0.0.1:${PORT}`;
const WS_URL = `ws://127.0.0.1:${PORT}/ws`;
const FILE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "together-relay-test-"));
const MAX_ROOM_MB = 3;
let child;

function waitForHealth() {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const probe = () => {
      attempts += 1;
      fetch(`${BASE}/health`)
        .then((response) => response.json())
        .then((payload) => {
          assert.equal(payload.ok, true);
          resolve(payload);
        })
        .catch(() => {
          if (attempts >= 60) reject(new Error("relay did not become healthy"));
          else setTimeout(probe, 100);
        });
    };
    probe();
  });
}

before(async () => {
  child = spawn(process.execPath, [path.join(__dirname, "..", "server.cjs")], {
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: "127.0.0.1",
      FILE_DIR,
      MAX_FILE_MB: "5",
      MAX_ROOM_MB: String(MAX_ROOM_MB),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => {
    if (process.env.RELAY_TEST_LOGS) process.stdout.write(`[relay] ${chunk}`);
  });
  child.stderr.on("data", (chunk) => process.stderr.write(`[relay] ${chunk}`));
  await waitForHealth();
});

after(() => {
  child?.kill("SIGTERM");
  fs.rmSync(FILE_DIR, { recursive: true, force: true });
});

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const inbox = [];
    const waiters = [];

    const settle = () => {
      for (let i = 0; i < waiters.length; i += 1) {
        const waiter = waiters[i];
        const index = inbox.findIndex(
          (message) => message.type === waiter.type && waiter.predicate(message),
        );
        if (index < 0) continue;
        const [message] = inbox.splice(index, 1);
        waiters.splice(i, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(message);
        return true;
      }
      return false;
    };

    ws.on("message", (raw) => {
      let message;
      try {
        message = JSON.parse(String(raw));
      } catch {
        return;
      }
      inbox.push(message);
      settle();
    });

    ws.once("open", () => {
      resolve({
        ws,
        send(payload) {
          ws.send(JSON.stringify(payload));
        },
        next(type, timeout = 5000, predicate = () => true) {
          return new Promise((resolveNext, rejectNext) => {
            const waiter = {
              type,
              predicate,
              resolve: resolveNext,
              timer: setTimeout(() => {
                const index = waiters.indexOf(waiter);
                if (index >= 0) waiters.splice(index, 1);
                rejectNext(new Error(`timed out waiting for ${type}`));
              }, timeout),
            };
            waiters.push(waiter);
            if (settle()) return;
          });
        },
        close() {
          ws.close();
        },
      });
    });
    ws.once("error", reject);
  });
}

function fileRequest(roomId, token, key, options = {}) {
  const url = new URL(`/rooms/${roomId}/files?key=${encodeURIComponent(key)}`, BASE);
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        method: options.method || "GET",
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(options.headers || {}),
        },
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () =>
          resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }),
        );
      },
    );
    request.on("error", reject);
    if (options.body) request.end(options.body);
    else request.end();
  });
}

async function createRoom(name) {
  const host = await connect();
  await host.next("hello");
  host.send({ type: "create", name });
  const welcome = await host.next("welcome");
  return { host, code: welcome.room.id, token: welcome.selfToken, selfId: welcome.selfId };
}

async function joinRoom(code, name) {
  const guest = await connect();
  await guest.next("hello");
  guest.send({ type: "join", roomId: code, name });
  const welcome = await guest.next("welcome");
  return { guest, token: welcome.selfToken, selfId: welcome.selfId, room: welcome.room };
}

test("rooms: join, chat, playback broadcast and host handover", async () => {
  const { host, code } = await createRoom("Host");
  const { guest, selfId } = await joinRoom(code, "Guest");

  guest.send({ type: "chat", text: "hello room" });
  const chat = await host.next("chat", 5000, (message) => message.message.text === "hello room");
  assert.equal(chat.message.text, "hello room");
  assert.equal(chat.message.name, "Guest");

  const track = {
    key: "netease:1",
    neteaseId: "1",
    title: "Test Song",
    artist: "Tester",
    album: "Rooms",
    duration: 180,
  };
  host.send({ type: "playback", state: { track, playing: true, position: 12 } });
  const playback = await guest.next("playback");
  assert.equal(playback.state.track.key, "netease:1");
  assert.equal(playback.state.playing, true);
  assert.equal(playback.state.position, 12);
  assert.ok(playback.state.startedAt > 0);

  host.close();
  const room = await guest.next("room", 6000, (message) => message.room.id === code && message.room.hostId === selfId);
  assert.equal(room.room.hostId, selfId);
  guest.close();

  // Rejoining an empty room must not leave it hostless.
  await new Promise((resolve) => setTimeout(resolve, 300));
  const back = await joinRoom(code, "Back");
  assert.equal(back.room.hostId, back.selfId);
  back.guest.close();
});

test("files: member upload, authorized download and Range", async () => {
  const { host, code } = await createRoom("Host");
  const { guest, token: guestToken } = await joinRoom(code, "Guest");
  const body = crypto.randomBytes(512 * 1024);
  const sha256 = crypto.createHash("sha256").update(body).digest("hex");
  const key = "netease:42";

  const upload = await fileRequest(code, guestToken, key, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/octet-stream", "Content-Length": body.length, "X-File-Name": "song.flac" },
  });
  assert.equal(upload.status, 200);
  assert.equal(upload.body.length > 0, true);
  const file = JSON.parse(upload.body.toString("utf8")).file;
  assert.equal(file.sha256, sha256);
  assert.equal(file.size, body.length);
  assert.equal(file.ext, ".flac");

  const broadcast = await host.next("file");
  assert.equal(broadcast.file.key, key);
  assert.equal(broadcast.file.sha256, sha256);

  const download = await fileRequest(code, null, key);
  assert.equal(download.status, 401);
  assert.equal(download.body.toString("utf8").includes("Join the room first"), true);

  const authorized = await fileRequest(code, guestToken, key);
  assert.equal(authorized.status, 200);
  assert.deepEqual(authorized.body, body);
  assert.equal(authorized.headers["accept-ranges"], "bytes");

  const range = await fileRequest(code, guestToken, key, { headers: { Range: "bytes=10-19" } });
  assert.equal(range.status, 206);
  assert.equal(range.body.length, 10);
  assert.deepEqual(range.body, body.subarray(10, 20));
  assert.equal(range.headers["content-range"], `bytes 10-19/${body.length}`);

  const missing = await fileRequest(code, guestToken, "netease:nope");
  assert.equal(missing.status, 404);

  const noAuth = await fileRequest(code, "", key);
  assert.equal(noAuth.status, 401);

  host.close();
  guest.close();
});

test("files: per-room quota stops the next upload", async () => {
  const { host, code, token } = await createRoom("Quota");
  const first = crypto.randomBytes(2 * 1024 * 1024);
  const second = crypto.randomBytes(2 * 1024 * 1024);
  const upload = (key, body) =>
    fileRequest(code, token, key, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/octet-stream", "Content-Length": body.length, "X-File-Name": "take.flac" },
    });

  const accepted = await upload("netease:quota-1", first);
  assert.equal(accepted.status, 200);
  const rejected = await upload("netease:quota-2", second);
  assert.equal(rejected.status, 413);
  assert.match(rejected.body.toString("utf8"), /quota/i);

  const health = await (await fetch(`${BASE}/health`)).json();
  assert.equal(health.maxRoomBytes, MAX_ROOM_MB * 1024 * 1024);

  host.close();
});
