import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { LoaderCircle, MessageCircle, RefreshCw, X } from "lucide-react";
import type { NeteaseComment, NeteaseCommentPage, NeteaseSong } from "@/types";
import { useTr } from "@/lib/i18n";
import { onlineImageUrl } from "@/lib/covers";
import { Modal } from "@/components/Modal";

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

export function NeteaseCommentsDialog({ song, onClose }: { song: NeteaseSong; onClose: () => void }) {
  const tr = useTr();
  const [page, setPage] = useState<NeteaseCommentPage | null>(null);
  const [latest, setLatest] = useState<NeteaseComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (offset: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const next = await window.potato.invoke<NeteaseCommentPage>("netease.comments", {
          id: song.id,
          limit: 30,
          offset,
        });
        setPage(next);
        setLatest((current) => {
          if (!append) return next.comments;
          const seen = new Set(current.map((item) => item.id));
          return [...current, ...next.comments.filter((item) => !seen.has(item.id))];
        });
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [song.id],
  );

  useEffect(() => {
    setPage(null);
    setLatest([]);
    void load(0, false);
  }, [load]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const hot = page?.hot ?? [];
  const hotIds = useMemo(() => new Set(hot.map((item) => item.id)), [hot]);
  const newest = latest.filter((item) => !hotIds.has(item.id));
  const hasMore = Boolean(page?.more);

  return createPortal(
    <Modal className="comments-dialog" onClose={onClose} labelledBy="comments-title">
      <header className="comments-dialog__head">
        <div className="comments-dialog__art">
          {song.coverUrl ? (
            <img src={onlineImageUrl(song.coverUrl) ?? ""} alt="" loading="lazy" referrerPolicy="no-referrer" />
          ) : (
            <MessageCircle size={20} />
          )}
        </div>
        <div className="comments-dialog__copy">
          <span className="eyebrow">{tr("NetEase comments", "网易云评论")}</span>
          <h2 id="comments-title">{song.name}</h2>
          <p>
            {song.artists}
            {page ? ` · ${tr("{count} comments", "{count} 条评论", { count: page.total })}` : ""}
          </p>
        </div>
        <button type="button" className="icon-button icon-button--ghost icon-button--sm" aria-label={tr("Close comments", "关闭评论")} onClick={onClose}>
          <X size={16} />
        </button>
      </header>

      <div className="comments-dialog__body">
        {loading ? (
          <div className="comments-state">
            <LoaderCircle size={18} className="is-spinning" /> {tr("Loading comments…", "正在加载评论…")}
          </div>
        ) : error ? (
          <div className="comments-state comments-state--error">
            <span>{error}</span>
            <button type="button" className="button button--glass button--small" onClick={() => void load(0, false)}>
              <RefreshCw size={13} /> {tr("Try again", "重试")}
            </button>
          </div>
        ) : !page || (!hot.length && !newest.length) ? (
          <div className="comments-state">
            <MessageCircle size={18} /> {tr("No comments yet.", "还没有评论。")}
          </div>
        ) : (
          <>
            {hot.length > 0 ? (
              <section className="comments-section">
                <h3>{tr("Most liked", "最热评论")}</h3>
                {hot.map((comment) => <CommentItem key={comment.id} comment={comment} />)}
              </section>
            ) : null}
            {newest.length > 0 ? (
              <section className="comments-section">
                <h3>{tr("Latest", "最新评论")}</h3>
                {newest.map((comment) => <CommentItem key={comment.id} comment={comment} />)}
              </section>
            ) : null}
            {hasMore ? (
              <button
                type="button"
                className="button button--glass comments-more"
                disabled={loadingMore}
                onClick={() => void load(latest.length, true)}
              >
                {loadingMore ? <LoaderCircle size={14} className="is-spinning" /> : null}
                {loadingMore ? tr("Loading…", "加载中…") : tr("Load more comments", "加载更多评论")}
              </button>
            ) : null}
          </>
        )}
      </div>
    </Modal>,
    document.body,
  );
}
