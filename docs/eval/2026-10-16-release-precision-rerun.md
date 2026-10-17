# Release precision test, second run, 2026-10-16

The only accuracy figure SkipSponsor AI publishes comes from this test. It
replaces the first run of the same day
([2026-10-16-release-precision.md](2026-10-16-release-precision.md), kept as
measured) after two fixes in the detection pipeline, and uses a fresh set of
videos from channels used in neither earlier test.

| Metric | Value |
| --- | --- |
| Videos | 178 captioned YouTube videos from 75 channels (110 English, 32 Spanish, 14 Portuguese, 14 French, 6 German, 2 Greek), 4–35 min (mean 18), none used in the 2026-10-13 tuning sets or the first 2026-10-16 run |
| **Second-level precision** (share of skipped seconds that were sponsor reads) | **96.8%** |
| **Segment precision** (IoU ≥ 0.5) | **96.2%** (125 of 130 skipped segments) |
| Recall (reported, not gated) | 75.0% of sponsor-read seconds, 70.6% of reads (125 of 177) |
| Videos with no sponsor read that had any skip | 0 of 46 |
| Date | 2026-10-16 (run 2026-10-17 01:50–02:30 UTC) |
| Code | branch `feat/cws-release-1.1.0` at `a92b276` with `claude-haiku-4-5-20251001`, Sonnet 5.5 re-ask for ambiguous candidates (2 of 178 videos) |

Release bar (set by the owner): second-level precision ≥ 95% **and** segment
precision ≥ 90% on ≥ 150 held-out videos. **This run meets both.**

## Per language

| Language | Videos (with a sponsor read) | Segment precision | Second-level precision | Second-level recall | Real-content false skips |
| --- | --- | --- | --- | --- | --- |
| English | 110 (95) | 95.8% (91/95) | 95.9% | 71.0% | 166 s |
| Spanish | 32 (15) | 92.9% (13/14) | 98.7% | 82.6% | 12 s |
| French | 14 (12) | 100% (12/12) | 99.5% | 92.5% | 5 s |
| Portuguese | 14 (6) | 100% (5/5) | 99.3% | 95.8% | 2 s |
| German | 6 (3) | 100% (3/3) | 97.0% | 99.5% | 8 s |
| Greek | 2 (1) | 100% (1/1) | 100% | 51.4% | 0 s |
| **All** | **178 (132)** | **96.2%** | **96.8%** | **75.0%** | **194 s** |

The non-English samples are small (2–32 videos); their figures are indicative.
A further 106 s of skips fell on creator self-promotion (shown in the
extension, never auto-skipped when the model labels it as such) that the model
took for a third-party read.

## What changed since the first run

The first run missed the segment bar by one segment (89.6%). Its two
false-skip patterns were fixed at the root, with regression tests built from
the misclassified videos (`src/tests/unit/false-skip-regressions.test.ts`):

1. **Fully sponsored videos.** A disclosure line in a video whose topic is the
   sponsor's own product or trip was skipped as if it were a read. The model
   now has an `integrated` relationship (never skipped), and validation drops a
   sponsor named in 4 or more separate minutes outside its own reads
   (`src/api/services/candidate-validation.ts`).
2. **A one-line "sponsored by X" followed by content** was skipped as one block.
   The model now ends such a segment at the next caption line, and validation
   cuts a segment back to its last sponsor mention when 20 s or more follow it
   with no link, code or offer (also looking 20 s past the segment, for reads
   the model splits in two).

On the first run's videos (where the rules were chosen), the validation rules
alone moved segment precision from 89.6% to 92.2%. This second run is the
held-out confirmation.

## Method

Same metric definitions as the first run, fixed before the run.

1. Recent uploads from 91 listed channels (12 handles did not resolve; 75
   contributed videos), skipping each channel's newest two; per channel up to 3
   videos with a community sponsor label (4 for non-English channels) and up to
   2 without. 180 picked, 178 captioned; the 2 uncaptioned videos correctly
   reported "no captions".
2. Reference labels: SponsorBlock `sponsor` segments (votes ≥ 0 or locked),
   read once for this internal, non-commercial evaluation through the
   hash-prefix endpoint. They are not shipped, stored in this repository or
   used for training.
3. Transcripts: the built extension on the real watch pages (logged out), with
   every API call answered locally; all 178 captioned videos were read
   (upload p50 2.9 s).
4. Detection: the API's own pipeline (`chunkTranscript → classifyChunks →
   candidatesToSegments → mergeCandidates`), SponsorBlock off, always the live
   Claude call (LLM p50 1.8 s, about $0.009 per video). Only segments the
   extension auto-skips (category `sponsor`) are scored.
5. Every skipped segment without a matching label, and every false skip over
   5 s, was read in the transcript. Unclear cases count **against**
   SkipSponsor. Credited: three real reads with no label (PC Componentes,
   FarmKind, Nebula), one label that starts 3 s after the sponsor lead-in, and
   four pure disclosure lines ("this video is sponsored by …", "Microsoft
   helped partially fund this video"), treated as sponsor content as in the
   first run.

| Scoring | Segment precision | Second-level precision |
| --- | --- | --- |
| Labels only, no transcript reading | 90.8% (118/130) | 94.5% |
| Adjudicated, disclosure lines **not** credited | 93.8% (122/130) | 96.4% |
| **Adjudicated (headline, same rules as the first run)** | **96.2% (125/130)** | **96.8%** |

## Where it still errs

- **Lead-ins scored as content.** A skip that starts on the creator's
  transition before the read ("Before we get into the answer …", a channel
  update, a post-sign-off thank-you, music after the sign-off): 7–37 s each,
  70 s in four videos.
- **A creator's own product taken for a sponsor** (an app the creator
  co-owns): 22 s of content.
- **A read returned in two parts**, or a part of a longer labelled read:
  counted as unmatched segments, with no false seconds.
- Recall stays below precision by design: about 75% of sponsor-read seconds
  are found; missed reads play normally.
