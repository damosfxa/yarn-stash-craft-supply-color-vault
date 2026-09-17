import type { StashEntry, EntryDraft } from "./types.js";
import { saveEntries, type StorageLike, type SaveResult } from "./storage.js";

export interface Store {
  getEntries(): StashEntry[];
  add(draft: EntryDraft): SaveResult;
  remove(id: string): SaveResult;
}

export function addEntry(entries: readonly StashEntry[], draft: EntryDraft, id: string, now: number): StashEntry[] {
  const entry: StashEntry = { ...draft, id, dateAdded: now };
  return [entry, ...entries];
}
export function removeEntry(entries: readonly StashEntry[], id: string): StashEntry[] {
  return entries.filter((e) => e.id !== id);
}

export function createStore(initial: StashEntry[], storage: StorageLike): Store {
  let entries = initial.slice();
  const commit = (next: StashEntry[]): SaveResult => {
    const result = saveEntries(storage, next);
    if (result.ok) entries = next;
    return result;
  };
  return {
    getEntries: () => entries.slice(),
    add: (draft) => commit(addEntry(entries, draft, crypto.randomUUID(), Date.now())),
    remove: (id) => commit(removeEntry(entries, id)),
  };
}
