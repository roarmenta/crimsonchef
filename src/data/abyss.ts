import { defineDomain } from '../domain';
import type { Blueprint, Ingredient, Recipe, Requirement } from '../types';

// Data source: Crimson Desert Database (crimsondesert.gaming.tools), Crafting Manuals →
// Abyss Gears, data-mined from the game files. Seed dataset: the 15 Enhanced Gear families
// (Special, Skill and Tactical gears to follow).
//
// Every family follows the same shape: tier I = Abyss Cell + a gem + a reagent, and each
// higher tier is synthesized from two cores of the tier below (same blueprint throughout).
// Reagent slots accept any item of an in-game category ("Attack Reagent", "Defense Reagent",
// "Medicinal Amphibians"), so they're modelled as category tokens — the same approach as
// cooking's Vegetable/Grain/Fruit.
const DATA_VERSION = 'gaming.tools 2026-10-26 · Enhanced Gears';

const I = (ingredient: string, qty: number): Requirement => ({ options: [{ ingredient, qty }] });

const INGREDIENTS: Ingredient[] = [
  { id: 'abyss_cell', name: 'Abyss Cell', category: 'cell', aliases: ['abyss cells', 'cell', 'cells'] },
  // Gems
  { id: 'garnet', name: 'Garnet', category: 'gem' },
  { id: 'azurite', name: 'Azurite', category: 'gem' },
  { id: 'diamond', name: 'Diamond', category: 'gem' },
  { id: 'epidote', name: 'Epidote', category: 'gem' },
  // Reagents — category tokens: any item of that in-game category fills the slot
  {
    id: 'attack_reagent',
    name: 'Attack Reagent (any)',
    category: 'reagent',
    aliases: ['attack reagent', 'attack reagents', 'orange-barred sulphur butterfly', 'sulphur butterfly', 'butterfly', 'butterflies', 'shrubby sophora', 'sophora', 'peony', 'peonies'],
  },
  {
    id: 'defense_reagent',
    name: 'Defense Reagent (any)',
    category: 'reagent',
    aliases: ['defense reagent', 'defense reagents', 'defence reagent', 'cockroach', 'cockroaches', 'false starwort', 'starwort', 'blue lavender', 'lavender'],
  },
  {
    id: 'medicinal_amphibian',
    name: 'Medicinal Amphibian (any)',
    category: 'reagent',
    aliases: ['alchemy material', 'amphibian', 'amphibians', 'poison frog', 'tree frog', 'frog', 'frogs', 'toad', 'toads'],
  },
  { id: 'palmar_leaf', name: 'Palmar Leaf', category: 'reagent', aliases: ['palmer leaf'] },
  { id: 'skyroot', name: 'Skyroot', category: 'reagent' },
  { id: 'bears_gallbladder', name: "Bear's Gallbladder", category: 'reagent', aliases: ['bear gallbladder', 'bears gallbladder', 'gallbladder'] },
];

interface Family {
  id: string;
  name: string;
  gem: string;
  /** Third ingredient of the tier I recipe (a reagent token or a specific item). */
  reagent: string;
  /** Equipment the core sockets into. */
  fits: string;
  effect: string;
}

const FAMILIES: Family[] = [
  { id: 'aegis', name: 'Aegis', gem: 'azurite', reagent: 'defense_reagent', fits: 'Armor, Shields', effect: 'Damage Reduction bonus' },
  { id: 'ascent', name: 'Ascent', gem: 'diamond', reagent: 'defense_reagent', fits: 'Armor', effect: 'Climb Speed up' },
  { id: 'composure', name: 'Composure', gem: 'epidote', reagent: 'palmar_leaf', fits: 'Armor', effect: 'Spirit regeneration bonus' },
  { id: 'destruction', name: 'Destruction', gem: 'garnet', reagent: 'attack_reagent', fits: 'Weapons, Gloves, Footwear', effect: 'Attack up' },
  { id: 'flameward', name: 'Flameward', gem: 'diamond', reagent: 'medicinal_amphibian', fits: 'Armor', effect: 'Fire Resistance up' },
  { id: 'fortification', name: 'Fortification', gem: 'azurite', reagent: 'defense_reagent', fits: 'Armor, Shields', effect: 'Defense up' },
  { id: 'fortitude', name: 'Fortitude', gem: 'azurite', reagent: 'defense_reagent', fits: 'Shields, Gloves, Footwear', effect: 'Less Stamina used while guarding' },
  { id: 'frostward', name: 'Frostward', gem: 'diamond', reagent: 'medicinal_amphibian', fits: 'Armor', effect: 'Ice Resistance up' },
  { id: 'haste', name: 'Haste', gem: 'diamond', reagent: 'defense_reagent', fits: 'Armor', effect: 'Movement Speed up' },
  { id: 'insight', name: 'Insight', gem: 'garnet', reagent: 'attack_reagent', fits: 'Weapons, Gloves, Footwear', effect: 'Critical Rate up' },
  { id: 'shockward', name: 'Shockward', gem: 'diamond', reagent: 'medicinal_amphibian', fits: 'Armor', effect: 'Lightning Resistance up' },
  { id: 'surge', name: 'Surge', gem: 'diamond', reagent: 'medicinal_amphibian', fits: 'Armor', effect: 'Swim Speed up' },
  { id: 'swift', name: 'Swift', gem: 'diamond', reagent: 'attack_reagent', fits: 'Weapons, Gloves, Footwear', effect: 'Attack Speed up' },
  { id: 'vigor', name: 'Vigor', gem: 'epidote', reagent: 'skyroot', fits: 'Armor', effect: 'Stamina regeneration bonus' },
  { id: 'vitality', name: 'Vitality', gem: 'epidote', reagent: 'bears_gallbladder', fits: 'Armor', effect: 'Health regeneration bonus' },
];

const RECIPES: Recipe[] = [];
const BLUEPRINTS: Blueprint[] = [];

for (const f of FAMILIES) {
  const blueprint = `bp_${f.id}`;
  BLUEPRINTS.push({ id: blueprint, name: f.name });
  // Tier I and II cores are ingredients of the next tier; tier III is a final product.
  INGREDIENTS.push(
    { id: `core_${f.id}_1`, name: `${f.name} I`, category: 'core', aliases: [`${f.name.toLowerCase()} 1`], craftedBy: `${f.id}_1` },
    { id: `core_${f.id}_2`, name: `${f.name} II`, category: 'core', aliases: [`${f.name.toLowerCase()} 2`], craftedBy: `${f.id}_2` },
  );
  const base = { station: 'Enhanced Gear', tool: `Fits: ${f.fits}`, effects: [f.effect], blueprint };
  RECIPES.push(
    { id: `${f.id}_1`, name: `${f.name} I`, ...base, requirements: [I('abyss_cell', 1), I(f.gem, 1), I(f.reagent, 1)] },
    { id: `${f.id}_2`, name: `${f.name} II`, ...base, requirements: [I(`core_${f.id}_1`, 2)] },
    { id: `${f.id}_3`, name: `${f.name} III`, ...base, requirements: [I(`core_${f.id}_2`, 2)] },
  );
}

export const ABYSS = defineDomain({
  id: 'abyss',
  label: 'Abyss Gear',
  icon: '💠',
  subtitle: 'Crimson Desert Abyss Gear crafting companion',
  dataVersion: DATA_VERSION,
  storageKey: 'crimson-chef-abyss-inventory-v1',
  ingredients: INGREDIENTS,
  groups: {},
  recipes: RECIPES,
  stations: ['Enhanced Gear'],
  categories: [
    { id: 'cell', label: 'Abyss Cells' },
    { id: 'gem', label: 'Gems' },
    { id: 'reagent', label: 'Reagents & Herbs' },
    { id: 'core', label: 'Gear Cores (crafted)', collapsed: true },
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
      'Your pouch is empty — add materials to light up gear cores. Everything below shows what each core needs; higher tiers are synthesized from two cores of the tier below.',
    prepBadge: 'Craft lower tiers',
    prepLead: 'First craft:',
    itemNoun: 'materials',
    blueprintsHeading: 'Gear Blueprints',
    blueprintsNote:
      'Blueprints are sold by the witches in each region; read one to learn it. Tiers II and III use the same blueprint as tier I.',
    footer: `Abyss Gear data compiled from the Crimson Desert Database at crimsondesert.gaming.tools (${DATA_VERSION}). Seed dataset: the 15 Enhanced Gear families — Special, Skill and Tactical gears are coming. Reagent slots accept any item of that in-game category. Fan-made tool — not affiliated with Pearl Abyss.`,
  },
});
