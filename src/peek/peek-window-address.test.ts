import { describe, expect, test } from "bun:test";
import { asPeekableUrl } from "./peek-trigger.ts";
import { peekedUrlFrom, peekWindowAddress } from "./peek-window-address.ts";

const PAGE = "chrome-extension://abcdefghijklmnop/peek-window/peek-window.html";

function peekable(href: string) {
  const url = asPeekableUrl(href);
  if (!url) throw new Error(`Not peekable: ${href}`);
  return url;
}

describe("the Peek window address", () => {
  test("carries the peeked URL, including its query and fragment", () => {
    const url = peekable("https://example.com/search?q=a&b=c#results");

    expect(peekedUrlFrom(peekWindowAddress(PAGE, url))).toBe(url);
  });

  test("stays on the Peek window page", () => {
    const address = new URL(peekWindowAddress(PAGE, peekable("https://example.com/")));

    expect(address.href.startsWith(`${PAGE}?`)).toBe(true);
  });

  test("refuses anything that is not an http(s) page", () => {
    expect(peekedUrlFrom(`${PAGE}?url=javascript:alert(1)`)).toBeNull();
    expect(peekedUrlFrom(`${PAGE}?url=chrome://settings`)).toBeNull();
    expect(peekedUrlFrom(PAGE)).toBeNull();
  });
});
