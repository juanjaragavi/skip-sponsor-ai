import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Pointer cursor on everything clickable (engineering standard ES-6.6,
// 2026-10-14): the popup and options pages share src/extension/ui/tokens.css,
// which gives native controls and ARIA widgets the pointer and disabled ones
// not-allowed; the in-player toast carries its own shadow-DOM stylesheet.
// src/tests/e2e/cursor-pointer.spec.ts proves the computed cursor in Chromium.
const root = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

/** Selectors of the rules whose declarations set the given cursor. */
function rulesWithCursor(css: string, cursor: string): string[] {
  return [
    ...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g),
  ]
    .filter(([, , body]) =>
      new RegExp(`cursor:\\s*${cursor}\\s*(;|$)`).test((body ?? "").trim()),
    )
    .flatMap(([, selector]) =>
      (selector ?? "").split(",").map((s) => s.trim()),
    );
}

const tokens = read("src/extension/ui/tokens.css");

describe("shared extension stylesheet (ui/tokens.css)", () => {
  const pointer = rulesWithCursor(tokens, "pointer");
  const notAllowed = rulesWithCursor(tokens, "not-allowed");

  it.each([
    "button",
    '[role="button"]',
    '[role="switch"]',
    '[role="radio"]',
    '[role="checkbox"]',
    '[role="tab"]',
    "summary",
    "select",
    "label[for]",
    'input[type="checkbox"]',
    'input[type="radio"]',
  ])("%s → pointer", (selector) => {
    expect(pointer).toContain(selector);
  });

  it.each([
    "button:disabled",
    "select:disabled",
    "input:disabled",
    '[aria-disabled="true"]',
    ":disabled + label",
    "label:has(:disabled)",
  ])("%s → not-allowed", (selector) => {
    expect(notAllowed).toContain(selector);
  });

  it("never makes the whole page a pointer", () => {
    expect(
      pointer.filter((s) => ["*", "html", "body", ":root"].includes(s)),
    ).toEqual([]);
  });

  it("is loaded by both extension pages", () => {
    for (const page of ["src/extension/popup.ts", "src/extension/options.ts"]) {
      expect(read(page)).toContain('import "./ui/tokens.css";');
    }
  });
});

describe("in-player toast (shadow DOM)", () => {
  it("its buttons show the pointer", () => {
    expect(
      rulesWithCursor(read("src/extension/toast.ts"), "pointer"),
    ).toContain("button");
  });
});
