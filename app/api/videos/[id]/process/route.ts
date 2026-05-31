import { createClient } from "@/lib/supabase/server";
import { inngest } from "@/inngest/client";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: videoId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Atomic: update status only if video is owned by user AND currently 'uploaded'
  const { data: updated, error: updateErr } = await supabase
    .from("videos")
    .update({
      status: "transcribing",
      processing_started_at: new Date().toISOString(),
    })
    .eq("id", videoId)
    .eq("user_id", user.id)
    .eq("status", "uploaded")
    .select("id, credits_used, duration_seconds")
    .maybeSingle();

  if (updateErr) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  if (!updated) {
    return NextResponse.json(
      { error: "Video not ready for processing or already started" },
      { status: 400 }
    );
  }

  // Deduct credits now that processing has been atomically claimed
  const { error: deductErr } = await supabase.rpc("deduct_credits", {
    p_user_id: user.id,
    p_credits: updated.credits_used,
  });

  if (deductErr) {
    // Roll back status so user can retry
    await supabase
      .from("videos")
      .update({ status: "uploaded", processing_started_at: null })
      .eq("id", videoId);

    return NextResponse.json(
      { error: "Insufficient credits", details: deductErr.message },
      { status: 400 }
    );
  }

  await inngest.send({
    name: "video/uploaded",
    data: { videoId, userId: user.id },
  });

  return NextResponse.json({ success: true });
}
