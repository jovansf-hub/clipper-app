import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { headR2Object, deleteR2Object, getPresignedR2Url } from "@/lib/r2";
import { probeDuration } from "@/lib/clip-worker";
import { MAX_FILE_SIZE, MAX_FILE_SIZE_LABEL } from "@/lib/constants";

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

    // Verify the object actually landed in R2 and read its authoritative size.
    // file_path is the R2 key: sources/{user_id}/{video_id}.{ext}
    let head: { exists: boolean; size: number | null };
    try {
      head = await headR2Object(video.file_path);
    } catch {
      return NextResponse.json(
        { error: "Upload verification failed" },
        { status: 400 }
      );
    }

    if (!head.exists) {
      return NextResponse.json(
        { error: "Upload verification failed" },
        { status: 400 }
      );
    }

    // Authoritative server-side size enforcement (the client-reported size in
    // /api/upload is not trusted). Over the cap → delete the object and reject.
    if (head.size !== null && head.size > MAX_FILE_SIZE) {
      await deleteR2Object(video.file_path).catch(() => undefined);
      return NextResponse.json(
        { error: `File too large. Max ${MAX_FILE_SIZE_LABEL}.` },
        { status: 400 }
      );
    }

    // ── #2 cost-abuse gate: validate the REAL duration server-side ───────────
    // The client-reported duration in /api/upload is NOT trusted (it sets the
    // credit tier AND the plan duration-cap check). Probe the actual length
    // (ffprobe over the presigned URL, header-only — no download/ffmpeg) and
    // re-check the plan cap + credit tier against it, BEFORE any credit
    // deduction or pipeline runs. Backstop: if the probe fails or returns 0,
    // let the upload through — verify-duration (Groq) re-checks the plan cap
    // downstream as a net for malformed/streaming-unfriendly headers.
    try {
      const sourceUrl = await getPresignedR2Url(video.file_path, 3600);
      const { durationSeconds } = await probeDuration({
        videoUrl: sourceUrl,
        videoId,
        userId: user.id,
      });

      if (durationSeconds > 0) {
        const realDuration = Math.round(durationSeconds);
        // Reuse can_user_upload (single source of truth for plan caps + tiers)
        // with the REAL duration instead of duplicating the limits here.
        const { data: checkResult } = await admin.rpc("can_user_upload", {
          p_user_id: user.id,
          p_video_duration_seconds: realDuration,
        });
        const check = checkResult as {
          allowed: boolean;
          reason?: string;
          credits_needed?: number;
          max_duration_seconds?: number;
        } | null;

        // Over the plan's duration cap → reject before any billing/pipeline cost.
        if (check && !check.allowed && check.reason === "video_too_long") {
          await deleteR2Object(video.file_path).catch(() => undefined);
          await admin.from("videos").delete().eq("id", videoId);
          const maxMin = Math.floor((check.max_duration_seconds ?? 1800) / 60);
          return NextResponse.json(
            {
              error: `Video too long for your plan (max ${maxMin} min). Upgrade to upload longer videos.`,
              reason: "video_too_long",
            },
            { status: 400 }
          );
        }

        // Persist real duration + correct credit tier so /process deducts the
        // right amount. credits_needed is present in both the allowed and
        // insufficient_credits branches (absent only for video_too_long above).
        const realCredits = check?.credits_needed;
        await admin
          .from("videos")
          .update({
            duration_seconds: realDuration,
            ...(realCredits ? { credits_used: realCredits } : {}),
          })
          .eq("id", videoId);
      }
    } catch (err) {
      // Backstop: never block completion on a probe failure.
      console.error(
        `[upload/complete] duration probe skipped for ${videoId}:`,
        err instanceof Error ? err.message : err
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
