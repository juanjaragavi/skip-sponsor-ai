CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS video_analyses (
  video_id      TEXT PRIMARY KEY CHECK (char_length(video_id) = 11),
  channel_id    TEXT,
  duration_sec  REAL NOT NULL CHECK (duration_sec > 0),
  language      TEXT NOT NULL DEFAULT 'en',
  status        TEXT NOT NULL CHECK (status IN ('ready','pending','unanalyzable','degraded')),
  transcript_hash TEXT NOT NULL,
  analyzed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '30 days'
);
CREATE INDEX IF NOT EXISTS idx_video_expires ON video_analyses (expires_at);
CREATE INDEX IF NOT EXISTS idx_video_channel ON video_analyses (channel_id);

CREATE TABLE IF NOT EXISTS sponsor_segments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id    TEXT NOT NULL REFERENCES video_analyses(video_id) ON DELETE CASCADE,
  start_time  DOUBLE PRECISION NOT NULL CHECK (start_time >= 0),
  end_time    DOUBLE PRECISION NOT NULL CHECK (end_time > start_time),
  confidence  REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  category    TEXT NOT NULL CHECK (category IN ('sponsor','intro','outro','selfpromo','interaction_reminder')),
  source      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_duration CHECK (end_time - start_time BETWEEN 5 AND 600),
  EXCLUDE USING gist (video_id WITH =, numrange(start_time, end_time) WITH &&)
);
CREATE INDEX IF NOT EXISTS idx_seg_video ON sponsor_segments (video_id, start_time);

CREATE TABLE IF NOT EXISTS telemetry_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('skip_executed','skip_undone','fallback_used','llm_error','no_captions')),
  latency_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
