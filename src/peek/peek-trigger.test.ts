import { describe, expect, test } from "bun:test";
import { isPeekGesture, peekableUrl } from "./peek-trigger.ts";

const PAGE = "https://news.example/front?page=1";
const noModifiers = { button: 0, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };

describe("the peek gesture", () => {
  test("is a primary-button click with only Shift held", () => {
    expect(isPeekGesture({ ...noModifiers, shiftKey: true })).toBe(true);
  });

  test.each([
    ["a plain click", noModifiers],
    ["Shift+middle-click", { ...noModifiers, button: 1, shiftKey: true }],
    ["Shift+Cmd+click", { ...noModifiers, shiftKey: true, metaKey: true }],
    ["Shift+Alt+click", { ...noModifiers, shiftKey: true, altKey: true }],
  ])("is not %s", (_, gesture) => {
    expect(isPeekGesture(gesture)).toBe(false);
  });
});

describe("which links can be peeked", () => {
  const link = (href: string, hasDownloadAttribute = false) =>
    peekableUrl({ href, hasDownloadAttribute, pageUrl: PAGE });

  test("web pages, resolved against the current page", () => {
    expect(String(link("/story/42"))).toBe("https://news.example/story/42");
    expect(String(link("http://other.example/a#section"))).toBe("http://other.example/a#section");
  });

  test.each([
    ["javascript: links", "javascript:void(0)"],
    ["mail links", "mailto:someone@example.com"],
    ["anchors on the same page", "#comments"],
    ["meeting links, which must not be closed by accident", "https://meet.google.com/abc-defg-hij"],
    ["Zoom meetings", "https://us02web.zoom.us/j/123"],
  ])("not %s", (_, href) => {
    expect(link(href)).toBeNull();
  });

  test("not downloads", () => {
    expect(link("/report.pdf", true)).toBeNull();
  });
});
