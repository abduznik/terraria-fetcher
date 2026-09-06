# Terraria Fetcher

**Live site: https://abduznik.github.io/terraria-fetcher/**

A static, offline-first Terraria item and recipe database with instant search, an
interactive crafting-tree visualizer, a boss and enemy drop lookup, a side-by-side item
comparison tool, curated class build guides (Melee, Ranged, Mage, Summoner, Rogue) for
every progression stage, and a full progression checklist — all hosted on GitHub Pages
and built client-side from a single static dataset, with no backend and no external
API calls at runtime.

## Features

- **Item & recipe search** — instant, fuzzy, offline search across the full Terraria item database, including crafting stations, ingredients, drop sources, and NPC shop listings
- **Interactive crafting tree** — a visual node/branch diagram of any item's recipe chain, expandable down to base materials, with click-to-re-root navigation and back/forward history
- **Boss & enemy drop lookup** — reverse-search any boss or enemy to see its full loot table with drop rates and game-mode breakdowns
- **Item comparison** — compare up to four weapons, armor pieces, or accessories side by side on damage, defense, rarity, and value
- **Class build guides** — complete weapon, armor, and accessory loadouts for Melee, Ranged, Mage, Summoner, and Rogue across every boss progression stage
- **Progression checklist** — bosses, NPCs, money goals, and optional content per stage, with progress saved locally in the browser

## Structure

- `index.html`, `fetcher.html`, `tree.html`, `bosses.html`, `compare.html`, `builds/index.html`, `checklist/index.html` — the site pages (plain HTML/CSS/JS, no build step)
- `assets/` — CSS and client-side JS
- `data/items.json`, `data/npcs.json`, `data/meta.json` — generated item/recipe/NPC database
- `builds/builds.json` — hand-curated build guide content, grouped by class + stage
- `checklist/checklist.json` — hand-curated progression checklist (bosses, NPCs, money goals, optional content) grouped by stage; check-state is saved per-stage in the browser's localStorage
- `scripts/fetch_data.py` — one-off/periodic script that pulls item & recipe data from
  the [terraria.wiki.gg](https://terraria.wiki.gg) Cargo API and writes it into `data/`
- `.github/workflows/fetch-data.yml` — runs `fetch_data.py` on demand (or monthly) and commits the result
- `.github/workflows/pages.yml` — deploys the site to GitHub Pages on every push to `main`

## Refreshing the item database

The dataset is **not** fetched live at page-load time — it's pre-built and committed so the
site works instantly and fully offline. To refresh it:

1. Go to the repo's **Actions** tab
2. Run the **Fetch Terraria Data** workflow manually (`workflow_dispatch`)
3. It commits updated `data/*.json` files back to `main`, which triggers a Pages redeploy

It also runs automatically on the 1st of each month in case new items are added to the wiki.

## Local development

No build step — just open `index.html` in a browser, or serve the folder locally:

```
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Data attribution

Item, recipe, and NPC data is sourced from the [Official Terraria Wiki](https://terraria.wiki.gg),
whose content is licensed under CC BY-NC-SA. This project is a fan-made tool and is not affiliated
with Re-Logic.
