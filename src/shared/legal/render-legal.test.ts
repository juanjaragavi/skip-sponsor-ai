import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  GENERAL_EMAIL,
  LEGAL_NAME,
  LEGAL_VERSIONS,
  POSTAL_ADDRESS_LINE,
} from "../company.generated";
import {
  CHROME_WEB_STORE_URL,
  PRIVACY_URL,
  TERMS_URL,
  buildLegalOutputs,
  fillTemplate,
  formatLegalDate,
  markdownToHtml,
  renderInline,
  stripCounselMarkers,
} from "./render-legal";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");
const templates = {
  privacy: read("legal/PRIVACY.template.md"),
  terms: read("legal/TERMS.template.md"),
};
const outputs = buildLegalOutputs(templates);

describe("SkipSponsor legal pages", () => {
  it("committed PRIVACY.md, TERMS.md and site/ match a fresh build (npm run legal:build)", () => {
    for (const [path, content] of Object.entries(outputs)) {
      expect(read(path), path).toBe(content);
    }
  });

  it("names the controller, address, contact and version from the company facts", () => {
    for (const md of [outputs["PRIVACY.md"], outputs["TERMS.md"]]) {
      expect(md).toContain(LEGAL_NAME);
      expect(md).toContain(POSTAL_ADDRESS_LINE);
      expect(md).toContain(GENERAL_EMAIL);
      expect(md).not.toMatch(/\{\w+\}/);
    }
    expect(outputs["PRIVACY.md"]).toContain(
      `Version ${LEGAL_VERSIONS.skipsponsor.privacyVersion}`,
    );
    expect(outputs["TERMS.md"]).toContain(
      `Version ${LEGAL_VERSIONS.skipsponsor.termsVersion}`,
    );
    expect(formatLegalDate("2026-10-15")).toBe("October 15, 2026");
  });

  it("keeps entity and contact literals out of the templates", () => {
    for (const t of Object.values(templates)) {
      expect(t).not.toMatch(/Devspeak S\.A\.S|@devspeak\.dev|Medellín/);
    }
  });

  it("keeps counsel markers in the templates only", () => {
    const markers = Object.values(templates)
      .join("\n")
      .match(/COUNSEL-REVIEW ss-(privacy|terms)-\d+/g);
    expect(markers?.length).toBeGreaterThanOrEqual(10);
    for (const content of Object.values(outputs)) {
      expect(content).not.toContain("COUNSEL-REVIEW");
    }
    expect(stripCounselMarkers("a\n\n<!-- COUNSEL-REVIEW x: y -->\n\nb")).toBe(
      "a\n\nb",
    );
  });

  it("states the facts the code enforces and the Chrome Web Store policy", () => {
    const privacy = outputs["PRIVACY.md"] ?? "";
    expect(privacy).toMatch(/\*\*30 days\*\*/);
    expect(privacy).toContain("Limited Use");
    expect(privacy).toContain("10 business days");
    expect(privacy).toContain("15 business days");
    expect(privacy).not.toMatch(/SOC ?2|ISO ?27001|certified/i);
    const terms = outputs["TERMS.md"] ?? "";
    expect(terms).toContain(
      "not affiliated with, endorsed by or sponsored by YouTube",
    );
    expect(terms).toContain("MIT License");
  });

  it("the landing page offers the Chrome Web Store listing as the install path", () => {
    expect(CHROME_WEB_STORE_URL).toMatch(
      /^https:\/\/chromewebstore\.google\.com\/detail\/skipsponsor-ai\/[a-p]{32}$/,
    );
    expect(outputs["site/index.html"]).toContain(
      `<a class="cta" href="${CHROME_WEB_STORE_URL}" rel="noopener">Add to Chrome</a>`,
    );
  });

  it("serves indexable pages with canonical URLs and links to both documents", () => {
    const page = outputs["site/privacy/index.html"] ?? "";
    expect(page).toContain('<meta name="robots" content="index, follow">');
    expect(page).toContain(`<link rel="canonical" href="${PRIVACY_URL}">`);
    expect(page).toContain(`href="${TERMS_URL}"`);
    expect(page).toContain(`mailto:${GENERAL_EMAIL}`);
    expect(page).toContain("<table>");
    expect(page).not.toMatch(/noindex/);
    expect(outputs["site/terms/index.html"]).toContain(
      `<link rel="canonical" href="${TERMS_URL}">`,
    );
    expect(outputs["site/sitemap.xml"]).toContain(`<loc>${PRIVACY_URL}</loc>`);
    expect(outputs["site/sitemap.xml"]).toContain(`<loc>${TERMS_URL}</loc>`);
  });
});

describe("the Markdown subset", () => {
  it("renders headings, paragraphs, lists, ordered lists and tables", () => {
    const html = markdownToHtml(
      [
        "# Title",
        "",
        "## Section One",
        "",
        "A paragraph",
        "on two lines.",
        "",
        "- one",
        "  continued",
        "- two",
        "",
        "1. first",
        "",
        "2. second",
        "",
        "| A | B |",
        "| --- | --- |",
        "| x | y |",
      ].join("\n"),
    );
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain('<h2 id="section-one">Section One</h2>');
    expect(html).toContain("<p>A paragraph on two lines.</p>");
    expect(html).toContain("<ul><li>one continued</li><li>two</li></ul>");
    expect(html).toContain("<ol><li>first</li><li>second</li></ol>");
    expect(html).toContain('<th scope="col">A</th>');
    expect(html).toContain("<td>y</td>");
  });

  it("renders inline code, links, autolinks, bold and italics, escaping HTML", () => {
    expect(renderInline("`a<b>` and **bold** and _it_")).toBe(
      "<code>a&lt;b&gt;</code> and <strong>bold</strong> and <em>it</em>",
    );
    expect(renderInline("[x](https://e.example/a_b_c)")).toBe(
      '<a href="https://e.example/a_b_c" rel="noopener">x</a>',
    );
    expect(renderInline("<https://e.example>")).toBe(
      '<a href="https://e.example" rel="noopener">https://e.example</a>',
    );
    expect(renderInline("[rel](/privacy/)")).toBe(
      '<a href="/privacy/">rel</a>',
    );
    expect(renderInline('1 < 2 & "q"')).toBe("1 &lt; 2 &amp; &quot;q&quot;");
  });

  it("refuses unknown placeholders", () => {
    expect(fillTemplate("{a}", { a: "1" })).toBe("1");
    expect(() => fillTemplate("{nope}", {})).toThrow(
      /unknown legal placeholder/,
    );
  });
});
