import type { Domain } from './types';

const nameMaps = new WeakMap<Domain, Map<string, string>>();

function nameMap(domain: Domain): Map<string, string> {
  let map = nameMaps.get(domain);
  if (!map) {
    map = new Map<string, string>();
    for (const ing of domain.ingredients) {
      map.set(ing.name.toLowerCase(), ing.id);
      for (const alias of ing.aliases ?? []) map.set(alias.toLowerCase(), ing.id);
    }
    nameMaps.set(domain, map);
  }
  return map;
}

export interface ParseOutcome {
  added: Array<{ id: string; qty: number }>;
  unknown: string[];
}

function resolve(map: Map<string, string>, rawName: string): string | undefined {
  const name = rawName.trim().toLowerCase().replace(/\s+/g, ' ');
  if (map.has(name)) return map.get(name);
  if (name.endsWith('s') && map.has(name.slice(0, -1))) return map.get(name.slice(0, -1));
  return undefined;
}

/** Parse free text like "4 meat, 2 onion, salt x3, eggs" into inventory entries for `domain`. */
export function parseIngredientList(domain: Domain, text: string): ParseOutcome {
  const map = nameMap(domain);
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
    const id = resolve(map, name);
    if (id && qty > 0) {
      outcome.added.push({ id, qty });
    } else {
      outcome.unknown.push(token);
    }
  }
  return outcome;
}
