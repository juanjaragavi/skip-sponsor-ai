import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Juan, 2026-10-13: every DevSpeak Labs surface uses "© 2026 DevSpeak Labs".
const root = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("company copyright line", () => {
  it("appears in the options page About section", () => {
    const html = read("src/extension/options.html");
    const about = html.slice(html.indexOf('id="about"'));
    expect(about).toContain("© 2026 DevSpeak Labs");
  });

  it("closes the store listing description", () => {
    expect(read("store/listing.md")).toContain("© 2026 DevSpeak Labs");
  });
});
