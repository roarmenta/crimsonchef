export type Category = 'meat' | 'seafood' | 'produce' | 'basic' | 'special' | 'dish';

export interface Ingredient {
  id: string;
  name: string;
  category: Category;
  /** Extra names the text parser accepts (lowercase). The display name is always accepted. */
  aliases?: string[];
  /** For cooked dishes: the recipe id that produces this dish, when it exists in the dataset. */
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

export type Station =
  | 'Grilled'
  | 'Field Grill'
  | 'Field Pot'
  | 'Special Griddle'
  | 'Special Pot'
  | 'Feast';

export interface Recipe {
  id: string;
  name: string;
  station: Station;
  tool: string;
  effects: string[];
  requirements: Requirement[];
}
