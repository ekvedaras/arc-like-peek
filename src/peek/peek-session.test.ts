import { describe, expect, test } from "bun:test";
import {
  advancePeek,
  CLOSED_PEEK,
  type PeekEvent,
  type PeekSession,
  type PeekTransition,
} from "./peek-session.ts";
import { asPeekableUrl, type PeekableUrl } from "./peek-trigger.ts";

type Origin = "the-link";
const ORIGIN: Origin = "the-link";
const ARTICLE = peekable("https://example.com/article");
const NEXT_ARTICLE = peekable("https://example.com/next");

function peekable(href: string): PeekableUrl {
  const url = asPeekableUrl(href);
  if (!url) throw new Error(`Not peekable: ${href}`);
  return url;
}

function run(...events: PeekEvent<Origin>[]): PeekTransition<Origin> {
  let transition: PeekTransition<Origin> = { session: CLOSED_PEEK, effects: [] };
  for (const event of events) transition = advancePeek(transition.session, event);
  return transition;
}

const UNTOUCHED_HISTORY = { kind: "entriesAdded", count: 0 } as const;

function navigatedTo(
  url: PeekableUrl,
  historyChange: "entryAdded" | "entryReplaced" | "untracked" = "entryAdded",
): PeekEvent<Origin> {
  return { type: "peekNavigated", url, historyChange };
}

const requested: PeekEvent<Origin> = { type: "peekRequested", url: ARTICLE, origin: ORIGIN };
const openSettled: PeekEvent<Origin> = { type: "openSettled" };
const dismissed: PeekEvent<Origin> = { type: "dismissRequested", via: "escapeKey" };
const expanded: PeekEvent<Origin> = { type: "expandRequested" };

describe("opening a peek", () => {
  test("presents the overlay, grants the peek its access, then loads the page, in that order", () => {
    const { session, effects } = run(requested);

    expect(session).toEqual({
      phase: "opening",
      peek: { url: ARTICLE, origin: ORIGIN, historyTrail: UNTOUCHED_HISTORY },
    });
    expect(effects).toEqual([
      { kind: "presentOverlay", origin: ORIGIN },
      { kind: "grantPeekAccess" },
      { kind: "loadPage", url: ARTICLE },
    ]);
  });

  test("is open once the opening motion settles", () => {
    expect(run(requested, openSettled)).toEqual({
      session: {
        phase: "open",
        peek: { url: ARTICLE, origin: ORIGIN, historyTrail: UNTOUCHED_HISTORY },
      },
      effects: [],
    });
  });

  test("a second request while a peek is shown is ignored: one peek per page", () => {
    const other: PeekEvent<Origin> = { type: "peekRequested", url: NEXT_ARTICLE, origin: ORIGIN };
    const { session, effects } = run(requested, openSettled, other);

    expect(session).toEqual({
      phase: "open",
      peek: { url: ARTICLE, origin: ORIGIN, historyTrail: UNTOUCHED_HISTORY },
    });
    expect(effects).toEqual([]);
  });
});

describe("dismissing a peek", () => {
  test.each(["escapeKey", "backdropClick", "closeButton"] as const)(
    "via %s animates the overlay back to where it came from",
    (via) => {
      const { session, effects } = run(requested, openSettled, { type: "dismissRequested", via });

      expect(session.phase).toBe("closing");
      expect(effects).toEqual([{ kind: "dismissOverlay", origin: ORIGIN }]);
    },
  );

  test("can interrupt the opening motion", () => {
    expect(run(requested, dismissed).session.phase).toBe("closing");
  });

  test("a late opening-settled signal does not reopen a closing peek", () => {
    expect(run(requested, dismissed, openSettled).session.phase).toBe("closing");
  });

  test("repeated dismiss requests while closing do nothing", () => {
    expect(run(requested, openSettled, dismissed, dismissed).effects).toEqual([]);
  });

  test("once settled, removes the overlay, revokes the peek's access and returns focus", () => {
    const { session, effects } = run(requested, openSettled, dismissed, { type: "dismissSettled" });

    expect(session).toEqual(CLOSED_PEEK);
    expect(effects).toEqual([
      { kind: "removeOverlay" },
      { kind: "revokePeekAccess" },
      { kind: "returnFocus", origin: ORIGIN },
    ]);
  });

  test("a new peek can open after the previous one closed", () => {
    const { session } = run(requested, dismissed, { type: "dismissSettled" }, requested);

    expect(session.phase).toBe("opening");
  });
});

describe("expanding a peek into a tab", () => {
  test("animates the overlay to fill the page", () => {
    const { session, effects } = run(requested, openSettled, expanded);

    expect(session.phase).toBe("expanding");
    expect(effects).toEqual([{ kind: "expandOverlay" }]);
  });

  test("once settled, opens the page the user navigated to, then cleans up", () => {
    const { session, effects } = run(requested, openSettled, navigatedTo(NEXT_ARTICLE), expanded, {
      type: "expandSettled",
    });

    expect(session).toEqual(CLOSED_PEEK);
    expect(effects).toEqual([
      { kind: "openInTab", url: NEXT_ARTICLE },
      { kind: "removeOverlay" },
      { kind: "rewindHistory", entries: 1 },
      { kind: "revokePeekAccess" },
    ]);
  });

  test("dismissing while expanding is ignored", () => {
    const { session, effects } = run(requested, openSettled, expanded, dismissed);

    expect(session.phase).toBe("expanding");
    expect(effects).toEqual([]);
  });
});

describe("navigation inside a peek", () => {
  test("tracks the page shown while opening and open", () => {
    expect(run(requested, navigatedTo(NEXT_ARTICLE, "entryReplaced")).session).toEqual({
      phase: "opening",
      peek: { url: NEXT_ARTICLE, origin: ORIGIN, historyTrail: UNTOUCHED_HISTORY },
    });
  });

  test("is ignored when no peek is shown", () => {
    const closed: PeekSession<Origin> = CLOSED_PEEK;
    expect(advancePeek(closed, navigatedTo(NEXT_ARTICLE))).toEqual({
      session: CLOSED_PEEK,
      effects: [],
    });
  });
});

describe("the tab history a peek leaves behind", () => {
  const closedAfter = (...navigations: PeekEvent<Origin>[]) =>
    run(requested, openSettled, ...navigations, dismissed, { type: "dismissSettled" }).effects;

  test("each page visited inside the peek is stepped back over once the peek is gone", () => {
    expect(closedAfter(navigatedTo(NEXT_ARTICLE), navigatedTo(ARTICLE))).toEqual([
      { kind: "removeOverlay" },
      { kind: "rewindHistory", entries: 2 },
      { kind: "revokePeekAccess" },
      { kind: "returnFocus", origin: ORIGIN },
    ]);
  });

  test("pages that replace the current entry leave nothing to step back over", () => {
    expect(closedAfter(navigatedTo(NEXT_ARTICLE, "entryReplaced"))).not.toContainEqual(
      expect.objectContaining({ kind: "rewindHistory" }),
    );
  });

  test("after going back or forward inside the peek, history is left alone so the page stays", () => {
    const effects = closedAfter(
      navigatedTo(NEXT_ARTICLE),
      navigatedTo(ARTICLE, "untracked"),
      navigatedTo(NEXT_ARTICLE),
    );

    expect(effects).not.toContainEqual(expect.objectContaining({ kind: "rewindHistory" }));
  });
});

test("settle signals without a matching motion are ignored", () => {
  for (const type of ["openSettled", "dismissSettled", "expandSettled"] as const) {
    expect(run({ type })).toEqual({ session: CLOSED_PEEK, effects: [] });
  }
});
