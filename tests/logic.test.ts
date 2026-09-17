import { describe, it, expect } from "vitest";
import { validate, makeDraft, isValid, tidy, isHexColor, type FormValues } from "../src/validate.js";
import { normalizeStored, loadEntries, saveEntries, type StorageLike } from "../src/storage.js";
import { addEntry, removeEntry } from "../src/store.js";
import { selectEntries, weightOptions } from "../src/filter.js";
import type { StashEntry } from "../src/types.js";

const goodForm: FormValues = {
  material: "Merino Wool", color: "#3366CC", weightType: "Worsted", quantity: "4", unit: "skeins", brand: "Malabrigo", notes: "baby blanket",
};
const makeE = (over: Partial<StashEntry> = {}): StashEntry => ({
  id: "id-" + Math.random(), material: "Cotton DK", color: "#c0553d", weightType: "DK",
  quantity: 2, unit: "meters", brand: "", notes: "", dateAdded: 1000, ...over,
});
const memStorage = (seed?: string): StorageLike => {
  const data: Record<string, string> = seed ? { "yarn-stash:v1": seed } : {};
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
};

describe("validate", () => {
  it("accepts a valid form, reports every broken field, and coerces a clean draft", () => {
    expect(isValid(goodForm)).toBe(true);
    expect(validate(goodForm)).toEqual({});
    const e = validate({ material: " ", color: "red", weightType: "", quantity: "0", unit: "x", brand: "b".repeat(50), notes: "n".repeat(300) });
    expect(Object.keys(e).sort()).toEqual(["brand", "color", "material", "notes", "quantity", "unit", "weightType"]);
    const draft = makeDraft(goodForm);
    expect(draft).toMatchObject({ material: "Merino Wool", color: "#3366cc", weightType: "Worsted", quantity: 4, unit: "skeins", brand: "Malabrigo" });
    expect(tidy("a\n\t b")).toBe("a b");
  });
  it("rejects bad quantity and non-hex colours", () => {
    expect(validate({ ...goodForm, quantity: "-2" }).quantity).toBeDefined();
    expect(validate({ ...goodForm, quantity: "abc" }).quantity).toBeDefined();
    expect(validate({ ...goodForm, quantity: "999999" }).quantity).toBeDefined();
    expect(validate({ ...goodForm, color: "#fff" }).color).toBeDefined();
    expect(isHexColor("#a1b2c3")).toBe(true);
    expect(isHexColor("a1b2c3")).toBe(false);
  });
});

describe("storage", () => {
  it("normalizes valid rows, rejects junk, loads ok/empty/corrupt, reports write failures", () => {
    const row = makeE({ id: "fixed" });
    expect(normalizeStored(row)).toEqual(row);
    for (const bad of [null, { ...row, unit: "x" }, { ...row, color: "nope" }, { ...row, quantity: 0 }, { ...row, quantity: -1 }, { ...row, material: "" }])
      expect(normalizeStored(bad)).toBeNull();
    expect(loadEntries(memStorage())).toEqual({ status: "empty", entries: [] });
    const corrupt = loadEntries(memStorage(JSON.stringify([makeE(), { junk: true }])));
    expect(corrupt.status === "corrupt" && corrupt.skipped === 1 && corrupt.entries.length === 1).toBe(true);
    const store = memStorage();
    expect(saveEntries(store, [row]).ok).toBe(true);
    expect(loadEntries(store)).toEqual({ status: "ok", entries: [row] });
    const failing: StorageLike = { getItem: () => null, setItem: () => { throw new Error("nope"); } };
    expect(saveEntries(failing, [row]).ok).toBe(false);
  });
});

describe("store transforms (pure, never mutating the source)", () => {
  it("adds newest-first and removes by id without touching the source", () => {
    const base = [makeE({ id: "a", dateAdded: 500 })];
    const added = addEntry(base, { material: "Silk", color: "#112233", weightType: "Lace", quantity: 1, unit: "yards", brand: "", notes: "" }, "new", 2000);
    expect(added).toHaveLength(2);
    expect(added[0].id).toBe("new");
    expect(removeEntry([makeE({ id: "a" }), makeE({ id: "b" })], "a").map((e) => e.id)).toEqual(["b"]);
    expect(base).toHaveLength(1);
    expect(base[0].id).toBe("a");
  });
});

describe("filter + weight options", () => {
  const es: StashEntry[] = [
    makeE({ id: "1", weightType: "Worsted", dateAdded: 100 }),
    makeE({ id: "2", weightType: "Lace", dateAdded: 300 }),
    makeE({ id: "3", weightType: "Worsted", dateAdded: 200 }),
  ];
  it("filters by weight newest-first without mutating source, and lists unique sorted options", () => {
    expect(selectEntries(es, "Worsted").map((e) => e.id)).toEqual(["3", "1"]);
    expect(selectEntries(es, "all").map((e) => e.id)).toEqual(["2", "3", "1"]);
    expect(es.map((e) => e.id)).toEqual(["1", "2", "3"]);
    expect(weightOptions(es)).toEqual(["Lace", "Worsted"]);
  });
});
