import {
  BRAND_LINK_REL,
  BRAND_NAME,
  BRAND_URL,
  COPYRIGHT_NOTICE,
  COPYRIGHT_SEPARATOR,
} from "../shared/company.generated";

/**
 * Fills the About card's copyright slot: notice, separator, then the brand
 * linking to its site in a new tab. Company facts come from
 * devspeak-labs-company (src/shared/company.generated.ts); never hardcode them.
 */
export function renderCompanyCopyright(
  el: HTMLElement,
  doc: Pick<Document, "createElement" | "createTextNode"> = document,
): void {
  const link = doc.createElement("a");
  link.href = BRAND_URL;
  link.target = "_blank";
  link.rel = BRAND_LINK_REL;
  link.className = "link-inline";
  link.textContent = BRAND_NAME;
  el.replaceChildren(
    doc.createTextNode(`${COPYRIGHT_NOTICE}${COPYRIGHT_SEPARATOR}`),
    link,
  );
}
