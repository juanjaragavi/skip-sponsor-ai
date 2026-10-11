/**
 * Managed Postgres hosts (InstaCloud among them) hand out URLs with
 * `sslmode=require`. pg 8 already treats prefer/require/verify-ca as
 * verify-full (certificate and hostname checked) and prints a SECURITY
 * WARNING on every boot; pg 9 will switch them to libpq semantics, where
 * `require` no longer verifies the certificate. Pinning `verify-full` keeps
 * today's verified TLS across that upgrade and silences the warning.
 *
 * URLs that opt into libpq semantics (`uselibpqcompat`), use another mode
 * (disable, verify-full) or have no sslmode (local dev) are returned as-is.
 */
const PINNED = new Set(["prefer", "require", "verify-ca"]);

export function pinVerifiedTls(databaseUrl: string): string {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    return databaseUrl;
  }
  const mode = url.searchParams.get("sslmode");
  if (!mode || !PINNED.has(mode) || url.searchParams.has("uselibpqcompat"))
    return databaseUrl;
  url.searchParams.set("sslmode", "verify-full");
  return url.toString();
}
