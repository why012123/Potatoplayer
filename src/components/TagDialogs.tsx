import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import {
  Check,
  Layers3,
  LoaderCircle,
  Pencil,
  Plus,
  Tag as TagIcon,
  Trash2,
  X,
} from "lucide-react";
import type { Tag, TagKind } from "@/types";
import { useAppStore } from "@/store";
import { Modal } from "@/components/Modal";
import { Cover } from "@/components/Cover";

const palette = ["#c1845f", "#8b9e73", "#7a86b8", "#bd6e82", "#a68a62", "#5f9a9a", "#9b7bb5", "#c48a4b"];

function defaultColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

export function EditTrackDialog() {
  const trackId = useAppStore((state) => state.editTrackId);
  const tracks = useAppStore((state) => state.tracks);
  const blocks = useAppStore((state) => state.blocks);
  const genres = useAppStore((state) => state.genres);
  const updateTrack = useAppStore((state) => state.updateTrack);
  const setEditTrackId = useAppStore((state) => state.setEditTrackId);
  const setTaxonomyManager = useAppStore((state) => state.setTaxonomyManager);
  const track = tracks.find((item) => item.id === trackId);
  const [block, setBlock] = useState("");
  const [genre, setGenre] = useState("");
  const [rating, setRating] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!track) return;
    setBlock(track.block ?? "");
    setGenre(track.genre ?? "");
    setRating(track.rating ?? 0);
    setBusy(false);
  }, [track]);

  const close = () => setEditTrackId(null);
  const save = async () => {
    if (!track || busy) return;
    setBusy(true);
    await updateTrack(track.id, { block, genre, rating });
    setBusy(false);
    close();
  };

  return (
    <AnimatePresence>
      {track && (
        <Modal onClose={close} className="tag-dialog" labelledBy="edit-track-title">
          <div className="tag-dialog__head">
            <div className="tag-dialog__track">
              <Cover path={track.coverPath} seed={track.id} label={track.title} radius={12} />
              <div>
                <span className="modal__eyebrow">Edit song</span>
                <h2 id="edit-track-title">{track.title}</h2>
                <p>{track.artist}</p>
              </div>
            </div>
            <button type="button" className="icon-button icon-button--ghost icon-button--sm" onClick={close} aria-label="Close">
              <X size={17} />
            </button>
          </div>

          <div className="tag-edit-grid">
            <label>
              <span>
                <Layers3 size={13} /> Block
              </span>
              <select className="text-field" value={block} onChange={(event) => setBlock(event.target.value)}>
                <option value="">No block</option>
                {blocks.map((tag) => (
                  <option key={tag.name} value={tag.name}>
                    {tag.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>
                <TagIcon size={13} /> Genre
              </span>
              <select className="text-field" value={genre} onChange={(event) => setGenre(event.target.value)}>
                <option value="">No genre</option>
                {genres.map((tag) => (
                  <option key={tag.name} value={tag.name}>
                    {tag.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="rating-editor">
            <div>
              <span>Personal rating</span>
              <strong>{rating.toFixed(1)}</strong>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              step={0.1}
              value={rating}
              onChange={(event) => setRating(Number(event.target.value))}
              aria-label="Rating"
            />
          </div>

          <div className="tag-dialog__links">
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setEditTrackId(null);
                setTaxonomyManager("block");
              }}
            >
              <Plus size={12} /> Manage blocks
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setEditTrackId(null);
                setTaxonomyManager("genre");
              }}
            >
              <Plus size={12} /> Manage genres
            </button>
          </div>

          <div className="modal__actions">
            <button type="button" className="button button--glass" onClick={close}>
              Cancel
            </button>
            <button type="button" className="button button--dark" disabled={busy} onClick={() => void save()}>
              {busy ? <LoaderCircle size={15} className="is-spinning" /> : <Check size={15} />}
              Save song
            </button>
          </div>
        </Modal>
      )}
    </AnimatePresence>
  );
}

export function BulkAssignDialog() {
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
            <Layers3 size={13} /> Bulk assign
          </div>
          <h2 id="bulk-title">Move {bulk.trackIds.length} songs</h2>
          <p className="modal__description">
            {selectedNames.join(" · ")}
            {bulk.trackIds.length > selectedNames.length ? ` and ${bulk.trackIds.length - selectedNames.length} more` : ""}
          </p>
          <label className="bulk-field">
            <span>{bulk.field === "block" ? "Block" : "Genre"}</span>
            <div className="bulk-field__input">
              <span className="bulk-field__dot" style={{ background: current?.color ?? defaultColor(value) }} />
              <input
                className="text-field"
                list="existing-tags"
                value={value}
                placeholder={bulk.field === "block" ? "Choose or name a block" : "Choose or name a genre"}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void apply();
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
          <p className="modal__hint">Leave empty to remove the {bulk.field} from these songs.</p>
          <div className="modal__actions">
            <button type="button" className="button button--glass" onClick={close}>
              Cancel
            </button>
            <button type="button" className="button button--dark" disabled={busy} onClick={() => void apply()}>
              {busy ? <LoaderCircle size={15} className="is-spinning" /> : <Check size={15} />}
              Apply to {bulk.trackIds.length}
            </button>
          </div>
        </Modal>
      )}
    </AnimatePresence>
  );
}

export function TaxonomyManager() {
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
      title: `Rename ${tab}`,
      initialValue: tag.name,
      confirmLabel: "Save name",
      onSubmit: async (value) => {
        if (value.trim() && value.trim() !== tag.name) await renameTag(tab, tag.name, value.trim());
      },
    });
  };

  const remove = (tag: Tag) => {
    openPrompt({
      title: `Delete “${tag.name}”?`,
      description: `Songs assigned to this ${tab} will keep their files but lose the tag.`,
      confirmLabel: `Delete ${tab}`,
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
                <Layers3 size={13} /> Collection system
              </span>
              <h2 id="taxonomy-title">Blocks & genres</h2>
            </div>
            <button type="button" className="icon-button icon-button--ghost icon-button--sm" onClick={close} aria-label="Close">
              <X size={18} />
            </button>
          </div>

          <div className="taxonomy-tabs">
            <button type="button" className={clsx(tab === "block" && "is-active")} onClick={() => setTab("block")}>
              <Layers3 size={14} /> Blocks <em>{blocks.length}</em>
            </button>
            <button type="button" className={clsx(tab === "genre" && "is-active")} onClick={() => setTab("genre")}>
              <TagIcon size={14} /> Genres <em>{genres.length}</em>
            </button>
          </div>

          <div className="taxonomy-add">
            <label className="taxonomy-color" style={{ background: newColor }}>
              <input
                type="color"
                value={newColor}
                aria-label="New tag colour"
                onChange={(event) => setNewColor(event.target.value)}
              />
            </label>
            <input
              className="text-field"
              value={newName}
              placeholder={`New ${tab} name`}
              onChange={(event) => {
                setNewName(event.target.value);
                setNewColor(defaultColor(event.target.value));
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") void add();
              }}
            />
            <button type="button" className="button button--dark" disabled={!newName.trim() || busy} onClick={() => void add()}>
              <Plus size={14} /> Add
            </button>
          </div>

          <div className="taxonomy-list">
            {tags.map((tag) => (
              <motion.div layout key={tag.name} className="taxonomy-row">
                <label className="taxonomy-color" style={{ background: tag.color }}>
                  <input
                    type="color"
                    value={tag.color}
                    aria-label={`${tag.name} colour`}
                    onChange={(event) => void setTagColor(tab, tag.name, event.target.value)}
                  />
                </label>
                <span className="taxonomy-row__name">{tag.name}</span>
                <span className="taxonomy-row__count">
                  {count(tag)} {count(tag) === 1 ? "song" : "songs"}
                </span>
                <button type="button" className="icon-button icon-button--ghost icon-button--sm" onClick={() => rename(tag)} title="Rename">
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  className="icon-button icon-button--ghost icon-button--sm danger-hover"
                  onClick={() => remove(tag)}
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </motion.div>
            ))}
            {!tags.length && <p className="taxonomy-empty">No {tab}s yet. Add one above.</p>}
          </div>

          <div className="modal__actions">
            <button type="button" className="button button--glass" onClick={close}>
              Done
            </button>
          </div>
        </Modal>
      )}
    </AnimatePresence>
  );
}
