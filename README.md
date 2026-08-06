# 🔥 Crimson Chef

A cooking companion for **Crimson Desert**. Add the ingredients you have — by drag-and-drop,
tap, or pasting a list — and instantly see every recipe you can cook, what you're close to,
and what each dish needs.

**Data:** compiled from IGN's [Cooking Guide – All Cooking Recipes](https://www.ign.com/wikis/crimson-desert/Cooking_Guide_-_All_Cooking_Recipes)
(page updated 2026-03-20). Generic Meat/Vegetable/Grain/Fruit/Fish/Seafood slots accept any
ingredient of that category, mirroring the game's substitution system. Feast recipes that
require cooked dishes are flagged "Cook prereqs" when you could cook the prerequisite dishes
from your current ingredients.

Fan-made tool — not affiliated with Pearl Abyss or IGN.

## Develop

```bash
npm install
npm run dev      # local dev server
npm run build    # type-check + production build to dist/
```

Stack: Vite + React + TypeScript, no other runtime dependencies. Inventory persists in
`localStorage`. All matching runs client-side in `src/matcher.ts`; the dataset lives in
`src/data/gamedata.ts`.

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

## Updating recipe data

When a game patch changes recipes, edit `src/data/gamedata.ts` and bump `DATA_VERSION`.
Ingredient substitution groups are defined in `GROUPS`; each recipe requirement is a slot that
accepts either a specific ingredient or any member of a group.
