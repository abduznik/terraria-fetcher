# Terraria Fetcher

A static, offline-first Terraria item/recipe fetcher plus curated class build guides
(Melee, Ranged, Mage, Summoner, Rogue) for every progression stage, hosted on GitHub Pages.

## Structure

- `index.html`, `fetcher.html`, `builds/index.html` — the site pages (plain HTML/CSS/JS, no build step)
- `assets/` — CSS and client-side JS
- `data/items.json`, `data/npcs.json`, `data/meta.json` — generated item/recipe/NPC database
- `builds/builds.json` — hand-curated build guide content, grouped by class + stage
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
