import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { deleteVideoFully } from "@/lib/delete-video";

type Params = Promise<{ id: string }>;

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

  // All deletion + R2 cleanup + stuck-refund logic lives in the shared helper
  // (reused by the bulk-delete endpoint). Map its result to HTTP status.
  const outcome = await deleteVideoFully(admin, user.id, video);

  if (outcome.result === "skipped_in_flight") {
    return NextResponse.json(
      { error: "Cannot delete while processing" },
      { status: 409 }
    );
  }
  if (outcome.result === "failed") {
    return NextResponse.json(
      { error: "Could not delete, please retry" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
