import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { Check, Layers3, LoaderCircle, Pencil, Plus, Tag as TagIcon, Trash2, X } from "lucide-react";
import type { Tag, TagKind } from "@/types";
import { useAppStore } from "@/store";
import { useTr } from "@/lib/i18n";
import { isCommitEnter } from "@/lib/keyboard";
import { Modal } from "@/components/Modal";

const palette = ["#c1845f", "#8b9e73", "#7a86b8", "#bd6e82", "#a68a62", "#5f9a9a", "#9b7bb5", "#c48a4b"];

function defaultColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

export function BulkAssignDialog() {
  const tr = useTr();
  const bulk = useAppStore((state) => state.bulkAssign);
  const blocks = useAppStore((state) => state.blocks);
  const genres = useAppStore((state) => state.genres);
  const tracks = useAppStore((state) => state.tracks);
  const bulkUpdate = useAppStore((state) => state.bulkUpdate);
  const setBulkAssign = useAppStore((state) => state.setBulkAssign);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const tags = bulk?.field === "genre" ? genres : blocks;
  useEffect(() => {
    setValue("");
    setBusy(false);
  }, [bulk]);

  const close = () => setBulkAssign(null);
  const apply = async () => {
    if (!bulk || busy) return;
    setBusy(true);
    await bulkUpdate(bulk.trackIds, bulk.field, value.trim());
    setBusy(false);
    close();
  };
  const selectedNames = useMemo(
    () =>
      bulk
        ? tracks
            .filter((track) => bulk.trackIds.includes(track.id))
            .slice(0, 4)
            .map((track) => track.title)
        : [],
    [bulk, tracks],
  );
  const current = tags.find((tag) => tag.name === value);

  return (
    <AnimatePresence>
      {bulk && (
        <Modal onClose={close} className="bulk-dialog" labelledBy="bulk-title">
          <div className="modal__eyebrow">
            <Layers3 size={13} /> {tr("Bulk assign", "批量归类")}
          </div>
          <h2 id="bulk-title">
            {bulk.trackIds.length === 1
              ? tr("Move 1 song", "移动 1 首歌曲")
              : tr("Move {count} songs", "移动 {count} 首歌曲", { count: bulk.trackIds.length })}
          </h2>
          <p className="modal__description">
            {selectedNames.join(" · ")}
            {bulk.trackIds.length > selectedNames.length
              ? tr(" and {count} more", "，另有 {count} 首", {
                  count: bulk.trackIds.length - selectedNames.length,
                })
              : ""}
          </p>
          <label className="bulk-field">
            <span>{bulk.field === "block" ? tr("Block", "区块") : tr("Genre", "流派")}</span>
            <div className="bulk-field__input">
              <span className="bulk-field__dot" style={{ background: current?.color ?? defaultColor(value) }} />
              <input
                className="text-field"
                list="existing-tags"
                value={value}
                placeholder={
                  bulk.field === "block"
                    ? tr("Choose or name a block", "选择或输入区块名称")
                    : tr("Choose or name a genre", "选择或输入流派名称")
                }
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                  if (isCommitEnter(event)) void apply();
                }}
                autoFocus
              />
            </div>
            <datalist id="existing-tags">
              {tags.map((tag) => (
                <option key={tag.name} value={tag.name} />
              ))}
            </datalist>
          </label>
          <div className="bulk-existing">
            {tags.slice(0, 8).map((tag) => (
              <button
                type="button"
                key={tag.name}
                className={clsx("tag-chip", value === tag.name && "is-active")}
                onClick={() => setValue(tag.name)}
              >
                <i style={{ background: tag.color }} />
                {tag.name}
              </button>
            ))}
          </div>
          <p className="modal__hint">
            {bulk.field === "block"
              ? tr("Leave empty to remove the block from these songs.", "留空即可从这些歌曲中移除区块。")
              : tr("Leave empty to remove the genre from these songs.", "留空即可从这些歌曲中移除流派。")}
          </p>
          <div className="modal__actions">
            <button type="button" className="button button--glass" onClick={close}>
              {tr("Cancel", "取消")}
            </button>
            <button type="button" className="button button--dark" disabled={busy} onClick={() => void apply()}>
              {busy ? <LoaderCircle size={15} className="is-spinning" /> : <Check size={15} />}
              {tr("Apply to {count}", "应用到 {count} 首", { count: bulk.trackIds.length })}
            </button>
          </div>
        </Modal>
      )}
    </AnimatePresence>
  );
}

export function TaxonomyManager() {
  const tr = useTr();
  const kind = useAppStore((state) => state.taxonomyManager);
  const setKind = useAppStore((state) => state.setTaxonomyManager);
  const blocks = useAppStore((state) => state.blocks);
  const genres = useAppStore((state) => state.genres);
  const tracks = useAppStore((state) => state.tracks);
  const createTag = useAppStore((state) => state.createTag);
  const renameTag = useAppStore((state) => state.renameTag);
  const deleteTag = useAppStore((state) => state.deleteTag);
  const setTagColor = useAppStore((state) => state.setTagColor);
  const openPrompt = useAppStore((state) => state.openPrompt);
  const [tab, setTab] = useState<TagKind>("block");
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#c1845f");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (kind) setTab(kind);
  }, [kind]);

  const tags = tab === "block" ? blocks : genres;
  const tabEn = tab === "block" ? "block" : "genre";
  const tabZh = tab === "block" ? "区块" : "流派";
  const close = () => setKind(null);

  const add = async () => {
    if (!newName.trim() || busy) return;
    setBusy(true);
    await createTag(tab, newName, newColor);
    setNewName("");
    setNewColor(defaultColor(newName));
    setBusy(false);
  };

  const rename = (tag: Tag) => {
    openPrompt({
      title: tr(`Rename ${tabEn}`, `重命名${tabZh}`),
      initialValue: tag.name,
      confirmLabel: tr("Save name", "保存名称"),
      onSubmit: async (value) => {
        if (value.trim() && value.trim() !== tag.name) await renameTag(tab, tag.name, value.trim());
      },
    });
  };

  const remove = (tag: Tag) => {
    openPrompt({
      title: tr(`Delete “${tag.name}”?`, `删除“${tag.name}”？`),
      description:
        tab === "block"
          ? tr(
              "Songs assigned to this block will keep their files but lose the tag.",
              "分配给此区块的歌曲会保留文件，但会失去标签。",
            )
          : tr(
              "Songs assigned to this genre will keep their files but lose the tag.",
              "分配给此流派的歌曲会保留文件，但会失去标签。",
            ),
      confirmLabel: tr(`Delete ${tabEn}`, `删除${tabZh}`),
      input: false,
      destructive: true,
      onSubmit: async () => {
        await deleteTag(tab, tag.name);
      },
    });
  };

  const count = (tag: Tag) =>
    tracks.filter((track) => (tab === "block" ? track.block : track.genre) === tag.name).length;

  return (
    <AnimatePresence>
      {kind && (
        <Modal onClose={close} className="taxonomy-dialog" labelledBy="taxonomy-title">
          <div className="settings-head">
            <div>
              <span className="modal__eyebrow">
                <Layers3 size={13} /> {tr("Collection system", "分类体系")}
              </span>
              <h2 id="taxonomy-title">{tr("Blocks & genres", "区块与流派")}</h2>
            </div>
            <button type="button" className="icon-button icon-button--ghost icon-button--sm" onClick={close} aria-label={tr("Close", "关闭")}>
              <X size={18} />
            </button>
          </div>

          <div className="taxonomy-tabs">
            <button type="button" className={clsx(tab === "block" && "is-active")} onClick={() => setTab("block")}>
              <Layers3 size={14} /> {tr("Blocks", "区块")} <em>{blocks.length}</em>
            </button>
            <button type="button" className={clsx(tab === "genre" && "is-active")} onClick={() => setTab("genre")}>
              <TagIcon size={14} /> {tr("Genres", "流派")} <em>{genres.length}</em>
            </button>
          </div>

          <div className="taxonomy-add">
            <label className="taxonomy-color" style={{ background: newColor }}>
              <input
                type="color"
                value={newColor}
                aria-label={tr("New tag colour", "新标签颜色")}
                onChange={(event) => setNewColor(event.target.value)}
              />
            </label>
            <input
              className="text-field"
              value={newName}
              placeholder={tr(`New ${tabEn} name`, `新${tabZh}名称`)}
              onChange={(event) => {
                setNewName(event.target.value);
                setNewColor(defaultColor(event.target.value));
              }}
              onKeyDown={(event) => {
                if (isCommitEnter(event)) void add();
              }}
            />
            <button type="button" className="button button--dark" disabled={!newName.trim() || busy} onClick={() => void add()}>
              <Plus size={14} /> {tr("Add", "添加")}
            </button>
          </div>

          <div className="taxonomy-list">
            {tags.map((tag) => (
              <motion.div layout key={tag.name} className="taxonomy-row">
                <label className="taxonomy-color" style={{ background: tag.color }}>
                  <input
                    type="color"
                    value={tag.color}
                    aria-label={tr("{name} colour", "{name} 颜色", { name: tag.name })}
                    onChange={(event) => void setTagColor(tab, tag.name, event.target.value)}
                  />
                </label>
                <span className="taxonomy-row__name">{tag.name}</span>
                <span className="taxonomy-row__count">
                  {count(tag) === 1
                    ? tr("1 song", "1 首歌曲")
                    : tr("{count} songs", "{count} 首歌曲", { count: count(tag) })}
                </span>
                <button
                  type="button"
                  className="icon-button icon-button--ghost icon-button--sm"
                  onClick={() => rename(tag)}
                  title={tr("Rename", "重命名")}
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  className="icon-button icon-button--ghost icon-button--sm danger-hover"
                  onClick={() => remove(tag)}
                  title={tr("Delete", "删除")}
                >
                  <Trash2 size={14} />
                </button>
              </motion.div>
            ))}
            {!tags.length && (
              <p className="taxonomy-empty">
                {tab === "block"
                  ? tr("No blocks yet. Add one above.", "还没有区块，在上方添加一个。")
                  : tr("No genres yet. Add one above.", "还没有流派，在上方添加一个。")}
              </p>
            )}
          </div>

          <div className="modal__actions">
            <button type="button" className="button button--glass" onClick={close}>
              {tr("Done", "完成")}
            </button>
          </div>
        </Modal>
      )}
    </AnimatePresence>
  );
}
