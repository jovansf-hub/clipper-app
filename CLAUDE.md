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

## RESUME POINT
- Days 1-7 complete. Full pipeline: upload → transcribe → analyze → clip → R2 → UI viewer
- Security hardening (Dani 1-6 review): H1-H4 SVI ZATVORENI + TESTIRANI. H1 zatvoreno+dokazano, H2 primijenjeno, H3 implementirano+testirano, H4 dovršeno (3 flow-a testirana POSLIJE DROP policy)
- Day 7b IMPLEMENTIRANO (audio extraction Opus 32k + delete/stuck 15-min fix), clip-worker redeploy fcd39a42 live — ALI čeka ručni end-to-end test (vidi Day 7b blok dole, ⚠️)
- Next steps: potvrditi Day 7b e2e test; pa pre-production checklist ispod (clip-worker P1, krediti/auth M/L, infra, kvalitet izlaza, Upload UX redesign)

### Day 7a complete:
- [x] clip-worker deployed (https://clip-worker.jovansf.workers.dev), 6 secrets
- [x] generate-clips Inngest step: idempotent, partial-results, rebased captions
- [x] clips tabela: 3 klipa verified (hook_type, viral_score, output_path, captions)
- [x] Presigned R2 URLs: thumbnails server-side na load, mp4 lazy na klik
- [x] UI: ClipsGrid + ClipCard (thumbnail, badge, score, preview, download)
- [x] Verified end-to-end: real 73s video → 3 vertical 1080x1920 clips in R2

### Day 7b — Audio extraction + delete/stuck fix (IMPLEMENTIRANO, NIJE END-TO-END TESTIRANO):
- [~] clip-worker `POST /extract-audio`: download source → ffmpeg Opus 16kHz mono 32k (.ogg) → R2 `sources/{userId}/{videoId}.audio.ogg` → vraća {audioKey, audioSizeBytes, durationSeconds}. Reuse zaštita: Bearer (worker.ts), validateVideoUrl, sanitizeId.
- [~] Inngest `extract-audio` step PRIJE transcribe (ostaje status 'transcribing', bez novog statusa/UI stagea). transcribe sada presignuje audioKey (mali audio), ne sirovi source.
- [~] >25MB poslije kompresije → refund_credits + status='failed' (error_message='Audio too long to transcribe') + RETURN (ne throw) — odmah obrisiv, bez retry. Procjena: 30 min ≈ ~7.2 MB na 32k.
- [~] groq.ts guard ostaje kao safety-net (poruka popravljena).
- [~] DELETE: 15-min stuck prag za in-flight statuse (transcribing/analyzing/clipping) — dozvoljava recovery zaglavljenih. Source cleanup preko listR2Objects('sources/{userId}/{videoId}') prefiksa (hvata source + .audio.ogg).
- [x] clip-worker REDEPLOYOVAN: verzija fcd39a42 (Version ID fcd39a42-adc3-4641-a162-e5a714ce3936), live na https://clip-worker.jovansf.workers.dev
- [x] tsc --noEmit čist, npm run build zelen
- ⚠️ NAPOMENA: pun end-to-end test (real video → extract → transcribe → clips) JOŠ NIJE URAĐEN — korisnik testira ručno. NE označavati kao potpuno završeno dok test ne prođe.

### Security hardening complete (Dani 1-6) — H1-H4 SVI DONE + TESTED:
- [x] H1: SECURITY DEFINER RPCs zaštićene in-function service_role guard (5/5 napadački PASS)
- [x] H2: videos UPDATE WITH CHECK primijenjeno (SQL migracija)
- [x] H3: verify-duration Inngest step — Groq real duration, kredit korekcija, 6/6 unit testova
- [x] H4: /api/upload/complete + /api/videos/[id]/retry + process/route.ts → admin client. UPDATE policy DROPPED (migracija 20260604000001). Sva 3 flow-a (upload/process/retry) testirana POSLIJE drop-a — rade.

---

## PRE-PRODUCTION CHECKLIST

### Security — H4 DONE ✅ (sve zatvoreno + testirano)
- [x] Browser test: upload flow — /api/upload/complete verifikuje storage i postavlja status uploading→uploaded
- [x] Browser test: process flow — admin client atomic claim (supabase user client uklonjen iz videos UPDATE)
- [x] Browser test: retry flow — /api/videos/[id]/retry resetuje failed→uploaded server-side
- [x] DROP POLICY "Users can update own videos" ON videos (migracija 20260604000001_drop_videos_update_policy.sql) — sva 3 flow-a verifikovana POSLIJE drop-a

### UX — Upload flow redesign (poslije H4)
- [ ] Upload UX redesign (Opcija A): upload kreće odmah na drop (background) umjesto na klik dugmeta. Trenutno: dugme na uploaderu se zove "Start Processing" ali radi SAMO upload (mislabel), i fajl se ne uploaduje dok se ne klikne → korisnik misli da je uploadovano a nije. Plan: (a) kreiraj video red + počni upload na drop sa default configom, (b) novi server endpoint za config update (auth + ownership + validacija, kao H4 standard) koji se zove na kraju, (c) abandonment cleanup za 'uploaded-ali-nikad-procesiran' redove (troše Supabase storage), (d) preimenuj dugme jasno. Zahtijeva vlastiti test pass + mini security review novog config endpointa.

### Reliability — stuck video recovery
- [ ] Stuck video recovery (POTVRDJEN scenario): video zaglavljen u in-flight statusu (transcribing/analyzing/clipping) kad Inngest job umre/padne. Ne moze delete (409 guard) ni retry (trazi failed). Korisnik u limbu. Rjesenja: (a) Inngest job timeout — ako step ne zavrsi za X min, auto-fail (status='failed' + refund), (b) ILI "stuck detection" — ako processing_started_at stariji od npr. 15min a status jos in-flight, dozvoli delete/retry, (c) ILI force-delete opcija za in-flight (sa upozorenjem). Za MVP minimum (b) ili (c). Trenutni workaround: rucni SQL UPDATE status='failed'. Napomena: delete guard blokira in-flight namjerno (sprječava race sa živim Inngest jobom koji bi pisao u obrisani red / pravio orphan R2 upload) — zato (b)/(c) moraju voditi računa o tom race-u (npr. samo nakon timeout praga).

### Security — clip-worker (P1 = blokira produkciju)
- [ ] P1 PROD-CRITICAL: clip-worker na javnom workers.dev — zatvoriti service bindingom (Next.js Worker ↔ clip-worker, nema javne URL) ILI custom domena + Cloudflare Access. Trenutno: samo Bearer auth + SSRF zaštita.
- [ ] P1 A2: X-Worker-Secret header u Bun serveru (defense-in-depth za misconfiguration slučaj)
- [ ] P1 D1: Streaming download hard byte-limit u Bun.write (Content-Length provjera postoji, ali nema cap na bytes written)
- [ ] P2 S1: FFmpeg stderr leak — truncirati u error poruci klijentu, loguj interno
- [ ] P2 S2: R2 error response body leak — ne vraćati XML klijentu
- [ ] P2 A1: crypto.timingSafeEqual za WORKER_SECRET u worker.ts
- [ ] P2 V3: preset allowlist validacija (ultrafast/superfast/…/veryslow)
- [ ] P2 V4: crf validacija kao integer 0–51
- [ ] P3 DF1: Dockerfile — FROM oven/bun:1.3.14-debian umjesto curl-pipe-bash
- [ ] P3 DF2: Pin base image digest (@sha256:…)
- [ ] P3 DF3: non-root USER u Dockerfile

### Security — krediti/auth (preostalo iz Dani 1-6 review)
- [ ] M1: refund_credits cap na max plan limit (sprječava dupli refund iznad plana)
- [ ] M2: MIME enforce via signed URL Content-Type (ne samo JSON body validacija)
- [ ] L1: auth/callback next param mora počinjati sa / (open redirect hardening)
- [ ] L2: audit log za kredit transakcije u usage_logs (deduct + refund)
- [ ] L3: reset_monthly_credits pozivač — Supabase scheduled job ili Inngest cron
- [ ] L4: clip_count_requested validacija cleanup (redundantna provjera + integer/range)

### Infrastruktura
- [ ] Source video storage: migracija na R2 (Supabase free limit 1GB, large video uploads zahtijevaju R2)
- [ ] Rotirati SVE tajne ključeve prije produkcije — dijeljeni u dev okruženju (Supabase, Groq, Anthropic, R2, Inngest, WORKER_SECRET, Creem)
- [ ] Anthropic spend limit postaviti ($20/mj početni cap)
- [ ] Creem payment integracija (Sedmica 3 po SPEC-u)

### Kvalitet izlaza (po SPEC-u)
- [ ] Portrait video edge case: crop=ih*9/16 daje negativan x za vertikalne izvore — detektovati aspect ratio prije cropa (clip-worker)
- [ ] Day 13: Smart crop / face tracking (trenutno center-crop)
- [ ] Day 14: Burned captions renderovanje (data već sačuvana rebazovano po klipu)

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
