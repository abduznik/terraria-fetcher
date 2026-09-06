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

## Later / unscheduled ideas

Not yet milestoned, listed here so they aren't lost:

- Service worker for the hosted GitHub Pages site, so a *browser* that has already
  visited once can keep working offline without the Docker route
- Search-as-you-type across builds and checklist content, not just the item fetcher
- Shareable permalinks for a specific Item Comparison selection
- Dark/light theme toggle independent of the current wood-panel theme
