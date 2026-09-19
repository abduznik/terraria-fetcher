# Roadmap

This tracks where the project is headed. Each phase corresponds to a GitHub milestone;
individual tasks are tracked as issues linked below.

## v1.1 - Accuracy & Polish

The site currently oversells its "offline" capability in some copy. This phase fixes
that and closes out small correctness gaps before new features build on top of it.

- [#1](https://github.com/abduznik/terraria-fetcher/issues/1) Fix overstated "fully offline" claims in copy
- [#2](https://github.com/abduznik/terraria-fetcher/issues/2) Write CONTRIBUTING.md and issue/PR templates
- [#3](https://github.com/abduznik/terraria-fetcher/issues/3) Add automated regression check for icon-slot overflow

## v1.2 - Docker Offline Bundle

The GitHub Pages site will keep hotlinking icons from terraria.wiki.gg to stay
lightweight. True offline use — no network access at all after the image is pulled —
will ship as a separate Docker distribution:

- [#4](https://github.com/abduznik/terraria-fetcher/issues/4) Add icon-mirroring step to the data bake for the Docker build
- [#5](https://github.com/abduznik/terraria-fetcher/issues/5) Write Dockerfile and static-file-server image
- [#6](https://github.com/abduznik/terraria-fetcher/issues/6) Publish Docker image to GitHub Container Registry (GHCR)

Planned usage once this ships:

```
docker pull ghcr.io/abduznik/terraria-fetcher
docker run -p 8080:80 ghcr.io/abduznik/terraria-fetcher
```

The container is a static file server only. It does not re-fetch data at runtime —
refreshing content means pulling a newer image, built from a newer data bake.

## v1.3 - New Terraria Content Sync

Terraria updates periodically (new items, new bosses). This phase makes re-baking the
dataset — and keeping the Docker image in sync with it — a documented, low-friction
process instead of a manual one-off:

- [#7](https://github.com/abduznik/terraria-fetcher/issues/7) Document and streamline the re-bake process for new Terraria content

## v2.0 - Beat the Wiki (complete)

Scouted from recurring community complaints about the official/Fandom Terraria
wikis (stale build advice surviving patches, decision paralysis over which
weapon/armor to pick next, slow/cluttered search, poor mobile experience, and
a long-unfulfilled community wish for a stat/DPS calculator). All six shipped:

- [x] [#9](https://github.com/abduznik/terraria-fetcher/issues/9) Show Terraria game version + data freshness on every page
- [x] [#10](https://github.com/abduznik/terraria-fetcher/issues/10) "What's my next upgrade?" recommender based on current gear + progress
- [x] [#11](https://github.com/abduznik/terraria-fetcher/issues/11) Global instant search across builds + checklist + items
- [x] [#12](https://github.com/abduznik/terraria-fetcher/issues/12) Build-guide accuracy: verified-current flag + community correction path
- [x] [#13](https://github.com/abduznik/terraria-fetcher/issues/13) Mobile pass: audit and fix layout/touch-target issues site-wide
- [x] [#14](https://github.com/abduznik/terraria-fetcher/issues/14) Weapon DPS/stat calculator with modifiers, buffs, and accessories

## Later / unscheduled ideas

Not yet milestoned, listed here so they aren't lost:

- Service worker for the hosted GitHub Pages site, so a *browser* that has already
  visited once can keep working offline without the Docker route
- Shareable permalinks for a specific Item Comparison selection
- Dark/light theme toggle independent of the current wood-panel theme
