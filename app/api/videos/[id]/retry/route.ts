import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

type Params = Promise<{ id: string }>;

export async function GET() {
  return new Response("Not implemented", { status: 501 });
}

export async function POST(
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

  // Verify ownership and that video is actually in 'failed' state.
  // Prevents resetting videos that are still processing or already completed.
  const { data: video } = await admin
    .from("videos")
    .select("id")
    .eq("id", videoId)
    .eq("user_id", user.id)
    .eq("status", "failed")
    .maybeSingle();

  if (!video) {
    return NextResponse.json(
      { error: "Video not found or not in failed state" },
      { status: 400 }
    );
  }

  const { error: updateError } = await admin
    .from("videos")
    .update({
      status: "uploaded",
      error_message: null,
      error_step: null,
      processing_started_at: null,
    })
    .eq("id", videoId)
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json({ error: "Failed to reset video" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
