import { describe, expect, it } from "vitest";
import {
  advertiserAliases,
  hasCallToAction,
  validateCandidates,
} from "../../api/services/candidate-validation";
import {
  candidatesToSegments,
  mergeCandidates,
} from "../../api/services/segment-classifier";
import { SYSTEM_PROMPT } from "../../shared/constants";
import type { LlmSegmentCandidate } from "../../shared/types";
import {
  advertiserWithCommonWord,
  disclosureThenContent,
  fullySponsoredDisclosure,
  fullySponsoredIntro,
  integrationWithCallToAction,
  readWithIntroAndOutro,
  realReadOneMention,
  shortDisclosure,
  splitReadOfferAfterEnd,
  type FalseSkipCase,
} from "./fixtures/false-skip-cases";

/** What the extension would auto-skip for this case (the API's own post-model path). */
function skipped(c: FalseSkipCase, candidates = [c.candidate]) {
  const valid = validateCandidates(candidates, c.cues);
  return mergeCandidates(
    candidatesToSegments(c.videoId, null, "claude-haiku", valid),
  ).filter((s) => s.category === "sponsor");
}

describe("false-skip regressions from the 2026-10-16 release test", () => {
  describe("a one-line disclosure followed by the video's topic", () => {
    it("is not skipped as one block with the content after it (gK-7TKC7kvY)", () => {
      expect(skipped(disclosureThenContent)).toEqual([]);
    });
    it("is cut back to the disclosure line itself", () => {
      const [v] = validateCandidates(
        [disclosureThenContent.candidate],
        disclosureThenContent.cues,
      );
      expect(v?.start).toBe(34);
      expect(v!.end).toBeLessThanOrEqual(35.8);
    });
  });

  describe("a fully sponsored video (the sponsor's product is the topic)", () => {
    it("skips nothing in its intro (dw6U6GROEpY)", () => {
      expect(skipped(fullySponsoredIntro)).toEqual([]);
    });
    it("skips nothing for its disclosure line (HmJYxPLgFds)", () => {
      expect(skipped(fullySponsoredDisclosure)).toEqual([]);
    });
    it("drops a candidate the model marks as an integrated partnership", () => {
      const integrated: LlmSegmentCandidate = {
        ...fullySponsoredDisclosure.candidate,
        relationship: "integrated",
      };
      expect(
        validateCandidates([integrated], fullySponsoredDisclosure.cues),
      ).toEqual([]);
    });
  });

  describe("true sponsor reads from the same test are kept", () => {
    const cases = [
      realReadOneMention,
      shortDisclosure,
      integrationWithCallToAction,
      readWithIntroAndOutro,
      advertiserWithCommonWord,
      splitReadOfferAfterEnd,
    ];
    for (const c of cases)
      it(`${c.videoId}: ${c.note}`, () => {
        const [s, ...rest] = skipped(c);
        expect(rest).toEqual([]);
        expect(s?.startTime).toBe(c.candidate.start);
        expect(s!.endTime).toBeGreaterThan(c.candidate.end - 5);
      });
    it("keeps a read that names the sponsor once when its call to action opens the next cue", () => {
      const c = realReadOneMention;
      const cues = c.cues.map((q) =>
        q.t0 === 157.7
          ? {
              ...q,
              text: "We've been using them for our smaller action cameras that",
            }
          : q,
      );
      const [s] = skipped({ ...c, cues });
      expect(s?.endTime).toBeGreaterThan(c.candidate.end - 5);
    });
  });
});

describe("prompt rules for the two failure modes", () => {
  it("tells the model a one-line disclosure before the topic ends at the next cue", () => {
    expect(SYSTEM_PROMPT).toMatch(/one-line disclosure/i);
    expect(SYSTEM_PROMPT).toMatch(/\"end\" is the next cue/);
  });
  it("defines an integrated relationship for fully sponsored videos", () => {
    expect(SYSTEM_PROMPT).toMatch(/\"integrated\"/);
    expect(SYSTEM_PROMPT).toMatch(/no separate ad to skip/i);
  });
});

describe("advertiserAliases", () => {
  it("splits joint sponsors and parenthesised short names", () => {
    expect(advertiserAliases("NBC and YouTube")).toEqual(["nbc", "youtube"]);
    expect(advertiserAliases("Private Internet Access (PIA)")).toEqual([
      "private internet access",
      "pia",
    ]);
    expect(advertiserAliases("boot.dev")).toEqual(["boot dev"]);
  });
  it("ignores names too short to match reliably", () => {
    expect(advertiserAliases("X")).toEqual([]);
    expect(advertiserAliases("")).toEqual([]);
  });
});

describe("hasCallToAction", () => {
  it("finds offers, links and codes in several languages", () => {
    for (const t of [
      "Learn more at the link in the description below.",
      "Sign up at nebula.tv slash this channel",
      "40% off the annual plan",
      "usa el código ABC para un descuento",
      "acesse o link abaixo",
      "rendez-vous sur le lien en description",
      "mit dem Gutschein bekommt ihr Rabatt",
    ])
      expect(hasCallToAction(t), t).toBe(true);
  });
  it("finds none in ordinary topic talk", () => {
    expect(
      hasCallToAction(
        "ChatGPT has been the fastest app to reach 1 billion users on the Google Play Store.",
      ),
    ).toBe(false);
  });
});
