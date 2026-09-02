"use client";

import type { Finding, Status } from "@/lib/checks";
import { cn } from "@/lib/utils";

export type AuditResult = {
  url: string;
  score: number;
  summary: { pass: number; warn: number; fail: number };
  findings: Finding[];
};

const TONE: Record<Status, { dot: string; text: string; soft: string; label: string }> = {
  pass: { dot: "bg-pass", text: "text-pass", soft: "bg-pass-soft border-pass/20", label: "OK" },
  warn: { dot: "bg-warn", text: "text-warn", soft: "bg-warn-soft border-warn/20", label: "Could be better" },
  fail: { dot: "bg-fail", text: "text-fail", soft: "bg-fail-soft border-fail/20", label: "Needs fixing" },
};

const GROUP_BLURB: Record<string, string> = {
  Reachable: "Can a person actually load this site on their phone?",
  Findable: "Will it turn up when someone searches for this trade nearby?",
  Trusted: "Once they land, is there enough to make them call?",
};

function Ring({ score }: { score: number }) {
  const tone = score >= 80 ? "text-pass" : score >= 50 ? "text-warn" : "text-fail";
  const c = 2 * Math.PI * 42;
  return (
    <div className="relative grid h-28 w-28 shrink-0 place-items-center">
      <svg viewBox="0 0 100 100" className="h-28 w-28 -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="9" className="text-line" />
        <circle
          cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="9"
          strokeLinecap="round" className={tone}
          strokeDasharray={`${(score / 100) * c} ${c}`}
        />
      </svg>
      <span className={cn("absolute text-[26px] font-bold tabular-nums", tone)}>{score}</span>
    </div>
  );
}

export default function Report({ result }: { result: AuditResult }) {
  const groups = ["Reachable", "Findable", "Trusted"] as const;
  const headline =
    result.summary.fail > 0
      ? `${result.summary.fail} thing${result.summary.fail > 1 ? "s" : ""} on this site ${result.summary.fail > 1 ? "are" : "is"} costing enquiries`
      : result.summary.warn > 0
        ? "The basics are covered, with room to tighten it up"
        : "This site is in good shape";

  return (
    <div className="mt-10">
      <div className="flex flex-col gap-6 rounded-2xl border border-line bg-surface p-6 sm:flex-row sm:items-center sm:gap-8">
        <Ring score={result.score} />
        <div className="min-w-0">
          <h2 className="text-[22px] font-bold tracking-tight text-balance text-ink">
            {headline}
          </h2>
          <p className="mt-1.5 truncate text-[14px] text-dim">{result.url}</p>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[14px]">
            {(["fail", "warn", "pass"] as const).map((s) =>
              result.summary[s] ? (
                <span key={s} className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 rounded-full", TONE[s].dot)} aria-hidden />
                  <span className="text-body">
                    <strong className="font-semibold text-ink">{result.summary[s]}</strong> {TONE[s].label.toLowerCase()}
                  </span>
                </span>
              ) : null
            )}
          </div>
        </div>
      </div>

      {groups.map((g) => {
        const items = result.findings.filter((f) => f.group === g);
        if (!items.length) return null;
        return (
          <section key={g} className="mt-10">
            <h3 className="text-[17px] font-bold text-ink">{g}</h3>
            <p className="mt-1 text-[14px] text-dim">{GROUP_BLURB[g]}</p>

            <ul className="mt-4 space-y-3">
              {items.map((f) => (
                <li
                  key={f.id}
                  className={cn(
                    "rounded-xl border p-5",
                    f.status === "pass" ? "border-line bg-paper" : TONE[f.status].soft
                  )}
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", TONE[f.status].dot)} aria-hidden />
                    <h4 className="text-[16px] font-semibold text-ink">{f.title}</h4>
                    <span className={cn("text-[12px] font-semibold tracking-wide uppercase", TONE[f.status].text)}>
                      {TONE[f.status].label}
                    </span>
                  </div>

                  <p className="mt-2 text-[15px] leading-relaxed text-body">{f.detail}</p>

                  {f.impact && (
                    <p className="mt-3 border-l-2 border-line-2 pl-3 text-[15px] leading-relaxed text-ink">
                      {f.impact}
                    </p>
                  )}
                  {f.fix && (
                    <p className="mt-3 text-[14px] leading-relaxed text-body">
                      <span className="font-semibold text-ink">Fix: </span>
                      {f.fix}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
