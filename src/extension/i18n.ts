/**
 * The extension's only door to user-visible text (S-P1-4). Every string a
 * user can see lives in `_locales/<lang>/messages.json` and is read here with
 * `chrome.i18n.getMessage`, so Chrome picks the user's language (English is
 * `default_locale`). Guarded by src/tests/unit/i18n-catalog.test.ts.
 *
 * Outside an extension (Vitest has no `chrome` global) a fallback catalog
 * installed with `installFallbackCatalog()` answers instead, using the same
 * `$PLACEHOLDER$` → `$1` substitution rules as Chrome.
 */
/** Every key in the English catalog; a typo is a type error. */
export type MessageKey = keyof typeof import("./_locales/en/messages.json") &
  string;

export interface CatalogEntry {
  message: string;
  description?: string;
  placeholders?: Record<string, { content: string; example?: string }>;
}
export type Catalog = Record<string, CatalogEntry>;

let fallback: Catalog | null = null;

/** Test-time (no `chrome.i18n`) catalog, e.g. `_locales/en/messages.json`. */
export function installFallbackCatalog(catalog: Catalog | null): void {
  fallback = catalog;
}

/** Chrome's substitution: `$NAME$` → placeholder content, then `$1`…`$9`, `$$` → `$`. */
export function formatEntry(
  entry: CatalogEntry,
  subs: readonly string[] = [],
): string {
  const named = entry.message.replace(
    /\$([A-Za-z0-9_@]+)\$/g,
    (whole, name: string) =>
      entry.placeholders?.[name.toLowerCase()]?.content ?? whole,
  );
  return named.replace(/\$(\$|[1-9])/g, (_, d: string) =>
    d === "$" ? "$" : (subs[Number(d) - 1] ?? ""),
  );
}

function chromeGetMessage():
  ((key: string, subs?: string | string[]) => string) | null {
  const g = globalThis as { chrome?: { i18n?: typeof chrome.i18n } };
  const fn = g.chrome?.i18n?.getMessage;
  return typeof fn === "function" ? fn.bind(g.chrome!.i18n) : null;
}

/** The message for `key` in the user's language, with `subs` filled in. */
export function t(key: MessageKey, ...subs: (string | number)[]): string {
  const values = subs.map(String);
  const get = chromeGetMessage();
  const text = get
    ? get(key, values)
    : fallback?.[key]
      ? formatEntry(fallback[key], values)
      : "";
  // An empty answer means a missing key: show the key, never a blank control.
  return text || key;
}

/**
 * Fills an extension page from its `data-i18n` attributes:
 * `data-i18n="key"` sets the text, `data-i18n-<attr>="key"` sets `<attr>`
 * (aria-label, title, placeholder, href). Run before icons are prepended.
 */
export function localizeDocument(doc: Document = document): void {
  doc.documentElement.lang = t("localeCode");
  doc.querySelectorAll<HTMLElement>("*").forEach((el) => {
    for (const { name, value } of [...el.attributes]) {
      if (name === "data-i18n") el.textContent = t(value as MessageKey);
      else if (name.startsWith("data-i18n-"))
        el.setAttribute(
          name.slice("data-i18n-".length),
          t(value as MessageKey),
        );
    }
  });
}
