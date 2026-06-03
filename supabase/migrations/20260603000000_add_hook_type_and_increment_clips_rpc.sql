ALTER TABLE clips
  ADD COLUMN hook_type text;

CREATE OR REPLACE FUNCTION increment_clips_total(
  p_user_id uuid,
  p_amount  integer
) RETURNS void AS $$
BEGIN
  UPDATE profiles
  SET
    clips_generated_total = COALESCE(clips_generated_total, 0) + p_amount,
    updated_at            = now()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
