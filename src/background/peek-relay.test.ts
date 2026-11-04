import { describe, expect, mock, test } from "bun:test";
import { PEEK_MOTION } from "../peek/motion-tokens.ts";
import { type PeekRelayPorts, relayPeekMessage } from "./peek-relay.ts";

function fakePorts() {
  return {
    grantFraming: mock<PeekRelayPorts["grantFraming"]>(async () => {}),
    withdrawFraming: mock<PeekRelayPorts["withdrawFraming"]>(async () => {}),
    peekOpening: mock<PeekRelayPorts["peekOpening"]>(async () => {}),
    peekWindowOpened: mock<PeekRelayPorts["peekWindowOpened"]>(async () => {}),
    peekClosed: mock<PeekRelayPorts["peekClosed"]>(async () => {}),
    openBackgroundTabNextTo: mock<PeekRelayPorts["openBackgroundTabNextTo"]>(async () => 42),
    tabFinishedLoading: mock<PeekRelayPorts["tabFinishedLoading"]>(async () => {}),
    switchToTab: mock<PeekRelayPorts["switchToTab"]>(async () => {}),
    elapse: mock<PeekRelayPorts["elapse"]>(() => new Promise(() => {})),
    notifyTopFrame: mock<PeekRelayPorts["notifyTopFrame"]>(async () => {}),
    peekedPageLoaded: mock<PeekRelayPorts["peekedPageLoaded"]>(async () => false),
    reloadPeekedPage: mock<PeekRelayPorts["reloadPeekedPage"]>(async () => {}),
  } satisfies PeekRelayPorts;
}

const TOP_FRAME = { tabId: 7, frameId: 0, isExtensionPage: false };
const PEEK_WINDOW = { tabId: 7, frameId: 2, isExtensionPage: true };
const PEEK_FRAME = { tabId: 7, frameId: 3, isExtensionPage: false };

describe("relaying peek messages", () => {
  test("the page showing a peek grants and revokes framing and sign-in sharing for its tab", async () => {
    const ports = fakePorts();

    await relayPeekMessage(ports, { type: "peekHost/grantAccess" }, TOP_FRAME);
    await relayPeekMessage(ports, { type: "peekHost/revokeAccess" }, TOP_FRAME);

    expect(ports.grantFraming.mock.calls[0]?.[0].tabId).toBe(7);
    expect(ports.peekOpening).toHaveBeenCalledWith(7);
    expect(ports.withdrawFraming.mock.calls[0]?.[0].tabId).toBe(7);
    expect(ports.peekClosed).toHaveBeenCalledWith(7);
  });

  test("the peeked page cannot change the peek's access or open tabs", async () => {
    const ports = fakePorts();

    await relayPeekMessage(ports, { type: "peekHost/grantAccess" }, PEEK_FRAME);
    await relayPeekMessage(ports, { type: "peekHost/revokeAccess" }, PEEK_FRAME);
    await relayPeekMessage(
      ports,
      { type: "peekHost/openInTab", url: "https://x.example" },
      PEEK_FRAME,
    );

    expect(ports.grantFraming).not.toHaveBeenCalled();
    expect(ports.peekClosed).not.toHaveBeenCalled();
    expect(ports.openBackgroundTabNextTo).not.toHaveBeenCalled();
  });

  test("only the extension's peek window can introduce the peek's frames", async () => {
    const ports = fakePorts();
    const opened = { type: "peekWindow/opened", url: "https://x.example/a" } as const;

    await relayPeekMessage(ports, opened, PEEK_FRAME);
    await relayPeekMessage(ports, opened, TOP_FRAME);
    await relayPeekMessage(ports, opened, PEEK_WINDOW);

    expect(ports.peekWindowOpened.mock.calls).toEqual([[7, 2, new URL("https://x.example/a")]]);
  });

  test("reports from the peeked page reach the page that shows it", async () => {
    const ports = fakePorts();

    await relayPeekMessage(ports, { type: "peekFrame/keyCommand", command: "dismiss" }, PEEK_FRAME);
    await relayPeekMessage(
      ports,
      { type: "peekFrame/navigated", url: "https://x.example/b", historyChange: "entryAdded" },
      PEEK_FRAME,
    );

    expect(ports.notifyTopFrame.mock.calls).toEqual([
      [7, { type: "peekHostNotice/keyCommand", command: "dismiss" }],
      [
        7,
        {
          type: "peekHostNotice/frameNavigated",
          url: "https://x.example/b",
          historyChange: "entryAdded",
        },
      ],
    ]);
  });

  test("expanding opens the tab out of sight and switches to it once it has loaded", async () => {
    const ports = fakePorts();
    const steps: string[] = [];
    ports.openBackgroundTabNextTo.mockImplementation(async () => {
      steps.push("opened in background");
      return 42;
    });
    ports.tabFinishedLoading.mockImplementation(async () => {
      steps.push("loaded");
    });
    ports.switchToTab.mockImplementation(async (tabId) => {
      steps.push(`switched to ${tabId}`);
    });

    await relayPeekMessage(
      ports,
      { type: "peekHost/openInTab", url: "https://x.example" },
      TOP_FRAME,
    );

    expect(ports.openBackgroundTabNextTo).toHaveBeenCalledWith(7, "https://x.example");
    expect(steps).toEqual(["opened in background", "loaded", "switched to 42"]);
  });

  test("a tab that is slow to load is switched to after the longest wait", async () => {
    const ports = fakePorts();
    ports.tabFinishedLoading.mockImplementation(() => new Promise(() => {}));
    ports.elapse.mockImplementation(async () => {});

    await relayPeekMessage(
      ports,
      { type: "peekHost/openInTab", url: "https://x.example" },
      TOP_FRAME,
    );

    expect(ports.elapse).toHaveBeenCalledWith(PEEK_MOTION.tabHandoverMaxWait);
    expect(ports.switchToTab).toHaveBeenCalledWith(42);
  });

  test("the top frame cannot pose as the peeked page", async () => {
    const ports = fakePorts();

    await relayPeekMessage(ports, { type: "peekFrame/keyCommand", command: "dismiss" }, TOP_FRAME);

    expect(ports.notifyTopFrame).not.toHaveBeenCalled();
  });
});
