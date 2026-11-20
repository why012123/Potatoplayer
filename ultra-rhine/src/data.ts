import sampleContent from "../content/archives.sample.json" with { type: "json" };

export interface ArchiveRecord {
  id: string;
  title: string;
  en: string;
  department: string;
  category: string;
  date: string;
  lead: string;
  clearance: string;
  abstract: string;
  findings: string[];
  source: string;
  trackId?: string;
  coverPath?: string;
  genre?: string;
  genreColor?: string;
}

export interface ArchiveContent {
  categories: string[];
  columns: string[];
  records: ArchiveRecord[];
}

type PotatoBridge = { ultraArchives?: ArchiveContent | null };

// The desktop app injects an archive generated from the live library.json, so
// the shelves follow the real music folder. In a plain browser (or before the
// first scan) fall back to the bundled sample archive.
const injected = (
  typeof window === "undefined" ? null : (window as { potato?: PotatoBridge }).potato?.ultraArchives
) as ArchiveContent | null;
const bundled = sampleContent as unknown as ArchiveContent;
const runtimeArchive = Boolean(injected && Array.isArray(injected.records) && injected.records.length > 0);
const content: ArchiveContent = runtimeArchive ? (injected as ArchiveContent) : bundled;

/** True when the archive mirrors the live library instead of the bundled sample. */
export const libraryInjected = runtimeArchive;

export const records: ArchiveRecord[] = content.records;
export const categories = ["全部档案", ...content.categories];
export const archiveColumns = content.columns;

const filesByColumn = archiveColumns.map(category => records.flatMap((record, index) => record.category === category ? [index] : []));
export function columnFiles(lane: number) {
  return filesByColumn[lane] ?? [];
}
export function fileLocation(index: number) {
  const lane = archiveColumns.indexOf(records[index].category);
  const row = 12 + columnFiles(lane).indexOf(index);
  return { lane, row, slot: lane * 32 + row };
}
export function fileAtSlot(slot: number) {
  const files = columnFiles(Math.floor(slot / 32));
  return files[Math.max(0, Math.min(files.length - 1, (slot % 32) - 12))];
}
