import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { SiteInput } from "@/lib/checks";

/**
 * Fetching a URL a stranger typed is server-side request forgery waiting to
 * happen: the obvious attack is pointing this at cloud metadata
 * (169.254.169.254) or something on the private network and reading the
 * response back out of the report.
 *
 * So: only http(s), resolve DNS ourselves, refuse any address that is not
 * public, and re-check on every redirect hop. A public hostname is free to
 * 302 to localhost, and checking only the first URL would miss it.
 */

const MAX_REDIRECTS = 8;
const TIMEOUT_MS = 10_000;
const MAX_BYTES = 2_000_000;

export class UnsafeUrlError extends Error {}
export class FetchFailedError extends Error {}

export function ipIsPublic(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const p = ip.split(".").map(Number);
    if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return false;
    const [a, b] = p;
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 169 && b === 254) return false; // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // carrier NAT
    if (a === 192 && b === 0) return false;
    if (a >= 224) return false; // multicast, reserved, broadcast
    return true;
  }
  if (v === 6) {
    const s = ip.toLowerCase().replace(/^\[|\]$/g, "");
    if (s === "::1" || s === "::") return false;
    if (s.startsWith("fe80")) return false; // link-local
    if (/^f[cd]/.test(s)) return false; // unique local
    // ::ffff:10.0.0.1 style IPv4-mapped addresses inherit the v4 rules
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return ipIsPublic(mapped[1]);
    return true;
  }
  return false;
}

async function assertPublicHost(hostname: string) {
  // A bare IP in the URL never touches DNS, so check it directly.
  if (isIP(hostname)) {
    if (!ipIsPublic(hostname)) {
      throw new UnsafeUrlError("That address is not a public website.");
    }
    return;
  }
  let results;
  try {
    results = await lookup(hostname, { all: true });
  } catch {
    throw new FetchFailedError(`Could not find a server for ${hostname}.`);
  }
  if (!results.length) throw new FetchFailedError(`Could not find a server for ${hostname}.`);
  // Every resolved address must be public. A name that returns one public and
  // one private address is exactly the DNS-rebinding shape we are refusing.
  for (const r of results) {
    if (!ipIsPublic(r.address)) {
      throw new UnsafeUrlError("That hostname resolves to a private address.");
    }
  }
}

export function normaliseUrl(input: string): URL {
  const raw = input.trim();
  if (!raw) throw new UnsafeUrlError("Enter a website address.");
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new UnsafeUrlError("That does not look like a website address.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Only http and https addresses can be checked.");
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("Remove the credentials from the address.");
  }
  if (!url.hostname.includes(".")) {
    throw new UnsafeUrlError("That does not look like a public domain.");
  }
  return url;
}

/**
 * A cookie jar, scoped to one audit and keyed by host.
 *
 * Without one, any site that authenticates or gates with a cookie handshake
 * (Clerk, Cloudflare, a consent wall) sets a cookie, redirects back, finds the
 * cookie missing because we discarded it, and redirects to the handshake
 * again. That loops until the redirect budget runs out and reports "too many
 * redirects", which is both wrong and unhelpful.
 *
 * Cookies are only ever replayed to the host that set them, so a redirect to
 * a third party cannot collect them.
 */
export type Jar = Map<string, Map<string, string>>;

export function storeCookies(jar: Jar, host: string, setCookies: string[]) {
  if (!setCookies.length) return;
  const forHost = jar.get(host) ?? new Map<string, string>();
  for (const raw of setCookies) {
    const [pair] = raw.split(";");
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (!name) continue;
    // An expiry in the past is a deletion, not a cookie.
    if (/expires=Thu, 01 Jan 1970/i.test(raw) || /max-age=0(?!\d)/i.test(raw)) {
      forHost.delete(name);
      continue;
    }
    forHost.set(name, value);
  }
  jar.set(host, forHost);
}

export function cookieHeaderFor(jar: Jar, host: string): string {
  const forHost = jar.get(host);
  if (!forHost || forHost.size === 0) return "";
  return [...forHost].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function guardedFetch(url: URL, signal: AbortSignal): Promise<Response> {
  let current = url;
  const jar: Jar = new Map();
  const seen = new Set<string>();

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(current.hostname);

    const cookie = cookieHeaderFor(jar, current.hostname);
    const res = await fetch(current.toString(), {
      redirect: "manual",
      signal,
      headers: {
        // Identify honestly. A site owner reading their logs should be able to
        // tell what this was.
        "User-Agent":
          "Mozilla/5.0 (compatible; LocalSEOAudit/1.0; +https://github.com/Negiventures/local-seo-audit)",
        Accept: "text/html,application/xhtml+xml",
        ...(cookie ? { Cookie: cookie } : {}),
      },
    });

    storeCookies(jar, current.hostname, res.headers.getSetCookie?.() ?? []);

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      const next = new URL(loc, current);
      if (next.protocol !== "http:" && next.protocol !== "https:") {
        throw new UnsafeUrlError("The site redirected somewhere we will not follow.");
      }
      // Revisiting a URL we have already fetched means the gate is not being
      // satisfied, and more hops will not help.
      const key = next.toString();
      if (seen.has(key)) {
        throw new FetchFailedError(
          "That site keeps redirecting in a loop, usually a login or cookie gate."
        );
      }
      seen.add(key);
      current = next;
      continue;
    }
    return res;
  }
  throw new FetchFailedError("That site redirects too many times.");
}

async function headOk(url: string, signal: AbortSignal) {
  try {
    const res = await fetch(url, { signal, redirect: "follow" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchSite(input: string): Promise<SiteInput> {
  const url = normaliseUrl(input);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);

  try {
    const started = Date.now();

    // A failed https attempt is itself the finding, so record it rather than
    // throwing: an expired certificate is the most valuable thing this tool
    // can tell a business owner.
    let tlsOk = true;
    let res: Response;
    try {
      res = await guardedFetch(url, ac.signal);
    } catch (err) {
      if (err instanceof UnsafeUrlError) throw err;
      if (url.protocol === "https:") {
        tlsOk = false;
        const httpUrl = new URL(url.toString());
        httpUrl.protocol = "http:";
        res = await guardedFetch(httpUrl, ac.signal);
      } else {
        throw new FetchFailedError("Could not reach that site.");
      }
    }
    const ms = Date.now() - started;

    if (!res.ok && res.status >= 400) {
      throw new FetchFailedError(`That site returned an error (${res.status}).`);
    }

    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) {
      throw new FetchFailedError("That page is too large to check.");
    }
    const html = new TextDecoder("utf-8").decode(buf);

    const origin = new URL(res.url || url.toString()).origin;
    const [robotsTxt, sitemapXml] = await Promise.all([
      headOk(`${origin}/robots.txt`, ac.signal),
      headOk(`${origin}/sitemap.xml`, ac.signal),
    ]);

    return {
      url: url.toString(),
      finalUrl: res.url || url.toString(),
      status: res.status,
      html,
      bytes: buf.byteLength,
      ms,
      tlsOk,
      robotsTxt,
      sitemapXml,
    };
  } catch (err) {
    if (err instanceof UnsafeUrlError || err instanceof FetchFailedError) throw err;
    if (ac.signal.aborted) throw new FetchFailedError("That site took too long to respond.");
    throw new FetchFailedError("Could not reach that site.");
  } finally {
    clearTimeout(timer);
  }
}
