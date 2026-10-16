// GENERATED from devspeak-labs-company@10098e849d99; do not edit.
// Edit company.json in github.com/juanjaragavi/devspeak-labs-company, run `node scripts/sync.mjs`, commit here.
// facts-sha256: b6bc6c256f52a0bb6a78d240ff1c38fe0c16655208d58b5c8c54887d1a39e8ab

/** Canonical company facts (public data only). */
export const COMPANY = {
  legalEntity: {
    name: "Devspeak S.A.S.",
    country: "CO",
    postalAddress: {
      streetAddress: "Cll. 7D # 43A - 40, Piso 8",
      addressLocality: "Medellín",
      addressRegion: "Antioquia",
      postalCode: "050022",
      addressCountry: "CO",
    },
    plannedEntities: [
      {
        name: "TBD Delaware LLC",
        target: "2027-Q1",
      },
    ],
  },
  brand: {
    name: "DevSpeak Labs",
    url: "https://labs.devspeak.dev",
  },
  copyright: {
    year: 2026,
    holder: "Devspeak S.A.S.",
  },
  contact: {
    general: "info@devspeak.dev",
    support: "info@devspeak.dev",
  },
} as const;

/** Registered legal entity (contracts, legal texts, JSON-LD legalName). */
export const LEGAL_NAME = "Devspeak S.A.S.";
/** Public brand; footers link it to BRAND_URL. */
export const BRAND_NAME = "DevSpeak Labs";
export const BRAND_URL = "https://labs.devspeak.dev";
/** rel for the brand link (it opens in a new tab). */
export const BRAND_LINK_REL = "noopener";
export const COPYRIGHT_YEAR = 2026;
export const COPYRIGHT_HOLDER = "Devspeak S.A.S.";
/** Footer pattern: COPYRIGHT_NOTICE + COPYRIGHT_SEPARATOR + <a href={BRAND_URL}>{BRAND_NAME}</a>. */
export const COPYRIGHT_NOTICE = "© 2026 Devspeak S.A.S.";
export const COPYRIGHT_SEPARATOR = " · ";
/** Plain-text line for surfaces that cannot link (plists, store listings, plain-text email). */
export const COPYRIGHT_LINE = "© 2026 Devspeak S.A.S. · DevSpeak Labs";
export const GENERAL_EMAIL = "info@devspeak.dev";
export const SUPPORT_EMAIL = "info@devspeak.dev";
/** Company postal address (schema.org PostalAddress fields; postalCode null until confirmed). */
export const POSTAL_ADDRESS = {
  streetAddress: "Cll. 7D # 43A - 40, Piso 8",
  addressLocality: "Medellín",
  addressRegion: "Antioquia",
  postalCode: "050022",
  addressCountry: "CO",
} as const;
/** One line for commercial-email footers (CAN-SPAM physical address). */
export const POSTAL_ADDRESS_LINE =
  "Cll. 7D # 43A - 40, Piso 8, Medellín, Antioquia 050022, Colombia";

/** schema.org Organization for JSON-LD publisher/organization nodes (add "@context" at the top level). */
export const ORGANIZATION_JSON_LD = {
  "@type": "Organization",
  name: "DevSpeak Labs",
  legalName: "Devspeak S.A.S.",
  url: "https://labs.devspeak.dev",
  email: "info@devspeak.dev",
} as const;

/** This repo's products. */
export const PRODUCTS = {
  skipsponsor: {
    id: "skipsponsor",
    name: "SkipSponsor AI",
  },
} as const;

/** Legal text versions (ISO date of the text in force; null = not shipped or unknown). */
export const LEGAL_VERSIONS = {
  skipsponsor: {
    termsVersion: "2026-10-15",
    privacyVersion: "2026-10-15",
  },
} as const;
