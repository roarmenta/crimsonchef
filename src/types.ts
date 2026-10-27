/** Category id. Each domain declares its own categories (see Domain.categories). */
export type Category = string;

export interface Ingredient {
  id: string;
  name: string;
  category: Category;
  /** Extra names the text parser accepts (lowercase). The display name is always accepted. */
  aliases?: string[];
  /**
   * For crafted intermediates — a cooked dish used in a Feast, a lower-tier gear core —
   * the id of the recipe in this domain that produces one unit of it.
   */
  craftedBy?: string;
}

export interface IngredientGroup {
  label: string;
  members: string[];
}

/** One way to satisfy a requirement slot: N of a specific ingredient, or N drawn from a group. */
export interface SlotOption {
  ingredient?: string;
  group?: string;
  qty: number;
}

/** A requirement slot; options are alternatives (first satisfiable one is used). */
export interface Requirement {
  options: SlotOption[];
}

export interface Recipe {
  id: string;
  name: string;
  station: string;
  tool: string;
  effects: string[];
  requirements: Requirement[];
  /** Knowledge gate: id of the blueprint that must be learned before crafting (see Domain.blueprints). */
  blueprint?: string;
  /** Free-text footnotes shown on the card, e.g. a random "special synthesis" shortcut. */
  notes?: string[];
}

export interface Blueprint {
  id: string;
  name: string;
}

export interface CategoryDef {
  id: Category;
  label: string;
  /** Collapsed by default in the palette. */
  collapsed?: boolean;
}

/** UI copy that differs between crafting systems. */
export interface DomainText {
  paletteHeading: string;
  paletteSearch: string;
  pouchEmpty: string;
  pasteExample: string;
  recipeSearch: string;
  allStations: string;
  emptyHint: string;
  /** Badge for recipes that become craftable after crafting intermediates. */
  prepBadge: string;
  /** Lead-in for the list of intermediates, e.g. "First cook:". */
  prepLead: string;
  footer: string;
  /** Plural noun for the things in the pouch: "ingredients", "materials". */
  itemNoun: string;
  blueprintsHeading: string;
  blueprintsNote: string;
}

/** Everything the engine and UI need to run one crafting system (cooking, Abyss Gear, …). */
export interface Domain {
  /** Used in the hash route (#/<id>) and localStorage keys — never rename once shipped. */
  id: string;
  label: string;
  icon: string;
  subtitle: string;
  dataVersion: string;
  /** localStorage key for this domain's pouch — never rename once shipped. */
  storageKey: string;
  ingredients: Ingredient[];
  ingredientById: Record<string, Ingredient>;
  groups: Record<string, IngredientGroup>;
  recipes: Recipe[];
  stations: string[];
  categories: CategoryDef[];
  blueprints: Blueprint[];
  text: DomainText;
}
