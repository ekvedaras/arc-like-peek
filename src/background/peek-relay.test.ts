import { describe, expect, mock, test } from "bun:test";
import { type PeekRelayPorts, relayPeekMessage } from "./peek-relay.ts";

function fakePorts() {
  return {
    grantFraming: mock<PeekRelayPorts["grantFraming"]>(async () => {}),
    withdrawFraming: mock<PeekRelayPorts["withdrawFraming"]>(async () => {}),
    openTabNextTo: mock<PeekRelayPorts["openTabNextTo"]>(async () => {}),
    notifyTopFrame: mock<PeekRelayPorts["notifyTopFrame"]>(async () => {}),
  } satisfies PeekRelayPorts;
}

const TOP_FRAME = { tabId: 7, frameId: 0 };
const PEEK_FRAME = { tabId: 7, frameId: 3 };

describe("relaying peek messages", () => {
  test("framing is allowed for sub-frames of the asking tab only", async () => {
    const ports = fakePorts();

    await relayPeekMessage(ports, { type: "peekHost/allowFraming" }, TOP_FRAME);

    expect(ports.grantFraming).toHaveBeenCalledWith({
      ruleId: 7,
      tabId: 7,
      strippedResponseHeaders: ["x-frame-options", "content-security-policy"],
    });
  });

  test("the peeked page cannot change framing or open tabs", async () => {
    const ports = fakePorts();

    await relayPeekMessage(ports, { type: "peekHost/allowFraming" }, PEEK_FRAME);
    await relayPeekMessage(
      ports,
      { type: "peekHost/openInTab", url: "https://x.example" },
      PEEK_FRAME,
    );

    expect(ports.grantFraming).not.toHaveBeenCalled();
    expect(ports.openTabNextTo).not.toHaveBeenCalled();
  });

  test("reports from the peeked page reach the page that shows it", async () => {
    const ports = fakePorts();

    await relayPeekMessage(ports, { type: "peekFrame/keyCommand", command: "dismiss" }, PEEK_FRAME);
    await relayPeekMessage(
      ports,
      { type: "peekFrame/navigated", url: "https://x.example/b" },
      PEEK_FRAME,
    );

    expect(ports.notifyTopFrame.mock.calls).toEqual([
      [7, { type: "peekHostNotice/keyCommand", command: "dismiss" }],
      [7, { type: "peekHostNotice/frameNavigated", url: "https://x.example/b" }],
    ]);
  });

  test("the top frame cannot pose as the peeked page", async () => {
    const ports = fakePorts();

    await relayPeekMessage(ports, { type: "peekFrame/keyCommand", command: "dismiss" }, TOP_FRAME);

    expect(ports.notifyTopFrame).not.toHaveBeenCalled();
  });
});
