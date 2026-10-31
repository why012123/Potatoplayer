import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import {
  Check,
  Copy,
  Crown,
  LoaderCircle,
  LogOut,
  MessageCircle,
  Radio,
  Send,
  Users,
  Wifi,
} from "lucide-react";
import { useAppStore } from "@/store";
import { useTr } from "@/lib/i18n";
import { useTogether } from "@/lib/together";
import { Cover } from "@/components/Cover";
import { Modal } from "@/components/Modal";

export function TogetherDialog() {
  const tr = useTr();
  const open = useTogether((state) => state.open);
  const status = useTogether((state) => state.status);
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
  const closeDialog = useTogether((state) => state.closeDialog);
  const setServerUrl = useTogether((state) => state.setServerUrl);
  const setName = useTogether((state) => state.setName);
  const createRoom = useTogether((state) => state.createRoom);
  const joinRoom = useTogether((state) => state.joinRoom);
  const leaveRoom = useTogether((state) => state.leaveRoom);
  const sendChat = useTogether((state) => state.sendChat);

  const tracks = useAppStore((state) => state.tracks);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);

  const connected = status === "connected" && Boolean(roomId);
  const isHost = Boolean(selfId && hostId === selfId);
  const remoteTrack = remote?.track;
  const localTrack = remoteTrack
    ? tracks.find((track) => (remoteTrack.neteaseId && track.neteaseId === remoteTrack.neteaseId) ||
        (track.title === remoteTrack.title && track.artist === remoteTrack.artist))
    : undefined;
  const missing = remoteTrack ? missingKey === remoteTrack.key : false;

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
    const body = message.trim();
    if (!body) return;
    sendChat(body);
    setMessage("");
  };

  return (
    <AnimatePresence>
      {open && (
        <Modal
          onClose={closeDialog}
          className="together-dialog"
          labelledBy="together-title"
        >
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
                      "Playback follows the host. Keep voice chat in QQ, WeChat or Discord.",
                      "播放跟随房主；语音继续用 QQ、微信或 Discord。",
                    )
                  : tr(
                      "Sync playback and chat with a friend. Each side plays its own local copy.",
                      "和朋友同步播放、文字聊天。两边各自播放本地文件。",
                    )}
              </p>
            </div>
            {connected && (
              <div className="together-head__actions">
                <span className={clsxStatus(status)}>
                  <Wifi size={12} />
                  {latency > 0 ? `${latency} ms` : tr("Connected", "已连接")}
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
                  "The relay only carries room state, chat and the playback clock. Audio stays on each device.",
                  "服务器只同步房间状态、聊天和播放时钟；音频不经过服务器。",
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
                          {isHost ? tr("You are hosting", "你是房主") : tr("Following the host", "跟随房主")}
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
                {missing && (
                  <div className="together-missing">
                    {tr(
                      "This song is not in your library. Add the same file before joining playback.",
                      "你的资料库里没有这首歌；加入播放前需要先补上同一份文件。",
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
                    onChange={(event) => setMessage(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        submitChat();
                      }
                    }}
                    placeholder={tr("Message the room…", "发到房间里…")}
                    aria-label={tr("Chat message", "聊天消息")}
                  />
                  <button type="button" className="button button--dark" disabled={!message.trim()} onClick={submitChat}>
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
