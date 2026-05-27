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

### Next Steps
- [ ] Day 2: Configure Supabase Dashboard (Site URL, Redirect URLs)
- [ ] Day 2: Test full registration flow
- [ ] Day 3: Landing page implementation
- [ ] Day 3: Dashboard layout + sidebar
- [ ] Day 4: Upload UI with drag & drop
- [ ] Day 5-7: Inngest setup + Groq Whisper transcription

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
