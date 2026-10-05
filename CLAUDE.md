# Claude Code Guidelines

> Kernel rules. Read first. Cross-cutting only. Topical detail lives in `.claude/reference/`.

## What this project is

A browser game hub for the owner's niece and nephew, aged 4 and 5, who cannot read. They play alone on a Windows laptop with a low-end integrated GPU, a mouse or trackpad and a keyboard. The hub, a name-entry screen and a growing set of small games share one engine (`src/engine/`), familiar controls (each world may use its own art medium) and one save file; new games register in `src/engine/registry.ts`.

Won't compromise on:

- No instruction text; navigation never needs reading. Text on screen is a child's name, numbers, the letter keys on the name-entry screen, and letters (uppercase and lowercase), words and shape names used as learning material. Mechanics are taught by demonstration.
- Nothing is ever wrong, locked or lost. No game over; misses only ease the hidden adaptive difficulty; every round ends with at least one star.
- Every interactive target is at least 96 CSS px on its shortest side. Mouse, trackpad and any key all work; there is no wrong button.
- 60 fps at 1366x768 on an integrated GPU. No per-frame allocations in update or render, no shadowBlur, no per-frame gradients or fillText.
- No settings screens, no network calls at runtime except fetching the app's own files (no third-party requests, no analytics, nothing about the child sent anywhere), no external links. Adult configuration is JSON in the repo.
- Engagement stays honest: stickers and stars reward play; everything to play is open from the start, nothing unlocks; nothing nags, times out or manipulates.

## Default prose mode: caveman ultra

Invoke the `caveman` skill at **ultra** at session start. Applies to all prose replies, this and every future session.

- Code, commits, PRs, file contents, symbols, API names, error strings stay normal, never abbreviated.
- Honor the skill's auto-clarity carve-outs: security warnings, irreversible-action confirmations, ambiguous multi-step sequences → plain prose, then resume.

## Always-on cleanup

Caveman covers chat replies only. Anything written to a file or for another reader (docs, READMEs, UI copy, emails, commit messages, PR text) uses the `writing` skill in normal prose. Preserve facts, caveats, exact quotations, code and identifiers. No jargon, in chat or in files: say what a thing does in plain words instead of coining labels, internal codes or shorthand the reader hasn't seen. If a new term is unavoidable, define it the first time.

## CRITICAL: Verification

This machine can verify everything that matters: `npm run typecheck` and `npm run build` are meaningful, and the owner can open any dev server you start (`npm run dev -- --port <n>`, per-scene pages under `/dev/`). There is no CI yet; the authoritative signal is a clean typecheck and build plus a headed-browser check of the behaviour you changed, with frame times read from `window.__corewise.loop.stats`. Screenshots go under `D:\screenshots\CoreWiseLearn\`. The children's laptop is the final judge for feel and performance; the owner tests there by hand.

- Inspect logs / run scripts / read code yourself before claiming anything works.
- Never claim visual/UI verification you didn't actually perform.
- Can't run the authoritative check → flag the risk plainly, don't claim it passes.
- Visual/UI checks: headed Chrome on the real GPU, launched through `launchPlacedChrome()` (`scripts/lib/launch-chrome.mjs`). Never headless (WebGL falls back to the CPU), never minimized (rAF drops to 1 fps). Pass this rule into every subagent prompt that does browser work.
- Parallel or subagent browser work: each agent opens its own browser through `mcp__playwright-iso__*` (`--isolated`, any number at once) or `launchPlacedChrome()`. Never the shared playwright plugin or the app's Browser pane, which hold one browser and deadlock a second user.

## Core principles

- Plan before acting. Break large refactors into atomic steps.
- Reproduce bugs before fixing them.
- Scope discipline: No unrequested refactors, features, abstractions, or extra coding. Minimum complexity for the task at hand; don't regress performance.
- No unit tests or type tests unless the user asks.
- Solve generally. Never hard-code to pass specific tests. If a test or requirement is wrong, say so rather than work around it.
- Scratch work → `.tmp/` (gitignored). Promote to `scripts/` if reusable; otherwise delete.
- Durable project knowledge → `.claude/reference/` via `/recall save` (committed, travels to every machine and sandbox). Standing truths only: moments (PR numbers, branch names, task status, tool-version snapshots) rot and don't get saved. `/recall` and `.claude/reference/` replace Claude Code's built-in auto memory, which stays off (`"autoMemoryEnabled": false` in `.claude/settings.json`).
- Welcome correction. Confident-sounding mistakes happen; don't defend wrong answers. The user can challenge a recommendation with `/why`.
- Restraint is a feature. New kernel rules, skills, and reference entries must earn their place; prefer pruning stale content over accreting. More ≠ better; complex ≠ complicated. This file loads every turn: keep cross-cutting safety and process rules here, move area-specific detail to `.claude/reference/`, and never restate what the harness already injects (skills list, environment block, tool docs). See `/optimize-context`.

## Subagents

- Run independent work in parallel: when parts don't depend on each other's results or edit the same files (research across areas, separate reviews, changes to separate modules), start their subagents in one message instead of one after another. Keep dependent or overlapping work sequential, and give parallel writers separate files or worktrees.
- Omit `model` on subagent calls unless the user names one. The default is `CLAUDE_CODE_SUBAGENT_MODEL` when set, else the session model.

## Git: push on completion

- "Complete" = the requested change finished and verified to this environment's limits. On Complete: commit, push, and open or update the PR. Mid-task or exploratory work is NOT a commit trigger.
- Stage intentionally. Never blanket-commit unrelated changes.
- Before opening a PR, check for an existing one (`gh pr list --head <branch>`) and push to that instead.
- Merge PRs with **squash** by default (`gh pr merge --squash`); merge-commit or rebase only when the user explicitly asks.
- Never force-push or run destructive git operations without an explicit request.
- End commit messages with the standard `Co-Authored-By:` trailer.
- PowerShell quoting trap: embedded `"` inside a here-string argument gets mangled en route to native exes (git/gh) and splits the argument. For multiline commit messages / PR bodies, write the text to a `.tmp/` file and use `git commit -F <file>` / `gh pr create --body-file <file>`, or keep the message free of double quotes.

## Environment & deploy target

Static site, no server, no database, no secrets. Hosted on Vercel at https://corewise.fun, served from the site root: every merge to `main` deploys to production and every PR gets a preview link (details in `.claude/reference/deployment.md`). Vercel Web Analytics and Speed Insights stay off. Runtime dependencies are zero and stay zero without the owner's OK; dev dependencies may be added when a task needs them, named in the handover. Save data lives in the browser's localStorage with a versioned schema; a schema change ships with a migration in `src/engine/save.ts`, never a reset. Merging to `main` publishes to the live site, so it always needs the owner's go-ahead.

## Project reference library

Topical reference lives in `.claude/reference/`. Consult BEFORE non-trivial work in an unfamiliar area: `/recall <topic>` or read directly.

| File | Covers |
|---|---|
| `secrets.md` | Env var names + purpose |
| `architecture.md` | System flow, auth, state |
| `pitfalls.md` | Accumulated gotchas |
| `commands.md` | Build / dev / test commands |
| `tech-stack.md` | Non-default picks + why |
| `deployment.md` | Deploy target, artifacts |

New quirk bites → save it to `.claude/reference/pitfalls.md` before the task ends, without asking, when it cost a retry, a backed-out change, or a user correction and its cause is confirmed. Amend an existing entry over adding one. Other reference edits stay behind `/recall save`.

## Codex compatibility

Every skill in `.claude/skills/` has a standalone Codex version in `.agents/skills/`, registered `native` in `.agents/skill-modes.json`, or is registered `disabled` when it needs Claude-only tools. Adding or editing a skill updates its Codex version in the same change, with tools translated per `.agents/codex-tools.md`; never ship a generated adapter. For a `native` skill, once its port matches, run `node .claude/scripts/sync-codex-skills.mjs --baseline <name>` to record the reviewed Claude source; `disabled` skills skip this step. Then run `node .claude/scripts/sync-codex-skills.mjs --check` (CI fails on drift or a missing registration). `AGENTS.md` owns Codex runtime safety.
