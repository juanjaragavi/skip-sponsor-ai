-- 004: anonymous usage counts (installs, uninstalls, daily active installs).
--
-- One row per (UTC day, usage key, event). usage_key is an HMAC of the
-- extension's random usage id keyed by INSTALL_TOKEN_SECRET, never the raw id,
-- so a stored row cannot be matched to a browser. No IP address, user agent,
-- URL, video ID or channel ID is stored. Rows older than 365 days are purged
-- by the API (RETENTION.usagePingDays).

CREATE TABLE IF NOT EXISTS usage_pings (
  day        DATE NOT NULL,
  usage_key  TEXT NOT NULL CHECK (char_length(usage_key) BETWEEN 16 AND 128),
  event      TEXT NOT NULL CHECK (event IN ('install', 'update', 'active', 'uninstall')),
  version    TEXT NOT NULL CHECK (char_length(version) BETWEEN 1 AND 32),
  PRIMARY KEY (day, usage_key, event)
);

CREATE INDEX IF NOT EXISTS idx_usage_pings_event_day ON usage_pings (event, day);
