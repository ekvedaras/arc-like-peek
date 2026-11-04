import { describe, expect, test } from "bun:test";
import { asPeekableUrl } from "./peek-trigger.ts";
import { framableUrl, peekedUrlFrom, peekWindowAddress } from "./peek-window-address.ts";

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

describe("a page shown in the Peek window", () => {
  test("is asked for over https when the link is plain http", () => {
    expect(framableUrl(peekable("http://paypal.com/path?q=1#top"))).toBe(
      peekable("https://paypal.com/path?q=1#top"),
    );
  });

  test("keeps https links as they are", () => {
    expect(framableUrl(peekable("https://example.com:8443/a"))).toBe(
      peekable("https://example.com:8443/a"),
    );
  });

  test("stays plain http on an explicit port or the local machine, where https would not answer", () => {
    expect(framableUrl(peekable("http://example.com:8080/"))).toBe(
      peekable("http://example.com:8080/"),
    );
    expect(framableUrl(peekable("http://localhost/"))).toBe(peekable("http://localhost/"));
    expect(framableUrl(peekable("http://127.0.0.1/"))).toBe(peekable("http://127.0.0.1/"));
  });
});
