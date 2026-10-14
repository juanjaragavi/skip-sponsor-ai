import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderPrivacyController } from "../../extension/company-copyright";
import {
  BRAND_NAME,
  GENERAL_EMAIL,
  LEGAL_NAME,
} from "../../shared/company.generated";

// Juan, 2026-10-14: legal pages name Devspeak S.A.S. as the provider and data
// controller. The in-extension Privacy page reads the entity and the contact
// email from src/shared/company.generated.ts; the HTML holds no literal.
const root = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

interface FakeNode {
  tag?: string;
  text?: string;
  [key: string]: unknown;
}

describe("privacy controller line", () => {
  it("names the legal entity and links the contact email", () => {
    const children: FakeNode[] = [];
    const el = {
      replaceChildren: (...nodes: FakeNode[]) => children.push(...nodes),
    };
    const doc = {
      createElement: (tag: string): FakeNode => ({ tag }),
      createTextNode: (text: string): FakeNode => ({ text }),
    };
    renderPrivacyController(el as never, doc as never);
    expect(children[0]?.text).toBe(
      `${LEGAL_NAME} (${BRAND_NAME}) provides SkipSponsor AI and is responsible for the data it sends. Questions or requests: `,
    );
    expect(children[1]).toMatchObject({
      tag: "a",
      href: `mailto:${GENERAL_EMAIL}`,
      textContent: GENERAL_EMAIL,
    });
    expect(LEGAL_NAME).toBe("Devspeak S.A.S.");
    expect(GENERAL_EMAIL).toBe("info@devspeak.dev");
  });

  it("options Privacy section has a slot (no literal) and the script fills it", () => {
    const html = read("src/extension/options.html");
    const privacy = html.slice(
      html.indexOf('id="privacy"'),
      html.indexOf('id="about"'),
    );
    expect(privacy).toContain('id="privacy-controller"');
    expect(html).not.toMatch(/info@devspeak\.dev|Devspeak S\.A\.S/);
    expect(read("src/extension/options.ts")).toContain(
      'renderPrivacyController($("#privacy-controller"))',
    );
  });

  it("PRIVACY.md names the controller, the contact and the effective version", () => {
    const policy = read("PRIVACY.md");
    expect(policy).toContain(`**${LEGAL_NAME}**`);
    expect(policy).toContain(GENERAL_EMAIL);
    expect(policy).toContain("Law 1581 of 2012");
    expect(policy).toMatch(/Version 2026-10-14/);
    // SponsorBlock is off: the policy must not list it as a recipient.
    expect(policy).not.toMatch(/sponsor\.ajay\.app/);
  });
});
