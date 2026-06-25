-- =============================================================================
-- Security fix #1 (P0): profiles UPDATE was unrestricted (USING only, no WITH
-- CHECK, no column guard) — an authenticated user could PATCH their own
-- credits_remaining / plan via PostgREST and bypass billing entirely.
--
-- This replaces the policy with a same-row-only one and adds a BEFORE UPDATE
-- trigger that lets users edit SAFE profile columns (full_name, avatar_url,
-- default_caption_style, default_content_type) but blocks any change to
-- billing/plan/identity columns. Only browser-facing roles (authenticated/anon)
-- are restricted; service_role (admin client + SECURITY DEFINER credit RPCs) and
-- internal/cron contexts (no request JWT) may change anything.
-- =============================================================================

-- 1) Same-row-only UPDATE policy. WITH CHECK stops re-targeting another user's row.
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE
  USING      (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 2) Column guard. Protected columns can only change via service_role / internal.
CREATE OR REPLACE FUNCTION protect_profile_columns() RETURNS trigger AS $$
BEGIN
  -- service_role (admin client + credit RPCs) and internal/cron contexts (no
  -- request JWT → coalesced to 'internal') are unrestricted. authenticated/anon
  -- (browser) fall through to the column guard.
  IF coalesce(auth.jwt() ->> 'role', 'internal') NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF NEW.id                        IS DISTINCT FROM OLD.id
     OR NEW.email                  IS DISTINCT FROM OLD.email
     OR NEW.plan                   IS DISTINCT FROM OLD.plan
     OR NEW.credits_remaining      IS DISTINCT FROM OLD.credits_remaining
     OR NEW.credits_reset_at       IS DISTINCT FROM OLD.credits_reset_at
     OR NEW.videos_processed_total IS DISTINCT FROM OLD.videos_processed_total
     OR NEW.clips_generated_total  IS DISTINCT FROM OLD.clips_generated_total
     OR NEW.created_at             IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Cannot modify protected profile columns'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS protect_profile_columns_trg ON profiles;
CREATE TRIGGER protect_profile_columns_trg
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profile_columns();
