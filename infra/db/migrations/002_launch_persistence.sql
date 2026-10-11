-- 002: wire the schema to the API's SegmentRepository.
--
-- * Segments are stored as JSONB on the analysis row. The repository reads and
--   writes a whole VideoAnalysis at once, so one row per video keeps puts
--   atomic and a cache hit to a single-row primary-key read. The relational
--   sponsor_segments table from 001 is left in place but is not written:
--   manual corrections may overlap model segments, which its exclusion
--   constraint rejects.
-- * Unanalyzable videos have no known duration (0), so relax the duration check.
-- * Telemetry accepts every event the API validator accepts (adds skip_bounced)
--   and is indexed by time for the 30-day retention purge.

ALTER TABLE video_analyses
  ADD COLUMN IF NOT EXISTS segments JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE video_analyses DROP CONSTRAINT IF EXISTS video_analyses_duration_sec_check;
ALTER TABLE video_analyses
  ADD CONSTRAINT video_analyses_duration_sec_check CHECK (duration_sec >= 0);

ALTER TABLE telemetry_events DROP CONSTRAINT IF EXISTS telemetry_events_event_type_check;
ALTER TABLE telemetry_events
  ADD CONSTRAINT telemetry_events_event_type_check CHECK (event_type IN (
    'skip_executed','skip_undone','skip_bounced','fallback_used','llm_error','no_captions'
  ));
CREATE INDEX IF NOT EXISTS idx_telemetry_created ON telemetry_events (created_at);
