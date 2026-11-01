import type { Domain } from '../types';
import { ABYSS } from './abyss';
import { COOKING } from './cooking';

/** All crafting systems, in tab order. The first one is the default route. */
export const DOMAINS: Domain[] = [COOKING, ABYSS];

/** Resolve a `#/<id>` hash to a domain, defaulting to the first one. */
export function domainFromHash(hash: string): Domain {
  const id = hash.match(/^#\/([a-z-]+)/)?.[1];
  return DOMAINS.find((d) => d.id === id) ?? DOMAINS[0];
}
