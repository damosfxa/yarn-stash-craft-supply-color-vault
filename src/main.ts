import type { StashEntry } from "./types.js";
import { UNIT_LABEL } from "./types.js";
import { loadEntries, type StorageLike } from "./storage.js";
import { createStore, type Store } from "./store.js";
import { selectEntries, weightOptions } from "./filter.js";
import { validate, makeDraft, type FormErrors, type FormValues } from "./validate.js";

function mustEl<T extends HTMLElement = HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing required element #${id}`);
  return found as T;
}
function el(tag: string, cls?: string, text?: string, ...kids: Node[]): HTMLElement {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  if (kids.length) node.append(...kids);
  return node;
}
function button(cls: string, text: string, onClick: () => void): HTMLButtonElement {
  const b = el("button", cls, text) as HTMLButtonElement;
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}
function option(value: string, text: string): HTMLOptionElement {
  const o = el("option", undefined, text) as HTMLOptionElement;
  o.value = value;
  return o;
}
function alertP(cls: string, id: string): HTMLParagraphElement {
  const p = el("p", cls) as HTMLParagraphElement;
  p.id = id;
  p.setAttribute("role", "alert");
  p.hidden = true;
  return p;
}

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const STORAGE_OFF = "Local storage is unavailable, so your stash cannot be saved.";

const FIELDS: { key: keyof FormValues; control: string; slot: string }[] = [
  { key: "material", control: "f-material", slot: "e-material" },
  { key: "color", control: "f-color", slot: "e-color" },
  { key: "weightType", control: "f-weight", slot: "e-weight" },
  { key: "quantity", control: "f-quantity", slot: "e-quantity" },
  { key: "unit", control: "f-unit", slot: "e-unit" },
  { key: "brand", control: "f-brand", slot: "e-brand" },
  { key: "notes", control: "f-notes", slot: "e-notes" },
];

let store: Store;
let storage: StorageLike;
let weightFilter = "all";
let armedDelete: string | null = null;
let armTimer = 0;

const els = {
  bannerSlot: mustEl("banner-slot"),
  form: mustEl<HTMLFormElement>("entry-form"),
  material: mustEl<HTMLInputElement>("f-material"),
  color: mustEl<HTMLInputElement>("f-color"),
  weight: mustEl<HTMLInputElement>("f-weight"),
  quantity: mustEl<HTMLInputElement>("f-quantity"),
  unit: mustEl<HTMLSelectElement>("f-unit"),
  brand: mustEl<HTMLInputElement>("f-brand"),
  notes: mustEl<HTMLTextAreaElement>("f-notes"),
  formNote: mustEl("form-note"),
  wall: mustEl("wall"),
  filter: mustEl<HTMLSelectElement>("filter-weight"),
  count: mustEl("stash-count"),
  loading: mustEl("loading"),
  pegboard: mustEl("pegboard"),
  empty: mustEl("empty"),
  toastRoot: mustEl("toast-root"),
};

function showBanner(message: string): void {
  els.bannerSlot.replaceChildren(el("p", "banner", message));
}
const clearBanner = (): void => els.bannerSlot.replaceChildren();

function toast(message: string): void {
  els.toastRoot.replaceChildren(el("div", "toast", message));
  const box = els.toastRoot.firstElementChild;
  window.setTimeout(() => box?.isConnected && box.remove(), reduceMotion.matches ? 2600 : 3200);
}

function readableInk(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? "#2a1a12" : "#fdf7ee";
}

function fmtQty(entry: StashEntry): string {
  const n = Number.isInteger(entry.quantity) ? String(entry.quantity) : entry.quantity.toFixed(1);
  return `${n} ${UNIT_LABEL[entry.unit]}`;
}

function buildCard(entry: StashEntry): HTMLElement {
  const card = el("article", "tile");

  const swatch = el("div", "swatch");
  swatch.style.backgroundColor = entry.color;
  swatch.style.color = readableInk(entry.color);
  swatch.append(el("span", "swatch-qty", fmtQty(entry)), el("span", "swatch-hex", entry.color.toUpperCase()));
  swatch.setAttribute("aria-label", `Colour ${entry.color.toUpperCase()}`);
  card.append(swatch);

  const body = el("div", "tile-body");
  body.append(el("h3", "tile-name", entry.material));

  const meta = el("p", "tile-meta");
  meta.append(el("span", "tag", entry.weightType));
  if (entry.brand) meta.append(el("span", "brand", entry.brand));
  body.append(meta);

  if (entry.notes) body.append(el("p", "tile-notes", entry.notes));

  const armed = armedDelete === entry.id;
  const del = button("btn-del", armed ? "Tap again to delete" : "Delete", () => handleDelete(entry.id, entry.material));
  del.setAttribute("aria-label", armed ? `Confirm delete ${entry.material}` : `Delete ${entry.material}`);
  if (armed) del.classList.add("armed");
  body.append(del);

  body.append(alertP("tile-error", `card-error-${entry.id}`));

  card.append(body);
  return card;
}

function syncFilterOptions(entries: readonly StashEntry[]): void {
  const opts = weightOptions(entries);
  if (weightFilter !== "all" && !opts.includes(weightFilter)) weightFilter = "all";
  els.filter.replaceChildren(option("all", "All supplies"), ...opts.map((w) => option(w, w)));
  els.filter.value = weightFilter;
}

function renderCount(total: number, shown: number): void {
  if (total === 0) {
    els.count.textContent = "";
    return;
  }
  els.count.textContent =
    weightFilter === "all"
      ? `${total} ${total === 1 ? "supply" : "supplies"} in your stash`
      : `${shown} of ${total} · ${weightFilter}`;
}

function render(): void {
  const all = store.getEntries();
  syncFilterOptions(all);
  const visible = selectEntries(all, weightFilter);
  renderCount(all.length, visible.length);

  if (visible.length === 0) {
    els.pegboard.hidden = true;
    els.pegboard.replaceChildren();
    renderEmpty(all.length === 0);
    return;
  }
  els.empty.hidden = true;
  els.pegboard.hidden = false;
  els.pegboard.replaceChildren(...visible.map(buildCard));
}

function renderEmpty(trulyEmpty: boolean): void {
  const art = el("div", "empty-art");
  art.setAttribute("aria-hidden", "true");
  art.innerHTML =
    '<svg viewBox="0 0 96 72" width="132" height="99"><ellipse cx="48" cy="40" rx="26" ry="24" class="skein-body"/><path class="skein-wrap" d="M30 22c9 10 9 26 0 36M40 18c9 12 9 32 0 44M56 18c-9 12-9 32 0 44M66 22c-9 10-9 26 0 36"/><path class="skein-tail" d="M22 40c-9 2-15 8-16 18M74 40c9 2 15 8 16 18"/></svg>';
  const title = el("h2", "empty-title");
  const body = el("p", "empty-body");
  let cta: HTMLButtonElement;
  if (trulyEmpty) {
    title.textContent = "Your stash is empty";
    body.textContent = "Add your first skein, swatch, or spool to start the colour vault.";
    cta = button("btn btn-primary", "Add a supply", () => els.material.focus());
  } else {
    title.textContent = "No supplies match this filter";
    body.textContent = "Switch the filter back to see the whole stash.";
    cta = button("btn btn-primary", "Show all", () => {
      weightFilter = "all";
      render();
    });
  }
  els.empty.hidden = false;
  els.empty.replaceChildren(art, title, body, cta);
}

function disarm(): void {
  if (armedDelete === null) return;
  armedDelete = null;
  window.clearTimeout(armTimer);
  render();
}
function handleDelete(id: string, name: string): void {
  if (armedDelete !== id) {
    armedDelete = id;
    render();
    window.clearTimeout(armTimer);
    armTimer = window.setTimeout(disarm, 4000);
    return;
  }
  window.clearTimeout(armTimer);
  armedDelete = null;
  const result = store.remove(id);
  if (!result.ok) {
    showBanner(result.message);
    const slot = document.getElementById(`card-error-${id}`);
    if (slot) {
      slot.textContent = result.message;
      slot.hidden = false;
    }
    return;
  }
  clearBanner();
  render();
  toast(`${name} removed.`);
}

function readValues(): FormValues {
  return {
    material: els.material.value,
    color: els.color.value,
    weightType: els.weight.value,
    quantity: els.quantity.value,
    unit: els.unit.value,
    brand: els.brand.value,
    notes: els.notes.value,
  };
}

function showFieldErrors(errors: FormErrors): void {
  let firstInvalid: HTMLElement | null = null;
  for (const { key, control, slot } of FIELDS) {
    const slotEl = mustEl(slot);
    const controlEl = mustEl(control);
    const message = errors[key];
    if (message) {
      slotEl.textContent = message;
      slotEl.hidden = false;
      controlEl.setAttribute("aria-invalid", "true");
      if (!firstInvalid) firstInvalid = controlEl;
    } else {
      slotEl.hidden = true;
      controlEl.removeAttribute("aria-invalid");
    }
  }
  firstInvalid?.focus();
}

function onSubmit(event: SubmitEvent): void {
  event.preventDefault();
  els.formNote.hidden = true;
  const values = readValues();
  const errors = validate(values);
  showFieldErrors(errors);
  if (Object.keys(errors).length > 0) return;

  const result = store.add(makeDraft(values));
  if (!result.ok) {
    els.formNote.textContent = result.message;
    els.formNote.hidden = false;
    showBanner(result.message);
    return;
  }
  clearBanner();
  const name = values.material ?? "";
  els.form.reset();
  els.color.value = "#c65b47";
  render();
  toast(`${name.trim() || "Supply"} added to the stash.`);
  els.material.focus();
}

function finishLoad(): void {
  els.loading.hidden = true;
  els.wall.setAttribute("aria-busy", "false");
}

async function boot(): Promise<void> {
  try {
    storage = window.localStorage;
  } catch {
    finishLoad();
    showBanner(STORAGE_OFF);
    return;
  }

  if (!reduceMotion.matches) await new Promise((r) => window.setTimeout(r, 420));

  const result = loadEntries(storage);
  finishLoad();
  if (result.status === "unavailable") {
    showBanner(STORAGE_OFF);
    return;
  }
  if (result.status === "corrupt") {
    const was = result.skipped === 1 ? "entry was" : "entries were";
    const tail = result.entries.length ? `; ${result.entries.length} recovered.` : ".";
    showBanner(`${result.skipped} saved ${was} unreadable and skipped${tail}`);
  }

  store = createStore(result.entries, storage);
  els.form.addEventListener("submit", onSubmit);
  els.filter.addEventListener("change", () => {
    weightFilter = els.filter.value;
    render();
  });
  document.addEventListener("click", (event) => {
    if (armedDelete === null) return;
    if (!(event.target as HTMLElement).closest(".btn-del")) disarm();
  });
  render();
}

boot().catch(() => {
  finishLoad();
  showBanner("Something went wrong. Please refresh the page.");
});
