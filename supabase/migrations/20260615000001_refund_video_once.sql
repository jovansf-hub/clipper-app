-- =============================================================================
-- refund_video_once — atomic, exactly-once "fail + refund" for a video.
--
-- One transaction: lock the row, flip status -> 'failed', mark credits_refunded,
-- and credit the user. The credits_refunded guard makes a retry (or a concurrent
-- stuck-recovery cron) a no-op, so the refund happens AT MOST ONCE. Used by every
-- refund path (onFailure, extract-audio fail, verify-duration fail, persist
-- all-clips-failed, and the recover-stuck-videos cron) — this is the single
-- source of refund truth, replacing the prior update+refund_credits pairs.
--
-- error_step / error_message use COALESCE so a recovery never overwrites a value
-- a real failing step already set.
--
-- H1 guard is IDENTICAL to deduct_credits/refund_credits (security_hardening_v2):
-- in-function check of auth.jwt()->>'role' = 'service_role', SQLSTATE 42501.
-- =============================================================================

CREATE OR REPLACE FUNCTION refund_video_once(
  p_video_id      uuid,
  p_error_step    text,
  p_error_message text
) RETURNS boolean AS $$
DECLARE
  v_user_id  uuid;
  v_credits  integer;
  v_refunded boolean;
  v_status   text;
BEGIN
  IF (auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'permission denied for function refund_video_once'
      USING ERRCODE = '42501';
  END IF;

  -- Lock the row to serialize concurrent recovery / onFailure callers.
  SELECT user_id, credits_used, credits_refunded, status
    INTO v_user_id, v_credits, v_refunded, v_status
  FROM videos
  WHERE id = p_video_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Exactly-once + never touch an already-terminal or already-refunded video.
  IF v_refunded OR v_status IN ('completed', 'failed') THEN
    RETURN false;
  END IF;

  UPDATE videos
     SET status                  = 'failed',
         error_step              = COALESCE(error_step, p_error_step),
         error_message           = COALESCE(error_message, p_error_message),
         processing_completed_at = now(),
         credits_refunded        = true
   WHERE id = p_video_id;

  IF v_credits > 0 THEN
    UPDATE profiles
       SET credits_remaining = credits_remaining + v_credits,
           updated_at        = now()
     WHERE id = v_user_id;
  END IF;

  RETURN true;  -- true = this call performed the refund
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Privilege hygiene consistent with the other RPCs (defense-in-depth; the
-- in-function guard above is the real protection in Supabase Cloud).
REVOKE EXECUTE ON FUNCTION refund_video_once(uuid, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION refund_video_once(uuid, text, text) TO service_role;
