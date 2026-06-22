import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getCreditsNeeded } from "@/lib/utils";
import { getPresignedR2PutUrl, deleteR2Object } from "@/lib/r2";
import { checkUploadRate } from "@/lib/rate-limit";
import { MAX_FILE_SIZE, MAX_FILE_SIZE_LABEL } from "@/lib/constants";

const ALLOWED_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
]);

// Fallback file extension when the original filename has none we can trust.
const EXT_BY_MIME: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
};

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

    // Admin client used for all DB/RPC calls — can_user_upload and credit RPCs are
    // REVOKED from authenticated role; service_role bypasses that restriction.
    const admin = createAdminClient();

    // #3 rate limit: in-flight concurrency cap + rolling-hour upload cap.
    const rate = await checkUploadRate(admin, user.id);
    if (!rate.ok) {
      return NextResponse.json(
        { error: rate.error },
        { status: rate.status, headers: { "Retry-After": String(rate.retryAfter) } }
      );
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
        { error: `File too large. Max ${MAX_FILE_SIZE_LABEL}.` },
        { status: 400 }
      );
    }

    if (!ALLOWED_MIME_TYPES.has(mime_type)) {
      return NextResponse.json(
        { error: "Unsupported file type." },
        { status: 400 }
      );
    }

    // Check upload eligibility via DB function.
    // Uses admin client — can_user_upload is REVOKED from authenticated role.
    const { data: checkResult, error: rpcError } = await admin.rpc(
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

    // Fetch plan for retention calculation
    const { data: profile } = await admin
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .single();

    const userPlan = (profile?.plan as string) ?? "free";

    const FREE_CAPTION_STYLES = ["tiktok_highlight"];
    if (userPlan === "free" && !FREE_CAPTION_STYLES.includes(caption_style_requested)) {
      return NextResponse.json(
        { error: "Caption style requires upgrade", available_for_free: FREE_CAPTION_STYLES },
        { status: 403 }
      );
    }

    const MAX_CLIPS_BY_PLAN: Record<string, number> = { free: 5, creator: 15, pro: 15 };
    const maxAllowedClips = MAX_CLIPS_BY_PLAN[userPlan] ?? 5;
    if (clip_count_requested > maxAllowedClips) {
      return NextResponse.json(
        { error: `Clip count exceeds plan limit (max ${maxAllowedClips})` },
        { status: 403 }
      );
    }

    const retention = RETENTION_DAYS[userPlan] ?? 7;
    const expiresAt = new Date(Date.now() + retention * 86_400_000).toISOString();

    // Generate R2 source key: sources/{userId}/{videoId}.{ext}
    const videoId = crypto.randomUUID();
    const rawExt = filename.includes(".")
      ? filename.split(".").pop()!.toLowerCase()
      : "";
    const ext = /^[a-z0-9]{1,5}$/.test(rawExt) ? rawExt : (EXT_BY_MIME[mime_type] ?? "bin");
    const storagePath = `sources/${user.id}/${videoId}.${ext}`;
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

    // Generate R2 presigned PUT URL. The client PUTs the raw file with the
    // returned contentType header; size is enforced authoritatively (HEAD) in
    // /api/upload/complete once the object lands.
    let uploadUrl: string;
    try {
      uploadUrl = await getPresignedR2PutUrl(storagePath, 3600);
    } catch {
      // Rollback video row
      await admin.from("videos").delete().eq("id", videoId);
      return NextResponse.json(
        { error: "Failed to generate upload URL." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      uploadUrl,
      videoId,
      key: storagePath,
      contentType: mime_type,
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
      .select("id, user_id, status, file_path")
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

    // Best-effort: remove any partially-uploaded R2 object so abandoned uploads
    // don't accumulate. Idempotent — deleting a missing key is a no-op.
    await deleteR2Object(video.file_path).catch(() => undefined);

    await admin.from("videos").delete().eq("id", videoId);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
