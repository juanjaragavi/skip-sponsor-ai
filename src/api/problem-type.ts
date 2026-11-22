/**
 * RFC 9457 problem `type` for API errors. A tag URI (RFC 4151) on a domain
 * DevSpeak Labs controls: stable and unique, and it does not pretend to be a
 * web page (the old value pointed at a placeholder host). Clients branch on
 * the problem's `reason`/`status`, never on this string.
 */
export const problemType = (slug: string | number): string =>
  `tag:devspeak.dev,2026:skipsponsor/problems/${slug}`;
