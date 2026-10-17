# Release precision test, 2026-10-16

The first run of the 2026-10-16 release test, kept as measured. The published
figure now comes from the second run on fresh videos after two detection
fixes: [2026-10-16-release-precision-rerun.md](2026-10-16-release-precision-rerun.md).

| Metric | Value |
| --- | --- |
| Videos | 169 captioned YouTube videos from 56 channels (122 English, 22 Spanish, 11 Portuguese, 9 French, 5 German), 5–34 min, none used to tune the detector |
| **Second-level precision** (share of skipped seconds that were sponsor reads) | **95.4%** |
| Segment precision (IoU ≥ 0.5) | 89.6% (95 of 106 skipped segments) |
| Date | 2026-10-16 (run 2026-10-17 01:00–01:45 UTC) |
| Code | detection path of `main` at `2e338cf` (the production API runs the same path) with `claude-haiku-4-5-20251001`, Sonnet 5.5 re-ask for ambiguous candidates |

Release bar (set by the owner): second-level precision ≥ 95% **and** segment
precision ≥ 90% on ≥ 150 held-out videos. This run met the first and missed
the second by one segment, so it is published as a measurement, not as a
passed bar.

## Method

1. Recent uploads from 56 channels (skipping each channel's newest two);
   per channel up to 3 videos with a community sponsor label and up to 2 without.
2. Reference labels: SponsorBlock `sponsor` segments (votes ≥ 0 or locked), read
   once for this internal, non-commercial evaluation through the hash-prefix
   endpoint. They are not shipped, stored in this repository or used for
   training.
3. Transcripts: the built extension on the real watch pages (logged out), with
   every API call answered locally; all 169 captioned videos were read, and the
   6 uncaptioned ones correctly reported "no captions".
4. Detection: the API's own pipeline (`chunkTranscript → classifyChunks →
   candidatesToSegments → mergeCandidates`), SponsorBlock off. Only segments
   the extension auto-skips (category `sponsor`) are scored.
5. Every skipped segment without a matching label, and every false skip over
   1 s, was read in the transcript. Three were credited (one real read with no
   label, two labels with wrong bounds); unclear cases count **against**
   SkipSponsor.

## Where it errs

- Fully sponsored videos: a disclosure line in the intro skipped as if it were
  a read (Spanish, Portuguese and English examples).
- A one-line "sponsored by" followed by real content skipped as one block.
- Recall is lower than precision by design: it misses some reads (about 72% of
  sponsor-read seconds found); those play normally.
