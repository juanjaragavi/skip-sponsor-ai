import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const VERSION = "v1";
const ID_RE = /^[A-Za-z0-9_-]{32}$/;

const sha = (s: string): string =>
  createHash("sha256").update(s).digest("hex").slice(0, 32);

/**
 * Anonymous install tokens: `v1.<random id>.<HMAC(id)>`, issued by
 * POST /v1/installs and signed with INSTALL_TOKEN_SECRET. The server keeps no
 * token list; it verifies the signature and derives a non-reversible quota
 * key, so the raw token is never stored.
 *
 * Without a secret (local development) any opaque bearer token is accepted
 * and hashed, which keeps older unsigned extension builds working.
 */
export class InstallTokens {
  constructor(private readonly secret: string) {}

  get signing(): boolean {
    return this.secret.length > 0;
  }

  issue(): string {
    const id = randomBytes(24).toString("base64url"); // 32 chars
    if (!this.signing) return `${VERSION}.${id}.unsigned`;
    return `${VERSION}.${id}.${this.mac(`install:${id}`)}`;
  }

  /** Quota key for a valid token, or null when the token is missing or forged. */
  quotaKey(token: string | undefined): string | null {
    if (!token || token.length > 256) return null;
    if (!this.signing) return token.length >= 16 ? `t:${sha(token)}` : null;
    const [version, id, sig] = token.split(".");
    if (version !== VERSION || !id || !sig || !ID_RE.test(id)) return null;
    const expected = Buffer.from(this.mac(`install:${id}`));
    const given = Buffer.from(sig);
    if (given.length !== expected.length || !timingSafeEqual(given, expected))
      return null;
    return `i:${this.mac(`quota:${id}`).slice(0, 32)}`;
  }

  private mac(data: string): string {
    return createHmac("sha256", this.secret).update(data).digest("base64url");
  }
}

/** `Authorization: Bearer <token>` → token. */
export function bearerToken(header: string | undefined): string | undefined {
  return /^Bearer\s+(\S+)$/i.exec(header ?? "")?.[1];
}

/** Dev-only fallback key when a request carries no token at all. */
export const ipQuotaKey = (ip: string): string => `ip:${sha(ip)}`;
