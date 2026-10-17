import type { DbPool as Pool } from "../db/connection";

/**
 * Anonymous usage counts: installs, updates, uninstalls and daily active
 * installs. Each row is (UTC day, usage key, event, extension version), where
 * the usage key is a keyed one-way hash of the extension's random usage id
 * (UsageKeys in services/install-token.ts). Nothing else is stored: no IP
 * address, user agent, URL, video ID or channel ID.
 */
export type UsageEvent = "install" | "update" | "active" | "uninstall";

export interface UsageSummary {
  /** UTC day the windows end on (inclusive), `YYYY-MM-DD`. */
  asOf: string;
  installs: { last7: number; last28: number; total: number };
  uninstalls: { last7: number; last28: number; total: number };
  /** Distinct installs that sent an "active" ping on `asOf`. */
  dailyActive: number;
  /** Distinct installs active in the 7 days ending on `asOf`. */
  weeklyActive: number;
  /** Distinct installs active in the 28 days ending on `asOf`. */
  monthlyActive: number;
  /** Weekly active installs by extension version (latest version they reported). */
  weeklyActiveByVersion: Record<string, number>;
}

export interface UsageStatsStore {
  /** Record one event; a repeat of the same (day, key, event) is a no-op. */
  record(
    day: string,
    usageKey: string,
    event: UsageEvent,
    version: string,
  ): Promise<void>;
  summary(asOf: string): Promise<UsageSummary>;
}

/** `YYYY-MM-DD` n days before `day` (UTC). */
export function daysBefore(day: string, n: number): string {
  const t = Date.parse(`${day}T00:00:00Z`) - n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

interface Row {
  day: string;
  key: string;
  event: UsageEvent;
  version: string;
}

export class MemoryUsageStatsStore implements UsageStatsStore {
  readonly rows: Row[] = [];

  async record(
    day: string,
    key: string,
    event: UsageEvent,
    version: string,
  ): Promise<void> {
    if (
      this.rows.some((r) => r.day === day && r.key === key && r.event === event)
    )
      return;
    this.rows.push({ day, key, event, version });
  }

  async summary(asOf: string): Promise<UsageSummary> {
    const within = (r: Row, days: number) =>
      r.day <= asOf && r.day > daysBefore(asOf, days);
    const count = (event: UsageEvent, days?: number) =>
      this.rows.filter(
        (r) =>
          r.event === event &&
          (days === undefined ? r.day <= asOf : within(r, days)),
      ).length;
    const distinct = (days: number) =>
      new Set(
        this.rows
          .filter((r) => r.event === "active" && within(r, days))
          .map((r) => r.key),
      ).size;
    const latest = new Map<string, Row>();
    for (const r of this.rows)
      if (r.event === "active" && within(r, 7)) {
        const prev = latest.get(r.key);
        if (!prev || prev.day < r.day) latest.set(r.key, r);
      }
    const byVersion: Record<string, number> = {};
    for (const r of latest.values())
      byVersion[r.version] = (byVersion[r.version] ?? 0) + 1;
    return {
      asOf,
      installs: {
        last7: count("install", 7),
        last28: count("install", 28),
        total: count("install"),
      },
      uninstalls: {
        last7: count("uninstall", 7),
        last28: count("uninstall", 28),
        total: count("uninstall"),
      },
      dailyActive: distinct(1),
      weeklyActive: distinct(7),
      monthlyActive: distinct(28),
      weeklyActiveByVersion: byVersion,
    };
  }
}

/** Postgres store (table from migration 004). */
export class PostgresUsageStatsStore implements UsageStatsStore {
  constructor(private readonly pool: Pool) {}

  async record(
    day: string,
    key: string,
    event: UsageEvent,
    version: string,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO usage_pings (day, usage_key, event, version)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (day, usage_key, event) DO NOTHING`,
      [day, key, event, version],
    );
  }

  async summary(asOf: string): Promise<UsageSummary> {
    const { rows } = await this.pool.query<{
      installs7: string;
      installs28: string;
      installs_total: string;
      uninstalls7: string;
      uninstalls28: string;
      uninstalls_total: string;
      dau: string;
      wau: string;
      mau: string;
    }>(
      `SELECT
         count(*) FILTER (WHERE event = 'install'   AND day > $1::date - 7)  AS installs7,
         count(*) FILTER (WHERE event = 'install'   AND day > $1::date - 28) AS installs28,
         count(*) FILTER (WHERE event = 'install')                           AS installs_total,
         count(*) FILTER (WHERE event = 'uninstall' AND day > $1::date - 7)  AS uninstalls7,
         count(*) FILTER (WHERE event = 'uninstall' AND day > $1::date - 28) AS uninstalls28,
         count(*) FILTER (WHERE event = 'uninstall')                         AS uninstalls_total,
         count(DISTINCT usage_key) FILTER (WHERE event = 'active' AND day = $1::date)      AS dau,
         count(DISTINCT usage_key) FILTER (WHERE event = 'active' AND day > $1::date - 7)  AS wau,
         count(DISTINCT usage_key) FILTER (WHERE event = 'active' AND day > $1::date - 28) AS mau
       FROM usage_pings
       WHERE day <= $1::date`,
      [asOf],
    );
    const versions = await this.pool.query<{ version: string; n: string }>(
      `SELECT version, count(*) AS n FROM (
         SELECT DISTINCT ON (usage_key) usage_key, version
         FROM usage_pings
         WHERE event = 'active' AND day <= $1::date AND day > $1::date - 7
         ORDER BY usage_key, day DESC
       ) latest
       GROUP BY version`,
      [asOf],
    );
    const r = rows[0];
    const n = (v: string | undefined) => Number(v ?? 0);
    return {
      asOf,
      installs: {
        last7: n(r?.installs7),
        last28: n(r?.installs28),
        total: n(r?.installs_total),
      },
      uninstalls: {
        last7: n(r?.uninstalls7),
        last28: n(r?.uninstalls28),
        total: n(r?.uninstalls_total),
      },
      dailyActive: n(r?.dau),
      weeklyActive: n(r?.wau),
      monthlyActive: n(r?.mau),
      weeklyActiveByVersion: Object.fromEntries(
        versions.rows.map((v) => [v.version, Number(v.n)]),
      ),
    };
  }
}
