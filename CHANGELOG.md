# Changelog

SkipSponsor AI follows semantic versioning (major.minor.patch). The extension
version lives in `package.json` and `src/extension/manifest.json`;
`scripts/zip-extension.mjs` refuses a store package when they differ.

## [Unreleased]

## 1.1.0 — first Chrome Web Store submission (package rebuilt 2026-10-16)

- Detection (API): fewer false skips. Disclosure lines in fully sponsored
  videos are no longer skipped, and a one-line "sponsored by" followed by the
  video's topic is no longer skipped together with that content (`a92b276`).
  Release test on 178 fresh videos: 96.8% second-level and 96.2% segment
  precision (`docs/eval/2026-10-16-release-precision-rerun.md`).
- Anonymous usage counts: one ping at install and per version update, at most
  one "active" ping per UTC day (first YouTube video), and an uninstall page.
  Each carries a random usage ID (not the install token), the event and the
  version only; off with Settings › Privacy › **Share usage statistics** (the
  renamed skip-statistics switch). API: `POST /v1/usage`,
  `GET /v1/usage/uninstalled`, operator-only `GET /v1/usage/summary`;
  migration `004_usage_pings.sql` (12-month retention).
- Popup and Options: every clickable control shows the pointer cursor, and
  disabled controls (and their labels) show not-allowed (`src/extension/ui/tokens.css`,
  engineering standard ES-6.6).

Labelled 2026-10-14:

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
