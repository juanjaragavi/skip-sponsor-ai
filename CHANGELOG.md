# Changelog

SkipSponsor AI follows semantic versioning (major.minor.patch). The extension
version lives in `package.json` and `src/extension/manifest.json`;
`scripts/zip-extension.mjs` refuses a store package when they differ.

## [Unreleased]

- Popup and Options: every clickable control shows the pointer cursor, and
  disabled controls (and their labels) show not-allowed (`src/extension/ui/tokens.css`,
  engineering standard ES-6.6).

## 1.1.0 — 2026-10-14 (first Chrome Web Store submission)

1.0.0 was never published. 1.1.0 is a minor bump because the extension gained
features after 1.0.0 was labelled.

- Transcripts are read through YouTube's modern transcript panel API, so
  captioned videos are analyzed reliably (`e7f1816`).
- Creators' promotions of their own products are shown as self-promo and never
  auto-skipped (`fc55059`).
- Videos without captions are not analyzed; the popup says "Couldn't analyze
  this video". SponsorBlock data is off by default (`20687a1`).
- The Options page About card shows `© 2026 Devspeak S.A.S. · DevSpeak Labs`
  (`5b5e65c`), and Settings › Privacy names Devspeak S.A.S. as the provider
  responsible for the data, with `info@devspeak.dev`.
- Privacy policy version 2026-10-14: Devspeak S.A.S. as data controller,
  Colombian Law 1581 and GDPR rights, exact data flows and retention.
