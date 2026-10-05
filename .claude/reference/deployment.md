# Deployment

> Deploy target, build output, asset paths, publish flow.

## Status

Live at https://corewise.fun (owner decision, 2026-10-05; earlier the site was local only and GitHub Pages was the planned host).

- Host: Vercel project `corewiselearn` (account `aoh1578`), connected to `github.com/ryanportfolio/CoreWiseLearn`. A push to `main` deploys to production; every other branch and PR gets a preview URL. Check deployments with `vercel ls` and `vercel inspect <url>`; roll back with `vercel rollback`.
- Domain: `corewise.fun`, registered at Namecheap with Namecheap's DNS. `www.corewise.fun` redirects to the apex. The records Vercel needs are listed on each domain's card in the Vercel project (Settings > Domains) and by `vercel domains inspect corewise.fun`.
- Build: Vercel detects Vite, runs `npm run build` (which also runs `scripts/check-precache.mjs`, so a missing precache entry fails the deploy) and serves `dist/`, a fully static bundle (HTML, JS, CSS, `public/` copied as is, service worker and web manifest from `vite-plugin-pwa`).
- Base path: Vite `base` is `/`; every asset URL goes through `services.base` or `services.art()` so the base never appears in game code.
- Privacy: Vercel Web Analytics and Speed Insights stay off. The site makes no requests beyond its own files.

After a deploy that changes the service worker, a page already open keeps the old build until the child reaches the hub (see `pitfalls.md`); a hard reload or a fresh browser profile shows the new one at once.

No database, no secrets, no server. `config.json` ships at the site root and is read fresh on every load, so editing the served copy changes the settings on the next page load. That needs no rebuild only where the built `dist/` folder is served as is (a copy on the children's laptop, or a local preview): edit `dist/config.json` there. On Vercel the served copy comes from the build, so change `public/config.json` in the repo and merge. The precached copy is the offline fallback (see `architecture.md`). Art under `public/art/` and icons under `public/icons/` ship as static files.

Two kinds of art ship today:

- PNG library. The 47 PNG files under `public/art/` (avatars, backgrounds, buttons, creatures, decoys, effects, mascot, tiles) were prepared on 2026-10-02 with `scripts/prepare-art.mjs` (`prepared` block in `public/art/manifest.json`). The script takes one input image and a separate output path and only writes PNG: it fits images wider than 1000 px within 1366x768 and everything else within 512x512 without enlarging, keeps alpha, applies a 256-color palette with `--palette`, and exits with an error when the output exceeds 1 MB. Originals are kept outside `public/`.
- WebP art. New generated art ships as transparent WebP, prepared outside `prepare-art.mjs`: the reward shells (open and closed), counting tray and gold star in `public/art/rewards/`, and the six sticker characters in `public/art/stickers/` (green dino, happy star, ocean friend, rainbow candy, rainbow unicorn, red rocket). The other 18 stickers reuse PNG creature and avatar art from the PNG library. Prompts, dates, source files and preparation settings are recorded in `docs/style-bible.md`.

There is no total size cap (owner, 2026-10-03). `scripts/check-precache.mjs` reports the total precache size; download and rendering cost are measured and optimized at the end, after visual acceptance.
