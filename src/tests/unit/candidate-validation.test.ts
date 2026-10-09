import { describe, it, expect } from "vitest";
import {
  batchCues,
  dedupeCues,
  evidenceSupported,
  normalizeText,
  trimEndToSpeech,
  validateCandidates,
} from "../../api/services/candidate-validation";
import type { LlmChunk, LlmSegmentCandidate } from "../../shared/types";

const cues: LlmChunk[] = [
  { t0: 0, t1: 5, text: "Welcome back to the channel." },
  { t0: 5, t1: 10, text: "But before we continue, a word from our sponsor." },
  {
    t0: 10,
    t1: 20,
    text: "This video is sponsored by AcmeVPN. Use code SAVE at acmevpn.com/save.",
  },
  { t0: 20, t1: 30, text: "Anyway, back to the build." },
  { t0: 30, t1: 40, text: "Now we solder the switches." },
];
const cand = (o: Partial<LlmSegmentCandidate>): LlmSegmentCandidate => ({
  start: 5,
  end: 20,
  category: "sponsor",
  confidence: 0.95,
  evidence: "This video is sponsored by AcmeVPN",
  advertiser: "AcmeVPN",
  relationship: "third_party_sponsor",
  ...o,
});

describe("normalizeText", () => {
  it("lowercases, strips diacritics and punctuation, keeps non-latin letters", () => {
    expect(normalizeText("¡Código: AHORRÁ, ya!")).toBe("codigo ahorra ya");
    expect(normalizeText("Спонсор  этого—видео")).toBe("спонсор этого видео");
  });
});

describe("evidenceSupported", () => {
  const text = normalizeText(cues.map((c) => c.text).join(" "));
  it("accepts a verbatim or near-verbatim quote", () => {
    expect(evidenceSupported("This video is sponsored by AcmeVPN", text)).toBe(
      true,
    );
    expect(
      evidenceSupported("video is sponsored by AcmeVPN. Use code SAVE", text),
    ).toBe(true);
  });
  it("rejects invented or unrelated quotes and empty evidence", () => {
    expect(
      evidenceSupported("Use code BETTERHELP for ten percent off", text),
    ).toBe(false);
    expect(evidenceSupported("", text)).toBe(false);
    expect(evidenceSupported(undefined, text)).toBe(false);
  });
});

describe("validateCandidates", () => {
  it("keeps a well-supported sponsor segment", () => {
    expect(validateCandidates([cand({})], cues)).toHaveLength(1);
  });
  it("snaps boundaries to real cue starts", () => {
    const [v] = validateCandidates([cand({ start: 6.4, end: 19.2 })], cues);
    expect(v!.start).toBe(5);
    expect(v!.end).toBe(20);
  });
  it("ends at the last cue's end when the ad runs to the final cue", () => {
    const [v] = validateCandidates(
      [cand({ start: 30, end: 90, evidence: "Now we solder the switches" })],
      cues,
    );
    expect(v!.end).toBe(40);
  });
  it("drops non-sponsor categories", () => {
    expect(
      validateCandidates([cand({ category: "intro" })], cues),
    ).toHaveLength(0);
    expect(
      validateCandidates([cand({ category: "selfpromo" })], cues),
    ).toHaveLength(0);
    expect(
      validateCandidates([cand({ category: "interaction_reminder" })], cues),
    ).toHaveLength(0);
  });
  describe("first-party promotions", () => {
    const longCues: LlmChunk[] = [
      { t0: 0, t1: 10, text: "Welcome back to the channel." },
      {
        t0: 10,
        t1: 20,
        text: "But before we kick off, join our own summer camp today.",
      },
      {
        t0: 20,
        t1: 30,
        text: "Camp Acme is our camp, reserve a spot at campacme.com right now.",
      },
      {
        t0: 30,
        t1: 40,
        text: "Seriously it is great fun for the whole family.",
      },
      { t0: 40, t1: 50, text: "Spots are limited so hurry up." },
      { t0: 50, t1: 60, text: "Link is below." },
      { t0: 60, t1: 70, text: "Anyway, back to the build." },
      { t0: 70, t1: 80, text: "Now we solder the switches." },
    ];
    const first = (o: Partial<LlmSegmentCandidate>) =>
      cand({
        start: 10,
        end: 60,
        advertiser: "Camp Acme",
        relationship: "first_party",
        breaksFromContent: true,
        evidence: "Camp Acme is our camp, reserve a spot at campacme.com",
        ...o,
      });
    it("accepts one that interrupts the video and runs at least 25 seconds", () => {
      const withContent: LlmChunk[] = [
        ...longCues,
        ...Array.from({ length: 24 }, (_, i) => ({
          t0: 80 + i * 10,
          t1: 90 + i * 10,
          text: `more content ${i}`,
        })),
      ];
      expect(validateCandidates([first({})], withContent)).toHaveLength(1);
    });
    it("rejects one that does not break from the content", () => {
      expect(
        validateCandidates([first({ breaksFromContent: false })], longCues),
      ).toHaveLength(0);
      expect(
        validateCandidates([first({ breaksFromContent: undefined })], longCues),
      ).toHaveLength(0);
    });
    it("rejects a short aside even when flagged as an interruption", () => {
      expect(
        validateCandidates(
          [
            first({
              start: 20,
              end: 30,
              evidence: "Camp Acme is our camp, reserve a spot",
            }),
          ],
          longCues,
        ),
      ).toHaveLength(0);
    });
    it("rejects a first-party promo that runs to the end of the video", () => {
      const endingCues: LlmChunk[] = [
        ...longCues.slice(0, 5),
        { t0: 60, t1: 70, text: "Thanks for watching, see you next time." },
      ];
      // ad covers 10-60, only 10s of video remain afterwards
      expect(validateCandidates([first({})], endingCues)).toHaveLength(0);
    });
    it("normalizes relationship label variants", () => {
      const moreCues: LlmChunk[] = [
        ...longCues,
        ...Array.from({ length: 24 }, (_, i) => ({
          t0: 80 + i * 10,
          t1: 90 + i * 10,
          text: `more content ${i}`,
        })),
      ];
      expect(
        validateCandidates(
          [first({ relationship: "first_party_sponsor" })],
          moreCues,
        ),
      ).toHaveLength(1);
      expect(
        validateCandidates([first({ relationship: "First-Party" })], moreCues),
      ).toHaveLength(1);
      expect(
        validateCandidates([cand({ relationship: "third_party" })], cues),
      ).toHaveLength(1);
      expect(
        validateCandidates(
          [cand({ relationship: "Third Party Sponsor" })],
          cues,
        ),
      ).toHaveLength(1);
    });
    it("does not require interruption for third-party sponsors", () => {
      expect(
        validateCandidates([cand({ breaksFromContent: false })], cues),
      ).toHaveLength(1);
    });
  });
  it.each(["network_promo", "other", "", undefined])(
    "drops a segment whose relationship is %s",
    (relationship) => {
      expect(validateCandidates([cand({ relationship })], cues)).toHaveLength(
        0,
      );
    },
  );
  it("drops segments with no named advertiser", () => {
    expect(validateCandidates([cand({ advertiser: "" })], cues)).toHaveLength(
      0,
    );
    expect(
      validateCandidates([cand({ advertiser: undefined })], cues),
    ).toHaveLength(0);
  });
  it("drops segments whose evidence is not in the transcript at that time", () => {
    expect(
      validateCandidates([cand({ evidence: "Use code BETTERHELP now" })], cues),
    ).toHaveLength(0);
    // real quote, wrong place in the video
    expect(
      validateCandidates([cand({ start: 30, end: 40 })], cues),
    ).toHaveLength(0);
  });
  it("drops segments without evidence and malformed numbers", () => {
    expect(
      validateCandidates([cand({ evidence: undefined })], cues),
    ).toHaveLength(0);
    expect(validateCandidates([cand({ start: NaN })], cues)).toHaveLength(0);
    expect(
      validateCandidates([cand({ start: 20, end: 10 })], cues),
    ).toHaveLength(0);
  });
  it("returns [] for an empty transcript", () => {
    expect(validateCandidates([cand({})], [])).toHaveLength(0);
  });
});

describe("end trimming on sparse rows", () => {
  // Live shape (modern panel, AdkShdDaivc): the last promo row starts at 41
  // with a few words, then gameplay until the next row at 56.
  const sparse: LlmChunk[] = [
    { t0: 0, t1: 16, text: "Today we play the new season." },
    {
      t0: 16,
      t1: 41,
      text: "This video is sponsored by Acme. Use my promo code ACME for thirty percent off.",
    },
    { t0: 41, t1: 56, text: "link in the description" },
    { t0: 56, t1: 70, text: "Okay, back to the match." },
  ];

  it("pulls the end back to where the last promo cue's speech can stop", () => {
    const [v] = validateCandidates(
      [
        cand({
          start: 16,
          end: 56,
          evidence: "This video is sponsored by Acme",
        }),
      ],
      sparse,
    );
    // "link in the description" (23 chars) takes at most ~2.9s to say.
    expect(v!.end).toBeGreaterThan(42);
    expect(v!.end).toBeLessThan(46);
    expect(v!.start).toBe(16);
  });

  it("leaves dense rows alone (end stays on the next cue)", () => {
    expect(trimEndToSpeech({ start: 5, end: 20 }, cues)).toBe(20);
  });

  it("leaves segments that run to the final cue alone", () => {
    expect(trimEndToSpeech({ start: 30, end: 40 }, cues)).toBe(40);
  });

  it("never ends before one second into the last promo cue", () => {
    const end = trimEndToSpeech({ start: 0, end: 30 }, [
      { t0: 0, t1: 29, text: "ok" },
      { t0: 30, t1: 31, text: "next" },
    ]);
    expect(end).toBeGreaterThanOrEqual(1);
    expect(end).toBeLessThan(30);
  });
});

describe("dedupeCues / batchCues", () => {
  it("flattens overlapping windows without duplicates, sorted by time", () => {
    const out = dedupeCues([cues.slice(0, 3), cues.slice(2)]);
    expect(out).toHaveLength(5);
    expect(out.map((c) => c.t0)).toEqual([0, 5, 10, 20, 30]);
  });
  it("covers every cue exactly once at the edges and overlaps between batches", () => {
    const many = Array.from({ length: 1000 }, (_, i) => ({
      t0: i,
      t1: i + 1,
      text: `c${i}`,
    }));
    const batches = batchCues(many, 300, 20);
    expect(batches[0]![0]!.t0).toBe(0);
    expect(batches.at(-1)!.at(-1)!.t0).toBe(999);
    expect(batches.every((b) => b.length <= 300)).toBe(true);
    const seen = new Set(batches.flat().map((c) => c.t0));
    expect(seen.size).toBe(1000);
    expect(batches[1]![0]!.t0).toBe(280);
  });
  it("returns a single batch for short transcripts and none for empty", () => {
    expect(batchCues(cues, 300, 20)).toHaveLength(1);
    expect(batchCues([], 300, 20)).toEqual([]);
  });
});
