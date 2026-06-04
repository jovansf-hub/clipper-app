import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/server";
import { transcribeAudio } from "@/lib/groq";
import { analyzeViralMoments, type ViralMoment } from "@/lib/anthropic";
import { callClipWorker } from "@/lib/clip-worker";
import { getSignedSourceUrl } from "@/lib/supabase-storage";
import { calculateCreditCorrection } from "@/lib/credit-verification";

export const processVideo = inngest.createFunction(
  {
    id: "process-video",
    name: "Process Video Pipeline",
    retries: 2,
    triggers: [{ event: "video/uploaded" }],
  },
  async ({ event, step }) => {
    const { videoId, userId } = event.data as {
      videoId: string;
      userId: string;
    };

    await step.run("update-status-transcribing", async () => {
      const supabase = createAdminClient();
      const { error } = await supabase
        .from("videos")
        .update({
          status: "transcribing",
          processing_started_at: new Date().toISOString(),
        })
        .eq("id", videoId);
      if (error) throw error;
    });

    const transcription = await step.run("transcribe-audio", async () => {
      const supabase = createAdminClient();

      const { data: video, error: videoErr } = await supabase
        .from("videos")
        .select("file_path, language")
        .eq("id", videoId)
        .single();
      if (videoErr || !video) throw new Error(`Video not found: ${videoId}`);

      const { data: signedUrlData, error: urlErr } = await supabase.storage
        .from("videos")
        .createSignedUrl(video.file_path, 3600);
      if (urlErr || !signedUrlData)
        throw new Error(`Could not create signed URL: ${urlErr?.message}`);

      const result = await transcribeAudio(
        signedUrlData.signedUrl,
        video.language ?? undefined
      );

      const { error: updateErr } = await supabase
        .from("videos")
        .update({
          transcript_text: result.text,
          transcript_segments: {
            segments: result.segments,
            words: result.words,
            duration: result.duration,
            language: result.language,
          },
        })
        .eq("id", videoId);
      if (updateErr) throw updateErr;

      return result;
    });

    const durationVerification = await step.run("verify-duration", async () => {
      const supabase = createAdminClient();

      const { data: video, error: videoErr } = await supabase
        .from("videos")
        .select("duration_seconds, credits_used")
        .eq("id", videoId)
        .single();
      if (videoErr || !video) throw new Error(`Video not found during verify-duration: ${videoId}`);

      const correction = calculateCreditCorrection({
        realDurationSeconds:     transcription.duration,
        reportedDurationSeconds: video.duration_seconds,
        creditsUsed:             video.credits_used,
      });

      if (!correction.needsCorrection) {
        return { verified: true, corrected: false, reason: "no_shortfall" };
      }

      // Tier boundary crossed — collect the difference.
      const { error: deductErr } = await supabase.rpc("deduct_credits", {
        p_user_id: userId,
        p_credits: correction.diff,
      });

      if (deductErr) {
        // Insufficient credits for the real duration.
        // Refund the initial charge and mark failed.
        await supabase.rpc("refund_credits", {
          p_user_id: userId,
          p_credits: video.credits_used,
        });
        await supabase
          .from("videos")
          .update({
            status: "failed",
            error_message: "Insufficient credits for actual video duration",
            error_step: "verify-duration",
          })
          .eq("id", videoId);

        // Return (don't throw): deterministic business failure, not a transient error.
        // Throwing would trigger Inngest retries and re-attempt credit deduction.
        return { verified: false, reason: "insufficient_credits" };
      }

      const realDuration = Math.ceil(transcription.duration);

      // Persist real values so idempotency check passes on any subsequent retry.
      await supabase
        .from("videos")
        .update({ duration_seconds: realDuration, credits_used: correction.realCredits })
        .eq("id", videoId);

      return {
        verified:          true,
        corrected:         true,
        reportedDuration:  video.duration_seconds,
        realDuration,
        additionalCredits: correction.diff,
      };
    });

    // Status already set to 'failed' and credits refunded inside the step.
    // Return (not throw) so Inngest marks execution completed, preventing
    // handleProcessVideoFailure from firing and double-refunding.
    if (!durationVerification.verified) {
      return { success: false, videoId, reason: "duration_verification_failed" };
    }

    const viralAnalysis = await step.run("analyze-viral-moments", async () => {
      const supabase = createAdminClient();

      await supabase
        .from("videos")
        .update({ status: "analyzing" })
        .eq("id", videoId);

      const { data: video, error } = await supabase
        .from("videos")
        .select("transcript_text, transcript_segments, content_type, clip_count_requested, language")
        .eq("id", videoId)
        .single();

      if (error || !video) throw new Error("Video not found for analysis");

      if (!video.transcript_text || video.transcript_text.trim().length === 0) {
        return { moments: [], reasoning: "No transcript available", content_summary: "" };
      }

      const segmentsData = video.transcript_segments as {
        segments?: Array<{ start: number; end: number; text: string }>;
        duration?: number;
      } | null;

      const result = await analyzeViralMoments(
        {
          text: video.transcript_text,
          duration: segmentsData?.duration ?? 0,
          segments: segmentsData?.segments ?? [],
        },
        {
          contentType: video.content_type || "podcast",
          clipCount: video.clip_count_requested || 10,
          language: video.language || "en",
        }
      );

      await supabase
        .from("videos")
        .update({ viral_analysis: result })
        .eq("id", videoId);

      return result;
    });

    const clipResult = await step.run("generate-clips", async () => {
      const supabase = createAdminClient();

      // 1. Status -> clipping
      await supabase
        .from("videos")
        .update({ status: "clipping" })
        .eq("id", videoId);

      // 2. Read file_path + transcript_segments (not returned by prior steps)
      const { data: video, error: videoErr } = await supabase
        .from("videos")
        .select("file_path, transcript_segments")
        .eq("id", videoId)
        .single();
      if (videoErr || !video) throw new Error(`Video not found: ${videoId}`);

      // 3. Idempotency: delete clips from any prior attempt so retries don't duplicate
      await supabase.from("clips").delete().eq("video_id", videoId);

      // 4. Moments from prior step — graceful exit if analysis found nothing
      const moments: ViralMoment[] = viralAnalysis.moments ?? [];
      if (moments.length === 0) {
        await supabase
          .from("videos")
          .update({
            status: "completed",
            processing_completed_at: new Date().toISOString(),
          })
          .eq("id", videoId);
        return { clipsGenerated: 0, clipsFailed: 0 };
      }

      // 5. Stable clipId per moment (used to correlate worker response back to moment)
      const clipsWithIds = moments.map((m) => ({
        ...m,
        clipId: crypto.randomUUID(),
      }));

      // 6. Presigned source URL for worker to download
      const videoUrl = await getSignedSourceUrl(video.file_path, 3600);

      // 7. Call clip-worker — snake_case moment fields -> camelCase worker payload
      const workerResponse = await callClipWorker({
        videoUrl,
        videoId,
        userId,
        clips: clipsWithIds.map((m) => ({
          clipId: m.clipId,
          startSeconds: m.start_time,
          endSeconds: m.end_time,
          title: m.title,
        })),
      });

      if (workerResponse.failed.length > 0) {
        console.warn(
          `[${videoId}] ${workerResponse.failed.length} clip(s) failed in worker: ` +
            workerResponse.failed.map((f) => `${f.clipId}(${f.error})`).join(", ")
        );
      }

      // 8. Rebase transcript segments/words onto clip-local time (0 = clip start)
      const transcriptData = video.transcript_segments as {
        segments?: Array<{ id?: number; start: number; end: number; text: string }>;
        words?: Array<{ word: string; start: number; end: number }>;
      } | null;
      const allSegments = transcriptData?.segments ?? [];
      const allWords = transcriptData?.words ?? [];

      let insertSuccessCount = 0;

      for (const result of workerResponse.clips) {
        const moment = clipsWithIds.find((m) => m.clipId === result.clipId);
        if (!moment) continue;

        const start = moment.start_time;
        const end = moment.end_time;

        const rebasedSegments = allSegments
          .filter((s) => s.end > start && s.start < end)
          .map((s) => ({
            ...s,
            start: Math.max(0, s.start - start),
            end: Math.max(0, s.end - start),
          }));

        const rebasedWords = allWords
          .filter((w) => w.end > start && w.start < end)
          .map((w) => ({
            ...w,
            start: Math.max(0, w.start - start),
            end: Math.max(0, w.end - start),
          }));

        const { error: insertErr } = await supabase.from("clips").insert({
          video_id: videoId,
          user_id: userId,
          start_time_seconds: moment.start_time,
          end_time_seconds: moment.end_time,
          duration_seconds: result.durationSeconds,
          title: moment.title,
          viral_score: moment.viral_score,
          viral_reasoning: moment.reasoning,
          hook_type: moment.hook_type,
          output_path: result.r2Key,
          thumbnail_path: result.thumbnailKey,
          file_size_bytes: result.fileSizeBytes,
          captions: { segments: rebasedSegments, words: rebasedWords },
        });

        if (insertErr) {
          console.error(
            `[${videoId}] DB insert failed for clip ${result.clipId}: ${insertErr.message}`
          );
        } else {
          insertSuccessCount++;
        }
      }

      // Worker responded but nothing usable — deterministic failure, skip retry
      // (callClipWorker throwing is the retry path; this branch means Worker is up but data is bad)
      if (insertSuccessCount === 0) {
        const errorMsg =
          workerResponse.clips.length === 0
            ? (workerResponse.error ?? `All ${moments.length} clips failed in worker`)
            : `All ${workerResponse.clips.length} clip DB inserts failed`;
        await supabase
          .from("videos")
          .update({
            status: "failed",
            error_message: errorMsg,
            error_step: "generate-clips",
          })
          .eq("id", videoId);
        return {
          clipsGenerated: 0,
          clipsFailed: workerResponse.failed.length + workerResponse.clips.length,
        };
      }

      // 10. Atomic counter update
      await supabase.rpc("increment_clips_total", {
        p_user_id: userId,
        p_amount: insertSuccessCount,
      });

      // 11. Mark completed
      await supabase
        .from("videos")
        .update({
          status: "completed",
          processing_completed_at: new Date().toISOString(),
        })
        .eq("id", videoId);

      return {
        clipsGenerated: insertSuccessCount,
        clipsFailed:
          workerResponse.failed.length +
          (workerResponse.clips.length - insertSuccessCount),
      };
    });

    return {
      success: true,
      videoId,
      userId,
      transcriptLength: transcription.text.length,
      duration: transcription.duration,
      momentsFound: viralAnalysis.moments.length,
      clipsGenerated: clipResult.clipsGenerated,
      clipsFailed: clipResult.clipsFailed,
    };
  }
);

export const handleProcessVideoFailure = inngest.createFunction(
  {
    id: "process-video-failure",
    triggers: [{ event: "inngest/function.failed" }],
  },
  async ({ event }) => {
    const data = event.data as {
      function_id: string;
      event: { data: { videoId: string } };
      error?: { message?: string };
      step_name?: string;
    };

    if (data.function_id !== "process-video") return;

    const supabase = createAdminClient();
    const videoId = data.event.data.videoId;

    const { data: video } = await supabase
      .from("videos")
      .select("user_id, credits_used")
      .eq("id", videoId)
      .single();

    if (video && video.credits_used > 0) {
      await supabase.rpc("refund_credits", {
        p_user_id: video.user_id,
        p_credits: video.credits_used,
      });
    }

    await supabase
      .from("videos")
      .update({
        status: "failed",
        error_message: data.error?.message || "Unknown error",
        error_step: data.step_name || "unknown",
      })
      .eq("id", videoId);
  }
);
