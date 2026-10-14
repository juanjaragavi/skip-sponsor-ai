# SkipSponsor AI — Privacy Policy

_Effective date: October 14, 2026 · Version 2026-10-14 · Applies to SkipSponsor AI 1.1.0 and later_

SkipSponsor AI is a browser extension that skips sponsor reads inside YouTube
videos. To find a sponsor read, it analyzes the **caption text** of the video
you are watching. This policy explains what is processed, why, where, for how
long, and how to exercise your rights.

## Who is responsible for your data

SkipSponsor AI is provided by **Devspeak S.A.S.** (DevSpeak Labs, "we", "us"),
a company based in Bogotá D.C., Colombia. Devspeak S.A.S. is the data
controller (_Responsable del Tratamiento_ under Colombian Law 1581 of 2012).

- Email for privacy questions and requests: **info@devspeak.dev**
- Website: <https://labs.devspeak.dev>

## Summary

- Only caption text is analyzed: **never audio, never video frames**.
- **No account, no sign-in, no name, no email.** The extension does not read
  your YouTube or Google account, cookies, comments, or watch-history pages.
- It only runs on `https://www.youtube.com/`.
- Analysis results are stored per video, not per person, for **30 days**, then
  deleted.
- Data is **never sold**, never used for advertising, and never used for any
  purpose unrelated to skipping sponsor segments.

## What is processed, and why

| Data | When it leaves your browser | Why |
| --- | --- | --- |
| **YouTube video ID** of the video you open | Each time you open a watch page | To look up the sponsor segments already found for that video |
| **Caption text with timestamps** of that video | Only when that video has no stored result yet | To detect where a sponsor read starts and ends |
| **Channel ID** of that video | With the caption text | To store the result with its channel |
| **Anonymous install token**: a random value our server issues the first time the extension runs | With every request | Rate limiting, abuse protection and the free daily allowance of new analyses. It is not linked to your identity |
| **Extension version** | With every request | Compatibility |
| **Skip events**: "skipped", "undone", or "the player jumped back after a skip", with the video ID and the skip latency | When a skip happens or you press Undo (you can turn this off) | To measure accuracy and performance, for example how often people press Undo |

The extension reads the captions from the YouTube page you already have open
(the same transcript YouTube shows under the video). It does not download
audio or video.

**Your settings** (on/off, mode, confidence threshold, and the channels where
you turned skipping off) are stored with `chrome.storage` in your browser. If
Chrome Sync is enabled, Chrome syncs them across your own devices. They are not
sent to our server.

## What is not collected

Your name, email, Google or YouTube account, cookies, audio, video frames,
browsing activity outside `www.youtube.com`, YouTube search queries,
comments, the content of any other website, and your location. We do not build
profiles of people.

## Where data goes

All traffic uses HTTPS.

1. **Our server.** The SkipSponsor AI backend, operated by Devspeak S.A.S. on
   Amazon Web Services in the United States (region us-east-2, Ohio),
   receives the data in the table above. Amazon Web Services hosts the server,
   its database and its backups on our behalf. For a video it has no result
   for, the server may also ask YouTube for that video's public caption track,
   sending only the video ID.
2. **Anthropic (Claude API).** When a video has no stored result, our server
   sends its **caption text and timestamps only** (no install token, no IP
   address, no settings) to Anthropic's API, which classifies the sponsor
   segments. Anthropic deletes API inputs and outputs within 30 days, except
   where it must keep them longer to enforce its usage policy or to comply
   with the law
   ([Anthropic Privacy Center](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data)).
   We have no zero-retention agreement with Anthropic.

No other third party receives data. The extension contains no analytics or
advertising code. Videos without captions are not analyzed: nothing about
their content is sent anywhere, and the extension tells you the video wasn't
analyzed.

The backend contains a SponsorBlock lookup that is switched off. It would only
be turned on with SponsorBlock's written permission, and this policy would be
updated before that happens.

## Retention

| Data | Kept for |
| --- | --- |
| Segment results (video ID, channel ID, start and end times, category, confidence, a hash of the transcript) | Deleted automatically **30 days** after the analysis |
| Caption text | Used only while the analysis runs. Our server does not store it |
| Skip events (video ID, event type, latency) | Stored without an IP address or install token; deleted after **30 days** |
| Daily usage counter (a keyed one-way hash of the install token and a count) | Deleted after **2 days** |
| IP address | Our application does not write it to its logs or database. It is held in memory for rate limiting, for at most one hour |
| Application logs (request method, path, status, time) | Rotated by size and used only for security and troubleshooting |
| Database backups | Encrypted; they rotate out within about 8 weeks, so deleted data can remain in a backup until then |

The hosting platform's edge proxy sees IP addresses while it forwards
requests, as any web server does.

## Legal basis

- **Colombia (Law 1581 of 2012 and Decree 1377 of 2013, compiled in Decree
  1074 of 2015).** We process data with your authorization. You give it by
  installing and using the extension after being informed by its Chrome Web
  Store listing and this policy (authorization by unequivocal conduct, Decree
  1377 of 2013, Article 7). You can withdraw it at any time by turning the
  extension off or uninstalling it.
- **European Economic Area, United Kingdom and similar laws.** We process the
  data to provide the feature you installed the extension for (Article 6(1)(b)
  GDPR) and, for skip statistics and abuse protection, on our legitimate
  interest in keeping the service accurate and secure (Article 6(1)(f) GDPR).
  You can object to skip statistics by turning them off (see "Your choices").

## International transfers

Our server and Anthropic's API are in the United States. When you use the
extension, the data described above is transferred to and processed in the
United States, under the safeguards described in this policy and in our
providers' terms.

## Your rights

Under Colombian law you have the right to know, update and rectify your
personal data; to request proof of the authorization you gave; to be informed
of how your data is used; to file complaints with the Superintendence of
Industry and Commerce (_Superintendencia de Industria y Comercio_, SIC); to
withdraw your authorization and request deletion; and to access your data free
of charge. If the GDPR or a similar law applies to you, you also have the
rights of access, rectification, erasure, restriction, objection and
portability, and the right to complain to your data protection authority.

**How to exercise them.** Email **info@devspeak.dev** with your request. We
answer questions (_consultas_) within 10 business days, extendable once by 5
business days, and complaints or requests to correct or delete data
(_reclamos_) within 15 business days, extendable once by 8 business days, as
Law 1581 requires. Requests under the GDPR are answered within one month.

Because we do not link stored data to a person, we usually cannot find data
"about you" on our server: results are stored per video, and skip events carry
no token or IP address. Include the video IDs you are asking about. The data
in your browser is under your control (see below).

## Your choices

- Turn skipping off with the switch in the extension popup, or choose **Off**
  mode. Both stop skipping right away.
- Turn skipping off for a single channel ("Don't skip this channel" in the
  popup, or Settings › Channels).
- Stop sending skip statistics: Settings › Privacy › **Share skip
  statistics**. Skipping keeps working; no skip or undo events are sent.
- Erase everything this browser holds (settings, channel list, anonymous
  install token): Settings › Privacy › **Reset SkipSponsor AI**.
- **Uninstalling** the extension deletes your settings and install token from
  your browser.
- To ask us to delete the stored result for a specific video, email
  info@devspeak.dev with the video ID. Results are deleted automatically after
  30 days in any case.

## Chrome Web Store User Data Policy

The use of information received through the extension adheres to the
[Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies),
including the
[Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use)
requirements. We use the data only to provide and improve the skipping of
sponsor segments, we do not transfer it except as described above, we never use
it for advertising or to determine creditworthiness, and no person reads it
except for security reasons, to comply with the law, or in aggregated form.

## Security

All traffic between the extension and the backend uses HTTPS. The extension
runs under Chrome's Manifest V3 rules: it contains no remotely hosted code and
uses only the `storage` permission and access to `https://www.youtube.com/*`.
Secrets used by the backend (such as the Anthropic API key) are kept as
server-side secrets and never ship in the extension. The source code of the
extension and the backend is public at
<https://github.com/juanjaragavi/skip-sponsor-ai>.

## Children

SkipSponsor AI is not directed at children under 13 and does not knowingly
collect personal information from them.

## Changes

If this policy changes, the effective date and version above change, and the
previous versions stay available in this file's history on GitHub. Material
changes are announced in the extension's release notes before they take
effect.

## Contact

Devspeak S.A.S. · Bogotá D.C., Colombia · **info@devspeak.dev**
