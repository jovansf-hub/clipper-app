import "server-only";
import type { createAdminClient } from "@/lib/supabase/server";

// Supabase admin (service_role) client — bypasses RLS so the count queries see
// all of a user's rows. Caller passes createAdminClient().
type AdminClient = ReturnType<typeof createAdminClient>;

// Statuses that represent an active, resource-consuming pipeline. A video in any
// of these is "in flight" and counts against the concurrency cap.
const IN_FLIGHT_STATUSES = ["uploading", "transcribing", "analyzing", "clipping"] as const;

// Max concurrent in-flight videos per user. Bounds simultaneous expensive jobs.
const IN_FLIGHT_LIMIT_FREE = 3;
const IN_FLIGHT_LIMIT_PAID = 5;

// Max new uploads per rolling hour per user.
const HOURLY_UPLOAD_CAP = 10;

export interface RateLimitResult {
  ok: boolean;
  status?: number;     // HTTP status when blocked (429)
  error?: string;      // user-facing message
  retryAfter?: number; // seconds — value for the Retry-After header
}

const OK: RateLimitResult = { ok: true };

function inFlightLimit(plan: string): number {
  return plan === "free" ? IN_FLIGHT_LIMIT_FREE : IN_FLIGHT_LIMIT_PAID;
}

async function getPlan(admin: AdminClient, userId: string): Promise<string> {
  const { data } = await admin.from("profiles").select("plan").eq("id", userId).single();
  return (data?.plan as string) ?? "free";
}

async function countInFlight(admin: AdminClient, userId: string): Promise<number> {
  const { count } = await admin
    .from("videos")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("status", IN_FLIGHT_STATUSES as unknown as string[]);
  return count ?? 0;
}

// Concurrency cap — shared by /process, /retry, and (as part of checkUploadRate)
// /upload. NOTE: a count-then-act check has a small TOCTOU race under burst
// concurrency; acceptable best-effort for MVP (the credit system is the hard
// economic backstop). Promote to an atomic SQL guard if abuse persists.
export async function checkInFlightCap(
  admin: AdminClient,
  userId: string
): Promise<RateLimitResult> {
  const plan = await getPlan(admin, userId);
  const limit = inFlightLimit(plan);
  const count = await countInFlight(admin, userId);
  if (count >= limit) {
    return {
      ok: false,
      status: 429,
      error: `Too many videos processing at once (max ${limit}). Wait for one to finish.`,
      retryAfter: 60,
    };
  }
  return OK;
}

// Upload guard: in-flight cap first, then the rolling-hour upload count.
export async function checkUploadRate(
  admin: AdminClient,
  userId: string
): Promise<RateLimitResult> {
  const inflight = await checkInFlightCap(admin, userId);
  if (!inflight.ok) return inflight;

  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await admin
    .from("videos")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gt("created_at", since);

  if ((count ?? 0) >= HOURLY_UPLOAD_CAP) {
    return {
      ok: false,
      status: 429,
      error: `Upload limit reached (${HOURLY_UPLOAD_CAP}/hour). Try again later.`,
      retryAfter: 3600,
    };
  }
  return OK;
}
