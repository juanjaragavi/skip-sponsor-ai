/**
 * Vitest runs without a `chrome` global, so `t()` (src/extension/i18n.ts)
 * reads the English catalog directly, as Chrome would for an English user.
 */
import en from "../../extension/_locales/en/messages.json";
import { installFallbackCatalog } from "../../extension/i18n";

installFallbackCatalog(en);
