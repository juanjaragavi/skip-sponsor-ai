# Changelog

SkipSponsor AI follows semantic versioning (major.minor.patch). The extension
version lives in `package.json` and `src/extension/manifest.json`;
`scripts/zip-extension.mjs` refuses a store package when they differ.

## [Unreleased]

## 1.2.0 — Spanish UI and first-run fixes (package built 2026-11-21, not yet submitted)

From the 2026-11-21 first-run audit (card t_35b75222):

- Extension in English and Spanish (`chrome.i18n`, `src/extension/_locales/`):
  popup, Settings, toasts and limit notices follow the browser language; a
  guard test fails on any user string outside the catalog
  (`src/tests/unit/i18n-catalog.test.ts`). Spanish store listing draft:
  `store/listing.es.md`.
- Shared networks: when the per-IP install limit refuses a new browser, it no
  longer shows "This browser couldn't be verified". It says SkipSponsor AI is
  still finishing setup and retries on the next video (after the server's
  Retry-After, at most 10 minutes; `src/extension/install-token.ts`).
- API: `GET /v1/usage/budget` (operator only) reports today's AI spend against
  `LLM_DAILY_BUDGET_USD`; the API logs `llm_budget_warning` at 80 % and
  `llm_budget_exhausted` at 100 %. The ops-alerts Worker polls the route
  hourly and emails at 80 % and 100 %.
- API: problem `type` URIs no longer point at a placeholder host; `/healthz`
  and `/api/health` report the package version.
- Local stack: the LLM stub is metered like a Haiku call, so budget limits can
  be tested locally.

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
- Privacy Policy 2026-10-17 discloses the anonymous usage counts (approved by
  Juan 2026-10-17; `legal/PRIVACY.template.md`, published from `site/`).
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
