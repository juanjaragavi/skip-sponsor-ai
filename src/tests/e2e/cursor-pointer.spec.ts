/**
 * Pointer cursor on everything clickable (engineering standard ES-6.6,
 * 2026-10-14). Opens the real popup and options pages of the built extension
 * and asserts the computed cursor of every visible interactive element:
 * `pointer` when enabled, `not-allowed` when disabled, `ew-resize` on the
 * popup's confidence slider (a drag affordance). Controls prove the rule
 * itself: plain text and the body must not advertise a click, and injected
 * controls must resolve through ui/tokens.css. Read-only: it never clicks.
 * Source guard: src/tests/unit/cursor-pointer.test.ts.
 */
import { test, expect, openPopup, openOptions } from "./harness";
import type { Page } from "@playwright/test";

const INTERACTIVE = [
  "a[href]",
  "button",
  "summary",
  "select",
  "label[for]",
  '[role="button"]',
  '[role="switch"]',
  '[role="radio"]',
  '[role="checkbox"]',
  '[role="tab"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
  'input[type="range"]',
].join(",");

interface Row {
  element: string;
  cursor: string;
  expected: string;
}

async function audit(page: Page): Promise<{ checked: number; wrong: Row[] }> {
  const rows = await page.evaluate((selector) => {
    return [...document.querySelectorAll(selector)]
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return (
          rect.width > 1 &&
          rect.height > 1 &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          style.pointerEvents !== "none" &&
          !el.closest("[hidden]")
        );
      })
      .map((el) => {
        const disabled =
          el.matches(":disabled") ||
          el.getAttribute("aria-disabled") === "true";
        const name = (el.getAttribute("aria-label") ?? el.textContent ?? "")
          .trim()
          .replace(/\s+/g, " ")
          .slice(0, 40);
        const slider = el.matches('.gate input[type="range"]');
        return {
          element: `<${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}> ${name}`,
          cursor: getComputedStyle(el).cursor,
          expected: disabled ? "not-allowed" : slider ? "ew-resize" : "pointer",
        };
      });
  }, INTERACTIVE);
  return {
    checked: rows.length,
    wrong: rows.filter((r) => r.cursor !== r.expected),
  };
}

async function controls(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const probe = document.createElement("div");
    probe.innerHTML =
      '<p id="cp-text">plain text</p><button id="cp-on" type="button">on</button><button id="cp-off" type="button" disabled>off</button><div id="cp-switch" role="switch">s</div>';
    document.body.append(probe);
    const cursor = (id: string) =>
      getComputedStyle(document.getElementById(id)!).cursor;
    const result = {
      text: cursor("cp-text"),
      button: cursor("cp-on"),
      disabledButton: cursor("cp-off"),
      roleSwitch: cursor("cp-switch"),
      body: getComputedStyle(document.body).cursor,
    };
    probe.remove();
    return result;
  });
}

function expectControls(c: Record<string, string>): void {
  expect(["auto", "default", "text"]).toContain(c["text"]);
  expect(c["body"]).not.toBe("pointer");
  expect(c["button"]).toBe("pointer");
  expect(c["disabledButton"]).toBe("not-allowed");
  expect(c["roleSwitch"]).toBe("pointer");
}

test("popup: every clickable element shows the pointer (ES-6.6)", async ({
  h,
}) => {
  await h.openPath("/");
  const popup = await openPopup(h);
  await expect(popup.locator(".edit--empty")).toBeVisible();
  const { checked, wrong } = await audit(popup);
  expect(checked).toBeGreaterThan(3);
  expect(wrong).toEqual([]);
  expectControls(await controls(popup));
});

test("options: every clickable element shows the pointer (ES-6.6)", async ({
  h,
}) => {
  await h.openPath("/");
  const options = await openOptions(h);
  await expect(options.locator("#thr-value")).toBeVisible();
  const { checked, wrong } = await audit(options);
  expect(checked).toBeGreaterThan(5);
  expect(wrong).toEqual([]);
  expectControls(await controls(options));
});
