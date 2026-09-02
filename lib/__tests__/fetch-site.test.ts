import { describe, it, expect } from "vitest";
import {
  ipIsPublic, normaliseUrl, UnsafeUrlError,
  storeCookies, cookieHeaderFor, type Jar,
} from "@/lib/fetch-site";

/**
 * These are the tests that matter most in this repo. Everything else produces a
 * wrong number; a hole here turns the tool into an open proxy into whatever
 * network it is deployed on.
 */

describe("ipIsPublic", () => {
  it("accepts ordinary public addresses", () => {
    expect(ipIsPublic("8.8.8.8")).toBe(true);
    expect(ipIsPublic("93.184.216.34")).toBe(true);
    expect(ipIsPublic("2606:2800:220:1:248:1893:25c8:1946")).toBe(true);
  });

  it("refuses loopback", () => {
    expect(ipIsPublic("127.0.0.1")).toBe(false);
    expect(ipIsPublic("127.9.9.9")).toBe(false);
    expect(ipIsPublic("::1")).toBe(false);
  });

  it("refuses the cloud metadata address", () => {
    // The single most valuable target for an SSRF against a deployed app.
    expect(ipIsPublic("169.254.169.254")).toBe(false);
  });

  it("refuses RFC1918 private ranges", () => {
    expect(ipIsPublic("10.0.0.1")).toBe(false);
    expect(ipIsPublic("192.168.1.1")).toBe(false);
    expect(ipIsPublic("172.16.0.1")).toBe(false);
    expect(ipIsPublic("172.31.255.255")).toBe(false);
  });

  it("still allows public addresses that sit just outside those ranges", () => {
    expect(ipIsPublic("172.15.0.1")).toBe(true);
    expect(ipIsPublic("172.32.0.1")).toBe(true);
    expect(ipIsPublic("192.167.1.1")).toBe(true);
    expect(ipIsPublic("11.0.0.1")).toBe(true);
  });

  it("refuses carrier NAT, multicast, broadcast and 0.0.0.0", () => {
    expect(ipIsPublic("100.64.0.1")).toBe(false);
    expect(ipIsPublic("224.0.0.1")).toBe(false);
    expect(ipIsPublic("255.255.255.255")).toBe(false);
    expect(ipIsPublic("0.0.0.0")).toBe(false);
  });

  it("refuses IPv6 link-local and unique-local", () => {
    expect(ipIsPublic("fe80::1")).toBe(false);
    expect(ipIsPublic("fc00::1")).toBe(false);
    expect(ipIsPublic("fd12:3456::1")).toBe(false);
  });

  it("sees through IPv4-mapped IPv6, which is the obvious way to smuggle a private address", () => {
    expect(ipIsPublic("::ffff:127.0.0.1")).toBe(false);
    expect(ipIsPublic("::ffff:10.0.0.1")).toBe(false);
    expect(ipIsPublic("::ffff:8.8.8.8")).toBe(true);
  });

  it("refuses anything that is not an IP at all", () => {
    expect(ipIsPublic("not-an-ip")).toBe(false);
    expect(ipIsPublic("")).toBe(false);
  });
});

describe("normaliseUrl", () => {
  it("assumes https when no scheme is given", () => {
    expect(normaliseUrl("example.com").toString()).toBe("https://example.com/");
  });

  it("keeps an explicit http scheme", () => {
    expect(normaliseUrl("http://example.com").protocol).toBe("http:");
  });

  it("refuses non-http schemes", () => {
    // file: and gopher: are the classic ways to read local resources.
    expect(() => normaliseUrl("file:///etc/passwd")).toThrow(UnsafeUrlError);
    expect(() => normaliseUrl("javascript:alert(1)")).toThrow(UnsafeUrlError);
  });

  it("refuses credentials embedded in the URL", () => {
    expect(() => normaliseUrl("https://user:pass@example.com")).toThrow(UnsafeUrlError);
  });

  it("refuses bare hostnames with no dot, which is how localhost sneaks in", () => {
    expect(() => normaliseUrl("localhost")).toThrow(UnsafeUrlError);
    expect(() => normaliseUrl("http://localhost:3000")).toThrow(UnsafeUrlError);
  });

  it("refuses an empty address", () => {
    expect(() => normaliseUrl("   ")).toThrow(UnsafeUrlError);
  });
});

describe("cookie jar", () => {
  it("stores and replays a cookie for the host that set it", () => {
    const jar: Jar = new Map();
    storeCookies(jar, "a.com", ["session=abc; Path=/; Secure", "theme=dark"]);
    expect(cookieHeaderFor(jar, "a.com")).toBe("session=abc; theme=dark");
  });

  it("never sends one host's cookies to another", () => {
    // The failure mode this prevents: a redirect to a third party harvesting
    // whatever the first site set.
    const jar: Jar = new Map();
    storeCookies(jar, "a.com", ["session=secret"]);
    expect(cookieHeaderFor(jar, "evil.com")).toBe("");
  });

  it("treats an expiry in the past as a deletion", () => {
    // Clerk's handshake clears cookies exactly this way; keeping them would
    // replay a stale session and re-trigger the gate.
    const jar: Jar = new Map();
    storeCookies(jar, "a.com", ["session=abc"]);
    storeCookies(jar, "a.com", ["session=; Expires=Thu, 01 Jan 1970 00:00:00 GMT"]);
    expect(cookieHeaderFor(jar, "a.com")).toBe("");
  });

  it("treats max-age=0 as a deletion but leaves max-age=0123 alone", () => {
    const jar: Jar = new Map();
    storeCookies(jar, "a.com", ["a=1; Max-Age=0", "b=2; Max-Age=0123"]);
    expect(cookieHeaderFor(jar, "a.com")).toBe("b=2");
  });

  it("lets a later value replace an earlier one", () => {
    const jar: Jar = new Map();
    storeCookies(jar, "a.com", ["t=1"]);
    storeCookies(jar, "a.com", ["t=2"]);
    expect(cookieHeaderFor(jar, "a.com")).toBe("t=2");
  });

  it("ignores malformed set-cookie values", () => {
    const jar: Jar = new Map();
    storeCookies(jar, "a.com", ["", "=novalue", "novalue", "ok=1"]);
    expect(cookieHeaderFor(jar, "a.com")).toBe("ok=1");
  });

  it("returns nothing for a host it has never seen", () => {
    expect(cookieHeaderFor(new Map(), "a.com")).toBe("");
  });
});
