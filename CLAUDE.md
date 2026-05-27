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

## Project Goal
Build an AI video clipping SaaS that competes with Opus Clip and Vugola. Target: â‚¬1000 MRR by end of month 2. Strict 30-day MVP timeline.
