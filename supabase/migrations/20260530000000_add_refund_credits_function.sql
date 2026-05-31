create or replace function refund_credits(
  p_user_id uuid,
  p_credits integer
) returns void as $$
begin
  update profiles
  set credits_remaining = credits_remaining + p_credits,
      updated_at = now()
  where id = p_user_id;
end;
$$ language plpgsql security definer set search_path = public;
