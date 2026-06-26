import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { deleteVideoFully } from "@/lib/delete-video";

export async function GET() {
  return new Response("Not implemented", { status: 501 });
}

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Only the caller's own videos.
  const { data: videos, error } = await admin
    .from("videos")
    .select("id, file_path, status, processing_started_at")
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: "Failed to load videos" }, { status: 500 });
  }

  let deleted = 0;
  let skipped = 0;
  let failed = 0;
  const deletedIds: string[] = [];

  // Sequential — bounds R2 call volume and reuses the exact same per-video
  // cleanup as single delete. In-flight (not stuck) videos return
  // "skipped_in_flight" and are left untouched (never orphaned).
  for (const video of videos ?? []) {
    const outcome = await deleteVideoFully(admin, user.id, video);
    if (outcome.result === "deleted") {
      deleted += 1;
      deletedIds.push(video.id);
    } else if (outcome.result === "skipped_in_flight") {
      skipped += 1;
    } else {
      failed += 1;
    }
  }

  return NextResponse.json({ deleted, skipped, failed, deletedIds });
}
