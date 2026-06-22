import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/server";
import { transcribeAudio } from "@/lib/groq";
import { analyzeViralMoments, detectSubjectCenterX, type ViralMoment } from "@/lib/anthropic";
import {
  startClipWorker,
  getClipWorkerStatus,
  startExtractAudio,
  getAudioStatus,
  callDetectKeyframes,
  type StatusMarker,
  type AudioStatusMarker,
} from "@/lib/clip-worker";
import { getPresignedR2Url } from "@/lib/r2";
import { calculateCreditCorrection } from "@/lib/credit-verification";

// A viral moment plus the stable clipId/cropX assigned at clip time. Generated
// in the start-process step and memoized, so the same ids survive retries and
// correlate worker output back to the moment when persisting.
type ClipWithId = ViralMoment & { clipId: string; cropX?: number };

export const processVideo = inngest.createFunction(
  {
    id: "process-video",
    name: "Process Video Pipeline",
    // One retry (2 attempts total): recovers a transient blip but bounds the
    // failure loop to ~2x the step timeout before onFailure refunds — instead
    // of 3 attempts tying up the charged credit for minutes. Per-step retries
    // aren't supported in inngest@4.4.0, so this is function-wide.
    retries: 1,
    triggers: [{ event: "video/uploaded" }],
    // Fires exactly once after all retries are exhausted for THIS function.
    // Inngest wires the match internally (no function_id string to maintain).
    // Steps that handle their own failure (extract-audio >25MB, verify-duration
    // insufficient, generate-clips) RETURN instead of throwing, so the function
    // completes successfully and onFailure never fires for them — that's what
    // keeps refunds to exactly once. onFailure only covers uncaught throws/timeouts.
    onFailure: async ({ event, error, step }) => {
      // event.data.event is the original `video/uploaded` event.
      const { videoId, userId } = event.data.event.data as {
        videoId: string;
        userId: string;
      };

      // Guard: if the event payload shape ever changes, videoId/userId would be
      // undefined and the queries below would silently no-op (.eq("id", undefined)
      // matches 0 rows) — a missed refund with no signal. Fail LOUDLY instead.
      if (!videoId || !userId) {
        console.error(
          `[onFailure] missing videoId/userId in event payload — cannot refund/mark-failed. ` +
            `videoId=${String(videoId)} userId=${String(userId)}`
        );
        return;
      }

      // Atomic exactly-once refund + flip via refund_video_once: the RPC's
      // credits_refunded guard makes a retry (or a concurrent stuck-recovery
      // cron) a no-op, so the refund happens at most once. status flips to
      // 'failed' and error_step is COALESCEd (no-overwrite) in the same tx.
      // Single memoized step replaces the old refund + mark-failed pair.
      await step.run("recover-failed-video", async () => {
        const supabase = createAdminClient();
        await supabase.rpc("refund_video_once", {
          p_video_id: videoId,
          p_error_step: "pipeline-failure",
          p_error_message: error?.message || "Processing failed",
        });
      });
    },
  },
  async ({ event, step }) => {
    const { videoId, userId } = event.data as {
      videoId: string;
      userId: string;
    };

    // Warm the clip-worker container BEFORE any timed/credited work. The
    // worker's /health goes through its readiness gate (waits up to ~30s for the
    // container port, else 503), so a 200 here means the container is up and
    // extract-audio won't eat a cold start. Pinging a separate keep-warm cron
    // instance doesn't help — real requests hit the "main" container, which is
    // exactly what /health here boots. GET only, no side effects, no credit cost.
    // NOTE: inngest@4.4.0 has no per-step retry option (retries are function-wide
    // — see above), so we retry the ping in-loop here instead of { retries: 3 }.
    await step.run("warm-container", async () => {
      const workerUrl = process.env.CLIP_WORKER_URL;
      const workerSecret = process.env.CLIP_WORKER_SECRET;
      if (!workerUrl) throw new Error("CLIP_WORKER_URL is not set");
      if (!workerSecret) throw new Error("CLIP_WORKER_SECRET is not set");

      const attempts = 4;
      let lastErr = "";
      for (let i = 0; i < attempts; i++) {
        const controller = new AbortController();
        // Slightly above the worker's ~30s readiness bound so a slow cold boot
        // resolves within one attempt rather than aborting prematurely.
        const timeoutId = setTimeout(() => controller.abort(), 35_000);
        try {
          const res = await fetch(`${workerUrl}/health`, {
            headers: { Authorization: `Bearer ${workerSecret}` },
            signal: controller.signal,
          });
          if (res.ok) return { warm: true, attempt: i + 1 };
          lastErr = `status ${res.status}`;
        } catch (err) {
          lastErr = err instanceof Error ? err.message : String(err);
        } finally {
          clearTimeout(timeoutId);
        }
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1_500));
      }
      // All pings failed — throw so the function-wide retry (retries: 1) gets one
      // more shot before onFailure refunds. No credit spent yet at this point.
      throw new Error(
        `Container not ready after ${attempts} warm-up attempts: ${lastErr}`
      );
    });

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

    // Extract a small Opus audio file from the source before transcription.
    // Groq's free tier caps uploads at 25MB; a raw video easily exceeds that,
    // so we downsample to 16kHz mono Opus @ 32kbps (~7MB for 30 min) first.
    // Stays under status 'transcribing' — no new status/UI stage.
    // ── ASYNC audio extraction: kick off → durable poll → size gate ──────────
    // /extract-audio-async returns 202 and runs extractAudio in the background,
    // so a large/slow source isn't bounded by a live HTTP connection. Mirrors the
    // /process async flow. Result (audioKey, audioSizeBytes) lands in the audio
    // marker, read via getAudioStatus.
    const audioStart = await step.run("start-extract-audio", async () => {
      const supabase = createAdminClient();

      const { data: video, error: videoErr } = await supabase
        .from("videos")
        .select("file_path, duration_seconds")
        .eq("id", videoId)
        .single();
      if (videoErr || !video) throw new Error(`Video not found: ${videoId}`);

      // Source video lives in R2 (file_path is the R2 key).
      const sourceUrl = await getPresignedR2Url(video.file_path, 3600);
      const start = await startExtractAudio({ videoUrl: sourceUrl, videoId, userId });
      if (!start.accepted) {
        throw new Error(`clip-worker did not accept /extract-audio-async for ${videoId}`);
      }
      return { durationSeconds: video.duration_seconds ?? 0 };
    });

    // Poll budget scales with the (reported) duration: floor 20 min for small
    // files, up to 60 min for very long ones. Unknown/0 duration -> floor. The
    // duration is the upload-reported value (verify-duration corrects it later),
    // which is fine as a budget estimate. step.sleep is durable (free wait).
    const maxAudioPolls = Math.min(
      360,
      Math.max(120, 90 + Math.ceil(audioStart.durationSeconds / 60))
    );

    let audioMarker: AudioStatusMarker | null = null;
    for (let i = 0; i < maxAudioPolls; i++) {
      const status = await step.run(`audio-poll-${i}`, async (): Promise<AudioStatusMarker> => {
        try {
          return await getAudioStatus(videoId, userId);
        } catch (err) {
          // Transient (network/timeout/abort/5xx) — NOT the deterministic worker
          // failure (which arrives as a returned status:"failed"). Keep waiting.
          console.warn(
            `[${videoId}] audio poll ${i} transient error, retrying next tick: ` +
              (err instanceof Error ? err.message : String(err))
          );
          return { status: "processing" };
        }
      });
      if (status.status === "completed") {
        audioMarker = status;
        break;
      }
      if (status.status === "failed") {
        throw new Error(status.error ?? "audio extraction reported failure");
      }
      await step.sleep(`audio-wait-${i}`, "10s");
    }
    if (!audioMarker) {
      throw new Error(
        `audio extraction polling timed out after ${maxAudioPolls * 10}s for ${videoId}`
      );
    }
    const completedAudio = audioMarker;

    // >25MB gate — same business decision + refund path as before, now reading
    // audioSizeBytes from the marker instead of a sync response. Unchanged.
    const audioExtraction = await step.run("check-audio-size", async () => {
      const supabase = createAdminClient();
      const MAX_GROQ_BYTES = 25 * 1024 * 1024;
      if ((completedAudio.audioSizeBytes ?? 0) > MAX_GROQ_BYTES) {
        // Even after compression the audio exceeds Groq's cap. Deterministic
        // business failure — atomic refund + flip (exactly-once), then RETURN.
        await supabase.rpc("refund_video_once", {
          p_video_id: videoId,
          p_error_step: "extract-audio",
          p_error_message: "Audio too long to transcribe",
        });
        return { ok: false as const };
      }
      if (!completedAudio.audioKey) {
        throw new Error(`audio marker completed but missing audioKey for ${videoId}`);
      }
      return { ok: true as const, audioKey: completedAudio.audioKey };
    });

    if (!audioExtraction.ok) {
      return { success: false, videoId, reason: "audio_too_large" };
    }

    const transcription = await step.run("transcribe-audio", async () => {
      const supabase = createAdminClient();

      const { data: video, error: videoErr } = await supabase
        .from("videos")
        .select("language")
        .eq("id", videoId)
        .single();
      if (videoErr || !video) throw new Error(`Video not found: ${videoId}`);

      // Transcribe the compressed audio extracted above (not the raw source).
      const sourceUrl = await getPresignedR2Url(audioExtraction.audioKey, 3600);

      const result = await transcribeAudio(
        sourceUrl,
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

      const realDuration = Math.ceil(transcription.duration);

      // Plan duration-cap backstop: if a malformed/streaming-unfriendly header
      // fooled the upstream /probe-duration gate, catch the over-limit video
      // here using Groq's authoritative duration. can_user_upload checks the cap
      // BEFORE credits, so an over-cap video returns video_too_long regardless
      // of the (already-deducted) balance — we act only on that reason.
      const { data: capCheck } = await supabase.rpc("can_user_upload", {
        p_user_id: userId,
        p_video_duration_seconds: realDuration,
      });
      const cap = capCheck as { allowed: boolean; reason?: string } | null;
      if (cap && !cap.allowed && cap.reason === "video_too_long") {
        await supabase.rpc("refund_video_once", {
          p_video_id: videoId,
          p_error_step: "verify-duration",
          p_error_message: "Video exceeds plan duration limit",
        });
        return { verified: false, reason: "video_too_long" };
      }

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
        // Insufficient credits for the real duration. Atomic refund of the
        // initial charge + flip to failed (exactly-once via refund_video_once).
        await supabase.rpc("refund_video_once", {
          p_video_id: videoId,
          p_error_step: "verify-duration",
          p_error_message: "Insufficient credits for actual video duration",
        });

        // Return (don't throw): deterministic business failure, not a transient error.
        // Throwing would trigger Inngest retries and re-attempt credit deduction.
        return { verified: false, reason: "insufficient_credits" };
      }

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

    // Smart crop via Claude Vision. For each viral moment, the clip-worker
    // extracts a keyframe at the moment's midpoint; we ask Haiku where the
    // subject is and turn that into a pixel crop offset. Result is an array of
    // cropX aligned by index to viralAnalysis.moments (null = center fallback).
    // Stays under status 'analyzing' — no new status/UI stage. Fully degrades:
    // any failure leaves cropX null and generate-clips center-crops.
    const cropDetection = await step.run("detect-crop", async () => {
      const moments = viralAnalysis.moments ?? [];
      if (moments.length === 0) return { cropXByIndex: [] as (number | null)[] };

      const supabase = createAdminClient();
      const { data: video, error: videoErr } = await supabase
        .from("videos")
        .select("file_path")
        .eq("id", videoId)
        .single();
      if (videoErr || !video) throw new Error(`Video not found for detect-crop: ${videoId}`);

      const sourceUrl = await getPresignedR2Url(video.file_path, 3600);
      const keyframes = moments.map((m, i) => ({
        momentId: String(i),
        midSeconds: m.start_time + (m.end_time - m.start_time) / 2,
      }));

      // Worker extracts keyframes; on failure, center-crop every clip.
      let kf;
      try {
        kf = await callDetectKeyframes({ videoUrl: sourceUrl, videoId, userId, keyframes });
      } catch (err) {
        console.error(
          `[${videoId}] detect-keyframes failed — center crop for all clips: ` +
            (err instanceof Error ? err.message : "unknown")
        );
        return { cropXByIndex: moments.map(() => null) };
      }

      const cropW = (kf.height * 9) / 16;
      const maxX = Math.max(0, kf.width - cropW);
      const frameById = new Map(kf.keyframes.map((k) => [k.momentId, k.jpegBase64]));

      const cropXByIndex: (number | null)[] = [];
      for (let i = 0; i < moments.length; i++) {
        const jpeg = frameById.get(String(i));
        if (!jpeg) {
          cropXByIndex.push(null); // keyframe extraction failed → center crop
          continue;
        }
        const centerFraction = await detectSubjectCenterX(jpeg); // [0,1], 0.5 on failure
        const centerPx = centerFraction * kf.width;
        const x = Math.round(Math.max(0, Math.min(centerPx - cropW / 2, maxX)));
        cropXByIndex.push(x);
      }

      return { cropXByIndex };
    });

    // ── ASYNC clip job: start → poll → persist ───────────────────────────────
    // /process now returns 202 and runs in the background (it outlives any HTTP
    // connection). We kick it off, poll GET /status durably, then persist from
    // the final marker. step.sleep (not setTimeout) keeps each poll a short,
    // memoized step and each poll resets the container's sleepAfter (keep-alive).

    // Kick off the job. Stable clipIds (randomUUID) are generated and memoized
    // HERE, so they survive function retries and correlate worker output → moment.
    const startResult = await step.run("start-process", async () => {
      const supabase = createAdminClient();

      await supabase.from("videos").update({ status: "clipping" }).eq("id", videoId);

      const { data: video, error: videoErr } = await supabase
        .from("videos")
        .select("file_path")
        .eq("id", videoId)
        .single();
      if (videoErr || !video) throw new Error(`Video not found: ${videoId}`);

      // Graceful exit if analysis found nothing to clip.
      const moments: ViralMoment[] = viralAnalysis.moments ?? [];
      if (moments.length === 0) {
        await supabase.from("clips").delete().eq("video_id", videoId);
        await supabase
          .from("videos")
          .update({ status: "completed", processing_completed_at: new Date().toISOString() })
          .eq("id", videoId);
        return { started: false as const, clipsWithIds: [] as ClipWithId[] };
      }

      // cropX from detect-crop is aligned by index; null → omit so worker center-crops.
      const clipsWithIds: ClipWithId[] = moments.map((m, i) => ({
        ...m,
        clipId: crypto.randomUUID(),
        cropX: cropDetection.cropXByIndex[i] ?? undefined,
      }));

      const videoUrl = await getPresignedR2Url(video.file_path, 3600);

      // snake_case moment fields -> camelCase worker payload. Expects 202.
      const start = await startClipWorker({
        videoUrl,
        videoId,
        userId,
        clips: clipsWithIds.map((m) => ({
          clipId: m.clipId,
          startSeconds: m.start_time,
          endSeconds: m.end_time,
          title: m.title,
          cropX: m.cropX,
        })),
      });
      if (!start.accepted) throw new Error(`clip-worker did not accept /process for ${videoId}`);

      return { started: true as const, clipsWithIds };
    });

    let clipResult: { clipsGenerated: number; clipsFailed: number };

    if (!startResult.started) {
      // No moments — already marked completed in start-process.
      clipResult = { clipsGenerated: 0, clipsFailed: 0 };
    } else {
      // Durable poll: GET /status every 10s. Budget scales with clip count so a
      // many-clip job (sequential encode) isn't falsely timed out: maxPolls =
      // clamp(30 + clipCount*10, 60, 180) → 3 clips ~10 min, 15 clips ~30 min.
      // step.sleep is durable (Inngest doesn't bill the wait); the cap bounds how
      // long a genuinely dead job waits before timeout → refund (UX only).
      const clipCount = startResult.clipsWithIds.length;
      const maxPolls = Math.min(180, Math.max(60, 30 + clipCount * 10));
      let finalStatus: StatusMarker | null = null;
      for (let i = 0; i < maxPolls; i++) {
        const status = await step.run(`poll-${i}`, async (): Promise<StatusMarker> => {
          try {
            return await getClipWorkerStatus(videoId, userId);
          } catch (err) {
            // Transient (network / timeout / abort / 5xx) — NOT the deterministic
            // worker failure, which arrives as a RETURNED status:"failed" below.
            // Throwing here would burn the function's single retry on a mid-poll
            // blip; instead treat it as "keep waiting" and re-check next tick. A
            // persistently failing /status still resolves via the budget timeout.
            console.warn(
              `[${videoId}] poll ${i} transient error, retrying next tick: ` +
                (err instanceof Error ? err.message : String(err))
            );
            return { status: "processing" };
          }
        });
        if (status.status === "completed") {
          finalStatus = status;
          break;
        }
        if (status.status === "failed") {
          // Deterministic worker failure → throw so retries/onFailure handle refund.
          throw new Error(status.error ?? "clip worker reported failure");
        }
        // "processing" | "not_found" → keep waiting.
        await step.sleep(`wait-${i}`, "10s");
      }
      if (!finalStatus) {
        throw new Error(
          `clip worker polling timed out after ${maxPolls * 10}s (${clipCount} clip(s)) for ${videoId}`
        );
      }
      // Capture in a const so the closure below keeps the narrowed (non-null) type.
      const marker = finalStatus;

      // Persist from the final marker — same rebase + insert logic as the old
      // sync path, just sourced from the polled marker instead of a response.
      clipResult = await step.run("persist-clips", async () => {
        const supabase = createAdminClient();

        const workerClips = marker.clips ?? [];
        const workerFailed = marker.failed ?? [];

        if (workerFailed.length > 0) {
          console.warn(
            `[${videoId}] ${workerFailed.length} clip(s) failed in worker: ` +
              workerFailed.map((f) => `${f.clipId}(${f.error})`).join(", ")
          );
        }

        // Re-read transcript for caption rebasing (kept in DB, not passed through
        // steps). credits_used is read inside refund_video_once, not here.
        const { data: video, error: videoErr } = await supabase
          .from("videos")
          .select("transcript_segments")
          .eq("id", videoId)
          .single();
        if (videoErr || !video) throw new Error(`Video not found: ${videoId}`);

        // Idempotency: clear any prior attempt's rows before re-inserting.
        await supabase.from("clips").delete().eq("video_id", videoId);

        const transcriptData = video.transcript_segments as {
          segments?: Array<{ id?: number; start: number; end: number; text: string }>;
          words?: Array<{ word: string; start: number; end: number }>;
        } | null;
        const allSegments = transcriptData?.segments ?? [];
        const allWords = transcriptData?.words ?? [];

        const clipsWithIds = startResult.clipsWithIds;
        let insertSuccessCount = 0;

        for (const result of workerClips) {
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

        // Worker finished but nothing usable — deterministic failure, skip retry
        // (a thrown status="failed" is the retry path; this means data is bad).
        if (insertSuccessCount === 0) {
          const errorMsg =
            workerClips.length === 0
              ? (marker.error ?? `All ${clipsWithIds.length} clips failed in worker`)
              : `All ${workerClips.length} clip DB inserts failed`;
          // Worker finished but nothing usable, and this branch RETURNs (not
          // throws) so onFailure never fires — refund must happen here. Atomic
          // refund + flip via refund_video_once (exactly-once: the
          // credits_refunded guard prevents a double-refund on step retry).
          await supabase.rpc("refund_video_once", {
            p_video_id: videoId,
            p_error_step: "generate-clips",
            p_error_message: errorMsg,
          });
          return {
            clipsGenerated: 0,
            clipsFailed: workerFailed.length + workerClips.length,
          };
        }

        await supabase.rpc("increment_clips_total", {
          p_user_id: userId,
          p_amount: insertSuccessCount,
        });

        await supabase
          .from("videos")
          .update({ status: "completed", processing_completed_at: new Date().toISOString() })
          .eq("id", videoId);

        return {
          clipsGenerated: insertSuccessCount,
          clipsFailed: workerFailed.length + (workerClips.length - insertSuccessCount),
        };
      });
    }

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
