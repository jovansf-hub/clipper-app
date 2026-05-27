-- =============================================================================
-- 1. PROFILES TABLE + TRIGGER
-- =============================================================================

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  avatar_url text,

  plan text not null default 'free' check (plan in ('free', 'creator', 'pro')),
  credits_remaining integer not null default 5,
  credits_reset_at timestamptz not null default (now() + interval '1 month'),

  default_caption_style text default 'tiktok_highlight',
  default_content_type text default 'podcast' check (default_content_type in ('podcast', 'interview', 'talk', 'tutorial', 'vlog')),

  videos_processed_total integer not null default 0,
  clips_generated_total integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function handle_new_user() returns trigger as $$
begin
  insert into profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- =============================================================================
-- 2. VIDEOS TABLE + INDEKSI
-- =============================================================================

create table videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,

  title text not null,
  original_filename text not null,
  file_path text not null,
  file_size_bytes bigint not null,
  duration_seconds integer not null,
  mime_type text not null,

  status text not null default 'uploading' check (status in (
    'uploading', 'uploaded', 'transcribing', 'analyzing', 'clipping', 'completed', 'failed'
  )),

  error_message text,
  error_step text,

  transcript_text text,
  transcript_segments jsonb,
  viral_analysis jsonb,

  credits_used integer not null default 1,
  cost_breakdown jsonb,

  content_type text default 'podcast',
  language text default 'en',
  clip_count_requested integer default 10,

  created_at timestamptz not null default now(),
  processing_started_at timestamptz,
  processing_completed_at timestamptz,
  expires_at timestamptz
);

create index videos_user_id_idx on videos(user_id);
create index videos_status_idx on videos(status);
create index videos_expires_at_idx on videos(expires_at);

-- =============================================================================
-- 3. CLIPS TABLE + INDEKSI
-- =============================================================================

create table clips (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references videos(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,

  start_time_seconds numeric(10,3) not null,
  end_time_seconds numeric(10,3) not null,
  duration_seconds numeric(10,3) not null,

  title text not null,
  description text,
  suggested_hashtags text[],

  captions jsonb not null,
  caption_style text not null default 'tiktok_highlight',

  viral_score integer check (viral_score between 0 and 100),
  viral_reasoning text,

  output_path text,
  output_url text,
  thumbnail_path text,
  thumbnail_url text,
  file_size_bytes bigint,

  aspect_ratio text not null default '9:16',
  face_detection_data jsonb,

  downloaded boolean not null default false,
  downloaded_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clips_video_id_idx on clips(video_id);
create index clips_user_id_idx on clips(user_id);
create index clips_viral_score_idx on clips(viral_score desc);

-- =============================================================================
-- 4. SUBSCRIPTIONS TABLE + INDEKSI
-- =============================================================================

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references profiles(id) on delete cascade,

  creem_customer_id text unique,
  creem_subscription_id text unique,
  creem_product_id text,

  plan text not null check (plan in ('free', 'creator', 'pro')),
  status text not null check (status in (
    'active', 'trialing', 'past_due', 'canceled', 'unpaid', 'paused'
  )),

  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,

  price_eur_per_month numeric(10,2),
  currency text default 'EUR',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_creem_subscription_id_idx on subscriptions(creem_subscription_id);
create index subscriptions_status_idx on subscriptions(status);

-- =============================================================================
-- 5. USAGE_LOGS TABLE + INDEKSI
-- =============================================================================

create table usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  video_id uuid references videos(id) on delete set null,

  operation text not null check (operation in (
    'video_upload', 'transcription', 'ai_analysis', 'clip_generation', 'clip_download'
  )),

  credits_charged integer not null default 0,
  duration_seconds_processed integer,

  cost_usd numeric(10,6),
  cost_breakdown jsonb,

  service_provider text,
  service_model text,

  created_at timestamptz not null default now()
);

create index usage_logs_user_id_idx on usage_logs(user_id);
create index usage_logs_created_at_idx on usage_logs(created_at desc);
create index usage_logs_operation_idx on usage_logs(operation);

-- =============================================================================
-- 6. CAPTION_STYLES TABLE
-- =============================================================================

create table caption_styles (
  id text primary key,
  name text not null,
  description text,

  font_family text not null default 'Inter',
  font_size integer not null default 48,
  font_weight integer not null default 800,

  text_color text not null default '#FFFFFF',
  highlight_color text default '#FFFF00',
  background_color text,
  stroke_color text,
  stroke_width integer default 2,

  animation_type text check (animation_type in ('none', 'word_highlight', 'word_pop', 'karaoke')),

  position text default 'bottom_center',
  margin_bottom_percent integer default 15,

  is_free boolean not null default false,

  created_at timestamptz not null default now()
);

-- =============================================================================
-- 7. SEED DATA: CAPTION STYLES
-- =============================================================================

insert into caption_styles (id, name, animation_type, is_free) values
  ('tiktok_highlight', 'TikTok Word Highlight', 'word_highlight', true),
  ('karaoke', 'Karaoke Style', 'karaoke', false),
  ('classic', 'Classic Centered', 'none', false),
  ('minimal', 'Minimal Bottom', 'none', false);

-- =============================================================================
-- 8. ROW LEVEL SECURITY POLITIKE
-- =============================================================================

-- Profiles
alter table profiles enable row level security;

create policy "Users can view own profile" on profiles
  for select using (auth.uid() = id);

create policy "Users can update own profile" on profiles
  for update using (auth.uid() = id);

-- Videos
alter table videos enable row level security;

create policy "Users can view own videos" on videos
  for select using (auth.uid() = user_id);

create policy "Users can insert own videos" on videos
  for insert with check (auth.uid() = user_id);

create policy "Users can update own videos" on videos
  for update using (auth.uid() = user_id);

create policy "Users can delete own videos" on videos
  for delete using (auth.uid() = user_id);

-- Clips
alter table clips enable row level security;

create policy "Users can view own clips" on clips
  for select using (auth.uid() = user_id);

create policy "Service role can do anything on clips" on clips
  for all using (auth.jwt()->>'role' = 'service_role');

-- Subscriptions
alter table subscriptions enable row level security;

create policy "Users can view own subscription" on subscriptions
  for select using (auth.uid() = user_id);

-- Usage logs
alter table usage_logs enable row level security;

create policy "Users can view own usage" on usage_logs
  for select using (auth.uid() = user_id);

-- Caption styles
alter table caption_styles enable row level security;

create policy "Anyone can view caption styles" on caption_styles
  for select using (true);

-- =============================================================================
-- 9. DATABASE FUNKCIJE
-- =============================================================================

-- Provjeri da li korisnik moze da uploaduje video
create or replace function can_user_upload(
  p_user_id uuid,
  p_video_duration_seconds integer
) returns jsonb as $$
declare
  v_profile profiles%rowtype;
  v_credits_needed integer;
  v_max_duration integer;
begin
  select * into v_profile from profiles where id = p_user_id;

  if p_video_duration_seconds <= 1800 then
    v_credits_needed := 1;
  elsif p_video_duration_seconds <= 5400 then
    v_credits_needed := 2;
  else
    v_credits_needed := 4;
  end if;

  v_max_duration := case v_profile.plan
    when 'free' then 1800
    when 'creator' then 5400
    when 'pro' then 10800
  end;

  if p_video_duration_seconds > v_max_duration then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'video_too_long',
      'max_duration_seconds', v_max_duration
    );
  end if;

  if v_profile.credits_remaining < v_credits_needed then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'insufficient_credits',
      'credits_needed', v_credits_needed,
      'credits_remaining', v_profile.credits_remaining
    );
  end if;

  return jsonb_build_object(
    'allowed', true,
    'credits_needed', v_credits_needed
  );
end;
$$ language plpgsql security definer;

-- Oduzmi kredite
create or replace function deduct_credits(
  p_user_id uuid,
  p_credits integer
) returns void as $$
begin
  update profiles
  set credits_remaining = credits_remaining - p_credits,
      updated_at = now()
  where id = p_user_id and credits_remaining >= p_credits;

  if not found then
    raise exception 'Insufficient credits';
  end if;
end;
$$ language plpgsql security definer;

-- Reset credita
create or replace function reset_monthly_credits() returns void as $$
begin
  update profiles p
  set credits_remaining = case p.plan
    when 'free' then 5
    when 'creator' then 50
    when 'pro' then 200
  end,
  credits_reset_at = now() + interval '1 month'
  where p.credits_reset_at <= now();
end;
$$ language plpgsql security definer;
