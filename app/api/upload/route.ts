import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getCreditsNeeded } from "@/lib/utils";

// TODO: raise to 500MB when on paid Supabase storage plan
const MAX_FILE_SIZE = 50 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
]);

const RETENTION_DAYS: Record<string, number> = {
  free: 7,
  creator: 30,
  pro: 90,
};

interface UploadBody {
  filename: string;
  file_size_bytes: number;
  duration_seconds: number;
  mime_type: string;
  content_type: string;
  clip_count_requested: number;
  caption_style_requested: string;
  language: string;
}

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

    const body = (await request.json()) as UploadBody;
    const {
      filename,
      file_size_bytes,
      duration_seconds,
      mime_type,
      content_type,
      clip_count_requested,
      caption_style_requested,
      language,
    } = body;

    // Validate file size and type
    if (file_size_bytes > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Max 50MB on free storage. Pro storage coming soon." },
        { status: 400 }
      );
    }

    if (!ALLOWED_MIME_TYPES.has(mime_type)) {
      return NextResponse.json(
        { error: "Unsupported file type." },
        { status: 400 }
      );
    }

    // Check upload eligibility via DB function
    const { data: checkResult, error: rpcError } = await supabase.rpc(
      "can_user_upload",
      {
        p_user_id: user.id,
        p_video_duration_seconds: Math.round(duration_seconds),
      }
    );

    if (rpcError) {
      return NextResponse.json(
        { error: "Failed to validate upload permissions." },
        { status: 500 }
      );
    }

    const check = checkResult as {
      allowed: boolean;
      reason?: string;
      credits_needed?: number;
      credits_remaining?: number;
      max_duration_seconds?: number;
    };

    if (!check.allowed) {
      if (check.reason === "video_too_long") {
        const maxMin = Math.floor((check.max_duration_seconds ?? 1800) / 60);
        return NextResponse.json(
          {
            error: `Video too long for your plan (max ${maxMin} min). Upgrade to upload longer videos.`,
            reason: "video_too_long",
          },
          { status: 400 }
        );
      }
      return NextResponse.json(
        {
          error: `Insufficient credits. You need ${check.credits_needed} but have ${check.credits_remaining}.`,
          reason: "insufficient_credits",
        },
        { status: 400 }
      );
    }

    const creditsNeeded = check.credits_needed ?? getCreditsNeeded(Math.round(duration_seconds));
    const admin = createAdminClient();

    // Fetch plan for retention calculation
    const { data: profile } = await admin
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .single();

    const userPlan = (profile?.plan as string) ?? "free";
    const retention = RETENTION_DAYS[userPlan] ?? 7;
    const expiresAt = new Date(Date.now() + retention * 86_400_000).toISOString();

    // Generate storage path
    const videoId = crypto.randomUUID();
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${user.id}/${videoId}/${safeFilename}`;
    const title = filename.replace(/\.[^.]+$/, "");

    // Enforce clip count limit by plan
    const maxClips = userPlan === "free" ? 5 : 15;
    const clampedClipCount = Math.min(Math.max(5, clip_count_requested), maxClips);

    // Insert video row
    const { error: insertError } = await admin.from("videos").insert({
      id: videoId,
      user_id: user.id,
      title,
      original_filename: filename,
      file_path: storagePath,
      file_size_bytes,
      duration_seconds: Math.round(duration_seconds),
      mime_type,
      status: "uploading",
      credits_used: creditsNeeded,
      content_type,
      clip_count_requested: clampedClipCount,
      caption_style_requested,
      language,
      expires_at: expiresAt,
    });

    if (insertError) {
      return NextResponse.json(
        { error: "Failed to create video record." },
        { status: 500 }
      );
    }

    // Generate signed upload URL
    const { data: signed, error: signedError } = await admin.storage
      .from("videos")
      .createSignedUploadUrl(storagePath);

    if (signedError || !signed) {
      // Rollback video row
      await admin.from("videos").delete().eq("id", videoId);
      return NextResponse.json(
        { error: "Failed to generate upload URL." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      signedUrl: signed.signedUrl,
      videoId,
      token: signed.token,
      path: storagePath,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get("videoId");

    if (!videoId) {
      return NextResponse.json({ error: "videoId is required." }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: video } = await admin
      .from("videos")
      .select("id, user_id, status")
      .eq("id", videoId)
      .single();

    if (!video) {
      return NextResponse.json({ error: "Video not found." }, { status: 404 });
    }

    if (video.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    if (video.status !== "uploading") {
      return NextResponse.json(
        { error: "Only videos with status 'uploading' can be cleaned up." },
        { status: 400 }
      );
    }

    await admin.from("videos").delete().eq("id", videoId);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
