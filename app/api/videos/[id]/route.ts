import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { listR2Objects, deleteR2Object } from "@/lib/r2";

type Params = Promise<{ id: string }>;

// In-flight statuses: a live Inngest job may still be writing to this video
// (DB row, R2 uploads). Deleting now would race it / orphan freshly-written
// objects. We refuse UNLESS the job looks dead — see STUCK_THRESHOLD_MS below.
const IN_FLIGHT = new Set(["transcribing", "analyzing", "clipping"]);

// Stuck recovery: if a video has sat in an in-flight status this long, the
// Inngest job almost certainly died (no timeout/refund fired). Past this
// threshold we allow delete so the user isn't stranded. The race window with a
// still-live job is gone by 15 min (processing steps are minutes, not hours).
const STUCK_THRESHOLD_MS = 15 * 60 * 1000;

export async function DELETE(
  _request: Request,
  { params }: { params: Params }
) {
  const { id: videoId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Ownership check: scope by user_id so a non-owner gets an indistinguishable 404.
  const { data: video } = await admin
    .from("videos")
    .select("id, file_path, status, processing_started_at")
    .eq("id", videoId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  // Status guard — never delete while a job could be writing, UNLESS the job
  // has been in-flight past STUCK_THRESHOLD_MS (presumed dead → allow recovery).
  if (IN_FLIGHT.has(video.status)) {
    const startedAt = video.processing_started_at
      ? new Date(video.processing_started_at).getTime()
      : null;
    const isStuck =
      startedAt !== null && Date.now() - startedAt > STUCK_THRESHOLD_MS;

    if (!isStuck) {
      return NextResponse.json(
        { error: "Cannot delete while processing" },
        { status: 409 }
      );
    }
  }

  // ── STRICT external cleanup first; DB row deleted ONLY if everything below
  //    succeeds 100%. On any failure → 500, row stays, user can retry. All
  //    deletes are idempotent (re-deleting a missing key is a no-op).

  // 1. R2 clips + thumbnails under clips/{userId}/{videoId}/
  try {
    const prefix = `clips/${user.id}/${videoId}/`;
    const keys = await listR2Objects(prefix);

    let failedCount = 0;
    for (const key of keys) {
      try {
        await deleteR2Object(key);
      } catch {
        // Already logged internally in lib/r2.ts; don't leak R2 XML to client.
        failedCount += 1;
      }
    }

    if (failedCount > 0) {
      return NextResponse.json(
        { error: `Failed to delete ${failedCount} clip file(s). Please retry.` },
        { status: 500 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Failed to clean up clip storage. Please retry." },
      { status: 500 }
    );
  }

  // 2. R2 source objects under sources/{userId}/{videoId} — this prefix covers
  //    both the raw source (…/{videoId}.{ext}) and the extracted audio
  //    (…/{videoId}.audio.ogg), so a single list+delete sweep cleans both.
  try {
    const sourcePrefix = `sources/${user.id}/${videoId}`;
    const sourceKeys = await listR2Objects(sourcePrefix);

    // listR2Objects matches by prefix string, not path boundary. Guard against
    // a sibling id that shares this id as a prefix (e.g. {videoId} vs
    // {videoId}2): only delete the exact source or its ".audio.*" companion.
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
      return NextResponse.json(
        { error: "Failed to clean up source storage. Please retry." },
        { status: 500 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Failed to clean up source storage. Please retry." },
      { status: 500 }
    );
  }

  // 3. DB row — only now that all external storage is gone.
  //    clips rows cascade-delete via clips.video_id ON DELETE CASCADE.
  const { error: deleteError } = await admin
    .from("videos")
    .delete()
    .eq("id", videoId)
    .eq("user_id", user.id);

  if (deleteError) {
    return NextResponse.json(
      { error: "Failed to delete video record. Please retry." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
