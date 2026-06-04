import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function GET() {
  return new Response("Not implemented", { status: 501 });
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { videoId?: string };
    if (!body.videoId) {
      return NextResponse.json({ error: "videoId is required" }, { status: 400 });
    }
    const { videoId } = body;

    const admin = createAdminClient();

    // Verify ownership and expected pre-complete state in one query
    const { data: video } = await admin
      .from("videos")
      .select("id, file_path")
      .eq("id", videoId)
      .eq("user_id", user.id)
      .eq("status", "uploading")
      .maybeSingle();

    if (!video) {
      return NextResponse.json(
        { error: "Video not found or not in expected state" },
        { status: 404 }
      );
    }

    // Verify the file actually landed in storage.
    // file_path format: {user_id}/{video_id}/{filename}
    const lastSlash = video.file_path.lastIndexOf("/");
    const folder = video.file_path.slice(0, lastSlash);
    const filename = video.file_path.slice(lastSlash + 1);

    const { data: files, error: listError } = await admin.storage
      .from("videos")
      .list(folder, { search: filename });

    if (listError || !files || files.length === 0) {
      return NextResponse.json(
        { error: "Upload verification failed" },
        { status: 400 }
      );
    }

    // File confirmed in storage — atomically transition to 'uploaded'.
    // Double-check status in WHERE to guard against concurrent calls.
    const { error: updateError } = await admin
      .from("videos")
      .update({ status: "uploaded" })
      .eq("id", videoId)
      .eq("user_id", user.id)
      .eq("status", "uploading");

    if (updateError) {
      return NextResponse.json({ error: "Failed to confirm upload" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
