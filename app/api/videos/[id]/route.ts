import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { listR2Objects, deleteR2Object } from "@/lib/r2";

type Params = Promise<{ id: string }>;

// In-flight statuses: a live Inngest job may still be writing to this video
// (DB row, R2 uploads). Deleting now would race it / orphan freshly-written
// objects, so we refuse. See CLAUDE.md "stuck video recovery" TODO.
const IN_FLIGHT = new Set(["transcribing", "analyzing", "clipping"]);

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
    .select("id, file_path, status")
    .eq("id", videoId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  // Status guard — never delete while a job could be writing.
  if (IN_FLIGHT.has(video.status)) {
    return NextResponse.json(
      { error: "Cannot delete while processing" },
      { status: 409 }
    );
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

  // 2. Supabase Storage source video under {userId}/{videoId}/
  try {
    const lastSlash = video.file_path.lastIndexOf("/");
    const folder = video.file_path.slice(0, lastSlash);

    const { data: files, error: listError } = await admin.storage
      .from("videos")
      .list(folder);

    if (listError) {
      return NextResponse.json(
        { error: "Failed to clean up source storage. Please retry." },
        { status: 500 }
      );
    }

    if (files && files.length > 0) {
      const paths = files.map((f) => `${folder}/${f.name}`);
      const { error: removeError } = await admin.storage
        .from("videos")
        .remove(paths);

      if (removeError) {
        return NextResponse.json(
          { error: "Failed to clean up source storage. Please retry." },
          { status: 500 }
        );
      }
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
