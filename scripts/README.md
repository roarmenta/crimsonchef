# Data pipelines

## Abyss Gear (`src/data/abyss.ts`)

Generated from the Crimson Desert Database at crimsondesert.gaming.tools.

1. Open https://crimsondesert.gaming.tools/crafting/abyssgear, open the browser console, paste
   `abyss-extract.browser.js` and press Enter. It walks every family's recipe page (about a
   minute, paced) and copies the result to the clipboard.
2. Save the clipboard as `abyss-raw.json` in this folder.
3. Run `node scripts/gen-abyss.mjs "gaming.tools YYYY-MM-DD"` to rewrite `src/data/abyss.ts`.
4. `npm run dev` — `defineDomain()` validates every cross-reference and throws on a typo.

New families need their id added to the lists at the top of the extractor; the category lists
in `gen-abyss.mjs` decide whether an item_skill family is a Special, Tactical or Skill gear.

Cooking data (`src/data/cooking.ts`) is maintained by hand from IGN's cooking guide.
