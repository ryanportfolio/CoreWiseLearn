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

No database, no secrets, no server. Art under `public/art/` and icons under `public/icons/` ship as static files; keep each under 1 MB and the whole initial payload under 5 MB.
