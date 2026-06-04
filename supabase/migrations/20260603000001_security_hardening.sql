-- =============================================================================
-- Security Hardening: H1 + H2
-- =============================================================================

-- H1: REVOKE EXECUTE on SECURITY DEFINER functions.
--
-- PostgreSQL grants EXECUTE TO PUBLIC by default for all functions.
-- Revoking from specific roles (anon, authenticated) is insufficient —
-- the PUBLIC grant still allows access. Must REVOKE FROM PUBLIC, then
-- re-grant explicitly to service_role (the only legitimate caller).
--
REVOKE EXECUTE ON FUNCTION deduct_credits(uuid, integer)        FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION refund_credits(uuid, integer)        FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION can_user_upload(uuid, integer)       FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION increment_clips_total(uuid, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION deduct_credits(uuid, integer)        TO service_role;
GRANT EXECUTE ON FUNCTION refund_credits(uuid, integer)        TO service_role;
GRANT EXECUTE ON FUNCTION can_user_upload(uuid, integer)       TO service_role;
GRANT EXECUTE ON FUNCTION increment_clips_total(uuid, integer) TO service_role;

-- H2: Add WITH CHECK to videos UPDATE policy.
-- Without it, users can write arbitrary values to any column on their own videos
-- (e.g. credits_used = 0 -> free processing bypass).
DROP POLICY "Users can update own videos" ON videos;
CREATE POLICY "Users can update own videos" ON videos
  FOR UPDATE
  USING   (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
