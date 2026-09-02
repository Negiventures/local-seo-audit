import { NextResponse } from "next/server";
import { fetchSite, UnsafeUrlError, FetchFailedError } from "@/lib/fetch-site";
import { runChecks, score, summarise } from "@/lib/checks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HITS = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 20;

/**
 * Charged per completed audit, not per request. A rejected URL should not
 * cost someone their quota while they are still typing it correctly.
 */
function overLimit(ip: string) {
  const e = HITS.get(ip);
  return e && Date.now() <= e.resetAt ? e.count >= MAX_PER_WINDOW : false;
}
function record(ip: string) {
  const now = Date.now();
  const e = HITS.get(ip);
  if (!e || now > e.resetAt) HITS.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  else e.count += 1;
}

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  if (overLimit(ip)) {
    return NextResponse.json(
      { error: "That is a lot of checks. Try again in a few minutes." },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url.slice(0, 300) : "";

  try {
    const site = await fetchSite(url);
    const findings = runChecks(site);
    record(ip);
    return NextResponse.json({
      url: site.finalUrl,
      score: score(findings),
      summary: summarise(findings),
      findings,
    });
  } catch (err) {
    if (err instanceof UnsafeUrlError || err instanceof FetchFailedError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[audit] unexpected", err);
    return NextResponse.json({ error: "Something went wrong checking that site." }, { status: 500 });
  }
}
