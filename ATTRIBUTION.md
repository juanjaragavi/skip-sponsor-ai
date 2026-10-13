# Attribution & Third-Party Notices

This file records the licenses and attributions required to keep
SkipSponsor AI compliant as an open source project.

- **This project's code** is licensed under the [MIT License](./LICENSE)
  — Copyright (c) 2026 Juan Jaramillo.
  SPDX: `MIT`. See `LICENSE` for the full text.
- **This project's name, logos, and brand assets** (`brand/`, `store/`,
  extension icons) identify the project and are **not** covered by the MIT
  grant of trademark rights. You may use the code freely under MIT, but do
  not use the SkipSponsor AI name or logos to imply endorsement without
  permission.

When you reuse or redistribute this project, keep this file, the `LICENSE`
file, and any `SPDX-License-Identifier` headers intact.

## 1. Runtime dependencies (bundled or required at runtime)

| Package | Version | License | Upstream |
| ------- | ------- | ------- | -------- |
| @anthropic-ai/sdk | ^0.32.1 | MIT | https://github.com/anthropics/anthropic-sdk-typescript |
| @fastify/cors | ^11.3.1 | MIT | https://github.com/fastify/fastify-cors |
| @fastify/rate-limit | ^11.2.1 | MIT | https://github.com/fastify/fastify-rate-limit |
| fastify | ^5.12.5 | MIT | https://github.com/fastify/fastify |
| ioredis | ^5.3.2 | MIT | https://github.com/redis/ioredis |
| opossum | ^8.1.3 | Apache-2.0 | https://github.com/nodeshift/opossum |
| pg | ^8.12.0 | MIT | https://github.com/brianc/node-postgres |
| pino | ^9.4.0 | MIT | https://github.com/pinojs/pino |
| zod | ^3.23.8 | MIT | https://github.com/colinhacks/zod |

## 2. Build / dev dependencies

| Package | License | Upstream |
| ------- | ------- | -------- |
| @crxjs/vite-plugin | MIT | https://github.com/crxjs/chrome-extension-tools |
| @fontsource-variable/roboto (font files) | OFL-1.1 | https://github.com/fontsource/fontsource |
| @playwright/test | Apache-2.0 | https://github.com/microsoft/playwright |
| @types/*, typescript-eslint, eslint | MIT / Apache-2.0 (see upstream) | https://github.com/DefinitelyTyped/DefinitelyTyped · https://github.com/eslint/eslint |
| lucide (icons) | ISC | https://github.com/lucide-icons/lucide |
| prettier, tsx, vite, vitest, typescript | MIT / Apache-2.0 (TypeScript) | https://prettier.io · https://github.com/vitejs/vite · https://github.com/vitest-dev/vitest |

License texts for these packages ship with their own npm distributions.
Run `npx license-checker --summary` (or equivalent) before a release if you
need a machine-generated bill of materials.

## 3. Services, data, and platforms (not bundled — attribution required)

- **Anthropic Claude** — sponsor-segment classification. Caption text only is
  sent to the API. Anthropic is a trademark of Anthropic PBC; use of the API
  is governed by Anthropic's terms, not by this repo's MIT License.
  https://www.anthropic.com · https://docs.anthropic.com
- **SponsorBlock** — the backend contains an optional, **disabled by
  default** read-only lookup (`SPONSORBLOCK_ENABLED`). No SponsorBlock data
  is fetched, stored or shown while it is off. SponsorBlock data is
  community-contributed under
  [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/);
  it will not be enabled for a commercial release without the author's
  written permission. https://sponsor.ajay.app · https://sponsorblock.org
- **YouTube** — caption source and host site. YouTube is a trademark of
  Google LLC. SkipSponsor AI is an independent project, not affiliated with
  or endorsed by YouTube or Google.
- **Google Chrome / Chrome Web Store** — extension platform and distribution
  channel. Chrome is a trademark of Google LLC.

## 4. Fonts and icons

- **Roboto Variable** (@fontsource-variable/roboto) is licensed under the
  [SIL Open Font License 1.1](https://openfontlicense.org/). Font files keep
  their own copyright notices; do not strip them.
- **Lucide icons** are ISC-licensed; keep upstream copyright notices where
  icon files are vendored.

## 5. How to add a new dependency

1. Prefer MIT / Apache-2.0 / BSD / ISC / OFL-1.1 licensed packages.
2. Add the package, version, license, and upstream URL to the tables above.
3. If the license requires notice reproduction (e.g. Apache-2.0 §4), keep its
   `NOTICE` text with the vendored code.
4. Copyleft licenses (GPL/AGPL) and non-commercial-only data licenses must
   **not** be bundled without prior maintainer approval — open an issue first.
