"use client";

import { useState } from "react";

/**
 * Posts to the single mailer on negiventures.com rather than carrying its own
 * Resend key. That route reads which site an enquiry came from out of the
 * Origin header, so this does not need to say.
 */
const ENDPOINT =
  process.env.NEXT_PUBLIC_CONTACT_ENDPOINT ??
  "https://www.negiventures.com/api/contact";

type State = "idle" | "sending" | "sent" | "error";

export default function ContactCard({
  /** Set once a report exists, so the ask can refer to what they just saw. */
  auditedUrl,
  failures,
}: {
  auditedUrl?: string;
  failures?: number;
}) {
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state === "sending") return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    setState("sending");
    setError("");

    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fd.get("name"),
          email: fd.get("email"),
          company: fd.get("company"),
          // The audited domain is the single most useful thing to know before
          // replying, so it rides along in the message rather than being lost.
          message: auditedUrl
            ? `[Checked: ${auditedUrl}]\n\n${fd.get("message")}`
            : fd.get("message"),
          company_website: fd.get("company_website"),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        setState("error");
        return;
      }
      form.reset();
      setState("sent");
    } catch {
      setError("Couldn't reach the server. Please try again shortly.");
      setState("error");
    }
  }

  const field =
    "w-full rounded-lg border border-line-2 bg-paper px-3.5 py-3 text-[15px] text-ink outline-none transition-colors placeholder:text-dim focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-ink/15";

  const heading = failures
    ? `Want these ${failures} fixed?`
    : "Want a hand with any of this?";

  return (
    <section id="contact" className="mt-14 rounded-2xl border border-line bg-surface p-6 sm:p-8">
      <h2 className="text-[22px] font-bold tracking-tight text-balance text-ink">
        {heading}
      </h2>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-body">
        The report above is free and yours to act on — every item lists the fix,
        and plenty of them are an afternoon's work for whoever built the site.
        If you would rather it was just done, or you want the whole thing
        rebuilt properly, tell me what you are dealing with.
      </p>

      {state === "sent" ? (
        <div role="status" className="mt-7 rounded-xl border border-line bg-paper px-5 py-6">
          <p className="text-[16px] font-semibold text-ink">Message sent.</p>
          <p className="mt-1 text-[15px] text-body">
            You&rsquo;ll get a reply at the address you gave, usually within a day or two.
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-7 max-w-2xl">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="k-name" className="mb-1.5 block text-[13px] font-medium text-ink">
                Name
              </label>
              <input id="k-name" name="name" required maxLength={100} autoComplete="name" className={field} placeholder="Your name" />
            </div>
            <div>
              <label htmlFor="k-email" className="mb-1.5 block text-[13px] font-medium text-ink">
                Email
              </label>
              <input id="k-email" name="email" type="email" required maxLength={200} autoComplete="email" className={field} placeholder="you@company.com" />
            </div>
          </div>

          <div className="mt-4">
            <label htmlFor="k-company" className="mb-1.5 block text-[13px] font-medium text-ink">
              Business <span className="font-normal text-dim">(optional)</span>
            </label>
            <input id="k-company" name="company" maxLength={120} autoComplete="organization" className={field} placeholder="Your business name" />
          </div>

          <div className="mt-4">
            <label htmlFor="k-message" className="mb-1.5 block text-[13px] font-medium text-ink">
              What do you need?
            </label>
            <textarea
              id="k-message"
              name="message"
              required
              rows={4}
              maxLength={4000}
              className={`${field} resize-y`}
              placeholder="A couple of lines about the site and what you want out of it."
            />
          </div>

          {/* Honeypot: real people never fill this in. */}
          <div className="hidden" aria-hidden>
            <label htmlFor="k-website">Company website</label>
            <input id="k-website" name="company_website" tabIndex={-1} autoComplete="off" />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-4">
            <button
              type="submit"
              disabled={state === "sending"}
              className="rounded-full bg-ink px-5 py-3 text-[15px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {state === "sending" ? "Sending…" : "Send message"}
            </button>
            <p aria-live="polite" className="text-[13px] text-dim">
              {state === "error" ? (
                <span className="font-medium text-fail">{error}</span>
              ) : auditedUrl ? (
                "The address you checked is included so I have the context."
              ) : (
                "Goes straight to my inbox."
              )}
            </p>
          </div>
        </form>
      )}
    </section>
  );
}
