import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/server";
import { transcribeAudio } from "@/lib/groq";
import { analyzeViralMoments } from "@/lib/anthropic";

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

    await step.run("mark-completed-temp", async () => {
      const supabase = createAdminClient();
      await supabase
        .from("videos")
        .update({
          status: "completed",
          processing_completed_at: new Date().toISOString(),
        })
        .eq("id", videoId);
    });

    return {
      success: true,
      videoId,
      userId,
      transcriptLength: transcription.text.length,
      duration: transcription.duration,
      momentsFound: viralAnalysis.moments.length,
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
