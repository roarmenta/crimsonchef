import type { Inventory } from './matcher';
import type { Domain } from './types';

/** A named snapshot of a section's pouch. */
export interface SavedPouch {
  id: string;
  name: string;
  inventory: Inventory;
  savedAt: string;
}

export const MAX_NAME_LENGTH = 40;

export const savedPouchesKey = (domain: Domain) => `crimson-chef-${domain.id}-pouches-v1`;

export const unitCount = (inv: Inventory): number => Object.values(inv).reduce((n, q) => n + Math.max(0, q), 0);

/** Order-independent fingerprint of a pouch, for "is this the saved one" checks. */
export const inventoryKey = (inv: Inventory): string =>
  Object.entries(inv)
    .filter(([, q]) => q > 0)
    .sort()
    .map(([k, q]) => `${k}:${q}`)
    .join(',');

function cleanInventory(value: unknown): Inventory {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] > 0,
    ),
  );
}

function isSavedPouch(value: unknown): value is SavedPouch {
  const p = value as Partial<SavedPouch> | null;
  return !!p && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.savedAt === 'string' && !!p.inventory;
}

export function loadSavedPouches(domain: Domain): SavedPouch[] {
  try {
    const raw = localStorage.getItem(savedPouchesKey(domain));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSavedPouch).map((p) => ({ ...p, inventory: cleanInventory(p.inventory) }));
  } catch {
    return [];
  }
}

export function storeSavedPouches(domain: Domain, pouches: SavedPouch[]): void {
  try {
    localStorage.setItem(savedPouchesKey(domain), JSON.stringify(pouches));
  } catch {
    // Storage blocked or full: the list still works for this session.
  }
}

export function newPouchId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** "Pouch N" with the first N that isn't taken. */
export function defaultPouchName(existing: SavedPouch[]): string {
  const names = new Set(existing.map((p) => p.name));
  let n = existing.length + 1;
  while (names.has(`Pouch ${n}`)) n++;
  return `Pouch ${n}`;
}

export function normalizeName(raw: string, existing: SavedPouch[]): string {
  const name = raw.trim().slice(0, MAX_NAME_LENGTH);
  return name || defaultPouchName(existing);
}
