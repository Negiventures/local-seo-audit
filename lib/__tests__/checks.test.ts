import { describe, it, expect } from "vitest";
import {
  runChecks, score, summarise, findPhones, looksLikePlaceholder,
  hasLocalBusinessSchema, tagContent, metaContent, textOf,
  type SiteInput,
} from "@/lib/checks";

const base: SiteInput = {
  url: "https://example.com",
  finalUrl: "https://example.com",
  status: 200,
  html: "",
  bytes: 1000,
  ms: 200,
  tlsOk: true,
  robotsTxt: true,
  sitemapXml: true,
};

const site = (html: string, over: Partial<SiteInput> = {}): SiteInput => ({
  ...base,
  html,
  ...over,
});

const find = (html: string, id: string, over: Partial<SiteInput> = {}) =>
  runChecks(site(html, over)).find((f) => f.id === id)!;

describe("html extraction", () => {
  it("strips script and style content out of the text", () => {
    const html = "<style>.a{color:red}</style><p>Real copy</p><script>var x=1</script>";
    expect(textOf(html)).toBe("Real copy");
  });

  it("reads a title and a meta description", () => {
    const html = `<title>Roofers in Sale</title><meta name="description" content="We fix roofs">`;
    expect(tagContent(html, "title")).toBe("Roofers in Sale");
    expect(metaContent(html, "description")).toBe("We fix roofs");
  });

  it("reads og tags declared with property rather than name", () => {
    expect(metaContent(`<meta property="og:title" content="Hi">`, "og:title")).toBe("Hi");
  });
});

describe("phone detection", () => {
  it("finds numbers in common UK and US formats", () => {
    expect(findPhones("Call 0161 496 0142 today")).toContain("0161 496 0142");
    expect(findPhones("Call (817) 555-0198 now").length).toBe(1);
  });

  it("ignores digit runs that are too short or too long to be phone numbers", () => {
    expect(findPhones("Est. 1998, company no 12")).toHaveLength(0);
    expect(findPhones("1234567890123456789012")).toHaveLength(0);
  });

  it("rates a tappable number above one that is only text", () => {
    const linked = find('<a href="tel:01614960142">0161 496 0142</a>', "phone");
    const textOnly = find("<p>Call 0161 496 0142</p>", "phone");
    const none = find("<p>Contact us</p>", "phone");
    expect(linked.status).toBe("pass");
    expect(textOnly.status).toBe("warn");
    expect(none.status).toBe("fail");
  });
});

describe("placeholder detection", () => {
  it("flags a holding page by its wording", () => {
    const r = looksLikePlaceholder("<h1>Coming soon</h1><p>Our new site is on its way.</p>");
    expect(r.hit).toBe("coming soon");
  });

  it("flags a page that is simply too thin to be a website", () => {
    const r = looksLikePlaceholder("<p>Acme Builders</p>");
    expect(r.thin).toBe(true);
  });

  it("leaves a real page alone", () => {
    const html = `<p>${"word ".repeat(200)}</p>`;
    const r = looksLikePlaceholder(html);
    expect(r.hit).toBeNull();
    expect(r.thin).toBe(false);
    // and produces no placeholder finding at all
    expect(runChecks(site(html)).find((f) => f.id === "placeholder")).toBeUndefined();
  });
});

describe("structured data", () => {
  it("recognises a specific local business type", () => {
    const html = `<script type="application/ld+json">{"@type":"GeneralContractor","name":"X"}</script>`;
    expect(hasLocalBusinessSchema(html).types).toContain("GeneralContractor");
    expect(find(html, "schema").status).toBe("pass");
  });

  it("finds a type nested inside a graph", () => {
    const html = `<script type="application/ld+json">{"@graph":[{"@type":"WebSite"},{"@type":"Plumber"}]}</script>`;
    expect(hasLocalBusinessSchema(html).types).toContain("Plumber");
  });

  it("treats malformed JSON-LD as broken rather than absent", () => {
    const html = `<script type="application/ld+json">{"@type": nope}</script>`;
    const f = find(html, "schema");
    expect(f.status).toBe("fail");
    expect(f.detail).toMatch(/not valid JSON/);
  });

  it("does not accept an unrelated type as a business", () => {
    const html = `<script type="application/ld+json">{"@type":"BreadcrumbList"}</script>`;
    expect(find(html, "schema").status).toBe("fail");
  });
});

describe("reachability", () => {
  it("fails HTTPS when the certificate did not verify", () => {
    const f = find("<p>hi</p>", "https", { tlsOk: false });
    expect(f.status).toBe("fail");
    expect(f.impact).toBeTruthy();
  });

  it("grades server response time in bands", () => {
    expect(find("<p>x</p>", "speed", { ms: 300 }).status).toBe("pass");
    expect(find("<p>x</p>", "speed", { ms: 1200 }).status).toBe("warn");
    expect(find("<p>x</p>", "speed", { ms: 3000 }).status).toBe("fail");
  });

  it("fails a page with no mobile viewport", () => {
    expect(find("<p>x</p>", "viewport").status).toBe("fail");
    expect(
      find('<meta name="viewport" content="width=device-width">', "viewport").status
    ).toBe("pass");
  });
});

describe("findability", () => {
  it("warns on a title that is too long to survive the search results", () => {
    expect(find(`<title>${"a".repeat(90)}</title>`, "title").status).toBe("warn");
  });

  it("wants exactly one main heading", () => {
    expect(find("<h1>One</h1>", "h1").status).toBe("pass");
    expect(find("<h1>One</h1><h1>Two</h1>", "h1").status).toBe("warn");
    expect(find("<h2>None</h2>", "h1").status).toBe("warn");
  });

  it("notices when the page never says which towns it covers", () => {
    expect(find("<p>We are builders.</p>", "location-words").status).toBe("warn");
    expect(find("<p>Builders in Stockport and Sale.</p>", "location-words").status).toBe("pass");
  });

  it("recognises a postal address in either UK or US shape", () => {
    expect(find("<p>12 Mill Road</p>", "address").status).toBe("pass");
    expect(find("<p>M4 7DB</p>", "address").status).toBe("pass");
    expect(find("<p>Fort Worth 76102</p>", "address").status).toBe("pass");
    expect(find("<p>Call us</p>", "address").status).toBe("warn");
  });
});

describe("scoring", () => {
  it("scores a page that fails everything below one that passes everything", () => {
    const bad = runChecks(site("<p>Coming soon</p>", { tlsOk: false, ms: 4000, robotsTxt: false, sitemapXml: false }));
    const good = runChecks(
      site(
        `<title>Roofers in Sale | Acme</title>
         <meta name="description" content="${"d".repeat(120)}">
         <meta name="viewport" content="width=device-width">
         <meta property="og:title" content="Acme">
         <h1>Roofers in Sale</h1>
         <script type="application/ld+json">{"@type":"RoofingContractor"}</script>
         <a href="tel:01614960142">0161 496 0142</a>
         <p>12 Mill Road, Sale. Serving Stockport and nearby. ${"word ".repeat(200)}</p>
         <img src="a.jpg" alt="A roof">`
      )
    );
    expect(score(bad)).toBeLessThan(30);
    expect(score(good)).toBeGreaterThan(90);
  });

  it("summarises counts that add up to the number of findings", () => {
    const findings = runChecks(site("<p>hi</p>"));
    const s = summarise(findings);
    expect(s.pass + s.warn + s.fail).toBe(findings.length);
  });

  it("always explains what a failure costs the business", () => {
    const findings = runChecks(site("<p>Coming soon</p>", { tlsOk: false }));
    for (const f of findings.filter((x) => x.status === "fail")) {
      expect(f.impact, `${f.id} has no impact line`).toBeTruthy();
      expect(f.fix, `${f.id} has no fix`).toBeTruthy();
    }
  });
});
