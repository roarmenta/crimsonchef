import { GROUPS, INGREDIENTS } from './data/gamedata';
import type { Recipe, Requirement, SlotOption } from './types';

export type Inventory = Record<string, number>;

export type MatchStatus = 'craftable' | 'prep' | 'nearMiss' | 'locked';

export interface SlotResult {
  option: SlotOption;
  need: number;
  have: number;
  ok: boolean;
}

export interface MatchResult {
  recipe: Recipe;
  status: MatchStatus;
  slots: SlotResult[];
  missingCount: number;
  maxCrafts: number;
  /** Dish ingredient ids you'd need to cook first (status 'prep' only). */
  prepDishes: string[];
}

function sourcesFor(opt: SlotOption): string[] {
  return opt.ingredient ? [opt.ingredient] : GROUPS[opt.group!].members;
}

function available(opt: SlotOption, pool: Inventory): number {
  return sourcesFor(opt).reduce((n, id) => n + (pool[id] ?? 0), 0);
}

/**
 * Try to satisfy one slot, consuming from `pool` on success so a single Egg
 * can't count toward two slots. Group options may mix members (e.g. 2× "Fish"
 * can be one Small Fish + one Large Fish). Greedy allocation is correct for
 * this dataset because no recipe has two slots competing for the same pool.
 */
function fillSlot(req: Requirement, pool: Inventory): SlotResult {
  let best: { opt: SlotOption; avail: number } | null = null;
  for (const opt of req.options) {
    const avail = available(opt, pool);
    if (avail >= opt.qty) {
      let need = opt.qty;
      for (const id of sourcesFor(opt)) {
        const take = Math.min(need, pool[id] ?? 0);
        if (take > 0) {
          pool[id] -= take;
          need -= take;
        }
        if (need === 0) break;
      }
      return { option: opt, need: opt.qty, have: opt.qty, ok: true };
    }
    if (!best || avail > best.avail) best = { opt, avail };
  }
  const b = best!;
  return { option: b.opt, need: b.opt.qty, have: b.avail, ok: false };
}

function matchOne(recipe: Recipe, inventory: Inventory) {
  const pool = { ...inventory };
  const slots = recipe.requirements.map((req) => fillSlot(req, pool));
  const missingCount = slots.filter((s) => !s.ok).length;
  let maxCrafts = 0;
  if (missingCount === 0) {
    maxCrafts = 1;
    while (recipe.requirements.every((req) => fillSlot(req, pool).ok)) maxCrafts++;
  }
  return { slots, missingCount, maxCrafts };
}

const DISH_TO_RECIPE: Record<string, string> = Object.fromEntries(
  INGREDIENTS.filter((i) => i.craftedBy).map((i) => [i.id, i.craftedBy!]),
);

export function matchAll(recipes: Recipe[], inventory: Inventory): MatchResult[] {
  const pass1 = recipes.map((recipe) => ({ recipe, ...matchOne(recipe, inventory) }));
  const craftableRecipes = new Set(
    pass1.filter((m) => m.missingCount === 0).map((m) => m.recipe.id),
  );
  const craftableDishes = Object.keys(DISH_TO_RECIPE).filter((dishId) =>
    craftableRecipes.has(DISH_TO_RECIPE[dishId]),
  );

  // Pass 2: a recipe whose only gaps are dishes you could cook right now gets
  // promoted to "prep" — craftable once you cook the prerequisites.
  const virtual: Inventory = { ...inventory };
  for (const dishId of craftableDishes) virtual[dishId] = (virtual[dishId] ?? 0) + 99;

  return pass1.map((m) => {
    if (m.missingCount === 0) {
      return { ...m, status: 'craftable' as const, prepDishes: [] };
    }
    let prepDishes: string[] = [];
    if (craftableDishes.length > 0) {
      const usesCraftableDish = m.recipe.requirements.some((req) =>
        req.options.some((o) => o.ingredient && craftableDishes.includes(o.ingredient)),
      );
      if (usesCraftableDish) {
        const retry = matchOne(m.recipe, virtual);
        if (retry.missingCount === 0) {
          prepDishes = m.recipe.requirements
            .flatMap((req) => req.options)
            .filter(
              (o) =>
                o.ingredient &&
                craftableDishes.includes(o.ingredient) &&
                (inventory[o.ingredient] ?? 0) < o.qty,
            )
            .map((o) => o.ingredient!);
          return {
            recipe: m.recipe,
            slots: m.slots,
            missingCount: m.missingCount,
            maxCrafts: retry.maxCrafts,
            status: 'prep' as const,
            prepDishes,
          };
        }
      }
    }
    const status: MatchStatus = m.missingCount <= 2 ? 'nearMiss' : 'locked';
    return { ...m, status, prepDishes };
  });
}
