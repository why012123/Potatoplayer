import content from "../content/archives.json" with { type: "json" };

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
