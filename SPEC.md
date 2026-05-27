# Project Specification: AI Video Clipper

**Radno ime:** clipper-app  
**Tip:** SaaS aplikacija — AI-powered video clipping za content creators  
**Cilj:** €1000/MRR do kraja mjeseca 2  
**Timeline:** 30 dana razvoja, launch krajem mjeseca 1  
**Stack:** Next.js 14, Supabase, Claude API, Groq Whisper, Modal, Vercel, Creem

---

## TABLE OF CONTENTS

1. [Part 1: Product Specification](#part-1-product-specification)
2. [Part 2: Tehnička arhitektura](#part-2-tehnička-arhitektura)
3. [Part 3: Database shema](#part-3-database-shema)
4. [Part 4: AI strategija](#part-4-ai-strategija)
5. [Part 5: 30-dnevni timeline + Hermes plan](#part-5-30-dnevni-timeline--hermes-plan)

---

# Part 1: Product Specification

## 1.1 Šta tačno aplikacija radi

**Jedna rečenica:** Korisnik uploaduje dugi video → AI nalazi 10 najviralnijih momenata → automatski ih klipuje, formatira za TikTok/Reels/Shorts (9:16), dodaje stilizovane titlove → korisnik objavljuje ili schedule-uje na više platformi odjednom.

## 1.2 Za koga je

**Persona A: Solo kreator/podcaster**  
30-45 godina, ima podcast ili YouTube kanal, snima 1-3 sata sadržaja sedmično, hoće da klipuje za TikTok/Reels/Shorts ali nema vremena.

**Persona B: Clipper (najvažnija publika)**  
18-30 godina, monetizuje tuđi sadržaj (MrBeast, Joe Rogan, Lex Fridman) preko Whop-a i drugih clipper platformi. Treba mu brzina i kvantitet.

**Persona C: Mala agencija**  
Vodi 5-10 klijentskih naloga na društvenim mrežama. Treba team funkcije, brand templates, scheduling.

## 1.3 MVP funkcionalnosti (30 dana)

**Mora da bude u MVP-u:**

1. **Auth** — registracija/login preko email + Google (Supabase Auth)
2. **Upload video** — drag & drop, podržava MP4/MOV/WEBM do 2GB, do 3 sata
3. **AI klipovanje** — Groq Whisper transkripcija → Claude analiza → izbor viralnih momenata
4. **Konfigurabilan broj klipova** — slider 5-15 klipova
5. **Auto reframe na 9:16** — FFmpeg crop sa face detection
6. **Auto-captions sa stilom** — burned-in titlovi, 4 preset stila
7. **Preview & download** — korisnik vidi sve klipove, može download MP4
8. **Pricing & paywall** — Free (5 klipova/mj), Creator €12/mj, Pro €29/mj
9. **Plaćanje preko Creem** — pretplata, billing portal, cancel anytime
10. **Dashboard** — istorija svih videa i klipova, usage tracker, account settings

**NE ulazi u MVP (Phase 2, mjesec 2+):**

- ❌ Auto-posting na društvene mreže
- ❌ Scheduling
- ❌ Team accounts/multi-seat
- ❌ Brand kit / custom fonts
- ❌ API access / MCP server
- ❌ Manual editor (timeline editing)
- ❌ B-roll/stock footage
- ❌ Translation
- ❌ Mobile app

## 1.4 Korisnikov tok

```
1. Landing page → Sign Up (email ili Google)
2. Onboarding → Izaberi tip sadržaja (podcast / interview / talk / tutorial / vlog)
3. Dashboard → Klik "Upload Video"
4. Upload → Progress bar dok se uploaduje na Supabase storage
5. Configuration → Izaberi broj klipova (5-15), tip sadržaja, caption style
6. Processing screen → "Transkribujemo audio..." → "Tražimo viralne momente..." → "Generišemo klipove..."
7. Results screen → Grid od N klipova, svaki sa:
   - Preview video player
   - "Viral score" 0-100
   - Naslov i opis klipa
   - Dugme: Download / Edit captions / Change reframe
8. Download → MP4 fajl sa burned-in captionima
```

## 1.5 Hibridni pricing model

### Cijena u kreditima po dužini videa

| Dužina videa | Cost u kreditima |
|---|---|
| 1-30 min | 1 credit |
| 31-90 min | 2 credita |
| 91-180 min | 4 credita |

### Planovi

| Funkcija | Free | Creator (€12) | Pro (€29) |
|---|---|---|---|
| Krediti mjesečno | 5 | 50 | 200 |
| Max dužina videa | 30 min | 90 min | 3 sata |
| Max klipova po videu | 5 | 15 | 15 |
| Watermark | Da | Ne | Ne |
| Caption stilovi | 1 | 4 | 4 |
| Viral score | Ne | Da | Da |
| Priority processing | Ne | Ne | Da |
| Storage retention | 7 dana | 30 dana | 90 dana |

## 1.6 Diferencijacija od konkurencije

1. **Plaćaš po videu, ne po minutu** — 1 video = 1 credit (max 4), bilo da traje 5 min ili 3 sata
2. **Klipovi nikad ne nestaju u toku retention perioda** — Opus Clip ima 3-dnevni rok na free planu
3. **Bez naplata nakon otkazivanja** — jednoklik cancel, transparentno
4. **Editor uključen na svim plaćenim planovima** — Opus Clip drži editor iza $29 plana
5. **Powered by Claude** — bolji u razumijevanju konteksta, humora, sarkazma
6. **Konfigurabilan broj klipova** — biraš 5-15, plaćaš isto

## 1.7 Success kriterijumi

**Tehnički (Dan 30):**
- Korisnik može da uploaduje video i dobije klipove za max 5 minuta
- 95% uploaded videa završi processing uspješno
- Captioni imaju manje od 5% grešaka u transkripciji
- Aplikacija ne padne pod 50 paralelnih uploada

**Business (Dan 60):**
- 200+ registrovanih korisnika
- 50+ plaćenih korisnika
- €1000+ MRR
- 5% conversion rate (free → paid)

---

# Part 2: Tehnička arhitektura

## 2.1 High-level pregled

```
Korisnik → Next.js frontend (Vercel)
   ↓ uploaduje video
Vercel Edge → Supabase Storage
   ↓ trigger
Inngest queue (background jobs)
   ↓ pokreće pipeline
   ├─→ 1. Groq Whisper API → transkripcija
   ├─→ 2. Claude Haiku API → analiza, izbor momenata
   ├─→ 3. Modal/FFmpeg → klipovanje + reframe + captions
   └─→ 4. Save rezultata → Supabase Postgres
Korisnik vidi notifikaciju → Dashboard prikazuje klipove
```

## 2.2 Tech stack

### Frontend
- Next.js 14 (App Router)
- Tailwind CSS + shadcn/ui
- TanStack Query (React Query)
- Zustand (state management)
- video.js ili plyr (video player)

### Backend
- Next.js API routes (na Vercel-u)
- Supabase JS client
- Inngest (background jobs i queue)

### Baza podataka i storage
- Supabase Postgres
- Supabase Storage
- Row Level Security (RLS)

### AI i procesiranje
- Groq API — Whisper Large V3 Turbo ($0.0006/min)
- Anthropic Claude API — Haiku 4.5 za analizu
- Modal.com — serverless FFmpeg processing
- MediaPipe — face detection za smart reframe

### Plaćanja
- Creem (primarni) — 0% provizija do €1K
- Paddle (backup) — 5% + $0.50

### Email i notifikacije
- Resend — transactional email
- React Email za template-e

### Hosting
- Vercel — frontend + API routes
- Modal — heavy video processing
- Supabase Cloud — DB i storage

### Monitoring
- PostHog — product analytics
- Sentry — error tracking
- Plausible — web analytics

## 2.3 Zašto Inngest

Video processing traje 3-5 minuta. Vercel serverless funkcije imaju 10-60 sec timeout. Inngest rješava ovo:

- Korisnik klikne "Start processing"
- Vercel funkcija stavi job u Inngest queue, vrati odmah
- Inngest u pozadini izvršava svaki korak
- Ako neki korak padne, automatski retry
- Korisnik vidi progress preko Supabase Realtime
- Kad završi, email + notifikacija

Besplatan tier: 50,000 step-runs mjesečno.

## 2.4 Zašto Modal

Vercel funkcije:
- 60 sec timeout max
- 4.5GB RAM max
- Bez GPU
- 50MB code size limit (FFmpeg binary je 50MB+)

Modal.com:
- Do 24 sata timeout
- Do 64GB RAM
- GPU opcija
- Bez code size limita
- Pay-per-second compute

## 2.5 Struktura projekta

```
clipper-app/
├── apps/
│   └── web/                          # Next.js aplikacija
│       ├── app/
│       │   ├── (auth)/
│       │   │   ├── login/page.tsx
│       │   │   └── signup/page.tsx
│       │   ├── (dashboard)/
│       │   │   ├── dashboard/page.tsx
│       │   │   ├── upload/page.tsx
│       │   │   ├── videos/[id]/page.tsx
│       │   │   ├── billing/page.tsx
│       │   │   └── settings/page.tsx
│       │   ├── (marketing)/
│       │   │   ├── page.tsx          # Landing
│       │   │   ├── pricing/page.tsx
│       │   │   └── blog/[slug]/page.tsx
│       │   ├── api/
│       │   │   ├── inngest/route.ts
│       │   │   ├── webhook/
│       │   │   │   ├── creem/route.ts
│       │   │   │   └── modal/route.ts
│       │   │   └── upload/route.ts
│       │   └── layout.tsx
│       ├── components/
│       │   ├── ui/                   # shadcn/ui
│       │   ├── video-uploader.tsx
│       │   ├── clip-preview.tsx
│       │   └── credit-calculator.tsx
│       ├── lib/
│       │   ├── supabase/
│       │   ├── groq.ts
│       │   ├── claude.ts
│       │   ├── modal.ts
│       │   ├── creem.ts
│       │   └── utils.ts
│       └── inngest/
│           ├── client.ts
│           └── functions/
│               ├── process-video.ts
│               ├── transcribe.ts
│               ├── analyze.ts
│               └── generate-clips.ts
│
├── modal/                            # Modal Python kod
│   ├── ffmpeg_worker.py
│   ├── face_detect.py
│   └── caption_render.py
│
├── CLAUDE.md                         # Instrukcije za Claude Code
├── package.json
├── tsconfig.json
└── .env.example
```

## 2.6 Procjena operativnih troškova

Za 100 aktivnih plaćenih korisnika:

| Servis | Trošak |
|---|---|
| Vercel Pro | $20 |
| Supabase Pro | $25 |
| Modal compute | ~$30 |
| Groq Whisper | ~$10 |
| Claude API | ~$15 |
| Inngest | $0 (free tier) |
| Resend email | $0-20 |
| Domain (.com) | $1 |
| Sentry, PostHog | $0 (free tier) |
| **UKUPNO** | **~$120/mj** |

Sa €1000 prihoda i ~$120 troškova = **~€880 profita (88% marža)**

## 2.7 Sigurnost

- **API ključevi** — nikad u client-side kodu, samo server environment variables
- **Row Level Security (RLS)** — svaki red u tabeli ima user_id, RLS osigurava izolaciju
- **Upload validacija** — mime type, max veličina, max trajanje
- **Rate limiting** — Vercel Edge middleware ograničava broj zahtjeva
- **Webhook signature verification** — Creem webhook MORA imati provjeru potpisa

---

# Part 3: Database shema

## 3.1 Tabele pregled

```
users (managed by Supabase Auth)
  ↓
profiles (1:1 sa users)
  ↓
videos (1:many)
  ↓
clips (1:many)

subscriptions (1:1 sa users) ← Creem sync
usage_logs (1:many)
caption_styles (preset stilovi)
```

## 3.2 Tabela: profiles

```sql
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
```

## 3.3 Tabela: videos

```sql
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
```

## 3.4 Tabela: clips

```sql
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
```

## 3.5 Tabela: subscriptions

```sql
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
```

## 3.6 Tabela: usage_logs

```sql
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
```

## 3.7 Tabela: caption_styles

```sql
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

insert into caption_styles (id, name, animation_type, is_free) values
  ('tiktok_highlight', 'TikTok Word Highlight', 'word_highlight', true),
  ('karaoke', 'Karaoke Style', 'karaoke', false),
  ('classic', 'Classic Centered', 'none', false),
  ('minimal', 'Minimal Bottom', 'none', false);
```

## 3.8 Row Level Security politike

```sql
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
```

## 3.9 Database funkcije

```sql
-- Provjeri da li korisnik može da uploaduje video
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
```

---

# Part 4: AI strategija

## 4.1 Pipeline overview

```
1. TRANSKRIPCIJA      → Groq Whisper Large V3 Turbo
2. VIRALNA ANALIZA    → Claude Haiku 4.5
3. CAPTION GENERATION → Word timestamps → stilizovani captioni
```

## 4.2 Korak 1: Transkripcija (Groq)

### Zašto Groq
- Cijena: $0.0006/min (10x jeftinije od OpenAI)
- Brzina: Groq LPU = 5-10x brže
- Word-level timestamps (kritično za captione)

### Implementacija

```typescript
// lib/groq.ts
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function transcribeVideo(audioBlob: Blob, language?: string) {
  const transcription = await groq.audio.transcriptions.create({
    file: audioBlob,
    model: "whisper-large-v3-turbo",
    response_format: "verbose_json",
    timestamp_granularities: ["word", "segment"],
    language: language || "en",
    temperature: 0,
  });

  return {
    text: transcription.text,
    duration: transcription.duration,
    segments: transcription.segments,
    words: transcription.words,
  };
}
```

### Edge cases
- Video bez audio tracka → odbijemo na uploadu
- Audio na nepoznatom jeziku → Whisper detektuje auto
- Loš kvalitet audija → još radi, ali viral score će biti niži
- Više govornika → Whisper Large V3 ne radi diarization (MVP ne treba)

## 4.3 Korak 2: Viralna analiza (Claude Haiku 4.5)

### Zašto Haiku

| Model | Cijena | Trošak po 60-min videu |
|---|---|---|
| Haiku 4.5 | $1/$5 per 1M | $0.027 |
| Sonnet 4.5 | $3/$15 per 1M | $0.081 |
| Opus 4.7 | $15/$75 per 1M | $0.405 |

Haiku je sasvim dovoljan za structured output task.

### System prompt

```typescript
const SYSTEM_PROMPT = `Ti si ekspert za viralni social media sadržaj. Analiziraš transkripte podcasta, intervjua, talk show-ova i drugog dugog video sadržaja, i identifikuješ momente koji imaju najveći potencijal da postanu viralni klipovi za TikTok, Instagram Reels i YouTube Shorts.

# Šta čini klip viralnim

1. EMOCIONALNI VRHUNAC: smijeh, šok, suze, ljutnja
2. KONTROVERZNA ILI HRABRA IZJAVA: nešto što tjera ljude da komentarišu
3. PRIČA SA POENTOM: kratka priča (15-60 sekundi) sa hookom, vrhuncem, poentom
4. KORISNA INFORMACIJA: lifehack, brzi savjet, "did you know"
5. ZAJEDNIČKO ISKUSTVO: "Svako ko..." momenti
6. NEOČEKIVANA POVEZANOST: dvije nepovezane stvari spojene pametno
7. HUMOR: vicevi, sarkazam, ironija, situaciona komedija
8. AUTORITATIVNI STAV: ekspert kaže nešto kontraintuitivno

# Šta NIJE viralno

- Predugačke razrade bez poente
- Tranzicioni dijelovi ("U redu, idemo dalje...")
- Tehnički detalji bez konteksta
- Outro segmenti
- Beznačajni small talk

# Pravila za izbor

- Svaki klip MORA biti samostalan
- Idealna dužina: 15-60 sekundi (najbolje 25-45)
- JASAN POČETAK (hook), JASAN KRAJ
- Izbjegavaj preklapanja (manje od 30 sekundi razmaka)

# Output format

Vratićeš STROGO validan JSON:

{
  "moments": [
    {
      "start_seconds": 145.2,
      "end_seconds": 178.6,
      "title": "The moment when his mom said the funniest thing",
      "description": "A relatable story about parents that hits perfectly.",
      "viral_score": 87,
      "viral_reasoning": "Emotional peak with humor + relatable moment.",
      "suggested_hashtags": ["#mom", "#funny", "#relatable", "#fyp"],
      "category": "humor",
      "transcript_excerpt": "So my mom said..."
    }
  ]
}

Vrati TAČNO {clip_count} momenata, rangiranih od najviralnijih ka manje viralnim.`;
```

### Različiti promptovi po tipu sadržaja

```typescript
const CONTENT_TYPE_OVERRIDES = {
  podcast: `Posebno traži: lične priče gosta, kontroverzne stavove, "hot takes", smiješne anegdote`,
  interview: `Posebno traži: otkrivanje momente, trenutke kad gost otkrije nešto novo, emocionalne reakcije`,
  talk: `Posebno traži: kratke pamtljive izreke, storytelling momente, šokantne statistike, "aha" momente`,
  tutorial: `Posebno traži: jedan koristan savjet po klipu, "mistake to avoid", "did you know"`,
  vlog: `Posebno traži: spontane reakcije, smiješne momente, day-in-life snippets sa hookom`,
};
```

### Implementacija

```typescript
// lib/claude.ts
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function analyzeForViralMoments(
  transcript: string,
  segments: TranscriptSegment[],
  contentType: string,
  clipCount: number = 10
) {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4000,
    system: SYSTEM_PROMPT.replace('{clip_count}', clipCount.toString()),
    messages: [
      {
        role: "user",
        content: buildUserPrompt(transcript, segments, contentType, clipCount),
      },
    ],
  });

  const textBlock = response.content.find(b => b.type === "text");
  if (!textBlock) throw new Error("No text response");
  
  const cleanJson = textBlock.text
    .replace(/^```json\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  
  const parsed = JSON.parse(cleanJson);
  
  if (!parsed.moments || !Array.isArray(parsed.moments)) {
    throw new Error("Invalid response structure");
  }
  
  return parsed.moments;
}
```

### Validacija outputa

```typescript
function validateMoments(moments: any[], videoDuration: number, expectedCount: number) {
  const errors = [];
  
  if (Math.abs(moments.length - expectedCount) > 2) {
    errors.push(`Expected ~${expectedCount} moments, got ${moments.length}`);
  }
  
  for (const m of moments) {
    if (m.start_seconds < 0 || m.end_seconds > videoDuration) {
      errors.push(`Timestamp out of range: ${m.start_seconds}-${m.end_seconds}`);
    }
    if (m.end_seconds - m.start_seconds < 5) {
      errors.push(`Clip too short: ${m.title}`);
    }
    if (m.end_seconds - m.start_seconds > 90) {
      errors.push(`Clip too long: ${m.title}`);
    }
  }
  
  const sorted = [...moments].sort((a, b) => a.start_seconds - b.start_seconds);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start_seconds < sorted[i-1].end_seconds) {
      errors.push(`Overlapping clips`);
    }
  }
  
  return errors;
}
```

## 4.4 Korak 3: Caption generation

### 4 stila

1. **TikTok Highlight (default, free)** — bold, word-by-word highlight u žuto/zeleno
2. **Karaoke (Pro)** — tekst progresivno mijenja boju
3. **Classic (Pro)** — centriran, čist bijeli sa outline-om
4. **Minimal (Pro)** — mali, suptilan na dnu

### Logika

```typescript
function generateCaptions(words: WhisperWord[], style: CaptionStyle) {
  const captions = [];
  let currentGroup: WhisperWord[] = [];
  
  const maxWordsPerGroup = style === 'minimal' ? 7 : 4;
  const maxDurationPerGroup = 2.5;
  
  for (const word of words) {
    currentGroup.push(word);
    
    const groupDuration = 
      currentGroup[currentGroup.length-1].end - currentGroup[0].start;
    
    const shouldBreak = 
      currentGroup.length >= maxWordsPerGroup ||
      groupDuration >= maxDurationPerGroup ||
      word.word.match(/[.!?]$/);
    
    if (shouldBreak) {
      captions.push({
        start: currentGroup[0].start,
        end: currentGroup[currentGroup.length-1].end,
        text: currentGroup.map(w => w.word).join(' '),
        words: currentGroup,
      });
      currentGroup = [];
    }
  }
  
  return captions;
}
```

## 4.5 Trošak po videu

| Dužina | Groq | Claude | Modal | UKUPNO |
|---|---|---|---|---|
| 15 min | $0.009 | $0.008 | $0.05 | ~$0.07 |
| 30 min | $0.018 | $0.012 | $0.08 | ~$0.11 |
| 60 min | $0.036 | $0.027 | $0.15 | ~$0.21 |
| 180 min | $0.108 | $0.08 | $0.40 | ~$0.59 |

Marža: ~88%

## 4.6 Edge cases

- Claude vrati loš JSON → retry 2x sa strožijim promptom, fallback heuristika
- Whisper transkript prazan → provjeri audio track
- Nepodržan jezik → grešku korisniku
- Tihi video → detect po malom broju riječi → grešku

---

# Part 5: 30-dnevni timeline + Hermes plan

## 5.1 High-level

```
SEDMICA 1: Foundation (Dan 1-7)
SEDMICA 2: AI Pipeline (Dan 8-14)
SEDMICA 3: UX + Monetizacija (Dan 15-21)
SEDMICA 4: Launch (Dan 22-30)
```

## 5.2 Sedmica 1: Foundation

### Dan 1: Setup projekta
- Inicijalizacija Next.js 14 + TypeScript
- Setup Tailwind, shadcn/ui
- Setup Git, GitHub, Vercel
- Setup Supabase
- Environment variables
- CLAUDE.md fajl

### Dan 2: Auth + Database
- Supabase Auth (email + Google)
- Sve tabele iz Part 3
- RLS politike
- Auth UI (login, signup, forgot password)
- Protected routes middleware

### Dan 3: Landing page
- Hero, features, pricing, FAQ, CTA
- Pricing stranica
- Privacy policy + ToS

### Dan 4: Upload pipeline
- Upload UI (drag & drop)
- Direct upload u Supabase Storage
- Validacija (mime, size, duration)
- Kreiranje video reda u DB

### Dan 5: Inngest setup
- Instalacija + konfiguracija
- Prva `process-video` funkcija
- Webhook endpoint
- Real-time progress (Supabase Realtime)

### Dan 6: Groq Whisper
- Inngest step: transcribe-audio
- Audio extraction (Modal)
- Groq API integracija
- Čuvanje rezultata u DB

### Dan 7: Polish + testing
- Bug fixes
- Edge cases
- Manual testing sa 5-10 videa
- Mjerenje brzine i troškova

## 5.3 Sedmica 2: AI Pipeline

### Dan 8-9: Claude analiza
- Inngest step: analyze-for-clips
- System prompt
- Različiti promptovi po content type
- JSON parsing + validacija
- Retry logic

### Dan 10: Konfigurabilan broj klipova
- UI slider (5-15)
- Limit po planu
- Credit calculator

### Dan 11-12: Modal + FFmpeg
- Modal Python projekat
- FFmpeg worker funkcije:
  - Audio extraction
  - Clipping na osnovu timestamps
  - Reframe na 9:16
  - Burned-in captions
  - Thumbnail generation

### Dan 13: Face detection
- MediaPipe ili face-api.js
- Smart crop koji prati lice
- Fallback na center crop

### Dan 14: Caption burn-in
- 4 stila implementirana u FFmpeg
- Word-level highlighting
- Animation rendering

## 5.4 Sedmica 3: UX + Monetizacija

### Dan 15-16: Dashboard + video player
- Lista svih videa korisnika
- Video detail stranica
- Grid od N klipova sa preview
- Filter/sort
- Bulk download

### Dan 17: Edit funkcije
- Edit captions
- Change caption style
- Re-process klip

### Dan 18-19: Creem integracija
- Setup, produkti (Free/Creator/Pro)
- Checkout flow
- Webhook handler
- Subscription sync
- Customer portal
- Credit logic

### Dan 20: Email notifikacije
- Resend setup
- Welcome email
- Processing complete email
- Error email
- Low credits email
- React Email template-i

### Dan 21: Settings + Polish
- Account settings
- Cancel subscription flow
- Mobile responsive
- Loading/empty/error states

## 5.5 Sedmica 4: Launch

### Dan 22-24: Hardening
- Performance optimization
- Database indexes
- Caching
- Rate limiting
- Sentry, PostHog
- Load testing

### Dan 25-27: Beta testing
- 10-20 ljudi
- Outreach ka clipper-ima
- Feedback iteration
- Bug fixes

### Dan 28-29: Marketing materijal
- Landing polish + social proof
- 5 SEO blog postova
- Product Hunt priprema
- TikTok/Reels demo videi
- Twitter/X postovi
- Reddit postovi

### Dan 30: Product Hunt launch
- Launch u 00:01 PST
- Aktiviraj beta korisnike
- Multi-channel: Reddit, Twitter, HN
- Email lista

## 5.6 Hermes paralelni plan

### Task 1: Praćenje konkurencije (dnevno 09:00)
- Skeniraj Opus, Vugola, Vizard, Klap pricing
- Detektuj promjene
- Trustpilot, G2, Reddit nove žalbe
- Dnevni Telegram brifing

### Task 2: SEO scanner (sedmično)
- Google trends za ključne riječi
- Nove subreddit postove
- Predloži teme za blog

### Task 3: Twitter/X monitoring (svaka 4h)
- Prati: "Opus Clip alternative", "AI clip tool"
- Filter relevantne postove
- Alert nama

### Task 4: Build in public (svako veče 20:00)
- Skeniraj GitHub commits
- Drafts X/Twitter post o napretku
- Mi pregledamo i objavimo

### Task 5: Customer support (od Dana 25)
- Discord/email monitoring
- Auto-odgovori na FAQ
- Eskalacija složenih pitanja

## 5.7 Podijela rada

**TI radiš:**
- Otvaranje naloga
- Plaćanja servisa
- Visoke-nivoa odluke
- Testiranje kao korisnik
- Beta outreach
- Marketing aktivnosti (Tweet, Reddit)

**CLAUDE CODE radi:**
- Pisanje koda (frontend + backend)
- Database migracije
- Testiranje
- Debugging
- Refactoring
- GitHub commits

**CLAUDE (chat) radi:**
- High-level planiranje
- Pisanje promptova za Claude Code
- Code review
- AI promptovi za proizvod
- SEO blog postovi
- Marketing copy
- Strategy diskusije

**HERMES radi:**
- 5 paralelnih taskova
- Sve rutinsko i automatizovano

## 5.8 Risk register

| Rizik | Verovatnoća | Impact | Mitigacija |
|---|---|---|---|
| Modal processing predug | Srednja | Visok | Optimizacija, GPU |
| Claude loši klipovi | Srednja | Vrlo visok | Iterativno poboljšavanje |
| Niko ne dolazi na launch | Visoka | Vrlo visok | Outreach 2 sedmice unaprijed |
| Creem ne odobri nalog | Niska | Srednja | Backup: Paddle |
| Pravni problemi | Vrlo niska | Visok | Vlastiti brand, bez kopiranja |
| Bug u plaćanju | Niska | Vrlo visok | Webhook verification |
| Loši performansi | Srednja | Visok | Load testing |
| Burnout | Srednja | Visok | Pauze u nedjeljama |

## 5.9 Success kriterijumi

**Dan 30 (tehnički):**
- ✅ Aplikacija na produkciji
- ✅ Plaćanje radi
- ✅ <1% upload failures
- ✅ Processing <5 min za 60-min video
- ✅ Bez kritičnih bugova
- ✅ Mobile responsive

**Dan 60 (biznis):**
- ✅ 200+ registrovanih
- ✅ 50+ plaćenih
- ✅ €1000+ MRR
- ✅ Pozitivan NPS
- ✅ 5+ organskih preporuka

---

## DODATAK: Lista naloga koje treba otvoriti

Prije Dana 1, treba otvoriti naloge na sljedećim servisima:

1. **GitHub** — repository za kod (besplatno)
2. **Vercel** — hosting (besplatno za početak, Pro $20/mj kasnije)
3. **Supabase** — database + auth + storage (besplatno za početak, Pro $25/mj na 100+ korisnika)
4. **Anthropic Console** — Claude API ključ (već imaš)
5. **Groq Cloud** — Whisper API ključ (besplatno, sa kreditima)
6. **Modal.com** — video processing ($30 besplatnih kredita)
7. **Creem** — payment processing (registracija, ToS, banking info)
8. **Resend** — transactional email (besplatno do 3000/mj)
9. **Sentry** — error tracking (besplatno za male projekte)
10. **PostHog** — analytics (besplatno do 1M events/mj)
11. **Domain** — kupiti pred launch (.com ili .ai, ~$10-50/god)

## DODATAK: Environment variables (.env.example)

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# AI APIs
ANTHROPIC_API_KEY=
GROQ_API_KEY=

# Modal
MODAL_TOKEN_ID=
MODAL_TOKEN_SECRET=

# Payments
CREEM_API_KEY=
CREEM_WEBHOOK_SECRET=

# Email
RESEND_API_KEY=

# Monitoring
SENTRY_DSN=
NEXT_PUBLIC_POSTHOG_KEY=

# Inngest
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# App
NEXT_PUBLIC_APP_URL=
```
