# arc-like-peek

[![CI](https://github.com/ekvedaras/arc-like-peek/actions/workflows/ci.yml/badge.svg)](https://github.com/ekvedaras/arc-like-peek/actions/workflows/ci.yml)

An Arc-style Peek for Chrome: shift+click a link and the page opens in an animated overlay, without leaving the one you are on.

- Springy open and close animation fitted to a frame-by-frame recording of Arc.
- Shows sites that forbid framing (`X-Frame-Options`, `frame-ancestors`) while a Peek is open.
- Stays signed in on the site you peek from: a link to a page of the same site (your intranet app's own sidebar, say) is framed by the page itself, so it gets your cookies and storage as in a tab.
- Navigate inside the Peek; Esc, a click outside or the close button dismisses it.
- Expand the Peek into a regular tab.

## Install from a release

1. Download `arc-like-peek-<version>.zip` from the [latest release](https://github.com/ekvedaras/arc-like-peek/releases/latest).
2. Unzip it into a folder you will keep (Chrome loads the extension from there).
3. Open `chrome://extensions`, enable Developer mode, choose "Load unpacked" and select that folder.

## Install from source

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

## Releasing

The version lives only in `package.json`; the build writes it into `dist/manifest.json`.

```sh
bun run release 0.2.0                 # bumps package.json, commits "Release 0.2.0", tags v0.2.0
git push origin main v0.2.0           # the tag push triggers .github/workflows/release.yml
```

The workflow runs `bun run check`, fails if the tag differs from the `package.json` version, runs `bun run package`
and creates a GitHub Release with `arc-like-peek-<version>.zip` and generated notes. `bun run package` can also be run
locally; it writes `artifacts/arc-like-peek-<version>.zip` with `manifest.json` at the zip root. The last step of the
workflow is the place to add a Chrome Web Store upload.

## Known limits

- Some sites refuse to be framed at all (for example x.com, PayPal, Facebook) and do not render in a Peek.
- Expanding opens a fresh tab, so the page reloads and in-Peek history is lost.
- A Peek of another site is a cross-site frame: Chrome withholds its `SameSite` cookies (all cookies if third-party cookies are blocked) and partitions its storage, so it may show that site signed out. Expand the Peek into a tab.
- Inside a Peek of the page's own site, leaving for another site reloads the Peek through an extension page, so Back inside the Peek cannot return across that step. A form posted to another site, or a redirect to one, can be blocked by the page's own CSP.
- While a Peek is open, the tab's other frames can be framed despite `X-Frame-Options`, and a peeked page whose CSP restricts framing runs without its CSP.
