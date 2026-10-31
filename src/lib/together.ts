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

export interface TogetherRoom {
  id: string;
  hostId: string;
  members: TogetherMember[];
  state: TogetherPlayback;
  chat: TogetherMessage[];
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
  openDialog: () => void;
  closeDialog: () => void;
  setServerUrl: (value: string) => void;
  setName: (value: string) => void;
  createRoom: () => void;
  joinRoom: (code: string) => void;
  leaveRoom: () => void;
  sendChat: (text: string) => void;
  publishPlayback: (state: { track: TogetherTrack | null; playing: boolean; position: number }) => void;
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
let pending: { type: "create" | "join"; roomId?: string } | null = null;

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
  };
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
    useTogether.setState({
      status: "connected",
      error: null,
      selfId,
      roomId: room.id,
      hostId: room.hostId,
      members: room.members || [],
      chat: room.chat || [],
      state: room.state || null,
      serverNow,
      clockOffset: serverNow - Date.now(),
      name: self?.name || store.name,
      missingKey: null,
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
    stopSocket();
    useTogether.setState({ ...emptyRoom(), error: null });
    return;
  }

  if (type === "error") {
    useTogether.setState({ error: String(message.message || "联机请求失败") });
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

  createRoom: () => get().status !== "connecting" && connect("create"),
  joinRoom: (code) => get().status !== "connecting" && connect("join", code),
  leaveRoom: () => {
    if (get().status === "connected") send({ type: "leave" });
    stopSocket();
    set({ ...emptyRoom(), error: null });
  },
  sendChat: (text) => {
    const body = text.trim().slice(0, 500);
    if (body) send({ type: "chat", text: body });
  },
  publishPlayback: (state) => {
    const current = get();
    if (current.status !== "connected" || current.hostId !== current.selfId) return;
    send({ type: "playback", state });
  },
}));

function connect(type: "create" | "join", roomId?: string) {
  const state = useTogether.getState();
  const url = normalizeServerUrl(state.serverUrl);
  const name = state.name.trim() || "听众";
  remember(SERVER_KEY, url);
  remember(NAME_KEY, name);
  stopSocket();
  pending = { type, roomId };
  useTogether.setState({
    status: "connecting",
    error: null,
    serverUrl: url,
    name,
    selfId: null,
    roomId: null,
    hostId: null,
    members: [],
    chat: [],
    state: null,
    missingKey: null,
  });

  let next: WebSocket;
  try {
    next = new WebSocket(url);
  } catch {
    useTogether.setState({ status: "error", error: "服务器地址无效" });
    return;
  }
  socket = next;

  next.onopen = () => {
    if (!pending) return;
    send({ type: pending.type, name, roomId: pending.roomId });
  };
  next.onmessage = (event) => handleMessage(String(event.data));
  next.onerror = () => {
    if (useTogether.getState().status === "connecting") {
      useTogether.setState({ status: "error", error: "无法连接联机服务器" });
    }
  };
  next.onclose = () => {
    if (socket !== next) return;
    socket = null;
    stopPing();
    if (useTogether.getState().status === "connected" || useTogether.getState().status === "connecting") {
      useTogether.setState({
        status: "error",
        error: "连接已断开，请重新加入房间",
        selfId: null,
        roomId: null,
        hostId: null,
        members: [],
      });
    }
  };
}
