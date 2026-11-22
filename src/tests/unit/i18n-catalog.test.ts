/**
 * S-P1-4 guard: every user-visible string of the extension comes from the
 * chrome.i18n catalog (src/extension/_locales/<lang>/messages.json).
 *
 * (a) en and es have the same keys, no empty messages, the same placeholders,
 *     and keep the brand and product names; store fields stay within limits.
 * (b) popup.html / options.html carry no visible text and no aria-label,
 *     title, placeholder or alt values of their own: text comes from
 *     data-i18n / data-i18n-<attr> keys filled by localizeDocument().
 *     Allowed: the brand "SkipSponsor AI" (never translated) and text with no
 *     letters (numbers, punctuation such as the "78%" badge).
 * (c) a TypeScript AST scan of src/extension/**\/*.ts (not tests, not the
 *     i18n module) flags English-looking literals: any sentence-like literal
 *     anywhere, and any literal with letters that reaches a UI sink
 *     (textContent, title, aria-label, append(), toast specs…).
 * (d) every key used by code, HTML and the manifest exists in English, and
 *     every English key is used.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import en from "../../extension/_locales/en/messages.json";
import es from "../../extension/_locales/es/messages.json";
import {
  formatEntry,
  installFallbackCatalog,
  localizeDocument,
  t,
  type Catalog,
} from "../../extension/i18n";
import { USER_MESSAGES } from "../../extension/user-messages";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const EXT = join(ROOT, "src/extension");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const rel = (f: string): string => relative(ROOT, f).split(sep).join("/");
const EN = en as Catalog;
const ES = es as Catalog;
const LOCALES: Record<string, Catalog> = { en: EN, es: ES };

/** Never translated, kept verbatim in every language. */
const BRAND_TERMS = ["SkipSponsor AI", "YouTube"];

const placeholderTokens = (message: string): string[] =>
  [...message.matchAll(/\$([A-Za-z0-9_@]+)\$/g)]
    .map((m) => m[1]!.toLowerCase())
    .sort();

describe("(a) catalog parity", () => {
  const enKeys = Object.keys(EN).sort();

  it("English and Spanish have exactly the same keys", () => {
    expect(Object.keys(ES).sort()).toEqual(enKeys);
  });

  it("keys are valid chrome.i18n names and no message is empty", () => {
    for (const [lang, catalog] of Object.entries(LOCALES))
      for (const [key, entry] of Object.entries(catalog)) {
        expect(key, `${lang}:${key}`).toMatch(/^[A-Za-z0-9_]+$/);
        expect(entry.message.trim(), `${lang}:${key}`).not.toBe("");
      }
  });

  it("each key has the same placeholders, and each message uses all of them", () => {
    for (const key of enKeys) {
      const a = EN[key]!;
      const b = ES[key]!;
      const contents = (e: typeof a) =>
        Object.entries(e.placeholders ?? {})
          .map(([n, p]) => `${n}=${p.content}`)
          .sort();
      expect(contents(b), key).toEqual(contents(a));
      for (const [lang, e] of [
        ["en", a],
        ["es", b],
      ] as const)
        expect(
          [...new Set(placeholderTokens(e.message))],
          `${lang}:${key}`,
        ).toEqual(Object.keys(e.placeholders ?? {}).sort());
    }
  });

  it("brand and product names stay verbatim in Spanish", () => {
    for (const key of enKeys)
      for (const term of BRAND_TERMS)
        if (EN[key]!.message.includes(term))
          expect(ES[key]!.message, key).toContain(term);
  });

  it("Spanish uses 'video' (no 'vídeo') and no informal imperatives", () => {
    const all = Object.values(ES)
      .map((e) => e.message)
      .join("\n");
    expect(all).not.toMatch(/vídeo/i);
    // usted on this surface (BRAND-07): no tú forms of the verbs we use.
    expect(all).not.toMatch(
      /\b(abre|pega|escribe|prueba|haz|agrega|elige|puedes|quieres|tienes|tus?)\b/i,
    );
  });

  it("store fields fit the Chrome Web Store limits in every language", () => {
    for (const [lang, catalog] of Object.entries(LOCALES)) {
      expect(catalog["extName"]!.message.length, lang).toBeLessThanOrEqual(75);
      expect(catalog["extName"]!.message).not.toMatch(/youtube/i);
      expect(
        catalog["extDescription"]!.message.length,
        lang,
      ).toBeLessThanOrEqual(132);
    }
  });

  it("the manifest is localized with English as the default", () => {
    const manifest = JSON.parse(read("src/extension/manifest.json"));
    expect(manifest.default_locale).toBe("en");
    expect(manifest.name).toBe("__MSG_extName__");
    expect(manifest.short_name).toBe("__MSG_extShortName__");
    expect(manifest.description).toBe("__MSG_extDescription__");
    expect(manifest.action.default_title).toBe("__MSG_actionTitle__");
  });
});

/* ---------- (b) HTML pages ---------- */

const PAGES = ["src/extension/popup.html", "src/extension/options.html"];
/** Text allowed inline in HTML: the brand, which is never translated. */
const HTML_TEXT_ALLOWLIST = new Set(["SkipSponsor AI"]);
const TEXT_ATTRS = [
  "aria-label",
  "title",
  "placeholder",
  "alt",
  "aria-description",
  "aria-valuetext",
];

/** Finds untranslated text in an extension page's markup. */
function htmlFindings(html: string): string[] {
  const src = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "");
  const out: string[] = [];
  for (const m of src.matchAll(/>([^<]+)</g)) {
    const text = m[1]!.replace(/\s+/g, " ").trim();
    if (/\p{L}/u.test(text) && !HTML_TEXT_ALLOWLIST.has(text))
      out.push(`text: "${text}"`);
  }
  for (const m of src.matchAll(/\s([a-z-]+)\s*=\s*"([^"]*)"/g)) {
    const [, name, value] = m;
    if (TEXT_ATTRS.includes(name!) && /\p{L}/u.test(value!))
      out.push(`${name}="${value}"`);
  }
  // A data-i18n element must start empty: old inline text would flash or go stale.
  for (const m of src.matchAll(
    /<[a-z0-9]+\b[^>]*\sdata-i18n="[^"]*"[^>]*>([^<]*)/g,
  ))
    if (m[1]!.trim())
      out.push(`data-i18n element with text: "${m[1]!.trim()}"`);
  return out;
}

describe("(b) extension pages take their text from the catalog", () => {
  it.each(PAGES)("%s has no inline user-visible text", (page) => {
    expect(htmlFindings(read(page))).toEqual([]);
  });

  it("the HTML check catches inline text and attributes (mutation check)", () => {
    expect(htmlFindings('<button type="button">Reload tab</button>')).toEqual([
      'text: "Reload tab"',
    ]);
    expect(
      htmlFindings('<div role="list" aria-label="Detected segments">'),
    ).toEqual(['aria-label="Detected segments"']);
    expect(htmlFindings('<input placeholder="@creator" />')).toEqual([
      'placeholder="@creator"',
    ]);
    expect(htmlFindings('<span data-i18n="modeOff">Off</span>')).toContain(
      'data-i18n element with text: "Off"',
    );
    expect(
      htmlFindings(
        '<span class="app">SkipSponsor AI</span><span id="v">78%</span><span data-i18n="modeOff"></span>',
      ),
    ).toEqual([]);
  });
});

/* ---------- (c) TypeScript sources ---------- */

/** Property names whose assigned value is shown to the user. */
const SINK_PROPS = new Set([
  "textContent",
  "innerText",
  "innerHTML",
  "outerHTML",
  "title",
  "placeholder",
  "alt",
  "ariaLabel",
  // Object-literal fields that the toast / view models render as text.
  "text",
  "sub",
  "popup",
  "status",
  "label",
  "tag",
]);
/** Call name → index of the first argument that is rendered as text. */
const SINK_CALLS: Record<string, number> = {
  append: 0,
  prepend: 0,
  replaceChildren: 0,
  before: 0,
  after: 0,
  createTextNode: 0,
  insertAdjacentText: 1,
  alert: 0,
  confirm: 0,
  emptyRow: 0,
  showNoticeToast: 0,
  div: 1, // div(className, text)
  el: 2, // el(tag, className, ...children)
};
/**
 * Literals that look like UI text but are not ours to translate.
 * file → literal → reason.
 */
const TS_ALLOWLIST: Record<string, Record<string, string>> = {
  "src/extension/view-model.ts": {
    CUT: "Tag data value; the label shown comes from tagLabel()",
    ASK: "Tag data value; the label shown comes from tagLabel()",
    KEEP: "Tag data value; the label shown comes from tagLabel()",
  },
};

/**
 * Sentence-like: two natural words in a row ("Reload tab", "would be cut").
 * Words glued to "-", "_", "#" or "." are code (class names, selectors).
 */
const PROSE =
  /(?:^|[\s(“"])\p{L}[\p{Ll}’']+ \p{L}[\p{Ll}’']*(?=$|[\s.,:!?…—)”"])/u;
/** Code-like text (CSS, selectors, markup, URLs): never UI copy. */
const CODE_LIKE = /[{};=<>]|https?:\/\/|^[.#[]/;
/** UI-looking text in a sink: has letters and a capital or a space ("Undo", "CUT"). */
const SINK_TEXT = /\p{L}{2,}/u;
const UI_SHAPE = /\p{Lu}|\p{L} \p{L}/u;

interface Finding {
  file: string;
  line: number;
  text: string;
  why: "prose" | "sink";
}

function literalText(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return node.text;
  if (ts.isTemplateExpression(node))
    return [node.head.text, ...node.templateSpans.map((s) => s.literal.text)]
      .join(" ")
      .trim();
  return null;
}

function calleeName(call: ts.CallExpression | ts.NewExpression): string {
  const e = call.expression;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  if (e.kind === ts.SyntaxKind.SuperKeyword) return "super";
  return "";
}

/** True for literals that never reach a user (errors, logs, keys, types). */
function isExempt(node: ts.Node): boolean {
  for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
    if (
      ts.isImportDeclaration(p) ||
      ts.isExportDeclaration(p) ||
      ts.isLiteralTypeNode(p) ||
      ts.isThrowStatement(p)
    )
      return true;
    if (ts.isNewExpression(p) && /Error$/.test(calleeName(p))) return true;
    if (ts.isCallExpression(p)) {
      const name = calleeName(p);
      if (name === "super" || name === "t") return true;
      if (
        ts.isPropertyAccessExpression(p.expression) &&
        ts.isIdentifier(p.expression.expression) &&
        p.expression.expression.text === "console"
      )
        return true;
    }
  }
  return false;
}

/** The UI sink this literal flows into, if any (through ?:, ??, +, templates). */
function sinkOf(node: ts.Node): string | null {
  let child: ts.Node = node;
  for (let p = node.parent; p; child = p, p = p.parent) {
    if (
      ts.isParenthesizedExpression(p) ||
      ts.isConditionalExpression(p) ||
      ts.isTemplateSpan(p) ||
      ts.isTemplateExpression(p) ||
      (ts.isBinaryExpression(p) &&
        [
          ts.SyntaxKind.PlusToken,
          ts.SyntaxKind.QuestionQuestionToken,
          ts.SyntaxKind.BarBarToken,
        ].includes(p.operatorToken.kind))
    ) {
      if (ts.isConditionalExpression(p) && child === p.condition) return null;
      continue;
    }
    if (
      ts.isBinaryExpression(p) &&
      p.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      child === p.right &&
      ts.isPropertyAccessExpression(p.left) &&
      SINK_PROPS.has(p.left.name.text)
    )
      return `${p.left.name.text} =`;
    if (
      ts.isPropertyAssignment(p) &&
      child === p.initializer &&
      (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) &&
      SINK_PROPS.has(p.name.text)
    )
      return `${p.name.text}:`;
    if (ts.isCallExpression(p)) {
      const name = calleeName(p);
      const i = p.arguments.indexOf(child as ts.Expression);
      if (i < 0) return null;
      if (name === "setAttribute" && i === 1) {
        const attr = p.arguments[0];
        return attr &&
          ts.isStringLiteral(attr) &&
          TEXT_ATTRS.includes(attr.text)
          ? `setAttribute("${attr.text}")`
          : null;
      }
      return name in SINK_CALLS && i >= SINK_CALLS[name]! ? `${name}()` : null;
    }
    return null;
  }
  return null;
}

/** English-looking literals in one TypeScript source. */
function tsFindings(file: string, source: string): Finding[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true);
  const out: Finding[] = [];
  const allow = TS_ALLOWLIST[file] ?? {};
  const visit = (node: ts.Node): void => {
    const text = literalText(node);
    if (text !== null) {
      const flat = text.replace(/\s+/g, " ").trim();
      if (!(flat in allow) && !isExempt(node)) {
        const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        const code = CODE_LIKE.test(flat);
        if (
          !code &&
          SINK_TEXT.test(flat) &&
          UI_SHAPE.test(flat) &&
          sinkOf(node)
        )
          out.push({ file, line, text: flat, why: "sink" });
        else if (!code && PROSE.test(flat))
          out.push({ file, line, text: flat, why: "prose" });
      }
      if (ts.isTemplateExpression(node)) {
        node.templateSpans.forEach((s) => visit(s.expression));
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });
}

const SOURCES = walk(EXT)
  .map(rel)
  .filter(
    (f) =>
      f.endsWith(".ts") &&
      !f.endsWith(".d.ts") &&
      !/\.(test|spec)\.ts$/.test(f) &&
      f !== "src/extension/i18n.ts",
  );

describe("(c) extension scripts take their text from the catalog", () => {
  it("scans every extension script", () => {
    for (const f of [
      "src/extension/popup.ts",
      "src/extension/options.ts",
      "src/extension/toast.ts",
      "src/extension/view-model.ts",
      "src/extension/content-script.ts",
      "src/extension/service-worker.ts",
      "src/extension/user-messages.ts",
      "src/extension/settings.ts",
      "src/extension/segments.ts",
      "src/extension/ui/icons.ts",
    ])
      expect(SOURCES).toContain(f);
  });

  it("no English UI literal outside the catalog", () => {
    const hits = SOURCES.flatMap((f) => tsFindings(f, read(f))).map(
      (h) => `${h.file}:${h.line} [${h.why}] ${h.text}`,
    );
    expect(hits).toEqual([]);
  });

  it("the scan catches the strings this change moved (mutation check)", () => {
    const sample = [
      'button.textContent = "Reload tab";',
      'close.setAttribute("aria-label", "Dismiss");',
      'const a = { className: "undo", text: "Undo", icon: "undo-2" };',
      'remove.append(icon("x", 14), "Remove");',
      'const s = { tag: "CUT" };',
      "el.textContent = allowed ? `${name} · skipping off` : name;",
      'function f() { return "Dots show this video’s detected segments — none so far."; }',
      'const M = { auto: "Auto-skip — cuts marked ranges as they start" };',
      "document.title = `SkipSponsor AI — ${tab}`;",
    ].join("\n");
    const found = tsFindings("sample.ts", sample).map((h) => h.text);
    expect(found).toEqual([
      "Reload tab",
      "Dismiss",
      "Undo",
      "Remove",
      "CUT",
      "· skipping off",
      "Dots show this video’s detected segments — none so far.",
      "Auto-skip — cuts marked ranges as they start",
      "SkipSponsor AI —",
    ]);
    // Keys, selectors, errors and logs are not UI text.
    expect(
      tsFindings(
        "ok.ts",
        [
          'el.textContent = t("popupReloadTab");',
          'document.querySelector("ytd-channel-name a, #channel-name a");',
          'throw new Error("transcript panel not found");',
          'console.warn("could not read the page");',
          'if (e.key === "Escape") close();',
        ].join("\n"),
      ),
    ).toEqual([]);
  });
});

/* ---------- (d) keys in use ---------- */

function keysUsedInTs(file: string, source: string): string[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true);
  const keys: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "t" &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    )
      keys.push(node.arguments[0].text);
    // Maps and variables typed with MessageKey hold keys as plain literals.
    if (
      (ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node)) &&
      node.type?.getText(sf).includes("MessageKey") &&
      node.initializer
    ) {
      // Values only: skip property names and the conditions of ?: chains.
      const collect = (n: ts.Node): void => {
        if (ts.isStringLiteral(n)) keys.push(n.text);
        else if (ts.isConditionalExpression(n)) {
          collect(n.whenTrue);
          collect(n.whenFalse);
        } else if (ts.isParenthesizedExpression(n)) collect(n.expression);
        else if (ts.isObjectLiteralExpression(n))
          for (const prop of n.properties)
            if (ts.isPropertyAssignment(prop)) collect(prop.initializer);
      };
      collect(node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return keys;
}

describe("(d) catalog keys in use", () => {
  const fromTs = SOURCES.flatMap((f) => keysUsedInTs(f, read(f)));
  const fromHtml = PAGES.flatMap((p) =>
    [...read(p).matchAll(/\sdata-i18n(?:-[a-z-]+)?="([^"]+)"/g)].map(
      (m) => m[1]!,
    ),
  );
  const fromManifest = [
    ...read("src/extension/manifest.json").matchAll(/__MSG_(\w+)__/g),
  ].map((m) => m[1]!);
  const used = new Set([...fromTs, ...fromHtml, ...fromManifest, "localeCode"]);

  it("every key used by code, pages and manifest exists in English", () => {
    expect([...used].filter((k) => !(k in EN))).toEqual([]);
    expect(fromTs.length).toBeGreaterThan(50);
    expect(fromHtml.length).toBeGreaterThan(50);
  });

  it("every English key is used (no stale copy for review)", () => {
    expect(Object.keys(EN).filter((k) => !used.has(k))).toEqual([]);
  });
});

/* ---------- the i18n module itself ---------- */

describe("i18n module", () => {
  it("formats placeholders like chrome.i18n", () => {
    expect(t("optionsConnectedTo", "api.example.com")).toBe(
      "Connected to api.example.com",
    );
    expect(
      formatEntry(
        {
          message: "$A$ costs $$5, $B$ $A$",
          placeholders: { a: { content: "$1" }, b: { content: "$2" } },
        },
        ["x", "y"],
      ),
    ).toBe("x costs $5, y x");
    expect(t("statusSkipped", 40)).toBe("Skipped · 40s");
  });

  it("prefers chrome.i18n.getMessage when the extension provides it", () => {
    const g = globalThis as { chrome?: unknown };
    const before = g.chrome;
    const calls: unknown[] = [];
    g.chrome = {
      i18n: {
        getMessage: (key: string, subs: string[]) => {
          calls.push([key, subs]);
          return key === "toastUndo" ? "Deshacer" : "";
        },
      },
    };
    try {
      expect(t("toastUndo")).toBe("Deshacer");
      expect(t("toastSkip")).toBe("toastSkip"); // missing → the key, never blank
      expect(calls[0]).toEqual(["toastUndo", []]);
    } finally {
      g.chrome = before;
    }
  });

  it("renders Spanish from the Spanish catalog", () => {
    installFallbackCatalog(ES);
    try {
      expect(t("toastSkippedSub", "Patrocinio", 37)).toBe(
        "Patrocinio · 37 s omitidos",
      );
      expect(t("aboutVersion", "1.1.0")).toBe("Versión 1.1.0");
    } finally {
      installFallbackCatalog(EN);
    }
  });

  it("every USER_MESSAGES entry resolves to catalog text in both languages", () => {
    const strings = (): string[] => {
      const { popup, options, limits } = USER_MESSAGES;
      return [
        ...Object.values(popup),
        ...Object.values(options).filter(
          (v): v is string => typeof v === "string",
        ),
        options.connectedTo("api.example.com"),
        options.cantReach("api.example.com"),
        ...[
          limits.installQuota("7:00 PM"),
          limits.globalBudget("7:00 PM"),
          limits.llmNotConfigured,
          limits.llmDisabled,
          limits.settingUp,
          limits.unreachable,
        ].flatMap((l) => [l.title, l.sub, l.popup]),
      ];
    };
    const english = strings();
    installFallbackCatalog(ES);
    try {
      const spanish = strings();
      expect(spanish).toHaveLength(english.length);
      spanish.forEach((text, i) => {
        // A raw key (missing message) has no spaces; real copy differs by language.
        expect(text, english[i]).not.toMatch(/^[A-Za-z0-9_]+$/);
        if (/[a-z]{3,} [a-z]{3,}/.test(english[i]!))
          expect(text, english[i]).not.toBe(english[i]);
      });
    } finally {
      installFallbackCatalog(EN);
    }
    expect(english).toContain(
      "Open a YouTube video to see its sponsor reads here.",
    );
  });

  it("localizeDocument fills text and attributes from data-i18n keys", () => {
    const el = (attrs: Record<string, string>) => {
      const node = {
        attributes: Object.entries(attrs).map(([name, value]) => ({
          name,
          value,
        })),
        textContent: "",
        set: {} as Record<string, string>,
        setAttribute(name: string, value: string) {
          node.set[name] = value;
        },
      };
      return node;
    };
    const button = el({ "data-i18n": "toastUndo", class: "undo" });
    const list = el({ "data-i18n-aria-label": "popupDetectedSegments" });
    const link = el({ "data-i18n-href": "privacyPolicyUrl" });
    const doc = {
      documentElement: { lang: "" },
      querySelectorAll: () => [button, list, link],
    };
    localizeDocument(doc as unknown as Document);
    expect(doc.documentElement.lang).toBe("en");
    expect(button.textContent).toBe("Undo");
    expect(button.set).toEqual({});
    expect(list.set).toEqual({ "aria-label": "Detected segments" });
    expect(link.set["href"]).toBe(
      "https://juanjaragavi.github.io/skip-sponsor-ai/privacy/",
    );
  });
});
