# Contributing to SkipSponsor AI

Thank you for considering a contribution. This project is open source under the
[MIT License](./LICENSE), and we welcome bug reports, fixes, docs, and features.

> **TL;DR**
> Fork → branch → test → `npm run verify` → PR with a clear test plan.
> By contributing you agree your work is licensed under the MIT License
> (inbound = outbound) and that you have the right to submit it.

Please also read the [Code of Conduct](./CODE_OF_CONDUCT.md) and the
[Security Policy](./SECURITY.md).

## 1. Ways to contribute

- **Report bugs** — use the Bug Report template, include Chrome version,
  extension version, a video URL or fixture, expected vs. actual behavior,
  and console errors.
- **Request features** — use the Feature Request template, describe the
  problem first, then the proposed solution and alternatives.
- **Fix bugs / improve docs** — great first contributions; look for
  `good first issue` and `help wanted` labels.
- **Build features** — open an issue or discussion first for anything
  beyond a small fix, so design can be agreed before code is written.

## 2. Development setup

Prerequisites: **Node.js 20 LTS**, **npm 8+**, **Chrome 116+**,
Docker (optional, for PostgreSQL + Redis), and an
[Anthropic API key](https://console.anthropic.com).

```bash
git clone https://github.com/juanjaragavi/skip-sponsor-ai.git
cd skip-sponsor-ai
npm ci
cp .env.example .env.local   # then fill in keys, never commit .env*
npm run build:extension
```

Load the extension: `chrome://extensions/` → Developer Mode →
**Load unpacked** → `dist/extension`.

Optional backend (full LLM path):

```bash
docker-compose up -d
npm run db:migrate
npm run dev:api   # http://localhost:3000
```

## 3. Branching and commits

- Fork the repo, create a topic branch from `main`:
  `feature/<slug>`, `fix/<slug>`, `docs/<slug>`.
- Keep PRs small and focused; one logical change per PR.
- Use [Conventional Commits](https://www.conventionalcommits.org/):
  `feat(extension): …`, `fix(api): …`, `docs: …`, `test: …`, `chore: …`.
- Sign off your commits (`git commit -s`) to certify the
  [Developer Certificate of Origin](https://developercertificate.org/):
  your contribution is yours to give and is submitted under the MIT License.

## 4. Quality gates (must pass)

```bash
npm run lint            # ESLint
npm run typecheck       # tsc --noEmit (strict)
npm run test -- --run   # Vitest, 80% lines/branches/functions gate
npm run test:e2e        # Playwright (for extension behavior changes)
npm run verify          # lint + typecheck + test
npm run build:extension # must bundle cleanly
```

PRs must include:

- [ ] Tests for new/changed behavior (unit + integration/E2E where relevant)
- [ ] `npm run verify` passing locally
- [ ] No secrets, keys, tokens, or local URLs committed
- [ ] Docs updated if behavior, config, or API changed
- [ ] A test plan in the PR description (what you ran, what you observed)

## 5. Code style

- TypeScript `strict`, no `any` without an `eslint-disable` + justification.
- Routes: Route → Zod validator → Service → Repository. No raw SQL in routes.
- Extension content scripts stay framework-free (CSP-safe on YouTube);
  use `textContent`, never `innerHTML` with untrusted data.
- Run `npm run format` (Prettier) before pushing.

## 6. Reporting bugs well

Include: extension + Chrome versions, steps to reproduce, a test video URL,
what you expected, what happened, popup/service-worker console output
(with `VITE_DEBUG_MODE=true` if possible), and whether captions existed on
the video. Redact API keys and personal data.

## 7. Review process

- Maintainers triage issues and review PRs on a best-effort basis.
- CI must be green. A maintainer review is required before merge.
- Small fixes merge fast; larger changes may request tests, docs, or
  follow-up issues. Be responsive to review feedback.
- After merge, the change ships in the next staged Chrome Web Store rollout.

## 8. Security vulnerabilities

**Do not open public issues for vulnerabilities.**
See [SECURITY.md](./SECURITY.md) for how to report privately.

## 9. License and attribution

- Code contributions are under the [MIT License](./LICENSE).
- If you vendor third-party code, add it to [ATTRIBUTION.md](./ATTRIBUTION.md)
  with its upstream URL, version, and license.
- The SkipSponsor AI name and logos are project trademarks — code is MIT,
  trademark rights are not granted (see ATTRIBUTION.md).

## 10. Getting help

- Questions: [GitHub Discussions](https://github.com/juanjaragavi/skip-sponsor-ai/discussions)
- Bugs: [GitHub Issues](https://github.com/juanjaragavi/skip-sponsor-ai/issues)
- Docs: [`README.md`](./README.md), [`PRIVACY.md`](./PRIVACY.md),
  [`store/listing.md`](./store/listing.md), [technical spec](./skip-sponsor-ai-technical-spec.md)
