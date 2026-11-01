# 🔥 Crimson Chef

A crafting companion for **Crimson Desert**. Add what you have — by drag-and-drop, tap, or
pasting a list — and instantly see everything you can make, what you're close to, and what
each item needs.

Two sections, each with its own pouch:

- **🍳 Cooking** — all 86 recipes. Data compiled from IGN's
  [Cooking Guide – All Cooking Recipes](https://www.ign.com/wikis/crimson-desert/Cooking_Guide_-_All_Cooking_Recipes)
  (page updated 2026-03-20). Generic Meat/Vegetable/Grain/Fruit/Fish/Seafood slots accept any
  ingredient of that category, mirroring the game's substitution system. Feasts that need
  cooked dishes are flagged "Cook prereqs" when you could cook those dishes from your pouch.
- **💠 Abyss Gear** — gear cores crafted by the witches. Data compiled from the
  [Crimson Desert Database](https://crimsondesert.gaming.tools/crafting/abyssgear). Currently
  all 94 families (176 recipes): 15 Enhanced, 24 Special, 10 Tactical and 44 Skill gears, plus
  the Faded Abyss Artifact. Enhanced tier I cores are made from an Abyss Cell, a gem and a
  reagent (or a rare material for Composure, Vigor and Vitality); every other gear is
  assembled from Enhanced tier I cores, and tiered families
  synthesize tier II and III from two cores of the tier below. The planner expands the whole
  chain ("First craft: Insight I ×4, Fortitude I ×4, Vigor I ×4, Fortune I ×4, Fortune II ×2")
  and only counts it when your materials really cover it. An optional **blueprint tracker**
  moves what you haven't learned yet into a "Blueprint needed" section.

Fan-made tool — not affiliated with Pearl Abyss, IGN, or gaming.tools.

## Inventory screenshot scanning

The 📷 **Scan screenshot** button in either section reads a screenshot (or phone photo) of
the in-game Materials inventory and adds what it recognizes to that section's pouch, with a
review step before anything is added. Each section sends its own vocabulary and rules, so the
Cooking scan collapses onions into "Vegetable" while the Abyss Gear scan maps butterflies to
"Attack Reagent" and reads socket gems as cores. It uses Claude vision via a bring-your-own Anthropic API key: the key is
stored only in the browser's localStorage and sent only to api.anthropic.com, and each scan
costs a few cents on the key owner's account (Claude Opus 5.5, with Anthropic's default
fallback if a safety classifier declines an image). Type `demo` instead of a key to preview the
flow with sample data. Images are sent to Anthropic for analysis. The scan engine
(`src/scanner.ts`) is lazy-loaded so the SDK stays out of the main bundle, and responses are
constrained by a structured-output schema whose item ids are an enum of the section's
vocabulary — out-of-vocabulary results are impossible.

## Develop

```bash
npm install
npm run dev      # local dev server
npm run build    # type-check + production build to dist/
```

Stack: Vite + React + TypeScript; the Anthropic SDK is the only other runtime dependency and
loads lazily, only when someone scans. Pouches and blueprint
progress persist in `localStorage`. All matching runs client-side.

## How it's put together

Each crafting system is a **domain** (`src/data/cooking.ts`, `src/data/abyss.ts`) built with
`defineDomain()` from `src/domain.ts`: its ingredients, substitution groups, recipes, stations,
palette categories, blueprints and UI copy. In dev, `defineDomain` validates every
cross-reference (unknown ingredient ids, dangling `craftedBy`, missing blueprints) and throws,
so a data typo fails at startup instead of silently hiding a recipe. The tab bar, palette,
pouch and results are generic over the domain; `src/App.tsx` picks the domain from the hash
route (`#/cooking`, `#/abyss`).

The matcher (`src/matcher.ts`) fills each recipe slot greedily from the pouch, then — for
ingredients that are themselves crafted (`craftedBy`) — plans the missing ones recursively,
consuming real quantities as it goes. Statuses: **craftable**, **prep** (craftable after
intermediate crafts), **blueprint** (materials are fine, knowledge is missing), **almost there**
(at most two slots short, with something already in hand), and **locked**.

## Deploy

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds the site and deploys
it with GitHub Pages. One-time setup in the repo:
**Settings → Pages → Build and deployment → Source: GitHub Actions.**

### Custom domain (optional)

To serve the app from a subdomain you own:

1. At your DNS provider, add a `CNAME` record for the subdomain pointing to
   `<your-github-username>.github.io`.
2. In the repo: Settings → Pages → Custom domain → enter the subdomain, and enable
   **Enforce HTTPS** once the certificate is issued.

The Vite build uses `base: './'`, so the app works at any URL (project path or custom domain)
without configuration changes.

## Updating game data

Cooking: edit `src/data/cooking.ts` by hand and bump its `DATA_VERSION`. Abyss Gear:
`src/data/abyss.ts` is generated — see `scripts/README.md` for the extract-and-generate steps. Substitution groups are defined in `groups`; each recipe requirement is a slot
that accepts either a specific ingredient or any member of a group. To add a crafting system,
create a new domain file, build it with `defineDomain()`, and add it to `DOMAINS` in
`src/data/index.ts` — the tab, pouch and matcher come for free.
