import type { Blueprint, Domain } from './types';

export type DomainDef = Omit<Domain, 'ingredientById' | 'blueprints'> & { blueprints?: Blueprint[] };

/** Build a Domain from its dataset. In dev, cross-references are validated so data typos fail fast. */
export function defineDomain(def: DomainDef): Domain {
  const domain: Domain = {
    ...def,
    blueprints: def.blueprints ?? [],
    ingredientById: Object.fromEntries(def.ingredients.map((i) => [i.id, i])),
  };
  if (import.meta.env.DEV) {
    const problems = validateDomain(domain);
    if (problems.length > 0) {
      throw new Error(`Invalid "${domain.id}" data:\n- ${problems.join('\n- ')}`);
    }
  }
  return domain;
}

/** Returns a list of dangling references and malformed entries (empty when the data is consistent). */
export function validateDomain(d: Domain): string[] {
  const problems: string[] = [];
  const categories = new Set(d.categories.map((c) => c.id));
  const stations = new Set(d.stations);
  const blueprintIds = new Set(d.blueprints.map((b) => b.id));
  const recipeIds = new Set<string>();
  const ingredientIds = new Set<string>();

  for (const ing of d.ingredients) {
    if (ingredientIds.has(ing.id)) problems.push(`duplicate ingredient id "${ing.id}"`);
    ingredientIds.add(ing.id);
    if (!categories.has(ing.category)) {
      problems.push(`ingredient "${ing.id}" has unknown category "${ing.category}"`);
    }
  }
  for (const [gid, group] of Object.entries(d.groups)) {
    if (group.members.length === 0) problems.push(`group "${gid}" has no members`);
    for (const m of group.members) {
      if (!ingredientIds.has(m)) problems.push(`group "${gid}" references unknown ingredient "${m}"`);
    }
  }
  for (const r of d.recipes) {
    if (recipeIds.has(r.id)) problems.push(`duplicate recipe id "${r.id}"`);
    recipeIds.add(r.id);
    if (!stations.has(r.station)) problems.push(`recipe "${r.id}" has unknown station "${r.station}"`);
    if (r.blueprint && !blueprintIds.has(r.blueprint)) {
      problems.push(`recipe "${r.id}" references unknown blueprint "${r.blueprint}"`);
    }
    if (r.requirements.length === 0) problems.push(`recipe "${r.id}" has no requirements`);
    for (const req of r.requirements) {
      if (req.options.length === 0) problems.push(`recipe "${r.id}" has a slot with no options`);
      for (const o of req.options) {
        if (!(o.qty > 0)) problems.push(`recipe "${r.id}" has a slot option with qty ${o.qty}`);
        if ((o.ingredient ? 1 : 0) + (o.group ? 1 : 0) !== 1) {
          problems.push(`recipe "${r.id}" has a slot option that must name exactly one ingredient or group`);
        }
        if (o.ingredient && !ingredientIds.has(o.ingredient)) {
          problems.push(`recipe "${r.id}" references unknown ingredient "${o.ingredient}"`);
        }
        if (o.group && !d.groups[o.group]) problems.push(`recipe "${r.id}" references unknown group "${o.group}"`);
      }
    }
  }
  for (const ing of d.ingredients) {
    if (ing.craftedBy && !recipeIds.has(ing.craftedBy)) {
      problems.push(`ingredient "${ing.id}" is craftedBy unknown recipe "${ing.craftedBy}"`);
    }
  }
  return problems;
}
