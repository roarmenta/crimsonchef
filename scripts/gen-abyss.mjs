#!/usr/bin/env node
/**
 * Generates src/data/abyss.ts from scripts/abyss-raw.json.
 *
 * abyss-raw.json is produced by scripts/abyss-extract.browser.js (run it in the browser
 * console on any crimsondesert.gaming.tools page). After a game patch: re-extract, run
 *   node scripts/gen-abyss.mjs "gaming.tools YYYY-MM-DD"
 * and `npm run build` — defineDomain() validates every cross-reference in dev.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const families = JSON.parse(readFileSync(join(here, 'abyss-raw.json'), 'utf8'));
const dataVersion = process.argv[2] ?? 'gaming.tools 2026-10-27';

// Gear types come from the site's category pages (Special Gears / Tactical Gears); every
// other item_skill recipe is a Skill Gear.
const SKILL = 'recipe_item_skill_abyssgear_';
const SPECIAL = new Set(
  ['skillpointexp_lv1', 'collectdrop_plant_lv1', 'collectdrop_animal_lv1', 'collectdrop_ore_lv1', 'collectdrop_log_lv1', 'equip_addpetfriendly_lv1', 'equipdroprate_lv1', 'reducecraftmaterial_lv1', 'addkillskilllevel_lv1', 'equip_addhorseexp_lv1', 'addmoneydroprate_lv1', 'foodskilllevelup_lv1', 'blockammoconsume_lv1', 'additionalthief_lv1', 'attack_hprecover_lv1', 'dam_up_rotationbash', 'combo_lv1', 'addcriticalratebymaterialkey_leatherarmor_lv1', 'contributionexp_lv1', 'addcriticalratebymaterialkey_platearmor_lv1', 'addcriticalratebymaterialkey_fabricarmor_lv1', 'addfrendly_lv1', 'attack_mprecover_lv1', 'attack_sprecover_lv1'].map((s) => SKILL + s),
);
const TACTICAL = new Set(
  ['abyssgrass_immune', 'creature_additionaldamage_lv1', 'commonanimal_additionaldamage_lv1', 'commonhumanoid_additionaldamage_lv1', 'immune_bismuth', 'hyena_poisonimmune', 'commonhexe_additionaldamage_lv1', 'boss_additionaldamage_lv1', 'commongolem_additionaldamage_lv1', 'machine_additionaldamage_lv1'].map((s) => SKILL + s),
);
const TYPE_ORDER = ['Enhanced Gear', 'Special Gear', 'Tactical Gear', 'Skill Gear', 'Abyss Parts'];

function gearType(f) {
  if (f.id.startsWith('recipe_item_stat_')) return 'Enhanced Gear';
  if (f.id === 'recipe_deactived_abyss_artifact') return 'Abyss Parts';
  if (SPECIAL.has(f.id)) return 'Special Gear';
  if (TACTICAL.has(f.id)) return 'Tactical Gear';
  return 'Skill Gear';
}

const ROMAN = { 1: 'I', 2: 'II', 3: 'III' };
const TIER = { I: 1, II: 2, III: 3, l: 1 /* "Efficiency l" is a typo upstream */ };
const slug = (s) => s.toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const uniq = (xs) => [...new Set(xs)];
const isCore = (itemId) => /^item_(stat|skill)_abyssgear_/.test(itemId);
const deterministic = (r) => /\(\+0\)$/.test(r.n);

function parseTier(itemName) {
  const m = itemName.match(/^(.*?)\s+(I|II|III|l)$/);
  return m ? { base: m[1], tier: TIER[m[2]] } : { base: itemName, tier: null };
}

// Pass 1: every deterministic recipe, keyed by the item it produces.
const madeBy = new Map();
for (const f of families) {
  for (const r of f.r) {
    if (!deterministic(r)) continue;
    const [resName, resId] = r.o[0];
    const { base, tier } = parseTier(resName);
    madeBy.set(resId, {
      recipeId: tier ? `${slug(base)}_${tier}` : slug(base),
      name: tier ? `${base} ${ROMAN[tier]}` : base,
      base,
      tier,
      family: f,
      r,
    });
  }
}

// Pass 2: ingredients. Reagent groups become category tokens (any member fills the slot),
// like cooking's Vegetable; their member names become parser aliases.
const GEMS = new Set(['Garnet', 'Azurite', 'Diamond', 'Epidote']);
const BASE_ALIASES = {
  abyss_cell: ['abyss cells', 'cell', 'cells'],
  palmar_leaf: ['palmer leaf'],
  bears_gallbladder: ['bear gallbladder', 'bears gallbladder', 'gallbladder'],
};
const GROUP_ALIASES = {
  attack_reagent: ['butterfly', 'butterflies'],
  defense_reagent: ['defence reagent', 'defence reagents'],
  alchemy_material: ['medicinal amphibian', 'medicinal amphibians', 'amphibian', 'amphibians', 'frog', 'frogs', 'toad', 'toads'],
};
const ingredients = new Map();

function ingredientIdFor(entry) {
  if (!Array.isArray(entry)) {
    const id = slug(entry.g);
    if (!ingredients.has(id)) {
      ingredients.set(id, {
        id,
        name: `${entry.g} (any)`,
        category: 'reagent',
        aliases: uniq([entry.g.toLowerCase(), `${entry.g.toLowerCase()}s`, ...(GROUP_ALIASES[id] ?? []), ...entry.m.map(([n]) => n.toLowerCase())]),
        members: entry.m.map(([n]) => n),
      });
    }
    return id;
  }
  const [name, itemId] = entry;
  if (isCore(itemId)) {
    const made = madeBy.get(itemId);
    if (!made) throw new Error(`core "${name}" (${itemId}) is used as an ingredient but has no deterministic recipe`);
    const id = made.tier ? `core_${slug(made.base)}_${made.tier}` : `core_${slug(made.base)}`;
    if (!ingredients.has(id)) {
      ingredients.set(id, {
        id,
        name: made.name,
        category: made.family.id.startsWith('recipe_item_stat_') ? 'core_enhanced' : 'core_other',
        aliases: made.tier ? [`${made.base.toLowerCase()} ${made.tier}`] : [],
        craftedBy: made.recipeId,
      });
    }
    return id;
  }
  const id = slug(name);
  if (!ingredients.has(id)) {
    ingredients.set(id, {
      id,
      name,
      category: name === 'Abyss Cell' ? 'cell' : GEMS.has(name) ? 'gem' : 'material',
      aliases: BASE_ALIASES[id] ?? [],
    });
  }
  return id;
}

const VERBS = { grant: 'Grants', reduce: 'Reduces', increase: 'Increases', block: 'Blocks', prevent: 'Prevents', provide: 'Provides', restore: 'Restores', recover: 'Recovers', add: 'Adds', make: 'Makes', allow: 'Allows', apply: 'Applies', deal: 'Deals', boost: 'Boosts', convert: 'Converts', lower: 'Lowers', raise: 'Raises', decrease: 'Decreases', nullify: 'Nullifies', negate: 'Negates', ignore: 'Ignores', gain: 'Gains', give: 'Gives', summon: 'Summons', enhance: 'Enhances', improve: 'Improves' };

function effectOf(f) {
  if (!f.effect) return null;
  const e = f.effect.replace(/^An Abyss gear equipped in gear sockets to\s+/, '').replace(/\.\s*$/, '');
  if (e === f.effect) return e;
  const [first, ...rest] = e.split(' ');
  return [VERBS[first] ?? first[0].toUpperCase() + first.slice(1), ...rest].join(' ');
}

function skillHint(f) {
  const m = f.hint?.match(/^※\s*([^:]+):\s*(.+)$/);
  return m && m[1].trim() === f.name ? m[2].trim() : null;
}

const ingName = (e) => (Array.isArray(e) ? e[0] : e.g);
const ingQty = (e) => (Array.isArray(e) ? e[2] : e.q);
const synthesisNote = (rr) =>
  `Special synthesis (random): ${rr.i.map((e) => `${ingQty(e)}× ${ingName(e)}`).join(' + ')} → ${rr.o.map(([n, , c]) => `${n} (${c}%)`).join(' or ')}`;

// Pass 3: recipes and blueprints, grouped by gear type then name.
const recipes = [];
const blueprints = [];
const sorted = [...families].sort((a, b) => TYPE_ORDER.indexOf(gearType(a)) - TYPE_ORDER.indexOf(gearType(b)) || a.name.localeCompare(b.name));
for (const f of sorted) {
  const type = gearType(f);
  const bpId = `bp_${slug(f.name)}`;
  blueprints.push({ id: bpId, name: f.name });
  const tool = f.fits ? `Fits: ${f.fits}` : 'Crafting material';
  const effects = [effectOf(f), skillHint(f)].filter(Boolean);
  const randoms = f.r.filter((r) => !deterministic(r));
  const mades = f.r.filter(deterministic).map((r) => madeBy.get(r.o[0][1])).sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0));
  for (const made of mades) {
    recipes.push({
      type,
      family: f.name,
      fits: f.fits,
      id: made.recipeId,
      name: made.name,
      tool,
      effects,
      blueprint: bpId,
      requirements: made.r.i.map((e) => ({ id: ingredientIdFor(e), qty: ingQty(e), isGroup: !Array.isArray(e) })),
      notes: randoms.filter((rr) => rr.o[0][1] === made.r.o[0][1]).map(synthesisNote),
    });
  }
}

// A reagent category whose members include items that are also specific ingredients here
// (Bear's Gallbladder is a Defense Reagent *and* Vitality I's own reagent) becomes a real
// substitution group: the category token plus those items, like cooking's any_fruit.
const groups = new Map();
for (const ing of ingredients.values()) {
  if (ing.category !== 'reagent') continue;
  const specific = uniq(ing.members.map(slug).filter((id) => ingredients.has(id) && id !== ing.id));
  if (specific.length === 0) continue;
  groups.set(`any_${ing.id}`, { label: ing.name, members: [ing.id, ...specific] });
  // Typing that item's name must resolve to the item itself, not to the category token.
  ing.aliases = ing.aliases.filter((a) => !specific.includes(slug(a)));
}
const slotFor = (x) => (x.isGroup && groups.has(`any_${x.id}`) ? `G(${q(`any_${x.id}`)}, ${x.qty})` : `I(${q(x.id)}, ${x.qty})`);

// Sanity checks beyond what defineDomain() does.
const recipeIds = new Set();
for (const r of recipes) {
  if (recipeIds.has(r.id)) throw new Error(`duplicate recipe id ${r.id}`);
  recipeIds.add(r.id);
}
for (const ing of ingredients.values()) {
  if (ing.craftedBy && !recipeIds.has(ing.craftedBy)) throw new Error(`${ing.id} craftedBy missing recipe ${ing.craftedBy}`);
}

// Emit.
const CATEGORY_ORDER = ['cell', 'gem', 'reagent', 'material', 'core_enhanced', 'core_other'];
const CATEGORY_LABELS = {
  cell: 'Abyss Cells',
  gem: 'Gems',
  reagent: 'Reagents (any of a kind)',
  material: 'Rare Materials',
  core_enhanced: 'Enhanced Cores (crafted)',
  core_other: 'Special & Tactical Cores (crafted)',
};
const CATEGORY_COMMENTS = {
  reagent: 'Reagent categories — any member item fills the slot; member names are parser aliases',
  core_enhanced: 'Crafted cores that other recipes consume',
};
const ingList = [...ingredients.values()].sort(
  (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.name.localeCompare(b.name),
);
const counts = {};
for (const f of families) counts[gearType(f)] = (counts[gearType(f)] ?? 0) + 1;

let out = `// GENERATED by scripts/gen-abyss.mjs from scripts/abyss-raw.json — do not edit by hand.
//
// Data source: Crimson Desert Database (crimsondesert.gaming.tools), Crafting Manuals →
// Abyss Gears, data-mined from the game files. ${families.length} families: ${TYPE_ORDER.map((t) => `${counts[t] ?? 0} ${t}`).join(', ')}.
//
// Enhanced tier I cores are made from an Abyss Cell, a gem and a reagent; every other
// family is assembled from Enhanced tier I cores. Tiered families synthesize tier N+1 from
// two tier N cores (same blueprint); Skill Gears are single unique cores. Random
// "special synthesis" shortcuts are kept as notes on the recipe they most likely produce.
import { defineDomain } from '../domain';
import type { Blueprint, Ingredient, IngredientGroup, Recipe, Requirement } from '../types';

const DATA_VERSION = ${q(dataVersion)};

const I = (ingredient: string, qty: number): Requirement => ({ options: [{ ingredient, qty }] });
const G = (group: string, qty: number): Requirement => ({ options: [{ group, qty }] });

const INGREDIENTS: Ingredient[] = [
`;
let lastCat = null;
for (const ing of ingList) {
  if (ing.category !== lastCat) {
    out += `  // ${CATEGORY_COMMENTS[ing.category] ?? CATEGORY_LABELS[ing.category]}\n`;
    lastCat = ing.category;
  }
  const fields = [`id: ${q(ing.id)}`, `name: ${q(ing.name)}`, `category: ${q(ing.category)}`];
  if (ing.aliases.length > 0) fields.push(`aliases: [${ing.aliases.map(q).join(', ')}]`);
  if (ing.craftedBy) fields.push(`craftedBy: ${q(ing.craftedBy)}`);
  out += `  { ${fields.join(', ')} },\n`;
}
out += `];

// Slots that accept the category token or any of these specific items.
const GROUPS: Record<string, IngredientGroup> = {
${[...groups].map(([id, g]) => `  ${id}: { label: ${q(g.label)}, members: [${g.members.map(q).join(', ')}] },`).join('\n')}
};

const BLUEPRINTS: Blueprint[] = [
${blueprints.map((b) => `  { id: ${q(b.id)}, name: ${q(b.name)} },`).join('\n')}
];

const RECIPES: Recipe[] = [
`;
let lastType = null;
let lastFamily = null;
for (const r of recipes) {
  if (r.type !== lastType) {
    out += `  // ───── ${r.type} ─────\n`;
    lastType = r.type;
    lastFamily = null;
  }
  if (r.family !== lastFamily) {
    out += `  // ${r.family}\n`;
    lastFamily = r.family;
  }
  const fields = [
    `id: ${q(r.id)}`,
    `name: ${q(r.name)}`,
    `station: ${q(r.type)}`,
    `tool: ${q(r.tool)}`,
    `effects: [${r.effects.map(q).join(', ')}]`,
    `blueprint: ${q(r.blueprint)}`,
    `requirements: [${r.requirements.map(slotFor).join(', ')}]`,
  ];
  if (r.notes.length > 0) fields.push(`notes: [${r.notes.map(q).join(', ')}]`);
  out += `  { ${fields.join(', ')} },\n`;
}
out += `];

export const ABYSS = defineDomain({
  id: 'abyss',
  label: 'Abyss Gear',
  icon: '💠',
  subtitle: 'Crimson Desert Abyss Gear crafting companion',
  dataVersion: DATA_VERSION,
  storageKey: 'crimson-chef-abyss-inventory-v1',
  ingredients: INGREDIENTS,
  groups: GROUPS,
  recipes: RECIPES,
  stations: [${TYPE_ORDER.map(q).join(', ')}],
  categories: [
${CATEGORY_ORDER.map((c) => `    { id: ${q(c)}, label: ${q(CATEGORY_LABELS[c])}${c.startsWith('core_') ? ', collapsed: true' : ''} },`).join('\n')}
  ],
  blueprints: BLUEPRINTS,
  text: {
    paletteHeading: 'Materials',
    paletteSearch: 'Search materials…',
    pouchEmpty: 'Drag materials here, tap ＋ in the list, or paste a list below — gear updates live.',
    pasteExample: 'Paste a list… e.g. "4 abyss cell, 2 garnet, peony x3"',
    recipeSearch: 'Search gear…',
    allStations: 'All gear types',
    emptyHint:
      'Your pouch is empty — add materials to light up gear cores. Everything below shows what each core needs; Special, Tactical and Skill gears are built from Enhanced tier I cores, and higher tiers from two cores of the tier below.',
    prepBadge: 'Craft lower tiers',
    prepLead: 'First craft:',
    itemNoun: 'materials',
    blueprintsHeading: 'Gear Blueprints',
    blueprintsNote:
      'Blueprints are sold by the witches in each region; read one to learn it. Tiers II and III use the same blueprint as tier I.',
    footer: \`Abyss Gear data compiled from the Crimson Desert Database at crimsondesert.gaming.tools (\${DATA_VERSION}): all ${families.length} gear families. Reagent slots accept any item of that in-game category. Fan-made tool — not affiliated with Pearl Abyss or gaming.tools.\`,
  },
});
`;

writeFileSync(join(here, '..', 'src', 'data', 'abyss.ts'), out);
console.log(`wrote src/data/abyss.ts: ${ingredients.size} ingredients, ${blueprints.length} blueprints, ${recipes.length} recipes (${Object.entries(counts).map(([t, n]) => `${n} ${t}`).join(', ')})`);
