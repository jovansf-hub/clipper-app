-- Refund idempotency: at most one refund per video.
-- A boolean flag set atomically inside refund_video_once (see next migration).
-- Existing 'failed' videos keep default false harmlessly — no refund path acts
-- on terminal videos, so the flag only matters for in-flight rows going forward.
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS credits_refunded boolean NOT NULL DEFAULT false;
