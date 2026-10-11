-- 003: cost guard.
--
-- * install_usage_daily: fresh LLM analyses per install per UTC day, for the
--   per-install quota (DAILY_ANALYSES_PER_INSTALL). install_key is an HMAC of
--   the install id keyed by INSTALL_TOKEN_SECRET, never the raw token. Rows
--   older than 2 days are purged by the API.
-- * llm_spend_daily: estimated LLM spend per UTC day (token usage x list
--   price), for the global budget kill switch (LLM_DAILY_BUDGET_USD).
--   Aggregate only, no per-user data.

CREATE TABLE IF NOT EXISTS install_usage_daily (
  day          DATE NOT NULL,
  install_key  TEXT NOT NULL CHECK (char_length(install_key) BETWEEN 16 AND 128),
  analyses     INT  NOT NULL DEFAULT 0 CHECK (analyses >= 0),
  PRIMARY KEY (day, install_key)
);

CREATE TABLE IF NOT EXISTS llm_spend_daily (
  day            DATE PRIMARY KEY,
  usd            NUMERIC(12, 6) NOT NULL DEFAULT 0,
  calls          INT    NOT NULL DEFAULT 0,
  input_tokens   BIGINT NOT NULL DEFAULT 0,
  output_tokens  BIGINT NOT NULL DEFAULT 0
);
