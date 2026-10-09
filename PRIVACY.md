# SkipSponsor AI — Privacy Policy

_Last updated: October 9, 2026 · Applies to SkipSponsor AI 1.0.0 and later_

SkipSponsor AI is a browser extension that skips sponsor reads inside YouTube
videos. To find a sponsor read, it analyzes the **caption text** of the video
you are watching. This policy explains exactly what is processed, why, where,
and for how long.

## Summary

- Only caption text is analyzed — **never audio, never video frames**.
- **No account, no sign-in, no name, no email.** The extension does not read
  your YouTube account, cookies, comments, or watch history pages.
- It only runs on `https://www.youtube.com/`.
- Analysis results are cached per video for **30 days**, then deleted.
- Data is **never sold**, never used for advertising, and never used to
  determine creditworthiness or for any purpose unrelated to skipping
  sponsor segments.

## What is processed, and why

| Data | When | Why |
| --- | --- | --- |
| **YouTube video ID** of the video you open | Every watch page | To look up (or create) the sponsor segments for that video |
| **Caption text with timestamps** of that video | Only when no cached result exists | To detect where a sponsor read starts and ends |
| **Channel ID or handle** of that video | With the caption text | To respect channels where you turned skipping off, and to group results |
| **Anonymous install token** — a random 256-bit value created on install | Sent with every request | Rate limiting and abuse protection. It is not linked to your identity |
| **Extension version** | Sent with every request | Compatibility |
| **Skip events** — "skip executed" or "skip undone", the video ID, and skip latency | When a skip happens or you press Undo | To measure accuracy and performance (for example, how often people press Undo) |

**Your settings** (on/off, mode, confidence threshold, and the channels where
you turned skipping off) are stored with `chrome.storage` in your browser. If
Chrome Sync is enabled, Chrome syncs them across your own devices. They are not
sent to our server.

## What is not collected

Your name, email, Google or YouTube account, IP-based profiles, cookies, audio,
video frames, browsing activity outside `www.youtube.com`, YouTube search
queries, comments, and the content of any other website.

## Where data goes

1. **SkipSponsor AI backend** (hosted on Amazon Web Services). It receives the
   data in the table above over HTTPS.
2. **Anthropic (Claude API)** — the backend sends **caption text only** (no
   token, no IP address, no personal data) to Anthropic's API to classify
   sponsor segments.
3. **SponsorBlock** (`sponsor.ajay.app`) — for videos without captions, the
   backend looks up community-labelled segments by **video ID only**. Your
   browser does not contact SponsorBlock directly.

No other third parties receive data. No analytics or advertising SDKs are
included in the extension.

## Retention

- **Segment results** (start time, end time, confidence, category): deleted
  automatically **30 days** after analysis.
- **Caption text** is used only while the analysis runs. It is not stored.
- **Server request logs**, which can include IP addresses: kept for up to
  **7 days** for security and abuse prevention, then deleted.
- **Skip events** (video ID, event type, latency): stored without your IP
  address, kept for at most 30 days.

## Your choices

- Turn skipping off with the switch in the extension popup, or choose **Off**
  mode. Both stop skipping right away.
- Turn skipping off for a single channel ("Don't skip this channel" in the
  popup, or Settings › Channels).
- Stop sending skip statistics: Settings › Privacy › **Share skip
  statistics**. Skipping keeps working; no skip or undo events are sent.
- Erase everything this browser holds (settings, channel list, anonymous
  install token): Settings › Privacy › **Reset SkipSponsor AI**.
- **Uninstalling** the extension also deletes your settings and install token
  from your browser.
- To request deletion of the cached result for a specific video, open an issue
  with the video ID (see Contact). Results are deleted automatically after 30
  days in any case.

## Security

All traffic between the extension and the backend uses HTTPS. The extension
runs under Chrome's Manifest V3 rules: it contains no remotely hosted code and
uses only the `storage` permission and access to `https://www.youtube.com/*`.
Secrets used by the backend (such as the Anthropic API key) are stored in a
managed secrets service and are never shipped in the extension.

## Children

SkipSponsor AI is not directed at children under 13 and does not knowingly
collect personal information from them.

## Changes

If this policy changes, the "Last updated" date above will change. Material
changes will be noted in the extension's release notes.

## Contact

Questions or deletion requests: open an issue at
<https://github.com/juanjaragavi/skip-sponsor-ai/issues>.
