import type { Domain, Recipe, Requirement, SlotOption } from './types';

export type Inventory = Record<string, number>;

export type MatchStatus = 'craftable' | 'prep' | 'blueprint' | 'nearMiss' | 'locked';

export interface SlotResult {
  option: SlotOption;
  need: number;
  have: number;
  ok: boolean;
  /** Satisfied only by crafting the ingredient first (see MatchResult.prepSteps). */
  viaCraft: boolean;
}

/** An intermediate recipe to run first, and how many times. */
export interface PrepStep {
  recipeId: string;
  count: number;
}

export interface MatchResult {
  recipe: Recipe;
  status: MatchStatus;
  slots: SlotResult[];
  /** Slots that can't be filled from the pouch (before any crafting). */
  missingCount: number;
  /** Times the recipe can be made in a row (direct crafts for 'craftable', incl. prep for 'prep'). */
  maxCrafts: number;
  /** Intermediate crafts for one run, lowest tier first ('prep' and 'blueprint' only). */
  prepSteps: PrepStep[];
  /** Blueprints that are tracked but not learned, for this recipe or any intermediate it needs. */
  missingBlueprints: string[];
}

export interface MatchOptions {
  /** Learned blueprint ids; `null`/undefined disables the gate (blueprints not tracked). */
  learned?: Set<string> | null;
}

type Steps = Record<string, number>;

interface Ctx {
  domain: Domain;
  recipeById: Record<string, Recipe>;
  /** ingredient id → id of the recipe that produces it. */
  producer: Record<string, string>;
}

/** Longest craft chain followed (a tier III core is depth 2). Guards against cyclic data. */
const MAX_DEPTH = 6;
const MAX_CRAFTS = 99;

function sourcesFor(ctx: Ctx, opt: SlotOption): string[] {
  return opt.ingredient ? [opt.ingredient] : ctx.domain.groups[opt.group!].members;
}

function available(ctx: Ctx, opt: SlotOption, pool: Inventory): number {
  return sourcesFor(ctx, opt).reduce((n, id) => n + (pool[id] ?? 0), 0);
}

/** Take `opt.qty` units out of the pool. Group options may mix members. Caller checked availability. */
function consume(ctx: Ctx, opt: SlotOption, pool: Inventory): void {
  let need = opt.qty;
  for (const id of sourcesFor(ctx, opt)) {
    const take = Math.min(need, pool[id] ?? 0);
    if (take > 0) {
      pool[id] -= take;
      need -= take;
    }
    if (need === 0) return;
  }
}

/**
 * Obtain `need` units of ingredient `id`: from the pool first, then — when a recipe
 * produces it — by crafting the remainder, recursively. Mutates pool/steps as it goes,
 * so callers pass scratch copies and commit only on success.
 */
function obtain(ctx: Ctx, id: string, need: number, pool: Inventory, steps: Steps, depth: number): boolean {
  const take = Math.min(need, pool[id] ?? 0);
  if (take > 0) {
    pool[id] -= take;
    need -= take;
  }
  if (need === 0) return true;
  const recipe = ctx.recipeById[ctx.producer[id]];
  if (!recipe || depth >= MAX_DEPTH) return false;
  for (let i = 0; i < need; i++) {
    if (!craft(ctx, recipe, pool, steps, depth + 1, true)) return false;
  }
  steps[recipe.id] = (steps[recipe.id] ?? 0) + need;
  return true;
}

/**
 * Fill one slot, consuming from `pool` on success so a single Egg can't count toward
 * two slots. Direct fills are tried first across all options; only then, when allowed,
 * crafting an option's ingredient. Greedy allocation is correct for these datasets
 * because no recipe has two slots competing for the same pool.
 */
function fillSlot(
  ctx: Ctx,
  req: Requirement,
  pool: Inventory,
  steps: Steps,
  depth: number,
  allowCraft: boolean,
): SlotResult {
  let best: { opt: SlotOption; avail: number } | null = null;
  for (const opt of req.options) {
    const avail = available(ctx, opt, pool);
    if (avail >= opt.qty) {
      consume(ctx, opt, pool);
      return { option: opt, need: opt.qty, have: opt.qty, ok: true, viaCraft: false };
    }
    if (!best || avail > best.avail) best = { opt, avail };
  }
  if (allowCraft) {
    for (const opt of req.options) {
      if (!opt.ingredient || !ctx.producer[opt.ingredient]) continue;
      const have = pool[opt.ingredient] ?? 0;
      const scratchPool = { ...pool };
      const scratchSteps = { ...steps };
      if (obtain(ctx, opt.ingredient, opt.qty, scratchPool, scratchSteps, depth)) {
        Object.assign(pool, scratchPool);
        Object.assign(steps, scratchSteps);
        return { option: opt, need: opt.qty, have, ok: true, viaCraft: true };
      }
    }
  }
  const b = best!;
  return { option: b.opt, need: b.opt.qty, have: b.avail, ok: false, viaCraft: false };
}

/** Run `recipe` once against the pool. Atomic: pool and steps are untouched on failure. */
function craft(ctx: Ctx, recipe: Recipe, pool: Inventory, steps: Steps, depth: number, allowCraft: boolean): boolean {
  const scratchPool = { ...pool };
  const scratchSteps = { ...steps };
  for (const req of recipe.requirements) {
    if (!fillSlot(ctx, req, scratchPool, scratchSteps, depth, allowCraft).ok) return false;
  }
  Object.assign(pool, scratchPool);
  Object.assign(steps, scratchSteps);
  return true;
}

function matchOne(ctx: Ctx, recipe: Recipe, inventory: Inventory, allowCraft: boolean) {
  const pool = { ...inventory };
  const steps: Steps = {};
  const slots = recipe.requirements.map((req) => fillSlot(ctx, req, pool, steps, 0, allowCraft));
  const missingCount = slots.filter((s) => !s.ok).length;
  // Steps for a single run — captured before counting how many more runs fit.
  const prepSteps = Object.entries(steps).map(([recipeId, count]) => ({ recipeId, count }));
  let maxCrafts = 0;
  if (missingCount === 0) {
    maxCrafts = 1;
    while (maxCrafts < MAX_CRAFTS && craft(ctx, recipe, pool, steps, 0, allowCraft)) maxCrafts++;
  }
  return { slots, missingCount, maxCrafts, prepSteps };
}

function usesProducible(ctx: Ctx, recipe: Recipe): boolean {
  return recipe.requirements.some((req) =>
    req.options.some((o) => o.ingredient !== undefined && ctx.producer[o.ingredient] !== undefined),
  );
}

export function matchAll(domain: Domain, inventory: Inventory, opts: MatchOptions = {}): MatchResult[] {
  const learned = opts.learned ?? null;
  const recipeById: Record<string, Recipe> = Object.fromEntries(domain.recipes.map((r) => [r.id, r]));
  const producer: Record<string, string> = {};
  for (const ing of domain.ingredients) {
    if (ing.craftedBy && recipeById[ing.craftedBy]) producer[ing.id] = ing.craftedBy;
  }
  const ctx: Ctx = { domain, recipeById, producer };

  // The planner ignores the blueprint gate so a recipe whose only obstacle is knowledge
  // still reads as "blueprint needed" rather than "missing materials".
  const unlearned = (r: Recipe): string[] =>
    r.blueprint && learned && !learned.has(r.blueprint) ? [r.blueprint] : [];
  const missingFor = (recipe: Recipe, steps: PrepStep[]): string[] => [
    ...new Set([...unlearned(recipe), ...steps.flatMap((s) => unlearned(recipeById[s.recipeId]))]),
  ];

  return domain.recipes.map((recipe): MatchResult => {
    const direct = matchOne(ctx, recipe, inventory, false);
    if (direct.missingCount === 0) {
      const missingBlueprints = missingFor(recipe, []);
      return {
        recipe,
        ...direct,
        prepSteps: [],
        status: missingBlueprints.length > 0 ? 'blueprint' : 'craftable',
        missingBlueprints,
      };
    }
    if (usesProducible(ctx, recipe)) {
      const planned = matchOne(ctx, recipe, inventory, true);
      if (planned.missingCount === 0) {
        const missingBlueprints = missingFor(recipe, planned.prepSteps);
        return {
          recipe,
          ...planned,
          status: missingBlueprints.length > 0 ? 'blueprint' : 'prep',
          missingBlueprints,
        };
      }
    }
    // "Almost there" means at most two slots short *and* something already in hand for it —
    // otherwise one-slot recipes (a tier II core) would read as close when the pouch is empty.
    const progress = direct.slots.some((s) => s.ok || s.have > 0);
    return {
      recipe,
      ...direct,
      prepSteps: [],
      status: direct.missingCount <= 2 && progress ? 'nearMiss' : 'locked',
      missingBlueprints: missingFor(recipe, []),
    };
  });
}
