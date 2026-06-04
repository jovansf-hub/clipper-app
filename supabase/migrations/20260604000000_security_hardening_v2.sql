-- =============================================================================
-- Security Hardening v2: in-function service_role guard (H1 fix)
--
-- REVOKE FROM PUBLIC/anon/authenticated is ineffective in Supabase because
-- ALTER DEFAULT PRIVILEGES on the public schema re-grants EXECUTE to anon and
-- authenticated for all functions, and that cannot be overridden by REVOKE in
-- Supabase Cloud. Instead, we guard each function body directly.
--
-- When called via the Next.js admin client (service_role key), PostgREST sets
-- auth.jwt() ->> 'role' = 'service_role'. Browser callers (anon or user JWT)
-- get 'anon' / 'authenticated' and are rejected with SQLSTATE 42501.
-- =============================================================================

CREATE OR REPLACE FUNCTION deduct_credits(
  p_user_id uuid,
  p_credits  integer
) RETURNS void AS $$
BEGIN
  IF (auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'permission denied for function deduct_credits'
      USING ERRCODE = '42501';
  END IF;

  UPDATE profiles
  SET credits_remaining = credits_remaining - p_credits,
      updated_at        = now()
  WHERE id = p_user_id
    AND credits_remaining >= p_credits;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient credits';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


CREATE OR REPLACE FUNCTION refund_credits(
  p_user_id uuid,
  p_credits  integer
) RETURNS void AS $$
BEGIN
  IF (auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'permission denied for function refund_credits'
      USING ERRCODE = '42501';
  END IF;

  UPDATE profiles
  SET credits_remaining = credits_remaining + p_credits,
      updated_at        = now()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


CREATE OR REPLACE FUNCTION can_user_upload(
  p_user_id                uuid,
  p_video_duration_seconds integer
) RETURNS jsonb AS $$
DECLARE
  v_profile        profiles%rowtype;
  v_credits_needed integer;
  v_max_duration   integer;
BEGIN
  IF (auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'permission denied for function can_user_upload'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;

  IF p_video_duration_seconds <= 1800 THEN
    v_credits_needed := 1;
  ELSIF p_video_duration_seconds <= 5400 THEN
    v_credits_needed := 2;
  ELSE
    v_credits_needed := 4;
  END IF;

  v_max_duration := CASE v_profile.plan
    WHEN 'free'    THEN 1800
    WHEN 'creator' THEN 5400
    WHEN 'pro'     THEN 10800
  END;

  IF p_video_duration_seconds > v_max_duration THEN
    RETURN jsonb_build_object(
      'allowed',              false,
      'reason',               'video_too_long',
      'max_duration_seconds', v_max_duration
    );
  END IF;

  IF v_profile.credits_remaining < v_credits_needed THEN
    RETURN jsonb_build_object(
      'allowed',            false,
      'reason',             'insufficient_credits',
      'credits_needed',     v_credits_needed,
      'credits_remaining',  v_profile.credits_remaining
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed',        true,
    'credits_needed', v_credits_needed
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


CREATE OR REPLACE FUNCTION increment_clips_total(
  p_user_id uuid,
  p_amount  integer
) RETURNS void AS $$
BEGIN
  IF (auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'permission denied for function increment_clips_total'
      USING ERRCODE = '42501';
  END IF;

  UPDATE profiles
  SET clips_generated_total = COALESCE(clips_generated_total, 0) + p_amount,
      updated_at            = now()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


CREATE OR REPLACE FUNCTION reset_monthly_credits() RETURNS void AS $$
BEGIN
  IF (auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'permission denied for function reset_monthly_credits'
      USING ERRCODE = '42501';
  END IF;

  UPDATE profiles p
  SET credits_remaining = CASE p.plan
        WHEN 'free'    THEN 5
        WHEN 'creator' THEN 50
        WHEN 'pro'     THEN 200
      END,
      credits_reset_at  = now() + interval '1 month'
  WHERE p.credits_reset_at <= now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
