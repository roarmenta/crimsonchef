import { INGREDIENTS } from './data/gamedata';

const NAME_TO_ID = new Map<string, string>();
for (const ing of INGREDIENTS) {
  NAME_TO_ID.set(ing.name.toLowerCase(), ing.id);
  for (const alias of ing.aliases ?? []) NAME_TO_ID.set(alias.toLowerCase(), ing.id);
}

export interface ParseOutcome {
  added: Array<{ id: string; qty: number }>;
  unknown: string[];
}

function resolve(rawName: string): string | undefined {
  const name = rawName.trim().toLowerCase().replace(/\s+/g, ' ');
  if (NAME_TO_ID.has(name)) return NAME_TO_ID.get(name);
  if (name.endsWith('s') && NAME_TO_ID.has(name.slice(0, -1))) return NAME_TO_ID.get(name.slice(0, -1));
  return undefined;
}

/** Parse free text like "4 meat, 2 onion, salt x3, eggs" into inventory entries. */
export function parseIngredientList(text: string): ParseOutcome {
  const outcome: ParseOutcome = { added: [], unknown: [] };
  const tokens = text
    .split(/[,\n;]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  for (const token of tokens) {
    let qty = 1;
    let name = token;
    let m = token.match(/^(\d+)\s*[x×]?\s+(.+)$/i) ?? token.match(/^(\d+)[x×](.+)$/i);
    if (m) {
      qty = parseInt(m[1], 10);
      name = m[2];
    } else {
      m = token.match(/^(.+?)\s*[x×]\s*(\d+)$/i);
      if (m) {
        name = m[1];
        qty = parseInt(m[2], 10);
      }
    }
    const id = resolve(name);
    if (id && qty > 0) {
      outcome.added.push({ id, qty });
    } else {
      outcome.unknown.push(token);
    }
  }
  return outcome;
}
