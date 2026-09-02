/**
 * The checks that decide whether a small local business can be found and
 * contacted. Deliberately not a general SEO audit — a builder in Manchester
 * does not need canonical-tag advice, they need a phone number a thumb can
 * tap and enough on the page for Google to know what town they work in.
 *
 * Every finding is written to be shown to the business owner, so the wording
 * avoids jargon and says what it costs them, not what rule it breaks.
 */

export type Status = "pass" | "warn" | "fail";

export type Finding = {
  id: string;
  group: "Reachable" | "Findable" | "Trusted";
  title: string;
  status: Status;
  /** What we actually observed. */
  detail: string;
  /** Why a business owner should care, in money-and-phone-calls terms. */
  impact?: string;
  fix?: string;
};

export type SiteInput = {
  url: string;
  finalUrl: string;
  status: number;
  html: string;
  /** Bytes of the HTML document alone. */
  bytes: number;
  /** Milliseconds to first byte of the document. */
  ms: number;
  /** Null when https could not be established at all. */
  tlsOk: boolean;
  robotsTxt: boolean;
  sitemapXml: boolean;
};

const between = (s: string, open: RegExp, close: RegExp) => {
  const a = s.search(open);
  if (a === -1) return "";
  const rest = s.slice(a);
  const b = rest.search(close);
  return b === -1 ? rest : rest.slice(0, b);
};

export function textOf(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tagContent(html: string, tag: string) {
  const m = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? textOf(m[1]) : "";
}

export function metaContent(html: string, nameOrProp: string) {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)\\s*=\\s*["']${nameOrProp}["'][^>]*>`,
    "i"
  );
  const tag = html.match(re)?.[0];
  if (!tag) return "";
  return tag.match(/content\s*=\s*["']([^"']*)["']/i)?.[1]?.trim() ?? "";
}

/** Phone-shaped runs of digits. Deliberately loose: formats vary by country. */
export function findPhones(text: string): string[] {
  const matches = text.match(/(?:\+?\d[\d\s().-]{7,17}\d)/g) ?? [];
  return [
    ...new Set(
      matches
        .map((m) => m.trim())
        .filter((m) => (m.replace(/\D/g, "").length ?? 0) >= 9)
        .filter((m) => m.replace(/\D/g, "").length <= 15)
    ),
  ];
}

const PLACEHOLDER_PHRASES = [
  "coming soon",
  "under construction",
  "site under construction",
  "website coming soon",
  "launching soon",
  "opening soon",
  "we are working on",
  "holding page",
  "default web page",
  "this site is under",
  "page is under construction",
  "check back soon",
];

export function looksLikePlaceholder(html: string) {
  const text = textOf(html).toLowerCase();
  const hit = PLACEHOLDER_PHRASES.find((p) => text.includes(p));
  // A real site has copy. A holding page usually has a sentence and a logo.
  const thin = text.split(/\s+/).filter(Boolean).length < 120;
  return { hit: hit ?? null, thin, words: text.split(/\s+/).filter(Boolean).length };
}

/**
 * A single-page app serves a near-empty shell and paints the content in the
 * browser. This checker never runs JavaScript, so without detecting that, a
 * perfectly good React site reads as "no content" — the most damaging wrong
 * answer this tool can give, and one you would be showing to the site's owner.
 */
export function isClientRendered(html: string) {
  const emptyRoot = /<div[^>]+id=["'](root|app|__next|__nuxt)["'][^>]*>\s*<\/div>/i.test(html);
  const words = textOf(html).split(/\s+/).filter(Boolean).length;
  const scripts = (html.match(/<script/gi) ?? []).length;
  return emptyRoot || (words < 60 && scripts >= 2 && html.length < 20000);
}

export function hasLocalBusinessSchema(html: string) {
  const blocks =
    html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  const types: string[] = [];
  for (const b of blocks) {
    const body = b.replace(/<[^>]+>/g, "");
    try {
      const parsed = JSON.parse(body);
      const walk = (n: unknown) => {
        if (Array.isArray(n)) return n.forEach(walk);
        if (n && typeof n === "object") {
          const t = (n as Record<string, unknown>)["@type"];
          if (typeof t === "string") types.push(t);
          if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && types.push(x));
          Object.values(n as Record<string, unknown>).forEach(walk);
        }
      };
      walk(parsed);
    } catch {
      // Malformed JSON-LD is worse than none: Google ignores the whole block.
      types.push("__invalid__");
    }
  }
  return { types, blocks: blocks.length };
}

const LOCAL_TYPES = [
  "LocalBusiness", "GeneralContractor", "HomeAndConstructionBusiness", "Plumber",
  "RoofingContractor", "Electrician", "HVACBusiness", "Locksmith", "MovingCompany",
  "Painter", "Store", "Restaurant", "Dentist", "Attorney", "AutoRepair",
  "ProfessionalService", "Organization",
];

export function runChecks(site: SiteInput): Finding[] {
  const f: Finding[] = [];
  const { html } = site;
  const text = textOf(html);
  const lower = html.toLowerCase();
  const spa = isClientRendered(html);
  // Anything read out of the body is unreliable on a client-rendered page, so
  // those checks report "could not read" instead of asserting an absence.
  const unread = "This could not be read: the page paints its content with JavaScript, which this check does not run.";

  // ---------- Reachable ----------

  f.push(
    site.tlsOk
      ? {
          id: "https",
          group: "Reachable",
          title: "Secure connection (HTTPS)",
          status: "pass",
          detail: "The certificate is valid, so browsers load the site without warning.",
        }
      : {
          id: "https",
          group: "Reachable",
          title: "Secure connection (HTTPS)",
          status: "fail",
          detail:
            "The security certificate is missing, expired or does not match the domain.",
          impact:
            "Chrome and Safari show a full-page red warning before anyone reaches the site. Most people press back. This costs more enquiries than every other item here combined.",
          fix: "Install a valid certificate for the domain. Most hosts do this free with Let's Encrypt, usually in minutes.",
        }
  );

  if (spa) {
    f.push({
      id: "client-rendered",
      group: "Reachable",
      title: "Content is drawn by JavaScript",
      status: "warn",
      detail:
        "The page arrives nearly empty and fills itself in the browser, so the checks below that read page content could not see it.",
      impact:
        "Google can usually run the JavaScript, but it is slower and less reliable than reading the page directly, and link previews on WhatsApp and Facebook often show nothing at all.",
      fix: "Render the main content on the server so the page arrives complete. In Next.js or Astro this is the default; in a plain React app it means adding server rendering or prerendering.",
    });
  }

  const ph = looksLikePlaceholder(html);
  // A holding page and a JS app both look empty in the raw HTML. Only one of
  // them actually is.
  if (!spa && (ph.hit || ph.thin)) {
    f.push({
      id: "placeholder",
      group: "Reachable",
      title: "There is no real website here",
      status: "fail",
      detail: ph.hit
        ? `The page says "${ph.hit}" and carries ${ph.words} words of content.`
        : `The page carries only ${ph.words} words of content.`,
      impact:
        "Someone who searches for this business, finds it, and clicks through has nothing to read and no way to get in touch. The advertising is working; the landing is not.",
      fix: "Publish real pages: what you do, work you have done, where you cover, and a way to make contact.",
    });
  }

  const speed: Status = site.ms < 800 ? "pass" : site.ms < 2000 ? "warn" : "fail";
  f.push({
    id: "speed",
    group: "Reachable",
    title: "Server response time",
    status: speed,
    detail: `The page started responding in ${site.ms}ms and the HTML is ${Math.round(site.bytes / 1024)}KB.`,
    ...(speed !== "pass" && {
      impact:
        "On a phone on mobile data, a slow first response is the difference between a visitor and a bounce.",
      fix: "Move to a host with caching or a CDN in front of it.",
    }),
  });

  const hasViewport = /name\s*=\s*["']viewport["']/i.test(html);
  f.push({
    id: "viewport",
    group: "Reachable",
    title: "Works on a phone",
    status: hasViewport ? "pass" : "fail",
    detail: hasViewport
      ? "The page tells phones how to size itself."
      : "The page has no mobile viewport setting, so phones render it zoomed out.",
    ...(!hasViewport && {
      impact:
        "Most people searching for a local trade are on a phone. A desktop-sized page pinched into a phone screen is unreadable, and Google ranks it lower for that reason.",
      fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to the page head.',
    }),
  });

  // ---------- Findable ----------

  const title = tagContent(html, "title");
  const titleStatus: Status = !title ? "fail" : title.length < 15 || title.length > 65 ? "warn" : "pass";
  f.push({
    id: "title",
    group: "Findable",
    title: "Page title",
    status: titleStatus,
    detail: title
      ? `"${title}" (${title.length} characters)`
      : "The page has no title tag.",
    ...(titleStatus !== "pass" && {
      impact:
        "The title is the blue line people click in Google. Without the trade and the town in it, the listing does not look like an answer to what they searched.",
      fix: 'Use the shape "Trade in Town | Business Name", for example "Roofers in Stockport | Wear & Tear Roofing".',
    }),
  });

  const desc = metaContent(html, "description");
  const descStatus: Status = !desc ? "fail" : desc.length < 50 || desc.length > 165 ? "warn" : "pass";
  f.push({
    id: "description",
    group: "Findable",
    title: "Search result description",
    status: descStatus,
    detail: desc ? `${desc.length} characters.` : "There is no meta description.",
    ...(descStatus !== "pass" && {
      impact:
        "Google writes its own snippet when this is missing, and it is usually a scraped sentence that sells nothing.",
      fix: "Write 140–160 characters covering what you do, the area you cover and one reason to call.",
    }),
  });

  const h1s = html.match(/<h1[\s>]/gi)?.length ?? 0;
  f.push({
    id: "h1",
    group: "Findable",
    title: "Main heading",
    status: h1s === 1 ? "pass" : "warn",
    ...(spa && h1s === 0 ? { detail: unread } : {}),
    detail:
      h1s === 0
        ? "The page has no main heading."
        : h1s === 1
          ? `Main heading: "${tagContent(html, "h1").slice(0, 80)}"`
          : `The page has ${h1s} main headings, so none of them reads as the main one.`,
    ...(h1s !== 1 && {
      impact: "The main heading is the strongest on-page signal of what this business does and where.",
      fix: "Use exactly one <h1>, naming the trade and the town.",
    }),
  });

  const schema = hasLocalBusinessSchema(html);
  const localType = schema.types.find((t) => LOCAL_TYPES.includes(t));
  const schemaStatus: Status = localType
    ? "pass"
    : schema.types.includes("__invalid__")
      ? "fail"
      : "fail";
  f.push({
    id: "schema",
    group: "Findable",
    title: "Business details Google can read",
    status: schemaStatus,
    detail: localType
      ? `Found ${localType} structured data.`
      : schema.types.includes("__invalid__")
        ? "There is structured data on the page but it is not valid JSON, so it is ignored."
        : "There is no business structured data on the page.",
    ...(schemaStatus !== "pass" && {
      impact:
        "This is the machine-readable version of the address, phone, hours and service area. It is a large part of how a business gets into the map results, which is where local enquiries actually come from.",
      fix: "Add LocalBusiness JSON-LD, using the most specific type that fits, with address, geo coordinates, opening hours and areas served.",
    }),
  });

  const townish = /\b(in|near|around|serving|across|covering)\s+[A-Z][a-z]+/.test(text);
  f.push({
    id: "location-words",
    group: "Findable",
    title: "Says where it works",
    status: townish ? "pass" : "warn",
    detail: townish
      ? "The page names the area it serves in the text."
      : spa
        ? unread
        : "No town or region is named in the page copy.",
    ...(!townish && {
      impact:
        'Nobody searches for "builder". They search for "builder in Sale". If the towns are not written on the page, the page cannot answer that search.',
      fix: "Name the towns and postcodes you cover in the body copy, not only in the footer.",
    }),
  });

  f.push({
    id: "sitemap",
    group: "Findable",
    title: "Sitemap and robots file",
    status: site.sitemapXml && site.robotsTxt ? "pass" : "warn",
    detail: `robots.txt ${site.robotsTxt ? "found" : "missing"}, sitemap.xml ${site.sitemapXml ? "found" : "missing"}.`,
    ...(!(site.sitemapXml && site.robotsTxt) && {
      impact: "These tell search engines which pages exist and are worth reading.",
      fix: "Publish a sitemap.xml and a robots.txt that points to it.",
    }),
  });

  // ---------- Trusted ----------

  const telLinks = (lower.match(/href\s*=\s*["']tel:/g) ?? []).length;
  const phones = findPhones(text);
  const phoneStatus: Status =
    telLinks > 0 ? "pass" : phones.length > 0 ? "warn" : spa ? "warn" : "fail";
  f.push({
    id: "phone",
    group: "Trusted",
    title: "Tap-to-call phone number",
    status: phoneStatus,
    detail:
      telLinks > 0
        ? `${telLinks} tap-to-call link${telLinks > 1 ? "s" : ""} on the page.`
        : phones.length > 0
          ? `A phone number appears as text (${phones[0]}) but is not tappable.`
          : spa
            ? unread
            : "No phone number found on the page.",
    ...(phoneStatus !== "pass" && {
      impact:
        "On a phone, a number that is not a link has to be memorised or copied. Every extra step loses calls, and calls are the enquiry that converts best for a trade.",
      fix: 'Wrap the number in <a href="tel:...">, and keep it visible in the header on mobile.',
    }),
  });

  const hasAddress =
    /\b(street|road|lane|avenue|drive|unit|suite|industrial estate|business park)\b/i.test(text) ||
    /\b[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}\b/.test(text) || // UK postcode
    /\b\d{5}(-\d{4})?\b/.test(text); // US ZIP
  f.push({
    id: "address",
    group: "Trusted",
    title: "Address on the page",
    status: hasAddress ? "pass" : "warn",
    detail: hasAddress
      ? "A postal address appears on the page."
      : spa
        ? unread
        : "No postal address found on the page.",
    ...(!hasAddress && {
      impact:
        "Google cross-checks the address here against the Google Business Profile. A missing or mismatched one is a common reason a business never appears in the map pack.",
      fix: "Put the full address in the footer, worded exactly as it appears on the Google Business Profile.",
    }),
  });

  const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
  const withAlt = imgs.filter((i) => /\balt\s*=\s*["']/i.test(i)).length;
  const altStatus: Status =
    imgs.length === 0 ? "warn" : withAlt / imgs.length >= 0.9 ? "pass" : "warn";
  f.push({
    id: "images",
    group: "Trusted",
    title: "Photographs of the work",
    status: altStatus,
    detail:
      imgs.length === 0
        ? spa
          ? unread
          : "There are no images on the page."
        : `${imgs.length} images, ${withAlt} with alt text.`,
    ...(altStatus !== "pass" && {
      impact:
        "For a trade, finished-job photos are the single most persuasive thing on the site. Alt text also lets those photos show up in image search.",
      fix: "Add real photos of completed jobs, each with a short description of what it is.",
    }),
  });

  const og = metaContent(html, "og:title") || metaContent(html, "og:image");
  f.push({
    id: "sharing",
    group: "Trusted",
    title: "Looks right when shared",
    status: og ? "pass" : "warn",
    detail: og
      ? "Social sharing tags are present."
      : "No Open Graph tags, so links shared on WhatsApp or Facebook show no preview.",
    ...(!og && {
      impact:
        "Recommendations between neighbours travel by WhatsApp. A link with no picture or title looks like spam.",
      fix: "Add og:title, og:description and og:image.",
    }),
  });

  return f;
}

export function score(findings: Finding[]) {
  const weight = { pass: 1, warn: 0.5, fail: 0 };
  const total = findings.reduce((n, f) => n + weight[f.status], 0);
  return Math.round((total / findings.length) * 100);
}

export function summarise(findings: Finding[]) {
  return {
    pass: findings.filter((f) => f.status === "pass").length,
    warn: findings.filter((f) => f.status === "warn").length,
    fail: findings.filter((f) => f.status === "fail").length,
  };
}
