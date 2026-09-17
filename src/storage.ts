import type { StashEntry } from "./types.js";
import { UNITS, MATERIAL_MAX, WEIGHT_MAX, BRAND_MAX, NOTES_MAX, QTY_MAX } from "./types.js";
import { isHexColor } from "./validate.js";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export const STORAGE_KEY = "yarn-stash:v1";

export type LoadResult =
  | { status: "ok"; entries: StashEntry[] }
  | { status: "empty"; entries: StashEntry[] }
  | { status: "corrupt"; entries: StashEntry[]; skipped: number }
  | { status: "unavailable" };

export type SaveResult = { ok: true } | { ok: false; message: string };

export function normalizeStored(value: unknown): StashEntry | null {
  if (!value || typeof value !== "object") return null;
  const e = value as Partial<StashEntry>;
  const str = (s: unknown, min: number, max: number): s is string =>
    typeof s === "string" && s.length >= min && s.length <= max;
  if (!str(e.id, 1, 200) || !str(e.material, 1, MATERIAL_MAX) || !str(e.weightType, 1, WEIGHT_MAX)) return null;
  if (!str(e.brand, 0, BRAND_MAX) || !str(e.notes, 0, NOTES_MAX)) return null;
  if (typeof e.color !== "string" || !isHexColor(e.color)) return null;
  if (!UNITS.includes(e.unit as (typeof UNITS)[number])) return null;
  if (typeof e.quantity !== "number" || !Number.isFinite(e.quantity) || e.quantity <= 0 || e.quantity > QTY_MAX) return null;
  if (typeof e.dateAdded !== "number" || !Number.isFinite(e.dateAdded)) return null;
  return {
    id: e.id, material: e.material, color: e.color.toLowerCase(), weightType: e.weightType,
    quantity: e.quantity, unit: e.unit!, brand: e.brand, notes: e.notes, dateAdded: e.dateAdded,
  };
}

export function loadEntries(storage: StorageLike): LoadResult {
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { status: "unavailable" };
  }
  if (!raw) return { status: "empty", entries: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  if (!Array.isArray(parsed)) return { status: "corrupt", entries: [], skipped: 0 };
  const entries: StashEntry[] = [];
  let skipped = 0;
  for (const row of parsed) {
    const clean = normalizeStored(row);
    if (clean) entries.push(clean);
    else skipped++;
  }
  return skipped > 0 ? { status: "corrupt", entries, skipped } : { status: "ok", entries };
}

export function saveEntries(storage: StorageLike, entries: StashEntry[]): SaveResult {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(entries));
    return { ok: true };
  } catch (err) {
    const quota =
      err instanceof DOMException &&
      (err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED" || err.code === 22);
    return {
      ok: false,
      message: quota
        ? "Storage is full, so this entry was not saved. Delete a skein and try again."
        : "This entry was not saved. Your stash is still visible here.",
    };
  }
}
