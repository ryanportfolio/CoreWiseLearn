# Pitfalls

> Accumulated project-specific gotchas. Dated entries, newest at the bottom. If this file exceeds ~200 lines, split by area (`pitfalls-<area>.md`) and update the CLAUDE.md index.

## 2026-10-02: the playwright-iso MCP browser is one browser for the whole session

`.mcp.json` starts one `@playwright/mcp --isolated` server per Claude session, and every subagent in that session shares its single browser and page. `--isolated` means an in-memory profile, not one browser per agent. Observed: a `page.reload()` from the name-entry agent landed on the hub agent's tab, and an init script ran there and wrote five test profiles into that origin's localStorage. Cost: one polluted verification run and a re-seed.

Fix for parallel browser work: each agent opens its own `BrowserContext` through `browser_run_code_unsafe` and keeps every action on that page:

```js
async (page) => {
  const ctx = await page.context().browser().newContext();
  const p = await ctx.newPage();
  await p.goto('http://localhost:5182/CoreWiseLearn/dev/hub.html?seed');
  // ... checks on p ...
  await ctx.close();
}
```

Never mix `browser_navigate`, `browser_click` or `browser_snapshot` (which act on the shared page) with checks that another agent may be running. Separate dev-server ports per agent (5181 to 5184) keep origins, and so localStorage, apart.

Two more quirks of the same browser, both confirmed by two agents:

- `page.screenshot` with a relative path writes into the main checkout's `.tmp`, not the worktree's. Always pass an absolute path (under `D:\screenshots\CoreWiseLearn\`).
- `globalThis` does not survive between `browser_run_code_unsafe` calls, so a page handle made in one call is gone in the next. Keep a whole check in one script file passed with `filename`, or find your page again by scanning `browser.contexts()` for your port.
- The save store writes its in-memory data back on `pagehide`, so `localStorage.clear()` followed by a reload does not reset a profile. Use a fresh context, or seed with `addInitScript` guarded by a `sessionStorage` flag.

## 2026-10-02: Vite watched `.tmp` and reloaded every dev page on scratch writes

A smoke run lost its 75 s round when another agent wrote `.tmp/wa.html` and Vite full-page-reloaded the game. `server.watch.ignored` in `vite.config.ts` now excludes `.tmp` and `.playwright-mcp`. Source edits by a parallel agent still reload; run end-to-end checks after the builders finish, or on `npm run preview`.

## 2026-10-02: stopping a background `npm run dev` leaves Vite holding the port

Killing the Bash background task that started `npm run dev -- --port 5183` ended the npm wrapper but not the Vite node process, which kept the port (two agents hit this, ports 5182 and 5183). Free it with `taskkill /PID <pid> /F` after `netstat -ano | findstr :5183`. Starting Vite with `node node_modules/vite/bin/vite.js --port 5183` as the background task does not reliably help: a later agent had that command refused by the command hook ("command contains control characters"), and a `.tmp/serve.sh` wrapper that `exec`s node still left the port held after the task stopped. Plan on the `taskkill` step, or give the owner the command for their own terminal tab.

## 2026-10-02: `loop.stats.mean` is the vsync interval, not the frame cost

The dev box has a 100 Hz panel, so `loop.stats.mean` reads 10.0 ms on every page no matter how little work a scene does. Two builders burned time trying to get it "under 4 ms". The budget number is `loop.stats.workMean` and `workMax` (milliseconds inside update plus render), added to `src/engine/loop.ts` for this reason.

## 2026-10-02: opening chrome://gpu in the probe window throttled the probe tab

In the Canvas 2D perf probe, opening `chrome://gpu` as a second tab of the probe's window before the run left the probe tab ticking at about 1 Hz after that tab was closed, and once crashed the page. Cost two aborted runs. Fix: capture `chrome://gpu` last, in its own `browser.newContext()`.

## 2026-10-02: this development machine is a desktop with a discrete GPU

The box is an AMD Radeon RX 6600 XT desktop with a 100 Hz panel, not the children's laptop. Frame times measured here say nothing about integrated-GPU fill rate; Chrome CPU throttling (4x) slows only the main thread. Treat every GPU-side cost under 10 ms as unmeasured, and read `.claude/reference/tech-stack.md` "Performance caps" for the numbers that were derived from the probe.
