/**
 * The extension's message catalog (portfolio platform standard): every
 * user-facing error, success and notification string is read from
 * `_locales/<lang>/messages.json` through `t()` (src/extension/i18n.ts), so it
 * follows the user's Chrome language. Getters resolve at use time. Copy names
 * only the product ("SkipSponsor AI"); hosting vendors are never named
 * (guarded by src/tests/unit/platform-guards.test.ts).
 */
import { t } from "./i18n";

export interface LimitMessages {
  title: string;
  sub: string;
  popup: string;
}

export const USER_MESSAGES = {
  popup: {
    get notRunning(): string {
      return t("popupNotRunning");
    },
    get openVideo(): string {
      return t("popupOpenVideo");
    },
    get readingCaptions(): string {
      return t("popupReadingCaptions");
    },
    get adPlaying(): string {
      return t("popupAdPlaying");
    },
    get analyzeFailed(): string {
      return t("popupAnalyzeFailed");
    },
    get notAnalyzed(): string {
      return t("popupNotAnalyzed");
    },
    get nothingToSkip(): string {
      return t("popupNothingToSkip");
    },
    get noSponsorReads(): string {
      return t("popupNoSponsorReads");
    },
  },
  options: {
    get channelHint(): string {
      return t("optionsChannelHint");
    },
    get invalidChannel(): string {
      return t("optionsInvalidChannel");
    },
    get resetConfirm(): string {
      return t("optionsResetConfirm");
    },
    get resetDone(): string {
      return t("optionsResetDone");
    },
    get statusChecking(): string {
      return t("optionsStatusChecking");
    },
    get statusOnline(): string {
      return t("optionsStatusOnline");
    },
    get statusUnreachable(): string {
      return t("optionsStatusUnreachable");
    },
    get statusUnavailable(): string {
      return t("optionsStatusUnavailable");
    },
    connectedTo: (host: string): string => t("optionsConnectedTo", host),
    cantReach: (host: string): string => t("optionsCantReach", host),
  },
  limits: {
    installQuota: (at: string): LimitMessages => ({
      title: t("limitInstallQuotaTitle"),
      sub: t("limitInstallQuotaSub", at),
      popup: t("limitInstallQuotaPopup", at),
    }),
    globalBudget: (at: string): LimitMessages => ({
      title: t("limitGlobalBudgetTitle"),
      sub: t("limitGlobalBudgetSub", at),
      popup: t("limitGlobalBudgetPopup", at),
    }),
    get llmNotConfigured(): LimitMessages {
      return {
        title: t("limitLlmNotConfiguredTitle"),
        sub: t("limitLlmNotConfiguredSub"),
        popup: t("limitLlmNotConfiguredPopup"),
      };
    },
    get llmDisabled(): LimitMessages {
      return {
        title: t("limitLlmDisabledTitle"),
        sub: t("limitLlmDisabledSub"),
        popup: t("limitLlmDisabledPopup"),
      };
    },
    get settingUp(): LimitMessages {
      return {
        title: t("limitSettingUpTitle"),
        sub: t("limitSettingUpSub"),
        popup: t("limitSettingUpPopup"),
      };
    },
    get unreachable(): LimitMessages {
      return {
        title: t("limitUnreachableTitle"),
        sub: t("limitUnreachableSub"),
        popup: t("limitUnreachablePopup"),
      };
    },
  },
};
