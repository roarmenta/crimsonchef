import { buildCtx, craft, type Ctx, type Inventory, type Steps } from './matcher';
import type { Domain, Recipe } from './types';

/** "biggest": tallest, most material-dense cores first. "tiers": any tier III before any tier II. */
export type Priority = 'biggest' | 'tiers';

export interface Pin {
  recipeId: string;
  count: number;
}

export interface PlanOptions {
  /** Learned blueprint ids; null/undefined = not tracking. */
  learned?: Set<string> | null;
  priority?: Priority;
  /** Products to make first, in order, up to their count. */
  pins?: Pin[];
  /** Recipe ids never made as products (they can still be intermediates). */
  skips?: Iterable<string>;
  /** Enabled equipment chips; null = all. Recipes with no "Fits:" always pass. */
  fits?: Iterable<string> | null;
}

export interface PlanInput {
  id: string;
  qty: number;
}

export interface PlanStep {
  recipeId: string;
  count: number;
  depth: number;
  /** Exact materials taken from the pouch, substitution groups resolved to the member spent. */
  inputs: PlanInput[];
  /** Ingredient id the step produces, when the product is itself an ingredient. */
  outputId: string | null;
  /** Products this step feeds (recipe ids), in plan order. */
  forProducts: string[];
}

export interface PlanProduct {
  recipeId: string;
  count: number;
  points: number;
  tier: number | null;
}

export interface PinShortfall {
  recipeId: string;
  wanted: number;
  made: number;
  /** Set when the pin can't be made because its blueprint isn't learned. */
  blueprint?: string;
}

export interface Plan {
  products: PlanProduct[];
  steps: PlanStep[];
  leftover: PlanInput[];
  usedUnits: number;
  totalUnits: number;
  totalPoints: number;
  shortfalls: PinShortfall[];
}

export interface Power {
  /** Units of the domain's size ingredient (Abyss Cells) embedded in one product, or base units. */
  size: number;
  units: number;
  depth: number;
  tier: number | null;
  /** size × 1 / 2 / 4 for tier I / II / III: two cores become one that takes one socket. */
  points: number;
}

function tierOf(name: string): number | null {
  if (name.endsWith(' III')) return 3;
  if (name.endsWith(' II')) return 2;
  if (name.endsWith(' I')) return 1;
  return null;
}

/** Size, depth and power points of a recipe's product from the recipe tree alone (no pouch). */
export function powerOf(ctx: Ctx, recipe: Recipe, memo: Map<string, Power> = new Map()): Power {
  const cached = memo.get(recipe.id);
  if (cached) return cached;
  const unit = ctx.domain.plan?.unitIngredient;
  let size = 0;
  let units = 0;
  let depth = 0;
  for (const req of recipe.requirements) {
    const opt = req.options[0];
    const id = opt.ingredient ?? ctx.domain.groups[opt.group!].members[0];
    const producer = ctx.recipeById[ctx.producer[id]];
    if (producer) {
      const sub = powerOf(ctx, producer, memo);
      size += sub.size * opt.qty;
      units += sub.units * opt.qty;
      depth = Math.max(depth, sub.depth);
    } else {
      units += opt.qty;
      if (id === unit) size += opt.qty;
    }
  }
  const tier = tierOf(recipe.name);
  const measure = unit ? size : units;
  const power: Power = { size: measure, units, depth: depth + 1, tier, points: measure * 2 ** ((tier ?? 1) - 1) };
  memo.set(recipe.id, power);
  return power;
}

/** Equipment chips a recipe's "Fits: …" text maps to; empty when the recipe has no Fits line. */
export function fitsOf(recipe: Recipe): string[] {
  const m = recipe.tool.match(/^Fits:\s*(.+)$/);
  if (!m) return [];
  return m[1].split(',').flatMap((part) => {
    const p = part.trim();
    if (p === 'Weapons') return ['Melee', 'Bows'];
    if (p === 'Melee Weapons') return ['Melee'];
    return [p];
  });
}

function rankKey(p: Power, priority: Priority): number[] {
  if (priority === 'tiers') {
    // Highest tier first, and within tiers II and III the cheapest core first so the pouch
    // spreads into more of them; at tier I, the stronger product first.
    const tier = p.tier ?? 1;
    return [tier, tier >= 2 ? -p.size : p.points];
  }
  return [p.points, p.tier ?? 1];
}

function compareKeys(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

interface Execution {
  recipe: Recipe;
  inputs: PlanInput[];
  product: Recipe;
}

/**
 * Turn the pouch into the strongest products it can make: pinned products first, then the
 * highest-ranked craftable product (one copy each), then repeats until nothing is craftable.
 * Every chain is committed with the matcher's atomic craft(), so quantities are exact.
 */
export function planPouch(domain: Domain, inventory: Inventory, opts: PlanOptions = {}): Plan {
  const learned = opts.learned ?? null;
  const ctx = buildCtx(domain, learned);
  // Points, depth and tier describe the recipe tree, not what the player has learned, so
  // a held core from an unlearned family still counts for what it is.
  const scoreCtx = learned ? buildCtx(domain, null) : ctx;
  const priority = opts.priority ?? 'biggest';
  const skips = new Set(opts.skips ?? []);
  const fits = opts.fits ? new Set(opts.fits) : null;
  const pinned = new Map((opts.pins ?? []).map((p) => [p.recipeId, p.count]));
  const memo = new Map<string, Power>();
  const power = (r: Recipe) => powerOf(scoreCtx, r, memo);
  const totalUnits = Object.values(inventory).reduce((n, q) => n + Math.max(0, q), 0);
  // Every committed chain consumes at least one unit, so this bound can't cut a real plan short.
  const maxProducts = totalUnits + 1;
  const usable = (r: Recipe) => !r.blueprint || !learned || learned.has(r.blueprint);
  const passesFits = (r: Recipe) => {
    if (!fits) return true;
    const f = fitsOf(r);
    return f.length === 0 || f.some((x) => fits.has(x));
  };
  const outputOf = new Map<string, string>();
  for (const ing of domain.ingredients) if (ing.craftedBy) outputOf.set(ing.craftedBy, ing.id);

  const pool: Inventory = { ...inventory };
  const executions: Execution[] = [];
  const madeCount = new Map<string, number>();
  // Pinned products are taken out of the pool so later chains can't consume them.
  const reserved = new Map<string, number>();

  // Replay a chain (intermediates by depth, then the product) with direct crafts only, recording
  // exactly what each craft took from the pool and adding what it made.
  const commit = (product: Recipe, steps: Steps) => {
    const order = Object.entries(steps)
      .map(([id, count]) => ({ recipe: ctx.recipeById[id], count }))
      .sort((a, b) => power(a.recipe).depth - power(b.recipe).depth);
    order.push({ recipe: product, count: 1 });
    for (const { recipe, count } of order) {
      for (let i = 0; i < count; i++) {
        const before = { ...pool };
        if (!craft(ctx, recipe, pool, {}, 0, false)) throw new Error(`plan replay failed at ${recipe.id}`);
        const inputs = Object.keys(before)
          .filter((id) => (pool[id] ?? 0) < before[id])
          .map((id) => ({ id, qty: before[id] - (pool[id] ?? 0) }));
        const out = outputOf.get(recipe.id);
        if (out) pool[out] = (pool[out] ?? 0) + 1;
        executions.push({ recipe, inputs, product });
      }
    }
    madeCount.set(product.id, (madeCount.get(product.id) ?? 0) + 1);
  };
  const tryChain = (recipe: Recipe): Steps | null => {
    const scratch = { ...pool };
    const steps: Steps = {};
    return craft(ctx, recipe, scratch, steps, 0, true) ? steps : null;
  };

  const shortfalls: PinShortfall[] = [];
  for (const pin of opts.pins ?? []) {
    const recipe = ctx.recipeById[pin.recipeId];
    if (!recipe || !usable(recipe)) {
      shortfalls.push({ recipeId: pin.recipeId, wanted: pin.count, made: 0, blueprint: recipe?.blueprint });
      continue;
    }
    let made = 0;
    const held = outputOf.get(recipe.id);
    if (held) {
      // Copies already in the pouch satisfy the pin, and are reserved like crafted ones.
      const have = Math.min(pin.count, pool[held] ?? 0);
      if (have > 0) {
        pool[held] -= have;
        reserved.set(held, (reserved.get(held) ?? 0) + have);
        madeCount.set(recipe.id, (madeCount.get(recipe.id) ?? 0) + have);
        made = have;
      }
    }
    while (made < pin.count) {
      const steps = tryChain(recipe);
      if (!steps) break;
      commit(recipe, steps);
      made++;
      const out = outputOf.get(recipe.id);
      if (out) {
        pool[out] -= 1;
        reserved.set(out, (reserved.get(out) ?? 0) + 1);
      }
    }
    if (made < pin.count) shortfalls.push({ recipeId: pin.recipeId, wanted: pin.count, made });
  }

  const candidates = domain.recipes
    .filter((r) => usable(r) && !skips.has(r.id) && passesFits(r))
    .map((r) => ({ recipe: r, key: rankKey(power(r), priority) }))
    .sort((a, b) => compareKeys(b.key, a.key) || a.recipe.name.localeCompare(b.recipe.name));

  // Pass 1 makes one copy of each product, strongest first (variety for a limited socket count);
  // pass 2 repeats the strongest until the pouch can't make anything else. Pinned products are
  // exact counts, so neither pass makes more of them.
  for (const allowRepeats of [false, true]) {
    for (let guard = 0; guard < maxProducts; guard++) {
      let best: { recipe: Recipe; steps: Steps; key: number[]; crafts: number } | null = null;
      for (const c of candidates) {
        if (best && compareKeys(c.key, best.key) < 0) break;
        if (pinned.has(c.recipe.id)) continue;
        if (!allowRepeats && (madeCount.get(c.recipe.id) ?? 0) > 0) continue;
        const steps = tryChain(c.recipe);
        if (!steps) continue;
        // Equal rank: prefer the chain that crafts the least, i.e. uses cores already in the pouch.
        const crafts = Object.values(steps).reduce((n, k) => n + k, 0);
        if (!best || crafts < best.crafts) best = { recipe: c.recipe, steps, key: c.key, crafts };
      }
      if (!best) break;
      commit(best.recipe, best.steps);
    }
  }

  // Aggregate executions into steps (per recipe, batched by depth), and settle products vs leftovers.
  const stepByRecipe = new Map<string, PlanStep & { order: number }>();
  executions.forEach((ex, order) => {
    let step = stepByRecipe.get(ex.recipe.id);
    if (!step) {
      step = {
        recipeId: ex.recipe.id,
        count: 0,
        depth: power(ex.recipe).depth,
        inputs: [],
        outputId: outputOf.get(ex.recipe.id) ?? null,
        forProducts: [],
        order,
      };
      stepByRecipe.set(ex.recipe.id, step);
    }
    step.count++;
    for (const input of ex.inputs) {
      const existing = step.inputs.find((i) => i.id === input.id);
      if (existing) existing.qty += input.qty;
      else step.inputs.push({ ...input });
    }
    if (ex.product.id !== ex.recipe.id && !step.forProducts.includes(ex.product.id)) step.forProducts.push(ex.product.id);
  });
  const steps: PlanStep[] = [...stepByRecipe.values()]
    .sort((a, b) => a.depth - b.depth || a.order - b.order)
    .map(({ order: _order, ...step }) => step);

  const products: PlanProduct[] = [];
  const leftover: PlanInput[] = [];
  const productCounts = new Map<string, number>();
  for (const [out, qty] of reserved) pool[out] = (pool[out] ?? 0) + qty;
  for (const [recipeId, made] of madeCount) {
    const out = outputOf.get(recipeId);
    // An unpinned product that is itself an ingredient may have been consumed by a later chain.
    const kept = out ? Math.min(made, pool[out] ?? 0) : made;
    if (kept > 0) productCounts.set(recipeId, kept);
  }
  for (const [id, qty] of Object.entries(pool)) {
    if (qty <= 0) continue;
    const recipeId = domain.ingredientById[id]?.craftedBy;
    const asProduct = recipeId ? (productCounts.get(recipeId) ?? 0) : 0;
    if (qty - asProduct > 0) leftover.push({ id, qty: qty - asProduct });
  }
  for (const [recipeId, count] of productCounts) {
    const p = power(ctx.recipeById[recipeId]);
    products.push({ recipeId, count, points: p.points, tier: p.tier });
  }
  products.sort((a, b) => b.points - a.points || ctx.recipeById[a.recipeId].name.localeCompare(ctx.recipeById[b.recipeId].name));

  const leftoverUnits = leftover.reduce((n, l) => n + l.qty, 0);
  return {
    products,
    steps,
    leftover,
    usedUnits: Math.max(0, totalUnits - leftoverUnits),
    totalUnits,
    totalPoints: products.reduce((n, p) => n + p.points * p.count, 0),
    shortfalls,
  };
}

/** The plan as plain text, for sharing. */
export function planToText(domain: Domain, plan: Plan): string {
  const name = (recipeId: string) => domain.recipes.find((r) => r.id === recipeId)?.name ?? recipeId;
  const ing = (id: string) => domain.ingredientById[id]?.name ?? id;
  const lines: string[] = [];
  lines.push(`Makes: ${plan.products.map((p) => `${name(p.recipeId)}${p.count > 1 ? ` ×${p.count}` : ''}`).join(', ') || 'nothing'}`);
  lines.push(
    `Uses ${plan.usedUnits} of ${plan.totalUnits} items${plan.leftover.length ? `; left over: ${plan.leftover.map((l) => `${ing(l.id)} ×${l.qty}`).join(', ')}` : ''}`,
  );
  plan.steps.forEach((s, i) => {
    const mats = s.inputs.map((x) => `${ing(x.id)} ×${x.qty}`).join(', ');
    const forText = s.forProducts.length ? ` → for ${s.forProducts.map(name).join(', ')}` : '';
    lines.push(`${i + 1}. Craft ${name(s.recipeId)} ×${s.count} — ${mats}${forText}`);
  });
  return lines.join('\n');
}
