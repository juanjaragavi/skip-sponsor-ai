/**
 * Builds the public legal pages of SkipSponsor AI from the Markdown templates in
 * `legal/` (Privacy Policy and Terms of Use, version 2026-10-15). Published on
 * Juan's instruction with counsel's provisional OK; counsel review pending week
 * of 2026-10-19 (notes/cto/legal/2026-10-15-counsel-review-pack.md).
 *
 * - `{entity}`, `{address}`, `{email}`, `{brandUrl}` come from the generated
 *   company facts; `{version}` and `{effectiveDate}` from LEGAL_VERSIONS.skipsponsor.
 * - `<!-- COUNSEL-REVIEW ss-… -->` comments in the templates are removed from
 *   every output.
 * - Outputs: `PRIVACY.md` and `TERMS.md` (repository root) and the static site in
 *   `site/` that GitHub Pages serves (`.github/workflows/pages.yml`), which is the
 *   privacy policy URL for the Chrome Web Store.
 *
 * `npm run legal:build` writes the outputs; the unit test fails when a committed
 * output differs from a fresh build.
 */
import {
  BRAND_URL,
  COPYRIGHT_NOTICE,
  GENERAL_EMAIL,
  LEGAL_NAME,
  LEGAL_VERSIONS,
  POSTAL_ADDRESS_LINE,
} from "../company.generated";

/** Where GitHub Pages serves `site/`. */
export const LEGAL_SITE_URL = "https://juanjaragavi.github.io/skip-sponsor-ai";
export const PRIVACY_URL = `${LEGAL_SITE_URL}/privacy/`;
export const TERMS_URL = `${LEGAL_SITE_URL}/terms/`;
/** The published Chrome Web Store listing (v1.1.0, live since 2026-10-23): the install path. */
export const CHROME_WEB_STORE_URL =
  "https://chromewebstore.google.com/detail/skipsponsor-ai/abeocdjmjjfjjoedafnhpfpdhdnliogh";

export type LegalDoc = "privacy" | "terms";

export interface LegalTemplates {
  readonly privacy: string;
  readonly terms: string;
}

const VERSIONS: Readonly<Record<LegalDoc, string>> = {
  privacy: LEGAL_VERSIONS.skipsponsor.privacyVersion,
  terms: LEGAL_VERSIONS.skipsponsor.termsVersion,
};

/** "October 15, 2026" from "2026-10-15" (UTC, never shifts a day). */
export function formatLegalDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
}

export function legalVars(doc: LegalDoc): Record<string, string> {
  return {
    entity: LEGAL_NAME,
    address: POSTAL_ADDRESS_LINE,
    email: GENERAL_EMAIL,
    brandUrl: BRAND_URL,
    privacyUrl: PRIVACY_URL,
    termsUrl: TERMS_URL,
    version: VERSIONS[doc],
    effectiveDate: formatLegalDate(VERSIONS[doc]),
  };
}

/** Removes `<!-- COUNSEL-REVIEW … -->` comments and the blank line after each. */
export function stripCounselMarkers(md: string): string {
  return md.replace(/<!--\s*COUNSEL-REVIEW[\s\S]*?-->\n(\n)?/g, "");
}

/** Fills `{name}` placeholders; throws on an unknown one. */
export function fillTemplate(
  md: string,
  vars: Readonly<Record<string, string>>,
): string {
  return md.replace(/\{(\w+)\}/g, (_m, key: string) => {
    const value = vars[key];
    if (value === undefined)
      throw new Error(`unknown legal placeholder {${key}}`);
    return value;
  });
}

export function renderLegalMarkdown(template: string, doc: LegalDoc): string {
  return fillTemplate(stripCounselMarkers(template), legalVars(doc));
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function linkTag(href: string, label: string): string {
  const external = /^https?:\/\//.test(href);
  const rel = external ? ' rel="noopener"' : "";
  return `<a href="${href}"${rel}>${label}</a>`;
}

/** Inline Markdown: code, links, autolinks, bold, italics. Input is raw text. */
export function renderInline(text: string): string {
  const codes: string[] = [];
  let out = text.replace(/`([^`]+)`/g, (_m, code: string) => {
    codes.push(`<code>${escapeHtml(code)}</code>`);
    return `\u0000${String(codes.length - 1)}\u0000`;
  });
  const links: string[] = [];
  const keep = (html: string) => {
    links.push(html);
    return `\u0001${String(links.length - 1)}\u0001`;
  };
  out = out.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_m, label: string, href: string) =>
      keep(linkTag(escapeHtml(href), escapeHtml(label))),
  );
  out = out.replace(/<(https?:\/\/[^>\s]+)>/g, (_m, href: string) =>
    keep(linkTag(escapeHtml(href), escapeHtml(href))),
  );
  out = escapeHtml(out)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])_([^_]+)_(?=[\s.,;:)]|$)/g, "$1<em>$2</em>");
  out = out.replace(/\u0001(\d+)\u0001/g, (_m, i: string) => {
    const label = links[Number(i)] ?? "";
    return label.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  });
  return out.replace(
    /\u0000(\d+)\u0000/g,
    (_m, i: string) => codes[Number(i)] ?? "",
  );
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function cells(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

/**
 * The Markdown subset the legal templates use: `#`/`##` headings, paragraphs,
 * `-` and `1.` lists (with indented continuation lines), pipe tables and inline
 * formatting. Anything else is rendered as a paragraph.
 */
export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let i = 0;
  const isBlank = (l: string | undefined) => l === undefined || l.trim() === "";
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (isBlank(line)) {
      i++;
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = (heading[1] ?? "#").length;
      const text = heading[2] ?? "";
      const id = level > 1 ? ` id="${slug(text)}"` : "";
      html.push(
        `<h${String(level)}${id}>${renderInline(text)}</h${String(level)}>`,
      );
      i++;
      continue;
    }
    if (line.trim().startsWith("|")) {
      const rows: string[] = [];
      while (i < lines.length && (lines[i] ?? "").trim().startsWith("|")) {
        rows.push(lines[i] ?? "");
        i++;
      }
      const [head, , ...body] = rows;
      html.push(
        "<table>",
        `<thead><tr>${cells(head ?? "")
          .map((c) => `<th scope="col">${renderInline(c)}</th>`)
          .join("")}</tr></thead>`,
        `<tbody>${body
          .map(
            (r) =>
              `<tr>${cells(r)
                .map((c) => `<td>${renderInline(c)}</td>`)
                .join("")}</tr>`,
          )
          .join("")}</tbody>`,
        "</table>",
      );
      continue;
    }
    const listItem = /^(-|\d+\.)\s+(.*)$/;
    const first = listItem.exec(line);
    if (first) {
      const ordered = first[1] !== "-";
      const items: string[] = [];
      const sameKind = (l: string | undefined) => {
        const m = listItem.exec(l ?? "");
        return m !== null && (m[1] !== "-") === ordered;
      };
      while (i < lines.length) {
        const m = listItem.exec(lines[i] ?? "");
        if (!m || !sameKind(lines[i])) break;
        let text = m[2] ?? "";
        i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i] ?? "")) {
          text += ` ${(lines[i] ?? "").trim()}`;
          i++;
        }
        items.push(`<li>${renderInline(text)}</li>`);
        if (isBlank(lines[i]) && sameKind(lines[i + 1])) i++;
      }
      const tag = ordered ? "ol" : "ul";
      html.push(`<${tag}>${items.join("")}</${tag}>`);
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      !isBlank(lines[i]) &&
      !/^(#{1,3}\s|\||-\s|\d+\.\s)/.test((lines[i] ?? "").trim())
    ) {
      para.push((lines[i] ?? "").trim());
      i++;
    }
    html.push(`<p>${renderInline(para.join(" "))}</p>`);
  }
  return html.join("\n");
}

const STYLE = `:root{color-scheme:light dark;--fg:#16181d;--muted:#5b6170;--bg:#fff;--line:#e3e5ea;--link:#0b57d0}
@media (prefers-color-scheme:dark){:root{--fg:#eceef2;--muted:#a3a9b6;--bg:#111317;--line:#2a2e36;--link:#8ab4f8}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:760px;margin:0 auto;padding:40px 20px 64px}h1{font-size:2rem;line-height:1.2;margin:0 0 8px}
h2{font-size:1.25rem;margin:32px 0 8px}p,li{color:var(--fg)}a{color:var(--link);text-decoration:underline;text-underline-offset:3px;cursor:pointer}
table{width:100%;border-collapse:collapse;margin:12px 0;font-size:.95rem;display:block;overflow-x:auto}
th,td{border:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}code{font-size:.9em}
nav{display:flex;gap:16px;flex-wrap:wrap;margin:0 0 24px;color:var(--muted)}footer{margin-top:48px;padding-top:16px;border-top:1px solid var(--line);color:var(--muted);font-size:.9rem}
.cta{display:inline-block;margin:8px 0 4px;padding:10px 18px;border-radius:8px;background:var(--link);color:var(--bg);font-weight:600;text-decoration:none}.cta:hover,.cta:focus-visible{text-decoration:underline}`;

export interface LegalPage {
  readonly title: string;
  readonly description: string;
  readonly canonical: string;
  readonly bodyHtml: string;
}

/** A complete, indexable HTML page with links to both documents. */
export function legalPageHtml(page: LegalPage): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(page.title)}</title>
<meta name="description" content="${escapeHtml(page.description)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${page.canonical}">
<style>${STYLE}</style>
</head>
<body>
<main>
<nav aria-label="Legal documents"><a href="${PRIVACY_URL}">Privacy Policy</a><a href="${TERMS_URL}">Terms of Use</a><a href="https://github.com/juanjaragavi/skip-sponsor-ai" rel="noopener">Source code</a></nav>
${page.bodyHtml}
<footer>${escapeHtml(COPYRIGHT_NOTICE)} · <a href="${BRAND_URL}" rel="noopener">DevSpeak Labs</a> · <a href="mailto:${GENERAL_EMAIL}">${GENERAL_EMAIL}</a></footer>
</main>
</body>
</html>
`;
}

/** Every generated file, keyed by its path relative to the repository root. */
export function buildLegalOutputs(
  templates: LegalTemplates,
): Record<string, string> {
  const privacyMd = renderLegalMarkdown(templates.privacy, "privacy");
  const termsMd = renderLegalMarkdown(templates.terms, "terms");
  const generated = (src: string) =>
    `<!-- GENERATED from legal/${src} by npm run legal:build; edit the template, not this file. -->\n\n`;
  const privacyPage = legalPageHtml({
    title: "SkipSponsor AI · Privacy Policy",
    description:
      "What SkipSponsor AI processes (caption text, video IDs, an anonymous install token), where, for how long, and your rights.",
    canonical: PRIVACY_URL,
    bodyHtml: markdownToHtml(privacyMd),
  });
  const termsPage = legalPageHtml({
    title: "SkipSponsor AI · Terms of Use",
    description:
      "The terms for using the free SkipSponsor AI browser extension and its backend.",
    canonical: TERMS_URL,
    bodyHtml: markdownToHtml(termsMd),
  });
  const index = legalPageHtml({
    title: "SkipSponsor AI · Legal",
    description: "Privacy Policy and Terms of Use of SkipSponsor AI.",
    canonical: `${LEGAL_SITE_URL}/`,
    bodyHtml: `<h1>SkipSponsor AI</h1>\n<p>A browser extension that skips sponsor reads in YouTube videos, provided by ${escapeHtml(LEGAL_NAME)}.</p>\n<p><a class="cta" href="${CHROME_WEB_STORE_URL}" rel="noopener">Add to Chrome</a><br>Free on the Chrome Web Store.</p>\n<ul><li><a href="${PRIVACY_URL}">Privacy Policy</a> (version ${VERSIONS.privacy})</li><li><a href="${TERMS_URL}">Terms of Use</a> (version ${VERSIONS.terms})</li></ul>`,
  });
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${LEGAL_SITE_URL}/</loc></url>
<url><loc>${PRIVACY_URL}</loc><lastmod>${VERSIONS.privacy}</lastmod></url>
<url><loc>${TERMS_URL}</loc><lastmod>${VERSIONS.terms}</lastmod></url>
</urlset>
`;
  return {
    "PRIVACY.md": generated("PRIVACY.template.md") + privacyMd,
    "TERMS.md": generated("TERMS.template.md") + termsMd,
    "site/index.html": index,
    "site/privacy/index.html": privacyPage,
    "site/terms/index.html": termsPage,
    "site/sitemap.xml": sitemap,
    "site/.nojekyll": "",
  };
}
