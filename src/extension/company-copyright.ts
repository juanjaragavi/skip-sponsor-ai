import {
  BRAND_LINK_REL,
  BRAND_NAME,
  BRAND_URL,
  COPYRIGHT_NOTICE,
  COPYRIGHT_SEPARATOR,
  GENERAL_EMAIL,
  LEGAL_NAME,
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

/**
 * Fills the Privacy page's controller line: the legal entity that provides the
 * extension and is responsible for its data, then the contact email as a
 * mailto link. Facts come from src/shared/company.generated.ts.
 */
export function renderPrivacyController(
  el: HTMLElement,
  doc: Pick<Document, "createElement" | "createTextNode"> = document,
): void {
  const link = doc.createElement("a");
  link.href = `mailto:${GENERAL_EMAIL}`;
  link.className = "link-inline";
  link.textContent = GENERAL_EMAIL;
  el.replaceChildren(
    doc.createTextNode(
      `${LEGAL_NAME} (${BRAND_NAME}) provides SkipSponsor AI and is responsible for the data it sends. Questions or requests: `,
    ),
    link,
  );
}
