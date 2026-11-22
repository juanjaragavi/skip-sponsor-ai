/**
 * Anonymous install token for the daily analysis allowance (POST /v1/installs).
 *
 * The API signs tokens and refuses unsigned ones for fresh analyses. When a
 * mint fails (offline, API down, or the per-IP mint limit on a shared network
 * answers 429) the extension keeps a random local token so cached lookups still
 * work, and asks the API again on a later video: after the 429's Retry-After,
 * otherwise after a short backoff that doubles up to MINT_BACKOFF_MAX_MS.
 * The retry state is kept in storage (chrome.storage.session in the service
 * worker), because MV3 stops an idle service worker and its memory with it.
 * Kept free of `chrome.*` so it can be unit-tested (src/tests/unit/install-token.test.ts).
 */

/** Server-issued, signed install token. */
export const SIGNED_TOKEN = /^v1\.[A-Za-z0-9_-]{32}\.[A-Za-z0-9_-]+$/;
export const MINT_BACKOFF_START_MS = 30 * 1000;
export const MINT_BACKOFF_MAX_MS = 10 * 60 * 1000;

export const isSignedToken = (t: string | null | undefined): boolean =>
  typeof t === "string" && SIGNED_TOKEN.test(t);

/** When to ask the API again after a failed mint. */
export interface MintRetryState {
  /** No mint before this time (ms epoch); 0 = no failed mint pending. */
  nextMintAt: number;
  /** Wait for the next failure without a Retry-After. */
  backoff: number;
  /** The server limited us (429): 401 renewals wait too. */
  rateLimited: boolean;
}

const FRESH: MintRetryState = {
  nextMintAt: 0,
  backoff: MINT_BACKOFF_START_MS,
  rateLimited: false,
};

export interface InstallTokenDeps {
  /** chrome.storage.local get/set of `installToken`. */
  load: () => Promise<string | null>;
  save: (token: string) => Promise<void>;
  /** POST {apiBase}/installs. */
  mint: () => Promise<Response>;
  /** Retry state that survives a service-worker restart (chrome.storage.session). Memory when omitted. */
  loadState?: () => Promise<MintRetryState | null>;
  saveState?: (s: MintRetryState) => Promise<void>;
  now?: () => number;
  randomToken?: () => string;
}

export interface InstallTokenClient {
  /** The token to send; mints when none is signed yet and no backoff applies. */
  get(renew?: boolean): Promise<string>;
  /** The last mint attempt failed and the stored token is not a signed one. */
  settingUp(): Promise<boolean>;
}

/** Retry-After in ms (delta-seconds or an HTTP date); null when absent or unreadable. */
export function retryAfterMs(res: Response, now: number): number | null {
  const raw = res.headers.get("retry-after")?.trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return Number(raw) * 1000;
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.max(0, at - now) : null;
}

export function createInstallTokenClient(
  deps: InstallTokenDeps,
): InstallTokenClient {
  const now = deps.now ?? (() => Date.now());
  const randomToken =
    deps.randomToken ??
    (() => crypto.randomUUID() + crypto.randomUUID().replace(/-/g, ""));
  let memory: MintRetryState = { ...FRESH };
  const loadState = async (): Promise<MintRetryState> => {
    if (!deps.loadState) return memory;
    try {
      return { ...FRESH, ...((await deps.loadState()) ?? {}) };
    } catch {
      return memory;
    }
  };
  const saveState = async (s: MintRetryState): Promise<void> => {
    memory = s;
    try {
      await deps.saveState?.(s);
    } catch {
      // memory copy still applies for this worker's lifetime
    }
  };
  let minting: Promise<string> | null = null;

  async function get(renew = false): Promise<string> {
    const current = await deps.load();
    if (!renew && isSignedToken(current)) return current!;
    const state = await loadState();
    const waiting = now() < state.nextMintAt;
    // A 401 renewal may retry at once after a network error, but never
    // before the server's own Retry-After.
    if (current && waiting && (!renew || state.rateLimited)) return current;
    minting ??= (async () => {
      let res: Response | null = null;
      let minted: string | null = null;
      try {
        res = await deps.mint();
        const body = res.ok
          ? ((await res.json()) as { installToken?: unknown })
          : {};
        if (typeof body.installToken === "string") minted = body.installToken;
      } catch {
        // offline or API down: fall through to a local token
      }
      if (minted) {
        await saveState({ ...FRESH });
        try {
          await deps.save(minted);
        } catch {
          // a valid server token is still used for this request
        }
        return minted;
      }
      const hinted = res?.status === 429 ? retryAfterMs(res, now()) : null;
      const wait = Math.min(
        Math.max(hinted ?? state.backoff, MINT_BACKOFF_START_MS),
        MINT_BACKOFF_MAX_MS,
      );
      await saveState({
        nextMintAt: now() + wait,
        backoff: Math.min(state.backoff * 2, MINT_BACKOFF_MAX_MS),
        rateLimited: res?.status === 429,
      });
      if (current) return current;
      const local = randomToken();
      await deps.save(local);
      return local;
    })().finally(() => (minting = null));
    return minting;
  }

  async function settingUp(): Promise<boolean> {
    return (
      (await loadState()).nextMintAt > 0 && !isSignedToken(await deps.load())
    );
  }

  return { get, settingUp };
}
