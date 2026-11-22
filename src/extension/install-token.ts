/**
 * Anonymous install token for the daily analysis allowance (POST /v1/installs).
 *
 * The API signs tokens and refuses unsigned ones for fresh analyses. When a
 * mint fails (offline, API down, or the per-IP mint limit on a shared network
 * answers 429) the extension keeps a random local token so cached lookups still
 * work, and asks the API again on a later video: after the 429's Retry-After,
 * otherwise after a short backoff that doubles up to MINT_BACKOFF_MAX_MS.
 * Kept free of `chrome.*` so it can be unit-tested (src/tests/unit/install-token.test.ts).
 */

/** Server-issued, signed install token. */
export const SIGNED_TOKEN = /^v1\.[A-Za-z0-9_-]{32}\.[A-Za-z0-9_-]+$/;
export const MINT_BACKOFF_START_MS = 30 * 1000;
export const MINT_BACKOFF_MAX_MS = 10 * 60 * 1000;

export const isSignedToken = (t: string | null | undefined): boolean =>
  typeof t === "string" && SIGNED_TOKEN.test(t);

export interface InstallTokenDeps {
  /** chrome.storage.local get/set of `installToken`. */
  load: () => Promise<string | null>;
  save: (token: string) => Promise<void>;
  /** POST {apiBase}/installs. */
  mint: () => Promise<Response>;
  now?: () => number;
  randomToken?: () => string;
}

export interface InstallTokenClient {
  /** The token to send; mints when none is signed yet and no backoff applies. */
  get(renew?: boolean): Promise<string>;
  /** The last mint attempt failed and the stored token is not a signed one. */
  settingUp(): Promise<boolean>;
}

function retryAfterMs(res: Response): number | null {
  const raw = res.headers.get("retry-after");
  if (!raw) return null;
  const secs = Number(raw);
  if (Number.isFinite(secs) && secs >= 0) return secs * 1000;
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

export function createInstallTokenClient(
  deps: InstallTokenDeps,
): InstallTokenClient {
  const now = deps.now ?? (() => Date.now());
  const randomToken =
    deps.randomToken ??
    (() => crypto.randomUUID() + crypto.randomUUID().replace(/-/g, ""));
  let minting: Promise<string> | null = null;
  /** No mint before this time (ms epoch). */
  let nextMintAt = 0;
  /** Backoff for the next failure without a Retry-After. */
  let backoff = MINT_BACKOFF_START_MS;
  /** The server limited us (429): renewals wait too. */
  let rateLimited = false;

  async function get(renew = false): Promise<string> {
    const current = await deps.load();
    if (!renew && isSignedToken(current)) return current!;
    const waiting = now() < nextMintAt;
    // A 401 renewal may retry at once after a network error, but never
    // before the server's own Retry-After.
    if (current && waiting && (!renew || rateLimited)) return current;
    minting ??= (async () => {
      let res: Response | null = null;
      try {
        res = await deps.mint();
        const body = res.ok
          ? ((await res.json()) as { installToken?: unknown })
          : {};
        if (typeof body.installToken === "string") {
          await deps.save(body.installToken);
          nextMintAt = 0;
          backoff = MINT_BACKOFF_START_MS;
          rateLimited = false;
          return body.installToken;
        }
      } catch {
        // offline or API down: fall through to a local token
      }
      const hinted = res?.status === 429 ? retryAfterMs(res) : null;
      rateLimited = res?.status === 429;
      const wait = Math.min(hinted ?? backoff, MINT_BACKOFF_MAX_MS);
      nextMintAt = now() + wait;
      backoff = Math.min(backoff * 2, MINT_BACKOFF_MAX_MS);
      if (current) return current;
      const local = randomToken();
      await deps.save(local);
      return local;
    })().finally(() => (minting = null));
    return minting;
  }

  async function settingUp(): Promise<boolean> {
    return nextMintAt > 0 && !isSignedToken(await deps.load());
  }

  return { get, settingUp };
}
