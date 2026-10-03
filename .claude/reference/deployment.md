# Deployment

> Deploy target, build output, asset paths, publish flow.

## Status

Local only for now (owner decision, 2026-10-02). Nothing is published. The hub is run from `npm run dev` or `npm run preview` on the development machine, and tested on the children's laptop by hand when the owner chooses.

## Target when it goes live

- Host: GitHub Pages, project site at `https://ryanportfolio.github.io/CoreWiseLearn/`.
- Build: `npm run build` writes `dist/`, a fully static bundle (HTML, JS, CSS, `public/` copied as is, service worker and web manifest from `vite-plugin-pwa`).
- Base path: Vite `base` is `/CoreWiseLearn/`; every asset URL goes through `services.base` or `services.art()` so the base never appears in game code.
- Workflow: `.github/workflows/deploy.yml` builds and publishes `dist/`. It is set to manual trigger only (`workflow_dispatch`) so pushes to `main` do not fail while Pages is off.

## Turning it on

1. Enable Pages with the Actions source once: `gh api -X POST repos/ryanportfolio/CoreWiseLearn/pages -f build_type=workflow` (or Settings > Pages > Source: GitHub Actions).
2. In `deploy.yml`, restore the `push: branches: [main]` trigger, or run the workflow by hand from the Actions tab.
3. After the first deploy, open the site, confirm the service worker installs, then reload with the network off to confirm offline play.

No database, no secrets, no server. `config.json` ships at the site root and is read fresh on every load, so editing the served copy changes the settings on the next page load. That needs no rebuild only where the built `dist/` folder is served as is (a copy on the children's laptop, or a local preview): edit `dist/config.json` there. On GitHub Pages the deploy workflow runs `npm run build` and publishes `dist/`, so change `public/config.json` in the repo and run the workflow again. The precached copy is the offline fallback (see `architecture.md`). Art under `public/art/` and icons under `public/icons/` ship as static files.

Two kinds of art ship today:

- PNG library. The 47 PNG files under `public/art/` (avatars, backgrounds, buttons, creatures, decoys, effects, mascot, tiles) were prepared on 2026-10-02 with `scripts/prepare-art.mjs` (`prepared` block in `public/art/manifest.json`). The script takes one input image and a separate output path and only writes PNG: it fits images wider than 1000 px within 1366x768 and everything else within 512x512 without enlarging, keeps alpha, applies a 256-color palette with `--palette`, and exits with an error when the output exceeds 1 MB. Originals are kept outside `public/`.
- WebP art. New generated art ships as transparent WebP, prepared outside `prepare-art.mjs`: the reward shells (open and closed), counting tray and gold star in `public/art/rewards/`, and the six sticker characters in `public/art/stickers/` (green dino, happy star, ocean friend, rainbow candy, rainbow unicorn, red rocket). The other 18 stickers reuse PNG creature and avatar art from the PNG library. Prompts, dates, source files and preparation settings are recorded in `docs/style-bible.md`.

There is no total size cap (owner, 2026-10-03). `scripts/check-precache.mjs` reports the total precache size; download and rendering cost are measured and optimized at the end, after visual acceptance.
