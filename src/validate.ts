import type { EntryDraft, Unit } from "./types.js";
import { UNITS, MATERIAL_MAX, WEIGHT_MAX, BRAND_MAX, NOTES_MAX, QTY_MAX } from "./types.js";

export type FormValues = {
  material?: string;
  color?: string;
  weightType?: string;
  quantity?: string;
  unit?: unknown;
  brand?: string;
  notes?: string;
};
export type FormErrors = Partial<Record<keyof FormValues, string>>;

export function tidy(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function isUnit(value: unknown): value is Unit {
  return typeof value === "string" && UNITS.includes(value as Unit);
}

export function validate(values: FormValues): FormErrors {
  const errors: FormErrors = {};
  const material = tidy(String(values.material ?? ""));
  const weight = tidy(String(values.weightType ?? ""));
  const brand = tidy(String(values.brand ?? ""));
  const notes = tidy(String(values.notes ?? ""));
  const color = String(values.color ?? "");
  const qtyRaw = String(values.quantity ?? "").trim();
  const qty = Number(qtyRaw);

  if (!material) errors.material = "Name your material.";
  else if (material.length > MATERIAL_MAX) errors.material = `Keep it under ${MATERIAL_MAX} characters.`;

  if (!isHexColor(color)) errors.color = "Pick a colour.";

  if (!weight) errors.weightType = "Add a weight or type.";
  else if (weight.length > WEIGHT_MAX) errors.weightType = `Keep it under ${WEIGHT_MAX} characters.`;

  if (!qtyRaw) errors.quantity = "Add a quantity.";
  else if (!Number.isFinite(qty) || qty <= 0) errors.quantity = "Use a number above zero.";
  else if (qty > QTY_MAX) errors.quantity = `Keep it under ${QTY_MAX}.`;

  if (!isUnit(values.unit)) errors.unit = "Choose a unit.";

  if (brand.length > BRAND_MAX) errors.brand = `Keep it under ${BRAND_MAX} characters.`;
  if (notes.length > NOTES_MAX) errors.notes = `Keep notes under ${NOTES_MAX} characters.`;

  return errors;
}

export function isValid(values: FormValues): boolean {
  return Object.keys(validate(values)).length === 0;
}

export function makeDraft(values: FormValues): EntryDraft {
  return {
    material: tidy(String(values.material ?? "")),
    color: String(values.color ?? "").toLowerCase(),
    weightType: tidy(String(values.weightType ?? "")),
    quantity: Number(String(values.quantity ?? "").trim()),
    unit: values.unit as Unit,
    brand: tidy(String(values.brand ?? "")),
    notes: tidy(String(values.notes ?? "")),
  };
}
