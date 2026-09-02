"use client";

import { useState } from "react";
import Report, { type AuditResult } from "@/components/Report";

export default function Page() {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<AuditResult | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (state === "running" || !url.trim()) return;
    setState("running");
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not check that site.");
        setState("error");
        return;
      }
      setResult(data);
      setState("done");
    } catch {
      setError("Could not reach the checker. Try again.");
      setState("error");
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-14 sm:py-20">
      <p className="text-[12px] font-semibold tracking-[0.15em] text-dim uppercase">
        Local SEO Audit
      </p>
      <h1 className="mt-3 text-[2rem] leading-tight font-bold tracking-tight text-balance text-ink sm:text-[2.6rem]">
        Can customers find this business, and can they contact it?
      </h1>
      <p className="mt-4 text-[17px] leading-relaxed text-body">
        Paste any small-business website. This checks the handful of things that
        decide whether it shows up when someone nearby searches for that trade,
        and whether a visitor on a phone can actually get in touch. Plain English,
        no jargon, nothing to install.
      </p>

      <form onSubmit={run} className="mt-8">
        <label htmlFor="url" className="mb-2 block text-[14px] font-medium text-ink">
          Website address
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="example.co.uk"
            inputMode="url"
            autoComplete="url"
            className="w-full flex-1 rounded-lg border border-line-2 bg-paper px-4 py-3 text-[16px] text-ink outline-none transition-colors placeholder:text-dim focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-ink/15"
          />
          <button
            type="submit"
            disabled={state === "running"}
            className="shrink-0 rounded-lg bg-ink px-6 py-3 text-[16px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {state === "running" ? "Checking…" : "Check the site"}
          </button>
        </div>
        <p aria-live="polite" className="mt-3 text-[14px]">
          {state === "error" ? (
            <span className="font-medium text-fail">{error}</span>
          ) : state === "running" ? (
            <span className="text-dim">Fetching the page and reading it…</span>
          ) : (
            <span className="text-dim">
              Only public websites. Nothing is stored.
            </span>
          )}
        </p>
      </form>

      {result && <Report result={result} />}

      <footer className="mt-16 border-t border-line pt-6 text-[13px] leading-relaxed text-dim">
        <p>
          This reads one page, the way a search engine would. It is a starting
          point for a conversation, not a ranking guarantee — nobody can promise
          those.
        </p>
        <p className="mt-3">
          Built by{" "}
          <a href="https://negiventures.com" className="font-medium text-ink underline underline-offset-2">
            Negi Ventures
          </a>
          {" · "}
          <a
            href="https://github.com/Negiventures/local-seo-audit"
            className="font-medium text-ink underline underline-offset-2"
          >
            Source
          </a>
        </p>
      </footer>
    </main>
  );
}
