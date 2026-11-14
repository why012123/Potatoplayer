import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, CheckCircle2, Cloud, Layers3, Link2, ListMusic, LoaderCircle, Pencil, Plus, RefreshCw, Tag, Unlink, X } from "lucide-react";
import { SyncSelect } from "@/components/SyncSelect";
import { PageHeader, SectionHeader } from "@/components/Headers";
import { useAppStore } from "@/store";
import { useTr } from "@/lib/i18n";
import type { NeteasePlaylist, NeteaseStatus, PlaylistSyncBinding, PlaylistSyncState, SyncDirection, SyncStrategy } from "@/types";

type Draft = Pick<PlaylistSyncBinding, "kind" | "target" | "cloudId" | "direction" | "strategy"> & { id?: string };
const fresh = (): Draft => ({ kind: "playlist", target: "", cloudId: "", direction: "both", strategy: "add" });
const rpc = <T,>(method: string, params?: Record<string, unknown>) => window.potato.invoke<T>(method, params);

export function SyncPage() {
  const tr = useTr();
  const playlists = useAppStore(s => s.playlists);
  const blocks = useAppStore(s => s.blocks);
  const genres = useAppStore(s => s.genres);
  const navigate = useAppStore(s => s.navigate);
  const setOnlineSource = useAppStore(s => s.setOnlineSource);
  const language = useAppStore(s => s.appearance.language);
  const [state, setState] = useState<PlaylistSyncState>({ bindings: [], error: "" });
  const [account, setAccount] = useState<NeteaseStatus | null>(null);
  const [cloud, setCloud] = useState<NeteasePlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [unlink, setUnlink] = useState<string | null>(null);
  const editor = useRef<HTMLFormElement>(null);
  const version = useRef(0);
  const eventRevision = useRef(0);
  const directions: { value: SyncDirection; label: string; detail: string; icon: typeof Cloud }[] = [
    { value: "push", label: tr("Local → cloud", "本地 → 云端"), detail: tr("Send local changes", "将本地修改同步到网易云"), icon: ArrowUpFromLine },
    { value: "pull", label: tr("Cloud → local", "云端 → 本地"), detail: tr("Receive cloud changes", "将网易云修改同步到本地"), icon: ArrowDownToLine },
    { value: "both", label: tr("Two-way", "双向"), detail: tr("Keep both sides in sync", "两端的修改相互同步"), icon: ArrowLeftRight },
  ];
  const strategyLabel = (value: SyncStrategy) => value === "add" ? tr("Add only", "仅添加") : tr("Full sync · replace", "完全同步（替换）");
  const kindLabel = (kind: Draft["kind"]) => kind === "playlist" ? tr("Playlist", "歌单") : kind === "block" ? tr("Block", "区块") : tr("Genre", "流派");
  const localName = (b: PlaylistSyncBinding) => b.kind === "playlist" ? playlists.find(p => p.id === b.target)?.name ?? tr("Deleted playlist", "已删除的歌单") : b.target;
  const discover = () => { setOnlineSource("netease"); navigate({ kind: "discover" }); };

  const refresh = useCallback(async () => {
    const request = ++version.current;
    const revision = eventRevision.current;
    setLoading(true); setError("");
    const results = await Promise.allSettled([rpc<PlaylistSyncState>("sync.list"), rpc<NeteaseStatus>("netease.status")]);
    if (request !== version.current) return;
    if (results[0].status === "fulfilled") {
      if (revision === eventRevision.current) setState(results[0].value);
    } else setError(String(results[0].reason));
    if (results[1].status === "fulfilled") {
      setAccount(results[1].value);
      if (results[1].value.loggedIn) {
        try {
          const lists = await rpc<NeteasePlaylist[]>("netease.playlists");
          if (request === version.current) setCloud(lists);
        } catch (e) { if (request === version.current) setError(String(e)); }
      } else setCloud([]);
    } else { setAccount(null); setError(String(results[1].reason)); }
    if (request === version.current) setLoading(false);
  }, []);
  useEffect(() => {
    void refresh();
    const off = window.potato.onEvent(event => {
      if (event.event === "sync.updated") { eventRevision.current++; setState(event.data as PlaylistSyncState); }
    });
    return () => { version.current++; off(); };
  }, [refresh]);
  useEffect(() => {
    if (draft) editor.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [draft?.id, !!draft]);

  const action = async (work: () => Promise<unknown>) => {
    setBusy(true); setError("");
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const localOptions = !draft ? [] : draft.kind === "playlist" ? playlists.map(p => ({ value: p.id, label: p.name }))
    : (draft.kind === "block" ? blocks : genres).map(t => ({ value: t.name, label: t.name }));
  const selectedCloud = cloud.find(p => p.id === draft?.cloudId);
  const writable = selectedCloud?.owned === true;
  const syncing = state.bindings.some(b => b.status === "syncing");

  return <div className="page sync-page">
    <PageHeader eyebrow={tr("ONLINE · NETEASE", "在线 · NETEASE")} title={tr("Sync", "同步")}
      description={tr("Your playlists, connected. Let your music move with you.", "让云端歌单与你的本地收藏保持一致。")}
      actions={<>
        <button className="button button--glass" disabled={loading || busy} onClick={() => void refresh()} aria-label={tr("Refresh playlists", "刷新歌单")}><RefreshCw size={15} />{tr("Refresh", "刷新")}</button>
        <button className="button button--dark" disabled={!account?.loggedIn || loading || busy} onClick={() => setDraft(fresh())}><Plus size={16} />{tr("New binding", "新建绑定")}</button>
      </>} />

    <section className="sync-account glass">
      <span className="sync-symbol"><Cloud size={22} /></span>
      <div className="sync-account__copy"><strong>{tr("NetEase Cloud Music", "网易云音乐")}</strong>
        <p>{loading ? tr("Loading playlists…", "正在读取歌单…") : account?.loggedIn
          ? tr("Connected as {name} · checks cloud changes at startup or when you sync manually", "已连接 {name} · 启动时或手动同步时检查云端变化", { name: account.nickname || "NetEase" })
          : tr("Connect your account in Discover to start syncing.", "先在发现页面连接网易云账号，即可开始同步。")}</p></div>
      <button className="button button--glass button--small" onClick={discover}>{account?.loggedIn ? tr("Account", "账号管理") : tr("Connect", "前往连接")}</button>
    </section>
    {(error || state.error) && <p className="online-error" role="alert">{error || state.error}</p>}

    {draft && <form ref={editor} className="sync-editor glass" onSubmit={event => {
      event.preventDefault();
      void action(async () => { await rpc<PlaylistSyncState>("sync.save", draft); setDraft(null); });
    }}>
      <SectionHeader title={draft.id ? tr("Edit binding", "编辑绑定") : tr("Connect a playlist", "连接你的歌单")}
        action={<button type="button" className="button button--glass button--small" disabled={busy} aria-label={tr("Close editor", "关闭编辑")} onClick={() => setDraft(null)}><X size={16} /></button>} />
      <div className="sync-fields">
        <SyncSelect label={tr("Cloud playlist", "云端歌单")} value={draft.cloudId} icon={Cloud}
          placeholder={tr("Choose a NetEase playlist", "选择网易云歌单")} disabled={busy || loading}
          options={cloud.map(p => ({ value: p.id, label: p.name, detail: `${p.trackCount} ${tr("songs", "首")}${p.owned ? "" : tr(" · subscribed", " · 收藏")}` }))}
          onChange={value => { const item = cloud.find(p => p.id === value); setDraft({ ...draft, cloudId: value, direction: item?.owned ? draft.direction : "pull" }); }} />
        <div className="sync-local-fields">
          <SyncSelect label={tr("Local type", "本地类型")} value={draft.kind} icon={draft.kind === "playlist" ? ListMusic : draft.kind === "block" ? Layers3 : Tag}
            placeholder="" disabled={busy} searchable={false}
            options={(["playlist", "block", "genre"] as const).map(kind => ({ value: kind, label: kindLabel(kind) }))}
            onChange={kind => setDraft({ ...draft, kind: kind as Draft["kind"], target: "" })} />
          <SyncSelect label={tr("Local destination", "本地绑定目标")} value={draft.target} icon={Link2}
            placeholder={localOptions.length ? tr("Choose a destination", "选择本地目标") : tr("Create one in the library first", "请先在资料库中创建")}
            disabled={busy} options={localOptions} onChange={target => setDraft({ ...draft, target })} />
        </div>
      </div>
      <fieldset className="sync-choices"><legend>{tr("Transfer direction", "传输方向")}</legend>
        <div className="sync-choice-grid">{directions.map(({ value, label, detail, icon: Icon }) => <label key={value} className={`sync-choice ${draft.direction === value ? "is-active" : ""}`}>
          <input type="radio" name="direction" value={value} checked={draft.direction === value} disabled={busy || (value !== "pull" && !writable)} onChange={() => setDraft({ ...draft, direction: value })} />
          <Icon size={18} /><strong>{label}</strong><span>{detail}</span>
        </label>)}</div>
      </fieldset>
      <fieldset className="sync-choices"><legend>{tr("Transfer strategy", "传输策略")}</legend>
        <div className="sync-choice-grid sync-choice-grid--two">{(["replace", "add"] as const).map(value => <label key={value} className={`sync-choice ${draft.strategy === value ? "is-active" : ""}`}>
          <input type="radio" name="strategy" value={value} checked={draft.strategy === value} disabled={busy} onChange={() => setDraft({ ...draft, strategy: value })} />
          <strong>{strategyLabel(value)}</strong><span>{value === "add" ? tr("Keep existing songs and add missing ones.", "保留已有歌曲，只补充缺少的歌曲。") : tr("Propagate removals as well as additions.", "同步新增与移除，使歌曲列表保持一致。")}</span>
        </label>)}</div>
      </fieldset>
      <p className="sync-note">{draft.strategy === "replace" ? draft.direction === "both"
        ? tr("First sync merges both lists. Later, a deletion on either side removes the song from both; local ordering wins if both reorder. Changing direction or strategy starts a new baseline.", "首次双向同步合并两端歌曲；之后任意一端移除歌曲，两端都会移除。两端同时调整顺序时以本地为准。更改方向或策略会重新建立基准。")
        : tr("The destination's membership will be replaced by the source, including an empty source. Audio files are kept.", "目标端的歌曲列表会被来源端替换，空列表也会同步。仅移除歌单或分类关系，不删除音频文件。")
        : tr("Removals are never propagated. Two-way sync may restore a song removed from only one side.", "不会传播删除操作；双向同步时，仅在一端移除的歌曲会被另一端补回。")}</p>
      {!writable && draft.cloudId && <p className="sync-note">{tr("Subscribed playlists support cloud → local only.", "收藏的云端歌单仅支持云端 → 本地。")}</p>}
      <div className="sync-editor__footer"><span>{tr("Binding starts sync automatically.", "保存绑定后将自动开始同步。")}</span>
        <button type="button" className="button button--glass" disabled={busy} onClick={() => setDraft(null)}>{tr("Cancel", "取消")}</button>
        <button type="submit" className="button button--dark" disabled={busy || !draft.target || !draft.cloudId || !account?.loggedIn || (!writable && draft.direction !== "pull")}>{busy ? <LoaderCircle size={15} className="sync-spin" /> : <Link2 size={15} />}{tr("Save binding", "保存绑定")}</button></div>
    </form>}

    <SectionHeader title={tr("Your bindings", "我的绑定")} meta={tr("{count} connected", "{count} 个连接", { count: state.bindings.length })}
      action={state.bindings.length > 0 && <button className="button button--glass button--small" disabled={busy || syncing || !account?.loggedIn} onClick={() => void action(() => rpc("sync.run"))}><RefreshCw size={14} />{tr("Sync all", "全部同步")}</button>} />
    {!state.bindings.length ? <div className="empty-stage glass empty-stage--compact sync-empty"><Link2 size={30} /><h2>{tr("Bring your playlists together.", "把喜欢的音乐连在一起。")}</h2><p>{tr("Bind a NetEase playlist to a local playlist, block or genre.", "将网易云歌单绑定到本地歌单、区块或流派。")}</p>
      <button className="button button--glass" disabled={loading || busy} onClick={() => account?.loggedIn ? setDraft(fresh()) : discover()}><Plus size={15} />{account?.loggedIn ? tr("Create your first binding", "创建第一个绑定") : tr("Connect NetEase", "连接网易云")}</button></div>
      : <div className="sync-bindings">{state.bindings.map(b => {
        const Icon = b.kind === "playlist" ? ListMusic : b.kind === "block" ? Layers3 : Tag;
        const Direction = directions.find(d => d.value === b.direction)!.icon;
        return <article key={b.id} className="sync-card glass">
          <div className="sync-card__connection"><div className="sync-endpoint"><span className="sync-symbol"><Icon size={21} /></span><div><span>{kindLabel(b.kind)}</span><strong>{localName(b)}</strong></div></div>
            <Direction size={20} className="sync-card__direction" aria-label={directions.find(d => d.value === b.direction)!.label} />
            <div className="sync-endpoint"><span className="sync-symbol"><Cloud size={21} /></span><div><span>NETEASE</span><strong>{b.cloudName}</strong></div></div></div>
          <div className="sync-card__meta"><span>{directions.find(d => d.value === b.direction)!.label}</span><span>{strategyLabel(b.strategy)}</span>
            <span>{b.lastSyncedAt ? tr("Last synced {time}", "上次同步 {time}", { time: new Date(b.lastSyncedAt).toLocaleString(language === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) }) : tr("Not synced yet", "尚未完成同步")}</span></div>
          <div className="sync-card__footer"><p className={`sync-status sync-status--${b.status}`} role="status">
            {b.status === "syncing" || b.status === "waiting" ? <LoaderCircle size={14} className="sync-spin" /> : b.status === "success" ? <CheckCircle2 size={14} /> : <span className="sync-status__dot" />}{b.message || tr("Waiting to sync", "等待同步")}</p>
            <div className="sync-card__actions">
              <button className="button button--glass button--small" disabled={busy || b.status === "syncing" || !account?.loggedIn} onClick={() => void action(() => rpc("sync.run", { id: b.id }))}><RefreshCw size={13} />{tr("Sync now", "立即同步")}</button>
              <button className="button button--glass button--small" disabled={busy || b.status === "syncing" || !account?.loggedIn} aria-label={tr("Edit {name}", "编辑 {name}", { name: b.cloudName })} onClick={() => setDraft({ id: b.id, kind: b.kind, target: b.target, cloudId: b.cloudId, direction: b.direction, strategy: b.strategy })}><Pencil size={13} /></button>
              <button className="button button--glass button--small" disabled={busy || b.status === "syncing"} onClick={() => setUnlink(b.id)}><Unlink size={13} />{tr("Unbind", "解绑")}</button>
            </div></div>
          {!!b.skipped?.length && <details className="sync-skipped" open>
            <summary>{tr("Skipped {count} songs without a NetEase ID", "已自动跳过 {count} 首未绑定网易云 ID 的歌曲", { count: b.skipped.length })}</summary>
            <p>{tr("These songs stay in your local collection. Other songs sync normally.", "这些歌曲保留在本地，其他歌曲正常同步。")}</p>
            <ul>{b.skipped.map(song => <li key={song.id}><span><strong>{song.title}</strong>{song.artist && <small>{song.artist}</small>}</span>
              <button type="button" className="button button--glass button--small" onClick={() => navigate({ kind: "editor", trackId: song.id })}>
                <Pencil size={12} />{tr("Bind ID", "绑定 ID")}</button></li>)}</ul>
          </details>}
          {unlink === b.id && <div className="sync-unlink"><p>{tr("Unbind this connection? Both playlists and downloaded files will be kept.", "解除此绑定？两端歌单和已下载的文件都会保留。")}</p><button className="button button--glass button--small" disabled={busy} onClick={() => setUnlink(null)}>{tr("Cancel", "取消")}</button><button className="button button--dark button--small" disabled={busy} onClick={() => void action(async () => { await rpc<PlaylistSyncState>("sync.unbind", { id: b.id }); setUnlink(null); })}>{tr("Confirm unbind", "确认解绑")}</button></div>}
        </article>;
      })}</div>}
    <p className="sync-footnote">{tr("Local edits sync automatically. Missing cloud songs download through your existing queue. Songs without a NetEase ID are listed and skipped automatically, while staying in your local collection. Sync changes membership, not titles, ratings or notes. Each block/genre song belongs to one category; syncing may move it. Unbinding keeps both sides intact.", "本地修改会自动同步；缺少的云端歌曲通过现有队列下载入库。缺少网易云 ID 的歌曲会列出名称并自动跳过，保留在本地。同步歌曲成员，不改动名称、评分与笔记。每首歌曲只有一个区块和流派，云端同步可能调整其分类。解绑会保留两端内容。")}</p>
  </div>;
}
