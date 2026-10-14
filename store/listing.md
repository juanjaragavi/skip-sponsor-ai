# Chrome Web Store submission — SkipSponsor AI 1.1.0

Everything the Developer Dashboard asks for, in dashboard order. Paste the
fenced blocks as they are. Assets live next to this file in `store/`. The
step-by-step walkthrough for the owner is in the CTO notes
(`notes/cto/runbooks/2026-10-14-skipsponsor-cws-guide.md`).

Requirements were checked live on developer.chrome.com on 2026-10-14 (sources
at the end of this file).

---

## 1. Package

| Field | Value |
| --- | --- |
| Upload | `release/skipsponsor-ai-1.1.0.zip`, built by `npm run package:store` (production API, store checks in `scripts/zip-extension.mjs`) |
| Manifest version | 3 |
| Version | `1.1.0` |
| Minimum Chrome | 116 |
| Permissions | `storage` only |
| Host permissions | `https://www.youtube.com/*` only |
| Remote code | none (all JavaScript ships in the package; CSP `script-src 'self'; object-src 'self'`) |

The ZIP is not committed (`release/` is gitignored). Rebuild it from the
release commit with `npm ci && npm run package:store`.

## 2. Store listing tab

### Name (from the manifest, max 75)

```text
SkipSponsor AI
```

### Summary (from the manifest `description`, max 132; not editable in the dashboard)

```text
Skip sponsor reads inside YouTube videos. Reads the captions, marks the sponsor segment, and jumps past it, with one-click Undo.
```

### Description (max 16,000)

```text
SkipSponsor AI skips the sponsor reads inside YouTube videos, the "this video is sponsored by…" part, so you get back to the content.

HOW IT WORKS
• When you open a video, SkipSponsor AI reads its captions and an AI model finds where a sponsor read starts and ends.
• When playback reaches that range, it jumps past it.
• A small note appears in the player, for example "CUT 00:06 → 00:43 · Sponsor · 37s skipped". Press Undo to go back and watch it.

YOU'RE IN CONTROL
• Auto-skip: jumps past sponsor reads automatically.
• Notify: marks the range and shows a Skip button, so you decide each time.
• Off: sponsor reads play normally.
• Cut threshold: choose how sure the AI must be before it acts (50–95%). The slider shows this video's detected segments, so you can see what will be cut.
• Don't skip this channel: support creators whose reads you want to hear. Manage the list in Settings.
• Changes apply to the video that's playing, without a reload.

SEE WHAT IT FOUND
Open the toolbar popup to see the current video's timeline and a list of every detected segment: what was cut, what will be cut, and the AI's confidence for each.

WHAT IT SKIPS, AND WHAT IT DOESN'T
• It skips paid sponsor reads inside videos.
• A creator's promotion of their own products or channels is not skipped.
• It doesn't block YouTube's own ads, and it doesn't skip intros, outros, or reminders to subscribe.
• Videos without captions aren't analyzed: the extension says so and the video plays normally.
• It works with auto-generated and uploaded captions. It has been tested on English, Spanish, Portuguese, German and French videos.
• The AI can be a few seconds off at the edges of a sponsor read. Undo is always one click away.

WHAT IS SENT, AND WHERE
• To find sponsor reads, the extension sends the YouTube video ID and, for videos that haven't been analyzed yet, the video's caption text to the SkipSponsor AI server. The server asks Anthropic's Claude API to classify the caption text.
• It also sends an anonymous install token (for rate limiting and the daily allowance) and, unless you turn it off in Settings › Privacy, skip and undo events with the video ID.
• Never audio or video. No account, no sign-in, no name or email. It runs only on www.youtube.com, with one extra permission (storage).
• Results are stored per video, not per person, and deleted after 30 days. Data is never sold or used for advertising.

FREE TO USE
SkipSponsor AI is free and needs no account. Each browser gets a daily allowance of new AI analyses. Videos that have already been analyzed don't count toward it. If the allowance runs out, already-analyzed videos keep skipping until it resets.

Privacy policy: https://github.com/juanjaragavi/skip-sponsor-ai/blob/main/PRIVACY.md
Support: info@devspeak.dev · https://github.com/juanjaragavi/skip-sponsor-ai/issues

SkipSponsor AI is an independent product of Devspeak S.A.S. It is not affiliated with or endorsed by YouTube or Google.

© 2026 Devspeak S.A.S. · DevSpeak Labs
```

### Category

`Productivity › Tools` (alternative: `Lifestyle › Entertainment`). Pick the
closest match in the dashboard dropdown; the category list is not published in
the docs.

### Language

English (United States). The extension UI is English only.

### Graphic assets

| Dashboard slot | File | Size | Notes |
| --- | --- | --- | --- |
| Store icon | `store/store-icon-128.png` | 128×128 PNG | 96 px art + 16 px transparent padding (store guideline) |
| Screenshot 1 | `store/screenshots/01-skips-sponsor-reads.png` | 1280×800 | The cut note with Undo, right after a real skip (JayzTwoCents video, sponsor read 00:06 → 00:43) |
| Screenshot 2 | `store/screenshots/02-see-what-it-found.png` | 1280×800 | The toolbar popup for the same video: timeline, two detected segments, mode, threshold |
| Screenshot 3 | `store/screenshots/03-notify-mode.png` | 1280×800 | Notify mode: the Skip button during a real sponsor read (Fireship video, 04:57 → 05:50) |
| Screenshot 4 | `store/screenshots/04-settings.png` | 1280×800 | Settings › General |
| Screenshot 5 | `store/screenshots/05-privacy.png` | 1280×800 | Settings › Privacy, including who is responsible for the data |
| Small promo tile | `store/promo/small-tile-440x280.png` | 440×280 | Required. Brand art, no claims |
| Marquee promo tile | _(do not upload yet)_ | 1400×560 | Optional. `store/promo/marquee-1400x560.png` shows a designed player mock and an "Any language" badge that is broader than what was tested; redraw it before using it |

**How the screenshots were made.** Real captures of the packaged extension
(the exact `release/skipsponsor-ai-1.1.0.zip`, unzipped and loaded unpacked in
Playwright's Chromium, logged out) on public YouTube watch pages, against the
production API, on 2026-10-14. Nothing in them is drawn or edited.
Screenshot 2 places the popup, rendered by the extension at its real size, at
the top right of the page where Chrome opens it; the Chrome toolbar itself is
not in the picture. All images are 24-bit RGB PNG without alpha. The pages are
YouTube's own, so they show YouTube's own sidebar ads.

### Additional fields

| Field | Value |
| --- | --- |
| Official URL | _(leave empty: needs a domain verified in Google Search Console)_ |
| Homepage URL | `https://github.com/juanjaragavi/skip-sponsor-ai` |
| Support URL | `https://github.com/juanjaragavi/skip-sponsor-ai/issues` |
| YouTube video | _(optional; none yet)_ |
| Mature content | No |

The support email shown on the listing is the account's verified contact
email: set it to `info@devspeak.dev` on the Account page.

## 3. Privacy practices tab

### Single purpose description

```text
SkipSponsor AI has a single purpose: skipping paid sponsor reads inside YouTube videos. It reads the caption text of the video being watched to find where a sponsor read starts and ends, then seeks the YouTube player past that range, or shows a Skip button in Notify mode.
```

### Permission justifications

**`storage`**

```text
Saves the user's settings (on/off, Auto-skip/Notify/Off mode, confidence threshold, the channels where skipping is turned off, and whether skip statistics are shared) with chrome.storage.sync, and an anonymous install token plus a note of the last daily-limit notice with chrome.storage.local. The token is used for rate limiting and the free daily allowance of new analyses. Nothing else is stored.
```

**Host permission `https://www.youtube.com/*`**

```text
The content scripts run on YouTube pages to read the open video's captions (the same transcript YouTube shows under the video), track playback time, seek past detected sponsor segments, and show the Undo and Skip notes in the player. They are injected on all www.youtube.com pages, not only /watch, because YouTube changes pages without reloading: a user who starts on the home page and clicks a video would otherwise get no skipping until they reload. No other site is accessed. The popup reads the URL of the YouTube tab, which this host permission allows, so no tabs permission is requested.
```

### Remote code

Select **"No, I am not using remote code."**

```text
All JavaScript ships inside the package. The extension pages' Content Security Policy is script-src 'self'; object-src 'self'. The backend returns JSON data only (segment start and end times, category and confidence).
```

### Data usage: what the extension collects

| Category | Tick? | What and why |
| --- | --- | --- |
| Personally identifiable information | **No** | No name, email, address or account |
| Health information | **No** | |
| Financial and payment information | **No** | Free, no payments |
| Authentication information | **No** | The install token is a random value issued by the server, not a credential the user knows or chose |
| Personal communications | **No** | |
| Location | **No** | No location is derived; the IP address is used in memory for rate limiting only |
| Web history | **Yes** | The YouTube video ID of each watched video is sent to fetch that video's segments |
| User activity | **Yes** | Skip, undo and "player jumped back" events (with the video ID and latency) are sent to measure accuracy; the user can turn this off in Settings › Privacy |
| Website content | **Yes** | The caption text of the YouTube video being watched is sent for analysis |

### Certifications (tick all three)

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

These match `PRIVACY.md` (version 2026-10-14). The store requires the
dashboard answers, the privacy policy and the extension's behaviour to agree.

### Privacy policy URL

```text
https://github.com/juanjaragavi/skip-sponsor-ai/blob/main/PRIVACY.md
```

Why this URL: the repository is public, the file lives on `main` with its full
version history, it needs no login, and it does not depend on our own hosting
or DNS. The extension's Settings › Privacy and About pages link to the same
URL. If the policy moves later (for example to labs.devspeak.dev), keep this
file in place with a link to the new page and update the dashboard field.

## 4. Distribution tab

| Field | Recommendation |
| --- | --- |
| Payments | Free, no in-app purchases |
| Visibility | Public (or Unlisted for a short closed beta first) |
| Regions | All regions |
| Trader status (EU Digital Services Act) | Owner's answer. Devspeak S.A.S. offers the product as a company, so "trader" is the likely answer; have the company's address, phone and email ready |

## 5. Test instructions tab

```text
No login or account is needed. The two videos below are already analyzed on our server, so the result appears within a few seconds.

1. Install the extension and open https://www.youtube.com/watch?v=ybT8H6QdcDs (JayzTwoCents). Let any YouTube ad finish.
2. Play from 0:00. At about 0:06 the player jumps to about 0:43, and a "CUT 00:06 → 00:43 · Sponsor · 37s skipped" note with an Undo button appears at the bottom right of the player. Press Undo to jump back.
3. Click the toolbar icon: the popup lists the detected segments for this video.
4. In the popup, choose "Notify", then open https://www.youtube.com/watch?v=wajoP_5Cpw8 (Fireship) and seek to 4:50. At 4:57 a "Skip" button appears instead of an automatic jump.
5. A video with no sponsor read: https://www.youtube.com/watch?v=dQw4w9WgXcQ (nothing is skipped).

The extension analyzes caption text only. Videos without captions are not analyzed; the popup then says "Couldn't analyze this video".
```

---

## Release status (2026-10-14)

| Item | Status |
| --- | --- |
| Production API | Live at the API origin built into the package; `/api/health` ok, `/readyz` `ai: configured`, `sponsorblock: off` |
| CORS | Allows any `chrome-extension://` origin until the store item exists. The item ID is assigned when the ZIP is first uploaded (before review): then set `CORS_ORIGIN=chrome-extension://<item id>` on the API and restart it, before clicking "Submit for review" |
| Privacy policy | `PRIVACY.md` version 2026-10-14 names Devspeak S.A.S. as controller; open items for counsel: street address, phone and NIT (Decree 1377 of 2013 asks for them) |
| Developer account | Owner: register (one-time US$5), verify `info@devspeak.dev` as the contact email |
| Reviewer path | Both test videos are cached on the server (analyzed 2026-10-13/14; results expire after 30 days). Keep `ANTHROPIC_API_KEY` set and `LLM_DAILY_BUDGET_USD` above 0 during review |

## Sources (accessed 2026-10-14)

- Register: https://developer.chrome.com/docs/webstore/register
- Account setup and contact email verification: https://developer.chrome.com/docs/webstore/set-up-account
- Listing fields and graphic assets: https://developer.chrome.com/docs/webstore/cws-dashboard-listing
- Image requirements (icon 128×128 with 96×96 art; screenshots 1280×800 or 640×400, full bleed, 1–5): https://developer.chrome.com/docs/webstore/images
- Listing best practices (summary ≤132 characters; promo tile 440×280; marquee 1400×560): https://developer.chrome.com/docs/webstore/best-listing
- Privacy tab (single purpose, permissions, remote code, data usage, policy URL): https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- Limited Use: https://developer.chrome.com/docs/webstore/program-policies/limited-use
- Disclosure requirements: https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements
- MV3 remote code rules: https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements
- Distribution: https://developer.chrome.com/docs/webstore/cws-dashboard-distribution
- Publish and review: https://developer.chrome.com/docs/webstore/publish · https://developer.chrome.com/docs/webstore/review-process
- Rejection reasons: https://developer.chrome.com/docs/webstore/troubleshooting
- Manifest `key` (stable ID during development): https://developer.chrome.com/docs/extensions/reference/manifest/key
