import { describe, expect, test } from "bun:test";
import { asPeekableUrl } from "./peek-trigger.ts";
import { peekedPageFraming, staysOnPageSite } from "./peeked-page-framing.ts";

function peekable(href: string) {
  const url = asPeekableUrl(href);
  if (!url) throw new Error(`Not peekable: ${href}`);
  return url;
}

describe("who frames the peeked page", () => {
  test("the page behind frames pages of its own origin", () => {
    expect(
      peekedPageFraming(
        "https://intranet.example.test/dashboard",
        peekable("https://intranet.example.test/status"),
      ),
    ).toBe("framedByPage");
  });

  test("the page behind frames pages of other hosts on its site", () => {
    expect(
      peekedPageFraming("https://app.corp.example/", peekable("https://wiki.corp.example/a")),
    ).toBe("framedByPage");
    expect(peekedPageFraming("https://corp.example/", peekable("https://www.corp.example/"))).toBe(
      "framedByPage",
    );
  });

  test("the Peek window frames pages of other sites", () => {
    expect(
      peekedPageFraming("https://github.com/a/b", peekable("https://news.ycombinator.com/")),
    ).toBe("framedByPeekWindow");
  });

  test("the Peek window frames the same host over another scheme, which is another site", () => {
    expect(peekedPageFraming("http://corp.example/", peekable("https://corp.example/"))).toBe(
      "framedByPeekWindow",
    );
  });

  test("IP addresses and single-label hosts are their own site", () => {
    expect(peekedPageFraming("http://127.0.0.1:8080/", peekable("http://127.0.0.1:9090/"))).toBe(
      "framedByPage",
    );
    expect(peekedPageFraming("http://10.0.0.1/", peekable("http://10.0.0.2/"))).toBe(
      "framedByPeekWindow",
    );
    expect(peekedPageFraming("http://localhost:3000/", peekable("http://localhost:4000/"))).toBe(
      "framedByPage",
    );
  });
});

describe("staying on the site of the page behind", () => {
  test("pages of the site stay, pages of other sites leave", () => {
    expect(
      staysOnPageSite("https://app.corp.example", peekable("https://app.corp.example/b")),
    ).toBe(true);
    expect(staysOnPageSite("https://app.corp.example", peekable("https://sso.idp.example/"))).toBe(
      false,
    );
  });
});
