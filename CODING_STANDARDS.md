# Coding standards

## Model the domain

- Name things after what they mean in Peek's domain: `PeekOverlay`, `PeekTrigger`, `dismissPeek`, `PreviewWindowGeometry`. Not `Manager`, `Helper`, `Utils`, `data`, `handle`.
- Make illegal states unrepresentable: discriminated unions for lifecycle (`closed | opening | open | closing`), branded or value types where a raw `string`/`number` is ambiguous (`PixelSize`, `DurationMs`).
- Keep the domain (state, geometry, timing curves) pure and free of DOM/Chrome calls so it can be reasoned about and tested directly.

## Small, deep modules

- One concept per module. A module exposes a small interface and hides its details.
- Prefer functions and plain data. Reach for a class only when it owns state with invariants.
- No barrel files and no default exports; import from the module that owns the thing.

## Chrome APIs behind thin adapters

- `chrome.*` is only called from adapter modules (e.g. `src/background/tabs-adapter.ts`), never from domain code.
- Adapters translate Chrome's shapes into domain types and back; they contain no decisions.
- Messages between content script and service worker are typed unions defined in one shared module.

## TypeScript

- No `any`, no non-null assertions (`!`), no `as` casts except at a validated boundary (with a reason why it is safe).
- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` stay on. Fix the type, don't loosen the config.
- `readonly` by default for data shapes.

## Comments

- Code explains what; comments only explain why, and only when the why is not obvious from the code.
- No commented-out code, no TODOs without a wiki entry.

## Tests

- Behaviour is specified by e2e specs that drive real Chromium: shift+click, keyboard, scroll, dismiss.
- Animations are asserted numerically (duration, easing, monotonicity) and reviewed on video.
- Test names describe behaviour from the user's point of view.
