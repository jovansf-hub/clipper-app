import "server-only";
import type { createAdminClient } from "@/lib/supabase/server";
import { listR2Objects, deleteR2Object } from "@/lib/r2";

type AdminClient = ReturnType<typeof createAdminClient>;

// In-flight statuses: a live Inngest job may still be writing to this video
// (DB row, R2 uploads). Deleting now would race it / orphan freshly-written
// objects — UNLESS the job looks dead (see STUCK_THRESHOLD_MS).
const IN_FLIGHT = new Set(["transcribing", "analyzing", "clipping"]);

// If a video has sat in an in-flight status this long, the Inngest job almost
// certainly died (no timeout/refund fired). Past this threshold we allow delete
// so the user isn't stranded; the live-job race window is gone by 15 min.
const STUCK_THRESHOLD_MS = 15 * 60 * 1000;

export interface DeletableVideo {
  id: string;
  file_path: string;
  status: string;
  processing_started_at: string | null;
}

export type DeleteVideoResult =
  | { result: "deleted" }
  | { result: "skipped_in_flight" }
  | { result: "failed"; reason: string };

/**
 * Single source of truth for fully deleting a video: refund (stuck in-flight
 * only) → R2 clips/thumbnails/markers → R2 source+audio → DB row (clips cascade).
 * The DB row is removed ONLY after all external storage is gone, so a partial
 * failure leaves the row for an idempotent retry. Caller must have already
 * confirmed `video` belongs to `userId`.
 */
export async function deleteVideoFully(
  admin: AdminClient,
  userId: string,
  video: DeletableVideo
): Promise<DeleteVideoResult> {
  // Status guard — refuse while a live job could be writing, unless stuck.
  let isStuckInFlight = false;
  if (IN_FLIGHT.has(video.status)) {
    const startedAt = video.processing_started_at
      ? new Date(video.processing_started_at).getTime()
      : null;
    const isStuck =
      startedAt !== null && Date.now() - startedAt > STUCK_THRESHOLD_MS;
    if (!isStuck) {
      return { result: "skipped_in_flight" };
    }
    isStuckInFlight = true;
  }

  // Stuck in-flight: the dead job never refunded the credit, and deleting the
  // row would stop the stuck-recovery cron from ever doing so. Refund BEFORE
  // deleting (refund reads credits_used from the row). Exactly-once via
  // credits_refunded, so it's a safe no-op if the cron already ran.
  if (isStuckInFlight) {
    const { error: refundErr } = await admin.rpc("refund_video_once", {
      p_video_id: video.id,
      p_error_step: "delete",
      p_error_message: "Deleted while stuck in-flight",
    });
    if (refundErr) {
      return { result: "failed", reason: "refund failed" };
    }
  }

  // 1. R2 clips + thumbnails + status markers under clips/{userId}/{videoId}/
  try {
    const prefix = `clips/${userId}/${video.id}/`;
    const keys = await listR2Objects(prefix);
    let failedCount = 0;
    for (const key of keys) {
      try {
        await deleteR2Object(key);
      } catch {
        // Logged internally in lib/r2.ts; never leak R2 XML to the caller.
        failedCount += 1;
      }
    }
    if (failedCount > 0) {
      return { result: "failed", reason: "clip storage" };
    }
  } catch {
    return { result: "failed", reason: "clip storage" };
  }

  // 2. R2 source + extracted audio under sources/{userId}/{videoId} — covers the
  //    raw source (…/{videoId}.{ext}) and audio (…/{videoId}.audio.ogg).
  try {
    const sourcePrefix = `sources/${userId}/${video.id}`;
    const sourceKeys = await listR2Objects(sourcePrefix);
    // Prefix matches by string, not path boundary. Guard against a sibling id
    // that shares this id as a prefix: only the exact source or its ".x" companion.
    const ownKeys = sourceKeys.filter(
      (k) => k === video.file_path || k.startsWith(`${sourcePrefix}.`)
    );
    let failedCount = 0;
    for (const key of ownKeys) {
      try {
        await deleteR2Object(key);
      } catch {
        failedCount += 1;
      }
    }
    if (failedCount > 0) {
      return { result: "failed", reason: "source storage" };
    }
  } catch {
    return { result: "failed", reason: "source storage" };
  }

  // 3. DB row — only now that all external storage is gone. clips rows cascade
  //    via clips.video_id ON DELETE CASCADE.
  const { error: deleteError } = await admin
    .from("videos")
    .delete()
    .eq("id", video.id)
    .eq("user_id", userId);

  if (deleteError) {
    return { result: "failed", reason: "db row" };
  }

  return { result: "deleted" };
}
