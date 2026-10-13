# Chrome Web Store submission — SkipSponsor AI 1.0.0

Everything the Developer Dashboard asks for, in dashboard order. Paste the
fenced blocks as-is. Assets live next to this file in `store/`.

> **Before you submit:** work through the checklist in
> [Release blockers](#release-blockers). Production builds fail without an
> https `VITE_API_BASE_URL`, and the package script refuses a store ZIP that
> points at a local or placeholder API.

---

## 1. Package

| Field | Value |
| --- | --- |
| Upload | `release/skipsponsor-ai-1.0.0.zip` (built by `npm run package:extension`) |
| Manifest version | 3 |
| Version | `1.0.0` |
| Minimum Chrome | 116 |

## 2. Store listing

### Name (max 75)

```text
SkipSponsor AI
```

### Summary (max 132) — shown on the tile and in search

```text
Skip sponsor reads inside YouTube videos. AI reads the captions, marks the sponsor segment, and jumps past it, with one-click Undo.
```

### Description (max 16,000)

```text
SkipSponsor AI skips the sponsor reads inside YouTube videos, the "this video is sponsored by…" part, so you get straight back to the content.

HOW IT WORKS
• When you open a video, SkipSponsor AI reads its captions and finds where a sponsor read starts and ends.
• When playback reaches that range, it jumps past it.
• A small note appears in the player: "CUT 03:42 → 04:22 · Sponsor · 40s skipped". Press Undo to go back and watch it.

YOU'RE IN CONTROL
• Auto-skip: jumps past sponsor reads automatically.
• Notify: marks the range and shows a Skip button, so you decide each time.
• Off: sponsor reads play normally.
• Cut threshold: choose how sure the AI must be before it acts (50–95%). The slider shows this video's detected segments, so you can see what will be cut.
• Don't skip this channel: support creators whose reads you want to hear. Manage the list in Settings.
• Changes apply instantly to the video that's playing. No reload.

SEE WHAT IT FOUND
Open the toolbar popup to see the current video's timeline and an edit list of every detected segment: what was cut, what was kept, and the AI's confidence for each.

WORKS IN ANY LANGUAGE
Reads the video's caption track, auto-generated or uploaded, in any language. Videos without captions aren't analyzed: the extension says so and the video plays normally.

PRIVATE BY DESIGN
• Only caption text is analyzed, never audio.
• No account, no sign-in, no personal data.
• Results are cached per video for 30 days, then deleted.
• Runs only on www.youtube.com, with a single extra permission (storage).

FREE TO USE
SkipSponsor AI is free, with no account. Each browser gets a daily allowance of new AI analyses. Videos that have already been analyzed load instantly and don't count. If the allowance runs out, already-analyzed videos keep skipping until it resets.

WHAT IT DOESN'T DO
SkipSponsor AI skips sponsor segments inside videos. It doesn't block YouTube's own ads, and it doesn't skip intros, outros, or reminders to subscribe.

Privacy policy: https://github.com/juanjaragavi/skip-sponsor-ai/blob/main/PRIVACY.md
Support: https://github.com/juanjaragavi/skip-sponsor-ai/issues

SkipSponsor AI is an independent project. It is not affiliated with or endorsed by YouTube or Google.

© 2026 Devspeak S.A.S. · DevSpeak Labs
```

### Category

`Productivity › Tools` (alternative: `Lifestyle › Entertainment`)

### Language

English (United States)

### Graphic assets

| Dashboard slot | File | Size | Notes |
| --- | --- | --- | --- |
| Store icon | `store/store-icon-128.png` | 128×128 | 96px art + 16px transparent padding |
| Screenshot 1 | `store/screenshots/01-skip-sponsor-reads.png` | 1280×800 | "Skip sponsor reads automatically" |
| Screenshot 2 | `store/screenshots/02-undo.png` | 1280×800 | "Changed your mind? Undo." |
| Screenshot 3 | `store/screenshots/03-auto-notify-off.png` | 1280×800 | "Auto, Notify, or Off" |
| Screenshot 4 | `store/screenshots/04-any-language.png` | 1280×800 | "Works in any language" |
| Screenshot 5 | `store/screenshots/05-private-by-design.png` | 1280×800 | "Private by design" |
| Small promo tile | `store/promo/small-tile-440x280.png` | 440×280 | Required |
| Marquee promo tile | `store/promo/marquee-1400x560.png` | 1400×560 | Optional (needed for featuring) |

All screenshots and tiles are 24-bit PNG with no alpha channel, as the store
requires. Extra brand files that are not uploaded to the store: 16:9 showcase
images in `store/showcase/` (YouTube promo-video cover, README, social media)
and logo files in `brand/`.

### Additional fields

| Field | Value |
| --- | --- |
| Official URL | _(optional: needs a verified domain in Search Console)_ |
| Homepage URL | `https://github.com/juanjaragavi/skip-sponsor-ai` |
| Support URL | `https://github.com/juanjaragavi/skip-sponsor-ai/issues` |
| YouTube promo video | _(optional: use `store/showcase/showcase-1920x1080.png` as the cover)_ |
| Mature content | No |

## 3. Privacy practices tab

### Single purpose description

```text
SkipSponsor AI has a single purpose: skipping sponsor reads inside YouTube videos. It reads a video's caption text to find where a sponsor read starts and ends, then seeks the YouTube player past that range, or shows a Skip button in Notify mode.
```

### Permission justifications

**`storage`**

```text
Saves the user's settings (on/off, Auto-skip/Notify/Off mode, confidence threshold, and the channels where skipping is turned off), an anonymous install token used for rate limiting and the free daily analysis allowance, and a note of the last daily-limit notice shown so it appears only once. Nothing else is stored.
```

**Host permission `https://www.youtube.com/*`**

```text
The content script runs on YouTube pages to read the open video's caption text, track playback time, seek past detected sponsor segments, and show the Undo and Skip overlays in the player. It is injected on all www.youtube.com pages, not just /watch, because YouTube changes pages without reloading: a user who starts on the home page and clicks a video would otherwise get no skipping until they reload. No other sites are accessed.
```

### Remote code

```text
No, I am not using remote code.
```

All JavaScript ships inside the package. The extension pages' Content Security
Policy is `script-src 'self'; object-src 'self'`. The backend returns JSON data
(segment start and end times) only.

### Data usage — what the extension collects

Tick these boxes:

| Category | Collected? | What and why |
| --- | --- | --- |
| Personally identifiable information | **No** | |
| Health information | **No** | |
| Financial and payment information | **No** | |
| Authentication information | **No** | The install token is random, not a credential the user knows or chose |
| Personal communications | **No** | |
| Location | **No** | |
| Web history | **Yes** | YouTube video IDs of watched videos are sent to the backend to fetch that video's segments |
| User activity | **Yes** | Skip and Undo events (with video ID and latency) are sent to measure accuracy |
| Website content | **Yes** | Caption text of the YouTube video being watched is sent for analysis |

### Certifications (tick all three)

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

### Privacy policy URL

```text
https://github.com/juanjaragavi/skip-sponsor-ai/blob/main/PRIVACY.md
```

## 4. Distribution

| Field | Recommendation |
| --- | --- |
| Visibility | Public (or Unlisted for a closed beta first) |
| Regions | All regions |
| Pricing | Free |
| Staged rollout | Start at 5%, then 50% and 100% (see "Release & Rollback" in `AGENTS.md`) |

## 5. Test instructions for the reviewer

```text
No login or account is needed.

1. Install the extension and open https://www.youtube.com/watch?v=ybT8H6QdcDs
2. Wait about 5 seconds while captions are analyzed. Click the toolbar icon: the popup's "This video" panel lists the detected segments (CUT rows).
3. Play from 0:00. At about 0:06 the player jumps to about 0:46, and a "CUT … Sponsor · 40s skipped" note with an Undo button appears at the bottom-right of the player. Press Undo to jump back.
4. In the popup, choose "Notify" and play the segment again: a "Skip" button appears instead of an automatic jump.
5. Control video with no sponsor read: https://www.youtube.com/watch?v=dQw4w9WgXcQ (nothing is skipped).

The extension analyzes caption text only. Videos without captions are not analyzed.
```

---

## Release blockers

Status as of 2026-10-11 (branch `feat/launch-readiness`). Items marked
**Owner** cannot be done from this repository.

1. **Production API.** _Code: done. Owner: deploy, domain, build._
   - The placeholder fallback in `service-worker.ts` is gone. The API origin is
     fixed at build time from `VITE_API_BASE_URL`; production builds fail
     without an https URL, and `npm run package:extension` still refuses
     `localhost`, `127.0.0.1` and the old placeholder host.
   - The API persists analyses in Postgres, meters fresh analyses per install
     and caps daily LLM spend. Hosting steps: [`docs/DEPLOY.md`](../docs/DEPLOY.md)
     (InstaCloud preferred, Oracle Always Free VM as the alternative).
   - **Owner:** choose the host, buy the domain, deploy, then build with
     `VITE_API_BASE_URL=https://api.<your-domain>` in `.env.production`.
2. **CORS.** _Code: done. Owner: set the item ID._ The API reads
   `CORS_ORIGIN` (comma-separated). Until it is set, production allows any
   `chrome-extension://` origin. **Owner:** after the first upload, set
   `CORS_ORIGIN=chrome-extension://<item id>`.
3. **Privacy policy hosting and retention.** _Code: retention enforced.
   Owner: legal wording, merge to `main`._
   - The API hard-deletes analyses after `CACHE_TTL_DAYS` (30), telemetry
     after 30 days and quota counters after 2 days, every hour. Caption text
     is never stored by the API.
   - **Owner (legal wording in `PRIVACY.md`, not changed here):** it says the
     backend is "hosted on Amazon Web Services" and that secrets sit in "a
     managed secrets service", so update both to the chosen host. It does not
     say that Anthropic keeps API inputs and outputs for up to 30 days (longer
     if flagged under its Usage Policy) unless a zero-retention agreement is
     in place. It does not mention the per-install quota counter (a keyed hash
     of the install token, kept 2 days). The "7-day request logs" promise
     depends on the host's log retention setting.
   - **Owner:** merge to `main` so the policy URL above serves the final text.
4. **Developer account.** **Owner:** Chrome Web Store developer registration
   (one-time $5 fee) with a verified contact email.
5. **Trader status (EU).** **Owner:** the dashboard asks whether you are a
   trader under the EU Digital Services Act. Answer it for your situation.
6. **Reviewer path.** **Owner:** before submitting, open the two test videos
   in section 5 once against the production API, so their analyses are cached
   and the reviewer's run does not depend on that day's LLM budget. Keep
   `ANTHROPIC_API_KEY` set and `LLM_DAILY_BUDGET_USD` above 0 during review.
