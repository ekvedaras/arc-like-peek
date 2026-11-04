# arc-like-peek

[![CI](https://github.com/ekvedaras/arc-like-peek/actions/workflows/ci.yml/badge.svg)](https://github.com/ekvedaras/arc-like-peek/actions/workflows/ci.yml)

An Arc-style Peek for Chrome: shift+click a link and the page opens in an animated overlay, without leaving the one you are on.

- Springy open and close animation fitted to a frame-by-frame recording of Arc.
- Shows sites that forbid framing (`X-Frame-Options`, `frame-ancestors`) while a Peek is open.
- Navigate inside the Peek; Esc, a click outside or the close button dismisses it.
- Expand the Peek into a regular tab.

## Install

Requires [Bun](https://bun.sh).

```sh
bun install
bun run build
```

Then open `chrome://extensions`, enable Developer mode, choose "Load unpacked" and select the `dist/` folder.

## Usage

- Shift+click a link to open it in a Peek.
- Esc, a click outside the Peek, or the close button dismisses it.
- ⌘O (Ctrl+O elsewhere) expands the Peek into a tab.

## Development

Only `bun` is needed; always go through the package scripts.

- `bun run dev` rebuilds `dist/` on change.
- `bun run typecheck`, `bun run lint` (`lint:fix` to autofix), `bun run test` (unit).
- `bun run test:e2e` builds, then runs Playwright in Chromium with the extension loaded (`-- --headed` to watch).
- `bun run check` runs all of the above; CI runs it.
- `bun run test:real-sites` exercises live websites (needs network, not part of `check`).

See `AGENTS.md` and `CODING_STANDARDS.md` for conventions.

## Known limits

- Some sites refuse to be framed at all (for example x.com, PayPal, Facebook) and do not render in a Peek.
- Expanding opens a fresh tab, so the page reloads and in-Peek history is lost.
- Logins that depend on third-party cookies may not carry into the Peek.
