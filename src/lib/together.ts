import { create } from "zustand";

export interface TogetherTrack {
  key: string;
  neteaseId: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
}

export interface TogetherMember {
  id: string;
  name: string;
  host: boolean;
}

export interface TogetherMessage {
  id: string;
  memberId?: string;
  name: string;
  text: string;
  ts: number;
  system?: boolean;
}

export interface TogetherPlayback {
  track: TogetherTrack | null;
  playing: boolean;
  position: number;
  startedAt: number;
  updatedAt: number;
}

export interface TogetherFile {
  key: string;
  size: number;
  sha256: string;
  ext: string;
}

export interface TogetherNeed {
  key: string;
  track: TogetherTrack | null;
  memberId?: string;
  name?: string;
}

export interface TogetherTransfer {
  key: string;
  direction: "up" | "down";
  state: "waiting" | "working" | "ready" | "error" | "canceled";
  message?: string;
  title?: string;
  loaded?: number;
  total?: number;
  nonce?: number;
}

export interface TogetherRoom {
  id: string;
  hostId: string;
  members: TogetherMember[];
  state: TogetherPlayback;
  chat: TogetherMessage[];
  files?: TogetherFile[];
  needs?: TogetherNeed[];
  serverNow: number;
}

export type TogetherStatus = "idle" | "connecting" | "connected" | "error";

interface TogetherStore {
  open: boolean;
  status: TogetherStatus;
  error: string | null;
  serverUrl: string;
  name: string;
  selfId: string | null;
  roomId: string | null;
  hostId: string | null;
  members: TogetherMember[];
  chat: TogetherMessage[];
  state: TogetherPlayback | null;
  serverNow: number;
  clockOffset: number;
  latency: number;
  missingKey: string | null;
  selfToken: string | null;
  files: TogetherFile[];
  needs: TogetherNeed[];
  transfers: Record<string, TogetherTransfer>;
  tempPlayingKey: string | null;
  reconnecting: boolean;
  openDialog: () => void;
  closeDialog: () => void;
  setServerUrl: (value: string) => void;
  setName: (value: string) => void;
  createRoom: () => void;
  joinRoom: (code: string) => void;
  leaveRoom: () => void;
  sendChat: (text: string) => void;
  publishPlayback: (state: { track: TogetherTrack | null; playing: boolean; position: number }) => void;
  requestFile: (key: string, track: TogetherTrack | null) => void;
  setTransfer: (key: string, transfer: TogetherTransfer | null) => void;
  cancelTransfer: (key: string) => void;
  retryTransfer: (key: string) => void;
  setTempPlayingKey: (key: string | null) => void;
  clearError: () => void;
}

const DEFAULT_SERVER = "ws://127.0.0.1:8787/ws";
const SERVER_KEY = "potato:together:server";
const NAME_KEY = "potato:together:name";

function stored(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The room still works for this session.
  }
}

export function togetherFileUrl(serverUrl: string, roomId: string, key: string): string {
  const url = new URL(normalizeServerUrl(serverUrl));
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = `/rooms/${encodeURIComponent(roomId)}/files`;
  url.search = `?key=${encodeURIComponent(key)}`;
  return url.toString();
}

export function normalizeServerUrl(raw: string): string {
  let value = (raw || "").trim() || DEFAULT_SERVER;
  if (value.startsWith("http://")) value = `ws://${value.slice("http://".length)}`;
  else if (value.startsWith("https://")) value = `wss://${value.slice("https://".length)}`;
  else if (!/^wss?:\/\//i.test(value)) value = `ws://${value}`;
  try {
    const url = new URL(value);
    if (!url.pathname || url.pathname === "/") url.pathname = "/ws";
    return url.toString();
  } catch {
    return DEFAULT_SERVER;
  }
}

let socket: WebSocket | null = null;
let pingTimer: number | null = null;
let reconnectTimer: number | null = null;
let reconnectAttempt = 0;
let resumeRoom: { roomId: string; name: string } | null = null;
let closingIntentionally = false;
let pending: { type: "create" | "join"; roomId?: string } | null = null;
const MAX_RECONNECT_ATTEMPTS = 5;

function send(payload: unknown) {
  if (!socket || socket.readyState !== 1) return;
  try {
    socket.send(JSON.stringify(payload));
  } catch {
    // The close handler owns the visible error.
  }
}

function stopPing() {
  if (pingTimer !== null) {
    window.clearInterval(pingTimer);
    pingTimer = null;
  }
}

function startPing() {
  stopPing();
  const ping = () => send({ type: "ping", t: Date.now() });
  ping();
  pingTimer = window.setInterval(ping, 8000);
}

function stopSocket() {
  stopPing();
  if (socket) {
    const old = socket;
    socket = null;
    try {
      old.close();
    } catch {
      // Already closed.
    }
  }
}

function emptyRoom() {
  return {
    status: "idle" as TogetherStatus,
    selfId: null,
    roomId: null,
    hostId: null,
    members: [],
    chat: [],
    state: null,
    missingKey: null,
    selfToken: null,
    files: [],
    needs: [],
    transfers: {},
    tempPlayingKey: null,
    reconnecting: false,
  };
}

function clearReconnect() {
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

/** Stop in-flight file work before the room credentials disappear. */
function cancelActiveTransfers(transfers: Record<string, TogetherTransfer>) {
  if (typeof window === "undefined" || typeof window.potato?.cancelTogetherTransfer !== "function") return;
  for (const transfer of Object.values(transfers)) {
    if (transfer.state === "working") {
      void window.potato.cancelTogetherTransfer(transfer.key).catch(() => undefined);
    }
  }
}

function handleMessage(raw: string) {
  let message: Record<string, unknown>;
  try {
    message = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return;
  }
  const type = message.type;
  const store = useTogether.getState();

  if (type === "hello") {
    useTogether.setState({ serverNow: Number(message.serverNow) || Date.now() });
    return;
  }

  if (type === "welcome") {
    const room = message.room as TogetherRoom;
    const selfId = String(message.selfId || "");
    if (!room || !selfId) return;
    const self = room.members.find((member) => member.id === selfId);
    const serverNow = Number(room.serverNow || message.serverNow) || Date.now();
    resumeRoom = { roomId: room.id, name: self?.name || store.name };
    reconnectAttempt = 0;
    closingIntentionally = false;
    clearReconnect();
    useTogether.setState({
      status: "connected",
      error: null,
      reconnecting: false,
      selfId,
      roomId: room.id,
      hostId: room.hostId,
      members: room.members || [],
      chat: room.chat || [],
      state: room.state || null,
      serverNow,
      clockOffset: serverNow - Date.now(),
      name: self?.name || store.name,
      selfToken: String(message.selfToken || ""),
      files: Array.isArray(room.files) ? room.files : [],
      needs: Array.isArray(room.needs) ? room.needs : [],
      missingKey: null,
      tempPlayingKey: null,
      transfers: {},
    });
    startPing();
    return;
  }

  if (type === "room") {
    const room = message.room as TogetherRoom;
    if (!room) return;
    useTogether.setState({
      hostId: room.hostId,
      members: room.members || [],
      state: room.state || useTogether.getState().state,
      chat: Array.isArray(room.chat) ? room.chat : useTogether.getState().chat,
      files: Array.isArray(room.files) ? room.files : useTogether.getState().files,
      needs: Array.isArray(room.needs) ? room.needs : useTogether.getState().needs,
      serverNow: Number(room.serverNow) || useTogether.getState().serverNow,
    });
    return;
  }

  if (type === "playback") {
    const serverNow = Number(message.serverNow) || Date.now();
    useTogether.setState({
      state: message.state as TogetherPlayback,
      serverNow,
      clockOffset: serverNow - Date.now(),
    });
    return;
  }

  if (type === "chat") {
    const entry = message.message as TogetherMessage;
    if (!entry?.id) return;
    const current = useTogether.getState().chat;
    if (current.some((item) => item.id === entry.id)) return;
    useTogether.setState({ chat: [...current, entry].slice(-120) });
    return;
  }

  if (type === "file") {
    const file = message.file as TogetherFile;
    if (!file?.key || !file.sha256) return;
    const current = useTogether.getState();
    const files = current.files.filter((item) => item.key !== file.key);
    const transfers = { ...current.transfers };
    const stale = transfers[file.key];
    if (stale && (stale.state === "error" || stale.state === "canceled")) delete transfers[file.key];
    useTogether.setState({
      files: [...files, file],
      needs: current.needs.filter((item) => item.key !== file.key),
      transfers,
    });
    return;
  }

  if (type === "need") {
    const key = String(message.key || "");
    if (!key) return;
    const current = useTogether.getState();
    if (current.files.some((item) => item.key === key)) return;
    const need: TogetherNeed = {
      key,
      track: (message.track as TogetherTrack) || null,
      memberId: message.memberId ? String(message.memberId) : undefined,
      name: message.name ? String(message.name) : undefined,
    };
    useTogether.setState({
      needs: [...current.needs.filter((item) => item.key !== key), need],
    });
    return;
  }

  if (type === "pong") {
    const sentAt = Number(message.t) || Date.now();
    const receivedAt = Date.now();
    const serverNow = Number(message.serverNow) || receivedAt;
    useTogether.setState({
      latency: Math.max(0, receivedAt - sentAt),
      clockOffset: serverNow - (sentAt + receivedAt) / 2,
      serverNow,
    });
    return;
  }

  if (type === "left") {
    closingIntentionally = true;
    resumeRoom = null;
    reconnectAttempt = 0;
    cancelActiveTransfers(useTogether.getState().transfers);
    clearReconnect();
    stopSocket();
    useTogether.setState({ ...emptyRoom(), error: null });
    return;
  }

  if (type === "error") {
    const detail = String(message.message || "联机请求失败");
    if (store.reconnecting || store.status === "connecting") {
      // A failed create/join/rejoin must not fall through to the generic
      // "connection dropped" path and erase the reason the relay gave us.
      closingIntentionally = true;
      resumeRoom = null;
      reconnectAttempt = 0;
      cancelActiveTransfers(store.transfers);
      clearReconnect();
      stopSocket();
      useTogether.setState({ ...emptyRoom(), status: "error", error: detail });
      return;
    }
    useTogether.setState({ error: detail });
  }
}

export const useTogether = create<TogetherStore>((set, get) => ({
  open: false,
  status: "idle",
  error: null,
  serverUrl: stored(SERVER_KEY, DEFAULT_SERVER),
  name: stored(NAME_KEY, ""),
  selfId: null,
  roomId: null,
  hostId: null,
  members: [],
  chat: [],
  state: null,
  serverNow: 0,
  clockOffset: 0,
  latency: 0,
  missingKey: null,
  selfToken: null,
  files: [],
  needs: [],
  transfers: {},
  tempPlayingKey: null,
  reconnecting: false,

  openDialog: () => set({ open: true }),
  closeDialog: () => set({ open: false }),
  clearError: () => set({ error: null }),
  setServerUrl: (value) => {
    remember(SERVER_KEY, value);
    set({ serverUrl: value, error: null });
  },
  setName: (value) => {
    remember(NAME_KEY, value);
    set({ name: value });
  },

  createRoom: () => {
    if (get().status === "connecting" && !get().reconnecting) return;
    closingIntentionally = false;
    resumeRoom = null;
    clearReconnect();
    connect("create");
  },
  joinRoom: (code) => {
    if (get().status === "connecting" && !get().reconnecting) return;
    closingIntentionally = false;
    resumeRoom = null;
    clearReconnect();
    connect("join", code);
  },
  leaveRoom: () => {
    closingIntentionally = true;
    resumeRoom = null;
    reconnectAttempt = 0;
    cancelActiveTransfers(get().transfers);
    clearReconnect();
    if (get().status === "connected") send({ type: "leave" });
    stopSocket();
    set({ ...emptyRoom(), error: null });
  },
  sendChat: (text) => {
    if (get().status !== "connected") return;
    const body = text.trim().slice(0, 500);
    if (body) send({ type: "chat", text: body });
  },
  publishPlayback: (state) => {
    const current = get();
    if (current.status !== "connected" || current.hostId !== current.selfId) return;
    send({ type: "playback", state });
  },
  requestFile: (key, track) => {
    if (!key) return;
    const current = get();
    if (current.status !== "connected" || current.files.some((item) => item.key === key)) return;
    if (current.needs.some((item) => item.key === key)) return;
    send({ type: "need", key, track });
    set({
      needs: [...current.needs, { key, track, memberId: current.selfId || undefined, name: current.name }],
    });
  },
  setTransfer: (key, transfer) => {
    const transfers = { ...get().transfers };
    if (transfer) transfers[key] = transfer;
    else delete transfers[key];
    set({ transfers });
  },
  cancelTransfer: (key) => {
    const current = get().transfers[key];
    if (!current) return;
    if (typeof window.potato?.cancelTogetherTransfer === "function") {
      void window.potato.cancelTogetherTransfer(key).catch(() => undefined);
    }
    set({
      transfers: { ...get().transfers, [key]: { ...current, state: "canceled", message: "已取消" } },
    });
  },
  retryTransfer: (key) => {
    const transfers = { ...get().transfers };
    delete transfers[key];
    set({ transfers });
  },
  setTempPlayingKey: (key) => set({ tempPlayingKey: key }),
}));

function connect(type: "create" | "join", roomId?: string, resume = false) {
  const state = useTogether.getState();
  const url = normalizeServerUrl(state.serverUrl);
  const name = state.name.trim() || "听众";
  remember(SERVER_KEY, url);
  remember(NAME_KEY, name);
  stopSocket();
  clearReconnect();
  pending = { type, roomId };
  const keepRoom = resume && Boolean(state.roomId);
  useTogether.setState({
    status: "connecting",
    error: null,
    reconnecting: resume,
    serverUrl: url,
    name,
    selfId: null,
    selfToken: null,
    missingKey: null,
    transfers: {},
    tempPlayingKey: null,
    ...(keepRoom
      ? {}
      : {
          roomId: null,
          hostId: null,
          members: [],
          chat: [],
          state: null,
          files: [],
          needs: [],
        }),
  });

  let next: WebSocket;
  try {
    next = new WebSocket(url);
  } catch {
    closingIntentionally = true;
    resumeRoom = null;
    reconnectAttempt = 0;
    clearReconnect();
    useTogether.setState({ ...emptyRoom(), status: "error", error: "服务器地址无效" });
    return;
  }
  socket = next;

  next.onopen = () => {
    if (!pending) return;
    const request = pending;
    pending = null;
    send({ type: request.type, name, roomId: request.roomId });
  };
  next.onmessage = (event) => handleMessage(String(event.data));
  next.onerror = () => {
    if (!useTogether.getState().reconnecting && useTogether.getState().status === "connecting") {
      useTogether.setState({ status: "error", error: "无法连接联机服务器" });
    }
  };
  next.onclose = () => {
    if (socket !== next) return;
    socket = null;
    stopPing();
    if (closingIntentionally || !resumeRoom) {
      if (useTogether.getState().status === "connected" || useTogether.getState().status === "connecting") {
        cancelActiveTransfers(useTogether.getState().transfers);
        useTogether.setState({
          ...emptyRoom(),
          status: "error",
          error: "连接已断开，请重新加入房间",
        });
      }
      return;
    }
    scheduleReconnect();
  };
}

function scheduleReconnect() {
  if (!resumeRoom || closingIntentionally) return;
  cancelActiveTransfers(useTogether.getState().transfers);
  if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
    closingIntentionally = true;
    resumeRoom = null;
    clearReconnect();
    stopSocket();
    useTogether.setState({
      ...emptyRoom(),
      status: "error",
      error: "连接已断开，自动重连失败",
    });
    return;
  }
  const delay = Math.min(8000, 700 * 2 ** reconnectAttempt);
  reconnectAttempt += 1;
  stopPing();
  useTogether.setState({
    status: "connecting",
    reconnecting: true,
    error: null,
    selfId: null,
    selfToken: null,
    missingKey: null,
    transfers: {},
    tempPlayingKey: null,
  });
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    if (!resumeRoom || closingIntentionally) return;
    connect("join", resumeRoom.roomId, true);
  }, delay);
}

let transferSequence = 0;
export function nextTransferNonce(): number {
  transferSequence += 1;
  return transferSequence;
}

let progressBound = false;
function bindTransferProgress() {
  if (progressBound || typeof window === "undefined") return;
  if (typeof window.potato?.onTogetherProgress !== "function") return;
  progressBound = true;
  window.potato.onTogetherProgress((payload) => {
    if (!payload?.id) return;
    const current = useTogether.getState();
    const transfer = current.transfers[payload.id];
    if (!transfer || transfer.direction !== payload.direction || transfer.state !== "working") return;
    const total = Math.max(0, Number(payload.total) || 0);
    const loaded = Math.max(0, Number(payload.loaded) || 0);
    useTogether.setState({
      transfers: {
        ...current.transfers,
        [payload.id]: {
          ...transfer,
          loaded,
          total: total || transfer.total,
        },
      },
    });
  });
}
bindTransferProgress();
