export type Unit = "skeins" | "meters" | "yards" | "other";

export interface StashEntry {
  id: string;
  material: string;
  color: string;
  weightType: string;
  quantity: number;
  unit: Unit;
  brand: string;
  notes: string;
  dateAdded: number;
}

export type EntryDraft = Omit<StashEntry, "id" | "dateAdded">;

export const UNITS: readonly Unit[] = ["skeins", "meters", "yards", "other"];
export const UNIT_LABEL: Record<Unit, string> = {
  skeins: "skeins",
  meters: "meters",
  yards: "yards",
  other: "units",
};

export const MATERIAL_MAX = 60;
export const WEIGHT_MAX = 40;
export const BRAND_MAX = 40;
export const NOTES_MAX = 200;
export const QTY_MAX = 100000;
