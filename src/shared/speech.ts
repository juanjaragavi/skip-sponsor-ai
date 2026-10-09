import {
  DENSE_SCRIPT_CHAR_WEIGHT,
  SLOWEST_SPEECH_CHARS_PER_SECOND,
} from "./constants";

const DENSE_SCRIPT = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/gu;

/**
 * Upper bound on how long `text` takes to say. Captions only carry start
 * times, so a short row followed by music, B-roll or gameplay still "lasts"
 * until the next row; this bounds where its speech can actually stop.
 */
export function maxSpeechSeconds(text: string): number {
  const compact = text.replace(/\s+/g, " ").trim();
  const dense = compact.match(DENSE_SCRIPT)?.length ?? 0;
  const weighted = compact.length + dense * (DENSE_SCRIPT_CHAR_WEIGHT - 1);
  return weighted / SLOWEST_SPEECH_CHARS_PER_SECOND;
}
