import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link2, LoaderCircle, MessageCircle, RefreshCw, Sparkles } from "lucide-react";
import type { NeteaseComment, Track, TrackCommentsPage } from "@/types";
import { useAppStore } from "@/store";
import { useTr } from "@/lib/i18n";
import { onlineImageUrl } from "@/lib/covers";
import { Cover } from "@/components/Cover";

function initials(value: string): string {
  const clean = value.trim();
  if (!clean) return "?";
  const parts = clean.split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : clean.slice(0, 2)).toUpperCase();
}

function formatDate(value: number): string {
  if (!value) return "";
  try {
    return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function CommentAvatar({ comment }: { comment: NeteaseComment }) {
  const avatar = onlineImageUrl(comment.avatarUrl);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [avatar]);
  return (
    <div className="comment-item__avatar">
      {avatar && !failed ? (
        <img src={avatar} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        <span>{initials(comment.user)}</span>
      )}
    </div>
  );
}

function CommentItem({ comment }: { comment: NeteaseComment }) {
  return (
    <article className="comment-item">
      <CommentAvatar comment={comment} />
      <div className="comment-item__body">
        <div className="comment-item__head">
          <strong>{comment.user || "—"}</strong>
          <span>{formatDate(comment.time)}</span>
          {comment.location ? <em>{comment.location}</em> : null}
        </div>
        {comment.replyTo ? <p className="comment-item__reply">↳ {comment.replyTo}</p> : null}
        <p className="comment-item__text">{comment.content}</p>
        {comment.liked > 0 ? (
          <span className="comment-item__liked">♥ {comment.liked.toLocaleString()}</span>
        ) : null}
      </div>
    </article>
  );
}

function sourceLabel(source: string): string {
  if (source === "qq") return "QQ Music";
  if (source === "netease") return "NetEase";
  return "";
}

export function CommentsPage() {
  const tr = useTr();
  const tracks = useAppStore((state) => state.tracks);
  const playback = useAppStore((state) => state.playback);
  const previewTrackId = useAppStore((state) => state.previewTrackId);
  const navigate = useAppStore((state) => state.navigate);
  const track = useMemo(
    () => tracks.find((item) => item.id === (playback?.trackId ?? previewTrackId)) ?? null,
    [tracks, playback?.trackId, previewTrackId],
  );
  const [page, setPage] = useState<TrackCommentsPage | null>(null);
  const [latest, setLatest] = useState<NeteaseComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);

  const bound = Boolean(track?.neteaseId || track?.qqId);
  const source = track?.neteaseId ? "netease" : track?.qqId ? "qq" : "";
  const sourceId = track?.neteaseId || track?.qqId || "";

  const load = useCallback(
    async (offset: number, append: boolean) => {
      if (!track || !bound) return;
      const id = ++sequence.current;
      if (append) setMoreLoading(true);
      else setLoading(true);
      setError(null);
      try {
        const next = await window.potato.invoke<TrackCommentsPage>("comments.forTrack", {
          trackId: track.id,
          limit: 30,
          offset,
        });
        if (id !== sequence.current) return;
        setPage(next);
        setLatest((current) => {
          if (!append) return next.comments;
          const seen = new Set(current.map((comment) => comment.id));
          return [...current, ...next.comments.filter((comment) => !seen.has(comment.id))];
        });
      } catch (reason) {
        if (id !== sequence.current) return;
        setError((reason instanceof Error ? reason.message : String(reason)).replace(/^Error:\s*/, ""));
      } finally {
        if (id === sequence.current) {
          setLoading(false);
          setMoreLoading(false);
        }
      }
    },
    [bound, track],
  );

  useEffect(() => {
    sequence.current += 1;
    setPage(null);
    setLatest([]);
    setError(null);
    if (track && bound) void load(0, false);
  }, [track?.id, track?.neteaseId, track?.qqId, bound, load]);

  const goToEditor = () => {
    if (!track) return;
    navigate({ kind: "editor", trackId: track.id });
  };

  if (!track) {
    return (
      <div className="page page--comments">
        <div className="empty-stage glass empty-stage--compact">
          <div className="empty-stage__icon empty-stage__icon--plain"><MessageCircle size={28} /></div>
          <h2>{tr("Nothing is playing yet.", "还没有正在播放的歌曲。")}</h2>
          <p>{tr("Play a song first, then open Comments to read its online thread.", "先播放一首歌，再打开评论查看它的在线讨论。")}</p>
        </div>
      </div>
    );
  }

  const hot = page?.hot ?? [];
  const hotIds = new Set(hot.map((comment) => comment.id));
  const newest = latest.filter((comment) => !hotIds.has(comment.id));
  const hasMore = Boolean(page?.more);

  return (
    <div className="page page--comments">
      <header className="comments-hero glass">
        <div className="comments-hero__cover">
          <Cover path={track.coverPath} seed={track.id} label={track.title} radius={12} eager />
        </div>
        <div className="comments-hero__copy">
          <span className="eyebrow"><MessageCircle size={12} /> {tr("Comments", "评论")}</span>
          <h1>{track.title}</h1>
          <p>{track.artist}{track.album ? ` · ${track.album}` : ""}</p>
          <div className="comments-hero__meta">
            {bound ? (
              <span className="comments-source"><Sparkles size={12} /> {sourceLabel(source)} · {sourceId}</span>
            ) : (
              <span className="comments-source comments-source--empty">{tr("No online identity linked", "未绑定在线身份")}</span>
            )}
            {page && bound ? (
              <em>{tr("{count} comments", "{count} 条评论", { count: page.total })}</em>
            ) : null}
          </div>
        </div>
        <div className="comments-hero__actions">
          {bound ? (
            <button type="button" className="button button--glass button--small" onClick={() => void load(0, false)} disabled={loading}>
              {loading ? <LoaderCircle size={14} className="is-spinning" /> : <RefreshCw size={14} />}
              {tr("Refresh", "刷新")}
            </button>
          ) : (
            <button type="button" className="button button--dark button--small" onClick={goToEditor}>
              <Link2 size={14} /> {tr("Link a source", "绑定来源")}
            </button>
          )}
        </div>
      </header>

      {!bound ? (
        <div className="empty-stage glass empty-stage--compact">
          <div className="empty-stage__icon empty-stage__icon--plain"><Link2 size={26} /></div>
          <h2>{tr("This song isn't linked yet.", "这首歌还没有绑定在线身份。")}</h2>
          <p>
            {tr(
              "Open the song editor and add a NetEase ID or QQ Music MID to read its comments here.",
              "打开歌曲编辑，填入网易云 ID 或 QQ 音乐 MID，就可以在这里查看评论。",
            )}
          </p>
          <button type="button" className="button button--dark" onClick={goToEditor}>
            <Link2 size={15} /> {tr("Open song editor", "打开歌曲编辑")}
          </button>
        </div>
      ) : loading && !page ? (
        <div className="online-loading glass"><LoaderCircle size={19} className="is-spinning" /> {tr("Loading comments…", "正在加载评论…")}</div>
      ) : error ? (
        <div className="comments-page glass">
          <div className="comments-state comments-state--error">
            <span>{error}</span>
            <button type="button" className="button button--glass button--small" onClick={() => void load(0, false)}>
              <RefreshCw size={13} /> {tr("Try again", "重试")}
            </button>
          </div>
        </div>
      ) : !page || (!hot.length && !newest.length) ? (
        <div className="comments-page glass">
          <div className="comments-state"><MessageCircle size={18} /> {tr("No comments yet.", "还没有评论。")}</div>
        </div>
      ) : (
        <section className="comments-page glass">
          {hot.length > 0 ? (
            <div className="comments-section">
              <h3>{tr("Most liked", "最热评论")}</h3>
              {hot.map((comment) => <CommentItem key={comment.id} comment={comment} />)}
            </div>
          ) : null}
          {newest.length > 0 ? (
            <div className="comments-section">
              <h3>{tr("Latest", "最新评论")}</h3>
              {newest.map((comment) => <CommentItem key={comment.id} comment={comment} />)}
            </div>
          ) : null}
          {hasMore ? (
            <button
              type="button"
              className="button button--glass comments-more"
              disabled={moreLoading}
              onClick={() => void load(latest.length, true)}
            >
              {moreLoading ? <LoaderCircle size={14} className="is-spinning" /> : null}
              {moreLoading ? tr("Loading…", "加载中…") : tr("Load more comments", "加载更多评论")}
            </button>
          ) : null}
        </section>
      )}
    </div>
  );
}
