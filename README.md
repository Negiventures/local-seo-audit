# local-seo-audit

Paste a small-business website, get back the handful of things that decide
whether customers can **find** it and **contact** it. Written to be shown to the
business owner, not to an SEO.

Live: https://localseo.negiventures.com

## Why this exists

Most "SEO audit" tools produce a wall of jargon aimed at marketers. A roofer
does not need advice about canonical tags. They need to know that their
certificate expired three months ago and every visitor is seeing a red warning
screen before they reach the site.

So every finding says three things: what was observed, **what it costs in
enquiries**, and how to fix it. No score-chasing, no invented urgency, and an
explicit note that nobody can guarantee rankings.

## What it checks

**Reachable.** HTTPS certificate validity, whether there is a real site here at
all or just a holding page, server response time, mobile viewport.

**Findable.** Title, meta description, single H1, `LocalBusiness` structured
data, whether the copy names the towns served, robots/sitemap.

**Trusted.** Tap-to-call link, postal address on the page, job photos and alt
text, social sharing tags.

## Security

The whole app takes a URL from a stranger and fetches it server-side, which is
textbook SSRF territory. `lib/fetch-site.ts` therefore:

- allows `http`/`https` only, and rejects embedded credentials
- resolves DNS itself and refuses any non-public address: loopback, RFC1918,
  carrier NAT, link-local (including `169.254.169.254`, the cloud metadata
  endpoint), multicast and IPv4-mapped IPv6 like `::ffff:10.0.0.1`
- **re-checks every redirect hop**, because a public hostname is free to 302 to
  localhost and validating only the first URL would miss it
- caps redirects, response size and total time
- identifies itself honestly in the User-Agent

`lib/__tests__/fetch-site.test.ts` covers each of those. They are the most
important tests in the repo: everything else produces a wrong number, but a gap
here turns this into an open proxy into whatever network it is deployed on.

## Verified

38 tests, covering the check logic and every SSRF guard, against synthetic
HTML fixtures. Mobile Lighthouse on the production build: performance 98,
accessibility 100, best practices 100, SEO 100, no failed audits.

```bash
npm install
npm test
npm run dev
```
