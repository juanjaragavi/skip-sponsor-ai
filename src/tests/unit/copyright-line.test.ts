import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderCompanyCopyright } from "../../extension/company-copyright";
import {
  BRAND_NAME,
  BRAND_URL,
  COPYRIGHT_LINE,
  COPYRIGHT_NOTICE,
} from "../../shared/company.generated";

// Juan, 2026-10-13: "© 2026 Devspeak S.A.S. · DevSpeak Labs", the brand linking to
// labs.devspeak.dev. The facts come from devspeak-labs-company through
// src/shared/company.generated.ts; no surface hardcodes them.
const root = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

interface FakeNode {
  tag?: string;
  text?: string;
  [key: string]: unknown;
}

describe("company copyright line", () => {
  it("renders the generated notice and a brand link in the options About card", () => {
    const children: FakeNode[] = [];
    const el = {
      replaceChildren: (...nodes: FakeNode[]) => children.push(...nodes),
    };
    const doc = {
      createElement: (tag: string): FakeNode => ({ tag }),
      createTextNode: (text: string): FakeNode => ({ text }),
    };
    renderCompanyCopyright(el as never, doc as never);
    expect(children[0]?.text).toBe(`${COPYRIGHT_NOTICE} · `);
    expect(children[1]).toMatchObject({
      tag: "a",
      href: BRAND_URL,
      target: "_blank",
      rel: "noopener",
      textContent: BRAND_NAME,
    });
    expect(COPYRIGHT_NOTICE).toBe("© 2026 Devspeak S.A.S.");
    expect(BRAND_URL).toBe("https://labs.devspeak.dev");
  });

  it("options page has a slot (no literal) and the script fills it", () => {
    const html = read("src/extension/options.html");
    const about = html.slice(html.indexOf('id="about"'));
    expect(about).toContain('id="about-copyright"');
    expect(html).not.toMatch(/©|DevSpeak Labs|Devspeak S\.A\.S/);
    expect(read("src/extension/options.ts")).toContain(
      'renderCompanyCopyright($("#about-copyright"))',
    );
  });

  it("closes the store listing description with the generated line", () => {
    expect(COPYRIGHT_LINE).toBe("© 2026 Devspeak S.A.S. · DevSpeak Labs");
    expect(read("store/listing.md")).toContain(`\n${COPYRIGHT_LINE}\n`);
    expect(read("store/listing.md")).not.toMatch(/© 2026 DevSpeak Labs/);
  });
});
