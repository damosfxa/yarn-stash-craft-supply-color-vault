import type { StashEntry } from "./types.js";

export function selectEntries(entries: readonly StashEntry[], filter: string): StashEntry[] {
  const rows = filter === "all" ? entries.slice() : entries.filter((e) => e.weightType === filter);
  return [...rows].sort((a, b) => b.dateAdded - a.dateAdded);
}

export function weightOptions(entries: readonly StashEntry[]): string[] {
  const seen = new Set<string>();
  for (const e of entries) seen.add(e.weightType);
  return [...seen].sort((a, b) => a.localeCompare(b));
}
