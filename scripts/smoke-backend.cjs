const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const readline = require("node:readline");

const root = path.resolve(__dirname, "..");
const jar = path.join(root, "backend", "target", "potatoplayer-super-backend.jar");
if (!fs.existsSync(jar)) {
  console.error("Build the backend first: npm run build:backend");
  process.exit(1);
}

const home = fs.mkdtempSync(path.join(os.tmpdir(), "potato-smoke-"));
const child = spawn("java", ["-Dfile.encoding=UTF-8", `-Dpotatomusic.home=${home}`, "-jar", jar], {
  cwd: root,
  stdio: ["pipe", "pipe", "pipe"],
});
const pending = new Map();
let nextId = 1;
let scanDone;
const scanPromise = new Promise((resolve) => (scanDone = resolve));
const readyPromise = new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error("backend did not become ready")), 20_000);
  child.once("exit", () => reject(new Error("backend exited early")));
  readline.createInterface({ input: child.stdout }).on("line", (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message.event === "ready") {
      clearTimeout(timeout);
      resolve(message.data);
      return;
    }
    if (message.event === "scan.done") scanDone(message.data);
    if (message.event === "scan.error") scanDone(Promise.reject(new Error(message.data.message)));
    if (message.event === "toast" && message.data.kind === "error") console.error("[toast]", message.data.message);
    if (message.id && pending.has(message.id)) {
      const { resolve: done, reject, timer } = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(timer);
      if (message.error) reject(new Error(message.error.message));
      else done(message.result);
    }
  });
});

function request(method, params = {}, timeout = 45_000) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`timeout: ${method}`));
    }, timeout);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(JSON.stringify({ id, method, params }) + "\n");
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  await readyPromise;
  const boot = await request("bootstrap");
  console.log(`[smoke] library root: ${boot.libraryRoot}`);
  if (boot.scanNeeded) {
    await request("library.scan");
    const done = await Promise.race([
      scanPromise,
      sleep(30_000).then(() => Promise.reject(new Error("scan timeout"))),
    ]);
    console.log(`[smoke] scanned ${done.tracks.length} tracks`);
  }
  const state = await request("bootstrap");
  if (!state.tracks.length) throw new Error("no tracks available to play");
  const track = state.tracks[0];
  const eq = await request("eq.state");
  if (eq.available) {
    await request("eq.setEnabled", { enabled: true });
    await request("eq.setBand", { index: 0, value: 4 });
    console.log(`[smoke] VLC equalizer available (${eq.factoryPresets.length} factory presets)`);
  } else {
    console.log("[smoke] VLC equalizer unavailable; continuing without EQ");
  }
  console.log(`[smoke] playing: ${track.artist} — ${track.title}`);
  await request("playback.play", {
    trackId: track.id,
    queue: state.tracks.slice(0, 8).map((item) => item.id),
  });
  let playing = await request("playback.state");
  for (let attempt = 0; attempt < 30; attempt++) {
    await sleep(400);
    playing = await request("playback.state");
    if (playing.available && playing.playing && playing.time > 0.3) break;
  }
  if (!playing.available) throw new Error(playing.error || "VLC is not available");
  if (!playing.playing) throw new Error("playback did not start");
  if (playing.time <= 0.3) throw new Error(`playback time did not advance: ${playing.time}`);
  console.log(`[smoke] VLC playback at ${playing.time.toFixed(2)}s / ${playing.duration}s`);
  if (eq.available) {
    await request("eq.factoryPreset", { name: "Dance" });
    await request("eq.setBand", { index: 3, value: -2 });
    const liveEq = await request("eq.state");
    const stillPlaying = await request("playback.state");
    if (!stillPlaying.playing) throw new Error("playback stopped after applying EQ");
    console.log(`[smoke] EQ live update at preamp ${liveEq.preamp} dB, band 0 ${liveEq.bands[0]} dB`);
  }
  await request("playback.volume", { volume: 0.4 });
  const volume = await request("playback.state");
  if (Math.abs(volume.volume - 0.4) > 0.01) throw new Error("volume did not update");
  await request("playback.seek", { seconds: 5 });
  await request("playback.toggle");
  await sleep(300);
  const paused = await request("playback.state");
  if (paused.playing) throw new Error("pause did not take effect");
  console.log("[smoke] pause, seek and volume all responded");
  await request("app.shutdown");
  await sleep(300);
  child.kill("SIGTERM");
  console.log("[smoke] OK");
  process.exit(0);
})().catch(async (error) => {
  console.error(`[smoke] FAILED: ${error.message}`);
  child.kill("SIGTERM");
  process.exit(1);
});
