"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Report, { type AuditResult } from "@/components/Report";
import ContactCard from "@/components/ContactCard";

export default function Page() {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<AuditResult | null>(null);

  const check = useCallback(async (target: string) => {
    if (!target.trim()) return;
    setState("running");
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target }),
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
  }, []);

  function run(e: React.FormEvent) {
    e.preventDefault();
    if (state === "running") return;
    void check(url);
  }

  /**
   * Accept ?url= so another page can hand us an address with the check already
   * running. negiventures.com puts an input on its homepage that submits here;
   * without this the visitor would land on an empty box and have to type it
   * again, which is exactly the friction the input was meant to remove.
   *
   * Runs once: the ref stops React's development double-invoke, and a later
   * edit of the field, from firing a second audit against the quota.
   */
  const fromQuery = useRef(false);
  useEffect(() => {
    if (fromQuery.current) return;
    const q = new URLSearchParams(window.location.search).get("url");
    if (!q) return;
    fromQuery.current = true;
    setUrl(q);
    void check(q);
  }, [check]);

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

      {/* Highest-intent moment on the site is right after someone reads their
          own score, so the ask sits there rather than in the footer. */}
      <ContactCard
        auditedUrl={result?.url}
        failures={result?.summary.fail}
      />

      <footer className="mt-16 border-t border-line pt-6 text-[13px] leading-relaxed text-dim">
        <p>
          This reads one page, the way a search engine would. It is a starting
          point for a conversation, not a ranking guarantee. Nobody can promise
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
