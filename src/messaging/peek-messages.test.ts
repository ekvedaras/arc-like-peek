import { expect, test } from "bun:test";
import { parsePeekHostNotice, parsePeekMessage } from "./peek-messages.ts";

test("well-formed messages are accepted as they are", () => {
  expect(parsePeekMessage({ type: "peekHost/openInTab", url: "https://a.example" })).toEqual({
    type: "peekHost/openInTab",
    url: "https://a.example",
  });
  expect(parsePeekHostNotice({ type: "peekHostNotice/keyCommand", command: "expand" })).toEqual({
    type: "peekHostNotice/keyCommand",
    command: "expand",
  });
});

test("anything else is rejected", () => {
  expect(parsePeekMessage(null)).toBeNull();
  expect(parsePeekMessage({ type: "peekHost/openInTab" })).toBeNull();
  expect(parsePeekMessage({ type: "peekFrame/keyCommand", command: "reload" })).toBeNull();
  expect(parsePeekHostNotice({ type: "peekHost/grantAccess" })).toBeNull();
  expect(parsePeekMessage({ type: "peekFrame/navigated", url: "https://a.example" })).toBeNull();
  expect(
    parsePeekHostNotice({
      type: "peekHostNotice/frameNavigated",
      url: "https://a.example",
      historyChange: "push",
    }),
  ).toBeNull();
});
