import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import {
  Check,
  Copy,
  Crown,
  Download,
  LoaderCircle,
  LogOut,
  MessageCircle,
  Radio,
  RefreshCw,
  Send,
  Upload,
  Users,
  Wifi,
  X,
} from "lucide-react";
import { useAppStore } from "@/store";
import { useTr } from "@/lib/i18n";
import { useTogether, type TogetherTransfer } from "@/lib/together";
import { Cover } from "@/components/Cover";
import { Modal } from "@/components/Modal";

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "0 MB";
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  const mb = bytes / (1024 * 1024);
  return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}

function TransferRow({ transfer }: { transfer: TogetherTransfer }) {
  const tr = useTr();
  const cancelTransfer = useTogether((state) => state.cancelTransfer);
  const retryTransfer = useTogether((state) => state.retryTransfer);
  const working = transfer.state === "working";
  const retryable = transfer.state === "error" || transfer.state === "canceled";
  const percent =
    transfer.total && transfer.total > 0
      ? Math.max(0, Math.min(100, Math.round(((transfer.loaded || 0) / transfer.total) * 100)))
      : null;
  const stateLabel =
    transfer.state === "working"
      ? tr("Transferring", "传输中")
      : transfer.state === "ready"
        ? tr("Ready", "已完成")
        : transfer.state === "canceled"
          ? tr("Canceled", "已取消")
          : tr("Failed", "失败");
  const title =
    transfer.title ||
    (transfer.direction === "up" ? tr("Sending a song", "正在发送歌曲") : tr("Receiving a song", "正在接收歌曲"));

  return (
    <div className={`together-transfer is-${transfer.state}`}>
      <span className="together-transfer__icon" aria-hidden="true">
        {transfer.direction === "up" ? <Upload size={13} /> : <Download size={13} />}
      </span>
      <div className="together-transfer__body">
        <div className="together-transfer__line">
          <strong>{title}</strong>
          <em>{stateLabel}</em>
        </div>
        <div className={percent === null ? "together-transfer__bar is-indeterminate" : "together-transfer__bar"}>
          <span style={percent === null ? undefined : { width: `${percent}%` }} />
        </div>
        <small>
          {transfer.message ? `${transfer.message} · ` : ""}
          {transfer.loaded || transfer.total
            ? `${formatBytes(transfer.loaded)} / ${formatBytes(transfer.total)}`
            : tr("Waiting for the relay…", "正在等待服务器…")}
        </small>
      </div>
      {working && (
        <button
          type="button"
          className="together-transfer__action"
          aria-label={tr("Cancel transfer", "取消传输")}
          title={tr("Cancel transfer", "取消传输")}
          onClick={() => cancelTransfer(transfer.key)}
        >
          <X size={13} />
        </button>
      )}
      {retryable && (
        <button
          type="button"
          className="together-transfer__action"
          aria-label={tr("Retry transfer", "重试传输")}
          title={tr("Retry transfer", "重试传输")}
          onClick={() => retryTransfer(transfer.key)}
        >
          <RefreshCw size={13} />
        </button>
      )}
      {transfer.state === "ready" && (
        <span className="together-transfer__done" aria-hidden="true">
          <Check size={14} />
        </span>
      )}
    </div>
  );
}

export function TogetherDialog() {
  const tr = useTr();
  const open = useTogether((state) => state.open);
  const status = useTogether((state) => state.status);
  const reconnecting = useTogether((state) => state.reconnecting);
  const error = useTogether((state) => state.error);
  const serverUrl = useTogether((state) => state.serverUrl);
  const name = useTogether((state) => state.name);
  const selfId = useTogether((state) => state.selfId);
  const roomId = useTogether((state) => state.roomId);
  const hostId = useTogether((state) => state.hostId);
  const members = useTogether((state) => state.members);
  const chat = useTogether((state) => state.chat);
  const remote = useTogether((state) => state.state);
  const latency = useTogether((state) => state.latency);
  const missingKey = useTogether((state) => state.missingKey);
  const files = useTogether((state) => state.files);
  const transfers = useTogether((state) => state.transfers);
  const closeDialog = useTogether((state) => state.closeDialog);
  const setServerUrl = useTogether((state) => state.setServerUrl);
  const setName = useTogether((state) => state.setName);
  const createRoom = useTogether((state) => state.createRoom);
  const joinRoom = useTogether((state) => state.joinRoom);
  const leaveRoom = useTogether((state) => state.leaveRoom);
  const sendChat = useTogether((state) => state.sendChat);
  const clearError = useTogether((state) => state.clearError);

  const tracks = useAppStore((state) => state.tracks);
  const tempTrack = useAppStore((state) => state.tempTrack);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);

  const connected = Boolean(roomId) && (status === "connected" || reconnecting);
  const isHost = Boolean(selfId && hostId === selfId);
  const remoteTrack = remote?.track;
  const localTrack = remoteTrack
    ? (tracks.find(
        (track) =>
          (remoteTrack.neteaseId && track.neteaseId === remoteTrack.neteaseId) ||
          (track.title === remoteTrack.title && track.artist === remoteTrack.artist),
      ) ??
        (tempTrack && tempTrack.id === `together:${remoteTrack.key}` ? tempTrack : undefined))
    : undefined;
  const missing = Boolean(remoteTrack && !localTrack);
  const transfer = remoteTrack ? transfers[remoteTrack.key] : undefined;
  const fileReady = remoteTrack ? files.some((file) => file.key === remoteTrack.key) : false;
  const activeTransfers = Object.values(transfers).sort((a, b) => {
    const rank = (item: TogetherTransfer) => (item.state === "working" ? 0 : item.state === "error" ? 1 : 2);
    return rank(a) - rank(b);
  });

  useEffect(() => {
    if (open) setCopied(false);
  }, [open, roomId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      closeDialog();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, closeDialog]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "end" });
  }, [chat.length, open]);

  const copyCode = async () => {
    if (!roomId) return;
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const submitChat = () => {
    if (reconnecting) return;
    const body = message.trim();
    if (!body) return;
    sendChat(body);
    setMessage("");
  };

  return (
    <AnimatePresence>
      {open && (
        <Modal onClose={closeDialog} className="together-dialog" labelledBy="together-title">
          <div className="together-head">
            <div>
              <div className="modal__eyebrow">
                <span className="modal__dot" />
                TOGETHER / 一起听
              </div>
              <h2 id="together-title">{tr("Listen together", "一起听")}</h2>
              <p className="modal__description">
                {connected
                  ? tr(
                      "Playback follows the host. Songs that someone is missing travel privately through the relay.",
                      "播放跟随房主；有人缺歌时，文件会通过中转私密补齐。",
                    )
                  : tr(
                      "Sync playback and chat with a friend. Each side plays its own local copy.",
                      "和朋友同步播放、文字聊天。两边各自播放本地文件。",
                    )}
              </p>
            </div>
            {connected && (
              <div className="together-head__actions">
                <span className={reconnecting ? "together-status is-reconnecting" : clsxStatus(status)}>
                  {reconnecting ? (
                    <LoaderCircle size={12} className="is-spinning" />
                  ) : (
                    <Wifi size={12} />
                  )}
                  {reconnecting
                    ? tr("Reconnecting…", "重连中…")
                    : latency > 0
                      ? `${latency} ms`
                      : tr("Connected", "已连接")}
                </span>
                <button type="button" className="icon-button" onClick={closeDialog} aria-label={tr("Close", "关闭")}>
                  ×
                </button>
              </div>
            )}
          </div>

          {!connected ? (
            <div className="together-setup">
              {error && <div className="together-error" role="alert">{error}</div>}
              <label className="together-field">
                <span>{tr("Server", "服务器")}</span>
                <input
                  className="text-field"
                  value={serverUrl}
                  onChange={(event) => setServerUrl(event.target.value)}
                  placeholder="ws://127.0.0.1:8787/ws"
                  spellCheck={false}
                />
                <small>{tr("Use wss:// when the relay is behind HTTPS.", "服务器走 HTTPS 时请用 wss://。")}</small>
              </label>
              <label className="together-field">
                <span>{tr("Your name", "你的名字")}</span>
                <input
                  className="text-field"
                  value={name}
                  maxLength={24}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={tr("Listener", "听众")}
                />
              </label>
              <div className="together-create">
                <button
                  type="button"
                  className="button button--dark"
                  disabled={status === "connecting"}
                  onClick={createRoom}
                >
                  {status === "connecting" ? <LoaderCircle size={15} className="is-spinning" /> : <Radio size={15} />}
                  {tr("Create a room", "创建房间")}
                </button>
              </div>
              <div className="together-divider"><span>{tr("or join", "或加入")}</span></div>
              <div className="together-join">
                <input
                  className="text-field"
                  value={code}
                  maxLength={6}
                  onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ""))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && code.length === 6) joinRoom(code);
                  }}
                  placeholder={tr("Room code", "房间码")}
                  aria-label={tr("Room code", "房间码")}
                />
                <button
                  type="button"
                  className="button button--glass"
                  disabled={code.length !== 6 || status === "connecting"}
                  onClick={() => joinRoom(code)}
                >
                  {tr("Join", "加入")}
                </button>
              </div>
              <p className="together-footnote">
                {tr(
                  "The relay only keeps room state, chat and temporary copies of files that members already own. Nothing is fetched from a music service.",
                  "服务器只保存房间状态、聊天和成员自己上传的临时文件；不会从音乐平台下载任何内容。",
                )}
              </p>
            </div>
          ) : (
            <div className="together-room">
              <aside className="together-side">
                <div className="together-code">
                  <span>{tr("Room code", "房间码")}</span>
                  <strong>{roomId}</strong>
                  <button type="button" onClick={() => void copyCode()} aria-label={tr("Copy room code", "复制房间码")}>
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? tr("Copied", "已复制") : tr("Copy", "复制")}
                  </button>
                </div>

                {reconnecting && (
                  <div className="together-reconnect" role="status">
                    <LoaderCircle size={13} className="is-spinning" />
                    <span>{tr("Connection lost. Rejoining the room…", "连接中断，正在重新加入房间…")}</span>
                  </div>
                )}
                {error && !reconnecting && (
                  <div className="together-error together-room__error" role="alert">
                    {error}
                    <button type="button" onClick={clearError} aria-label={tr("Dismiss", "关闭")}>
                      <X size={12} />
                    </button>
                  </div>
                )}

                <div className="together-section-label">
                  <Users size={13} />
                  {tr("Listeners", "听众")} <span>{String(members.length).padStart(2, "0")}</span>
                </div>
                <div className="together-members">
                  {members.map((member) => (
                    <div key={member.id} className={member.id === selfId ? "together-member is-self" : "together-member"}>
                      <span className="together-avatar">{member.name.slice(0, 1).toUpperCase()}</span>
                      <span>{member.name}</span>
                      {member.host && <Crown size={12} aria-label={tr("Host", "房主")} />}
                      {member.id === selfId && <small>{tr("you", "你")}</small>}
                    </div>
                  ))}
                </div>

                <div className="together-section-label">
                  <Radio size={13} />
                  {tr("Now playing", "正在播放")}
                </div>
                <div className="together-now">
                  {remoteTrack ? (
                    <>
                      <Cover
                        path={localTrack?.coverPath}
                        seed={remoteTrack.key}
                        label={remoteTrack.title}
                        className="together-now__cover"
                        radius={12}
                      />
                      <div>
                        <strong>{remoteTrack.title}</strong>
                        <span>{remoteTrack.artist || remoteTrack.album || tr("Unknown artist", "未知艺术家")}</span>
                        <small>
                          {isHost
                            ? tr("You are hosting", "你是房主")
                            : missing
                              ? tr("Filling in the missing file", "正在补齐缺少的文件")
                              : tr("Following the host", "跟随房主")}
                        </small>
                      </div>
                    </>
                  ) : (
                    <div className="together-empty">
                      <MessageCircle size={18} />
                      <span>{tr("Waiting for the host to play a song", "等待房主播放歌曲")}</span>
                    </div>
                  )}
                </div>

                {activeTransfers.length > 0 && (
                  <div className="together-transfers">
                    <div className="together-section-label">
                      {tr("Transfers", "文件传输")}
                      <span>{String(activeTransfers.length).padStart(2, "0")}</span>
                    </div>
                    <div className="together-transfers__list">
                      {activeTransfers.map((item) => (
                        <TransferRow key={item.key} transfer={item} />
                      ))}
                    </div>
                  </div>
                )}

                {missing && !transfer && (
                  <div className="together-missing">
                    {fileReady
                      ? tr(
                          "The room already has this file. Preparing playback…",
                          "房间已经有这份文件，正在准备播放…",
                        )
                      : tr(
                          "This song is not in your library. Asking the room for a private copy…",
                          "这首歌不在你的资料库，正在请房间成员私密补一份…",
                        )}
                  </div>
                )}
                <button type="button" className="together-leave" onClick={leaveRoom}>
                  <LogOut size={14} />
                  {tr("Leave room", "离开房间")}
                </button>
              </aside>

              <section className="together-chat">
                <div className="together-section-label">
                  <MessageCircle size={13} />
                  {tr("Chat", "聊天")}
                </div>
                <div className="together-chat__list" aria-live="polite">
                  {chat.length === 0 && (
                    <div className="together-chat__empty">
                      {tr("Say hi, or share what you are listening for.", "打个招呼，或者说说你在听什么。")}
                    </div>
                  )}
                  {chat.map((entry) => (
                    <div key={entry.id} className={`together-message${entry.system ? " is-system" : ""}`}>
                      {!entry.system && <span className="together-message__name">{entry.name}</span>}
                      <p>{entry.text}</p>
                      {!entry.system && (
                        <time>{new Date(entry.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                      )}
                    </div>
                  ))}
                  <div ref={chatEnd} />
                </div>
                <div className="together-chat__compose">
                  <input
                    className="text-field"
                    value={message}
                    maxLength={500}
                    disabled={reconnecting}
                    onChange={(event) => setMessage(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        submitChat();
                      }
                    }}
                    placeholder={
                      reconnecting
                        ? tr("Reconnecting…", "正在重连…")
                        : tr("Message the room…", "发到房间里…")
                    }
                    aria-label={tr("Chat message", "聊天消息")}
                  />
                  <button
                    type="button"
                    className="button button--dark"
                    disabled={!message.trim() || reconnecting}
                    onClick={submitChat}
                  >
                    <Send size={15} />
                  </button>
                </div>
                <p className="together-footnote">
                  {isHost
                    ? tr("Your play, pause and seek are broadcast to everyone.", "你的播放、暂停和拖动会同步给所有人。")
                    : tr("The host controls playback; you can add songs locally.", "房主控制播放；你可以在本地加歌。")}
                </p>
              </section>
            </div>
          )}
        </Modal>
      )}
    </AnimatePresence>
  );
}

function clsxStatus(status: string): string {
  return `together-status${status === "connected" ? " is-online" : ""}`;
}
