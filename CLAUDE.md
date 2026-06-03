# Project: AI Video Clipper (clipper-app)

## Source of Truth
SPEC.md is the canonical specification. Read it before any major task.

## Tech Stack
- Next.js 16+ (App Router) + TypeScript
- Tailwind CSS + shadcn/ui  
- Supabase (Postgres + Auth + Storage)
- Inngest (background jobs)
- Modal.com (FFmpeg processing)
- Groq API (Whisper transcription)
- Anthropic Claude API (viral analysis)
- Creem (payments)
- Resend (transactional email)
- Deployment: Vercel

## Coding Standards
- TypeScript strict mode, no `any` types
- Use 'use client' only when necessary (prefer Server Components)
- All async functions must have proper error handling
- All API routes return NextResponse.json() with proper status codes
- All database queries use Supabase typed client
- All env variables defined in .env.example first
- Never commit secrets to git

## Folder Structure
Follow the structure defined in SPEC.md Part 2.5. Do not create files outside this structure without asking.

## What NOT to Do
- Do NOT use deprecated Next.js patterns (pages router, getServerSideProps)
- Do NOT skip TypeScript types or use `any`
- Do NOT commit .env files
- Do NOT add features that are NOT in SPEC.md MVP scope without asking
- Do NOT use external UI libraries other than shadcn/ui without asking
- Do NOT use cdn imports â€” always use npm packages
- Do NOT proceed if you're uncertain â€” ask the user instead

## Communication Style
- Be concise. Show code, not lengthy explanations unless asked.
- When done with a task, summarize in 2-3 bullet points what was changed.
- Always run `npm run build` after major changes to verify nothing is broken.

## Database
All migrations are in /supabase/migrations/. Never modify the database schema without creating a migration first.

## Testing
For MVP, manual testing is sufficient. Add unit tests only for critical logic (credit calculations, viral analysis JSON parsing).

## Next.js 16 Auth Pattern
- File is proxy.ts (NOT middleware.ts) - Next.js 16 standard
- Use "Thin Proxy" pattern: only check cookie existence in proxy.ts
- Heavy session validation (DB lookups, JWT verification) goes in Server Components
- For Supabase: implement cookie sync properly to avoid logout loop bug
- Reference: https://nextjs.org/docs/app/api-reference/file-conventions/proxy

## Project Goal
Build an AI video clipping SaaS that competes with Opus Clip and Vugola. Target: â‚¬1000 MRR by end of month 2. Strict 30-day MVP timeline.

## Development Progress

### Completed
- [x] Day 1: Project setup (Next.js 16, Tailwind, shadcn/ui, dependencies)
- [x] Day 1: Folder structure per SPEC.md Part 2.5
- [x] Day 1: Environment configuration (.env.local, Zod validation)
- [x] Day 1: Supabase clients (browser, server, admin)
- [x] Day 1: proxy.ts (Next.js 16 standard) with auth middleware
- [x] Day 2: Database migration applied to Supabase (6 tables + RLS + functions)
- [x] Day 2: TypeScript Database types in lib/types.ts
- [x] Day 2: Auth UI (login, signup, forgot-password with email + Google OAuth)
- [x] Day 2: Configure Supabase Dashboard (Site URL, Redirect URLs)
- [x] Day 2: Test full registration flow (signup -> email confirm -> profile created -> login)
- [x] Day 3: Dashboard layout + sidebar + user menu (with logout)
- [x] Day 3: Dashboard home page with stat cards and empty state
- [x] Day 3: Fixed Base UI button warnings (nativeButton={false} for link-buttons)

### Next Steps
- [x] Day 3: Landing page (hero, features, pricing, comparison, FAQ)
- [x] Day 4: Upload pipeline complete (UI, validation, credit calc, backend, storage)
- [x] Day 4: Fixed /videos 404 with proper list page
- [x] Day 5: Inngest setup complete
- [x] Day 5: Groq Whisper transcription working
- [x] Day 5: Real-time status updates via Supabase Realtime
- [x] Day 5: Security review applied (6 fixes)
- [x] Day 6: Claude Haiku viral moment analysis - integration verified
- [x] Day 7: Cloudflare Container + FFmpeg clip pipeline (clip-worker deployed, R2, full UI)

### Tested Manually
- [x] Real upload tested with mp3 file - 1.0MB, 58s, status='uploaded'
- [x] Storage path: videos/{user_id}/{video_id}/{filename}
- [x] Credit deducted from 5 to 4
- [x] Full transcription pipeline tested - 58s mp3 transcribed successfully
- [x] Credit deduction works on process start
- [x] Status updates through pipeline phases
- [x] Claude Haiku isolated test: 74s fake transcript → 5 viral moments, $0.03 cost, JSON valid

## RESUME POINT (Day 7a COMPLETE)
- Days 1-7 complete. Full pipeline: upload → transcribe → analyze → clip → R2 → UI viewer
- Cloudflare Container (clip-worker) + R2 za FFmpeg clipping, deployed production
- Next steps per SPEC: captions rendering (Day 14), smart crop/face tracking (Day 13)

### Day 7a complete:
- [x] clip-worker deployed (https://clip-worker.jovansf.workers.dev), 6 secrets
- [x] generate-clips Inngest step: idempotent, partial-results, rebased captions
- [x] clips tabela: 3 klipa verified (hook_type, viral_score, output_path, captions)
- [x] Presigned R2 URLs: thumbnails server-side na load, mp4 lazy na klik
- [x] UI: ClipsGrid + ClipCard (thumbnail, badge, score, preview, download)
- [x] Verified end-to-end: real 73s video → 3 vertical 1080x1920 clips in R2

### Poznati bug-ovi za fix:
- [ ] Portrait video edge case: crop formula crop=ih*9/16 daje negativan x ako je source vec vertikalan. Detektovati aspect ratio prije cropa.

### Security TODO (P1/P2/P3) za 7a-2:
- [ ] P1 PROD-CRITICAL: clip-worker je na javnom workers.dev (clip-worker.jovansf.workers.dev). Prije produkcije: Worker NE smije biti javno dostupan. Opcije: (a) service binding izmedju Next.js Worker-a i clip-worker (najcistije, nema javne URL), ILI (b) custom domen + Cloudflare Access policy, ILI (c) mTLS. Trenutno stiti samo Bearer auth + SSRF, sto je OK za MVP/testiranje ali NE za produkciju. Obavezno zatvoriti prije launcha.
- [ ] P1 A2: Container auth (defense-in-depth) - Bun server provjeri X-Worker-Secret header koji Worker injektuje. CF arhitektura ga ne izlaze javno, ali treba za slucaj misconfiguration.
- [ ] P1 D1 streaming: Content-Length provjera radi, ali Bun.write jos uvijek streama cijeli fajl bez hard limita na bytes written. Dodati streaming download sa byte counter.
- [ ] P1 PT3 R2 isolation: r2BaseKey dolazi od klijenta (Inngest). Kad se integrira, generisati ga server-side iz userId/videoId (ne primati od klijenta).
- [ ] P2 S1: FFmpeg stderr leak - filtrirati/truncirati stderr u error poruci koja ide klijentu (sadrzi interne putanje). Loguj interno, klijentu vrati samo "Processing failed".
- [ ] P2 S2: R2 error response body leak - ne vracati R2 XML response tijelo klijentu.
- [ ] P2 A1: Timing-safe WORKER_SECRET comparison u worker.ts (crypto.timingSafeEqual).
- [ ] P2 V3: preset allowlist - validirati da je jedna od: ultrafast/superfast/veryfast/faster/fast/medium/slow/slower/veryslow.
- [ ] P2 V4: crf range - validirati kao integer 0-51.
- [ ] P3 DF1: Dockerfile - zamijeniti curl-pipe-bash Bun install sa FROM oven/bun:1.3.14-debian (pinned version, bez shell installer).
- [ ] P3 DF2: Pinirati base image sa digest (@sha256:...) za reproducibilne buildove.
- [ ] P3 DF3: Dodati non-root USER u Dockerfile (RUN useradd -r -u 1001 appuser && USER appuser).

### Key Decisions
- Next.js 16 + React 19 (not 14 as in original SPEC)
- middleware.ts renamed to proxy.ts (Next.js 16 standard)
- Supabase new API keys (publishable + secret, not anon/service_role JWT)
- Hybrid pricing model: 1/2/4 credits per video duration tier

### Important File Locations
- Supabase migration: supabase/migrations/20260527000000_initial_schema.sql
- Auth components: components/auth/login-form.tsx, signup-form.tsx, forgot-password-form.tsx
- Auth pages: app/(auth)/login/page.tsx, signup/page.tsx, forgot-password/page.tsx
- Auth callback: app/auth/callback/route.ts
- Proxy: proxy.ts (with lib/supabase/middleware.ts helper)
