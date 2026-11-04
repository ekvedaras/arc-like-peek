# arc-like-peek

Manifest V3 Chrome extension cloning Arc's Peek (shift+click a link → animated overlay preview).
Read `wiki/index.md` first (local-only, gitignored; it may be missing in a fresh clone): goal, decisions, research on Arc's behaviour, and how the e2e harness works.

## Commands

Only `bun` is installed (no node/npm). Always go through the package scripts.

- `bun run build` — bundle `src/` into `dist/` (loadable unpacked extension).
- `bun run dev` — rebuild on change.
- `bun run typecheck` / `bun run lint` (`bun run lint:fix` to format and autofix).
- `bun run test` — unit tests (`bun test`, only `src/**/*.test.ts`; see `bunfig.toml`).
- `bun run test:e2e` — build, then Playwright in Chromium with the extension loaded. Add `-- --headed` to watch, `-- -g "name"` to filter.
- `bun run test:real-sites` — the Peek on live websites (`e2e/real-sites/`, needs network, not part of `check`).
- `bun run check` — typecheck + lint + unit tests + build + e2e. Must be green before you claim anything is done.
- `bun run video-frames <video.webm>` — split a recorded e2e video into PNG frames next to it, to review motion.

## Layout

- `src/manifest.json` — MV3 manifest. Every `*.json` under `src/` is copied to `dist/` as is.
- `src/content/` — content script entry. `src/background/` — service worker entry.
- `src/peek/` — the Peek feature: pure domain (`peek-session.ts` state machine, `geometry.ts`, `spring.ts`,
  `choreography.ts`, `motion-tokens.ts`), the controller shell, and the DOM view in `src/peek/overlay/`.
- `src/peek-window/` — the Peek window: extension page the overlay's frame shows, which frames the peeked page.
- `src/messaging/` — typed messages between content scripts and the service worker.
- `src/background/` — service worker: Peek message relay and `chrome.*` adapters (session DNR rules, tabs).
- `src/**/*.test.ts` — unit tests for the pure modules.
- `e2e/` — Playwright specs; `e2e/support/` helpers; `e2e/fixtures/` local server and test pages.
- `artifacts/` — test output: videos, screenshots, traces, HTML report (gitignored).

## Rules

- No workarounds. If something is blocked, find the root cause or stop and report it; don't paper over it (no sleeps, no retries, no skipped tests, no `biome-ignore` without a reason).
- Verify UI in a real browser: write an e2e spec, assert animation curves with `traceAnimation` + `maxDeviationFromEasing`, and watch the recorded video in `artifacts/test-results/<test>/video/`. A passing unit of logic is not a working feature.
- Follow `CODING_STANDARDS.md`.
- Update the wiki (`wiki/`) when you learn or decide something future agents need. Date every claim; cite commits for claims about code.
