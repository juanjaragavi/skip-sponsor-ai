# Security Policy

## Supported versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |
| < 1.0   | :x:                |

Only the latest `1.x` release of the extension and API is supported with
security fixes.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Report privately via
[GitHub Security Advisories](https://github.com/juanjaragavi/skip-sponsor-ai/security/advisories/new)
(preferred). If that is unavailable, open a minimal issue titled
`[Security]` without exploit details and a maintainer will open a private
channel.

Include where possible:

- Affected component and version (extension, API, config)
- Steps to reproduce and impact assessment
- Relevant logs (redact keys, tokens, personal data)

What to expect:

- Acknowledgement within **72 hours**.
- Status updates at least every **7 days** until resolved.
- Credit in the fix release notes if you wish (opt-in).

## Scope

In scope:

- The extension (`src/extension/`), the API (`src/api/`), shared validators,
  and this repository's default configuration.
- Privacy-relevant behavior: caption handling, install tokens, telemetry,
  cache retention, permissions (`storage`, `https://www.youtube.com/*`).

Out of scope:

- YouTube itself, Chrome itself, Anthropic's API, AWS infrastructure,
  SponsorBlock's service, and social-engineering or physical attacks.
- Reports that require a jailbroken browser, a compromised machine, or a
  voluntarily installed malicious build.

## Safe harbor

Good-faith research that follows this policy and avoids privacy violations,
service disruption, and data exfiltration will not result in legal action.
Do not access other users' data, do not run automated scanners against the
production API at abusive rates, and stop and report if you encounter
personal data.

## Handling process

1. Triage and reproduce privately.
2. Fix on a private branch, add regression tests.
3. Release a patched version and publish notes without exploit detail.
4. Disclose via a GitHub Security Advisory once users can update.
