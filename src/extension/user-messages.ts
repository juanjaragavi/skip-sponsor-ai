/**
 * The extension's message catalog (portfolio platform standard): every
 * user-facing error, success and notification string lives here. Copy names
 * only the product ("SkipSponsor AI"); hosting vendors are never named
 * (guarded by src/tests/unit/user-messages-guard.test.ts).
 */
export const USER_MESSAGES = {
  popup: {
    notRunning: "SkipSponsor AI isn’t running in this tab yet.",
    openVideo: "Open a YouTube video to see its sponsor reads here.",
    readingCaptions: "Reading captions…",
    adPlaying: "YouTube ad playing",
    analyzeFailed: "Couldn’t analyze this video — it plays normally.",
    nothingToSkip:
      "No captions, and no community-labelled sponsors — nothing to skip.",
    noSponsorReads: "No sponsor reads found in this video.",
  },
  options: {
    channelHint: "Paste a channel link, or type its @handle.",
    invalidChannel:
      "That doesn’t look like a YouTube channel. Try @creator or a link like youtube.com/@creator.",
    resetConfirm: "Click again to reset",
    resetDone: "Done — reset",
    statusChecking: "Checking…",
    statusOnline: "Online",
    statusUnreachable: "Unreachable",
    statusUnavailable: "Status unavailable",
    connectedTo: (host: string): string => `Connected to ${host}`,
    cantReach: (host: string): string =>
      `Can’t reach ${host}. Videos will play normally until it’s back.`,
  },
  limits: {
    installQuota: (at: string) => ({
      title: "Daily AI analysis limit reached",
      sub: `Analyzed videos still skip · more at ${at}`,
      popup: `You’ve used today’s free AI analyses. Videos already analyzed and community-labelled sponsors still skip. More analyses at ${at}.`,
    }),
    globalBudget: (at: string) => ({
      title: "AI analysis is busy today",
      sub: `Analyzed videos still skip · resumes ${at}`,
      popup: `SkipSponsor AI reached today’s free analysis capacity. Videos already analyzed and community-labelled sponsors still skip. New analyses resume at ${at}.`,
    }),
    llmNotConfigured: {
      title: "AI analysis is unavailable",
      sub: "Community segments still skip",
      popup:
        "The SkipSponsor AI server isn’t set up for AI analysis yet. Videos already analyzed and community-labelled sponsors still skip.",
    },
    llmDisabled: {
      title: "AI analysis is paused",
      sub: "Analyzed videos still skip",
      popup:
        "AI analysis is paused for now. Videos already analyzed and community-labelled sponsors still skip.",
    },
    unreachable: {
      title: "Couldn’t reach SkipSponsor AI",
      sub: "Using community segments for now",
      popup:
        "This browser couldn’t be verified with the SkipSponsor AI server. Community-labelled sponsors still skip.",
    },
  },
} as const;
