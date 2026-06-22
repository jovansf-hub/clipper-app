// Types mirror clip-worker/src/server.ts — keep in sync if server types change

import { request, Agent } from "undici";

export interface ClipInput {
  clipId: string;
  startSeconds: number;
  endSeconds: number;
  title: string;
  // Horizontal crop offset (source pixels) from the Vision detect-crop step.
  // Omitted → worker falls back to a center crop.
  cropX?: number;
}

export interface ClipResult {
  clipId: string;
  r2Key: string;
  r2Url: string;
  thumbnailKey: string;
  thumbnailUrl: string;
  durationSeconds: number;
  fileSizeBytes: number;
}

export interface FailedClip {
  clipId: string;
  error: string;
}

export interface ClipWorkerResponse {
  success: boolean;
  clips: ClipResult[];
  failed: FailedClip[];
  processingMs: number;
  error?: string;
}

interface ClipWorkerRequest {
  videoUrl: string;
  videoId: string;
  userId: string;
  clips: ClipInput[];
}

// 202 response from the async POST /process.
export interface StartClipWorkerResult {
  accepted: boolean;
  videoId: string;
  skipped?: boolean;
}

// Shape of the R2 status marker, returned verbatim by GET /status.
export interface StatusMarker {
  status: "processing" | "completed" | "failed" | "not_found";
  startedAt?: number;
  clipCount?: number;
  clips?: ClipResult[];
  failed?: FailedClip[];
  error?: string;
  processingMs?: number;
  clipsTotalMs?: number;
}

// Shape of the async audio-extraction marker (GET /status?phase=audio).
export interface AudioStatusMarker {
  status: "processing" | "completed" | "failed" | "not_found";
  startedAt?: number;
  audioKey?: string;
  audioSizeBytes?: number;
  durationSeconds?: number;
  error?: string;
  processingMs?: number;
}

export interface KeyframeSpec {
  momentId: string;
  midSeconds: number;
}

export interface DetectKeyframesResult {
  width: number;
  height: number;
  keyframes: Array<{ momentId: string; jpegBase64: string }>;
}

// /process is now async: POST returns 202 almost immediately (marker read+write
// then fire-and-forget), so a short timeout suffices. 60s leaves room for a cold
// container readiness wait (~30s bound in worker.ts) without hanging.
const START_PROCESS_TIMEOUT_MS = 60 * 1000;
// GET /status is a cheap R2 read through the container — 30s is plenty.
const STATUS_TIMEOUT_MS = 30 * 1000;

// We call the worker via undici's standalone request() (NOT global fetch): the
// npm undici Agent is incompatible with Next's built-in fetch (which uses Node's
// internal undici) — mixing them throws UND_ERR_INVALID_ARG "invalid
// onRequestStart". request() + this Agent is a self-contained client.
//
// The Agent also raises undici's default headersTimeout (5 min), which otherwise
// fires UND_ERR_HEADERS_TIMEOUT mid-/process before our AbortController deadline,
// to 10 min — so the per-call AbortController is the single cancellation source.
const clipWorkerAgent = new Agent({
  headersTimeout: 10 * 60 * 1000,
  bodyTimeout: 10 * 60 * 1000,
});

// undici rejects an aborted request() with name "AbortError" or its own
// UND_ERR_ABORTED code — match both so the timeout path maps to a clear message.
function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === "AbortError" ||
      (err as { code?: string }).code === "UND_ERR_ABORTED")
  );
}

// Keyframe extraction is one source download + N single-frame seeks — bounded
// at 3 minutes so a slow/hung download fails the step rather than hanging.
const DETECT_KEYFRAMES_TIMEOUT_MS = 3 * 60 * 1000;

// Kick off the async /process job. Expects 202 Accepted (the container runs the
// work in the background and writes progress to an R2 marker). Does NOT wait for
// clips — the caller polls getClipWorkerStatus() until the marker is terminal.
export async function startClipWorker(
  params: ClipWorkerRequest
): Promise<StartClipWorkerResult> {
  const workerUrl = process.env.CLIP_WORKER_URL;
  const workerSecret = process.env.CLIP_WORKER_SECRET;

  if (!workerUrl) throw new Error("CLIP_WORKER_URL is not set");
  if (!workerSecret) throw new Error("CLIP_WORKER_SECRET is not set");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), START_PROCESS_TIMEOUT_MS);

  let statusCode: number;
  let body: Awaited<ReturnType<typeof request>>["body"];
  try {
    ({ statusCode, body } = await request(`${workerUrl}/process`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${workerSecret}`,
      },
      body: JSON.stringify(params),
      signal: controller.signal,
      dispatcher: clipWorkerAgent,
    }));
  } catch (err) {
    if (isAbortError(err)) {
      throw new Error(
        `clip-worker /process start timed out after ${START_PROCESS_TIMEOUT_MS / 1000}s for video ${params.videoId}`
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (statusCode !== 202) {
    let detail = "";
    try {
      const errBody = (await body.json()) as { error?: string };
      detail = errBody.error ? `: ${errBody.error}` : "";
    } catch {
      // ignore parse errors — don't leak response body
    }
    throw new Error(
      `clip-worker /process start returned ${statusCode} (expected 202) for video ${params.videoId}${detail}`
    );
  }

  return (await body.json()) as StartClipWorkerResult;
}

// Poll the async job's status marker through the container. Each call resets the
// container's sleepAfter (keep-alive while the background job runs).
export async function getClipWorkerStatus(
  videoId: string,
  userId: string
): Promise<StatusMarker> {
  const workerUrl = process.env.CLIP_WORKER_URL;
  const workerSecret = process.env.CLIP_WORKER_SECRET;

  if (!workerUrl) throw new Error("CLIP_WORKER_URL is not set");
  if (!workerSecret) throw new Error("CLIP_WORKER_SECRET is not set");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STATUS_TIMEOUT_MS);

  const qs = new URLSearchParams({ videoId, userId }).toString();

  let statusCode: number;
  let body: Awaited<ReturnType<typeof request>>["body"];
  try {
    ({ statusCode, body } = await request(`${workerUrl}/status?${qs}`, {
      method: "GET",
      headers: { authorization: `Bearer ${workerSecret}` },
      signal: controller.signal,
      dispatcher: clipWorkerAgent,
    }));
  } catch (err) {
    if (isAbortError(err)) {
      throw new Error(
        `clip-worker /status timed out after ${STATUS_TIMEOUT_MS / 1000}s for video ${videoId}`
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (statusCode < 200 || statusCode >= 300) {
    // Consume the body so undici returns the socket to the pool (a non-2xx left
    // unread keeps the connection stuck — leaks across the 60 polls per job).
    await body.dump().catch(() => {});
    throw new Error(
      `clip-worker /status returned ${statusCode} for video ${videoId}`
    );
  }

  return (await body.json()) as StatusMarker;
}

export async function callDetectKeyframes(params: {
  videoUrl: string;
  videoId: string;
  userId: string;
  keyframes: KeyframeSpec[];
}): Promise<DetectKeyframesResult> {
  const workerUrl = process.env.CLIP_WORKER_URL;
  const workerSecret = process.env.CLIP_WORKER_SECRET;

  if (!workerUrl) throw new Error("CLIP_WORKER_URL is not set");
  if (!workerSecret) throw new Error("CLIP_WORKER_SECRET is not set");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DETECT_KEYFRAMES_TIMEOUT_MS);

  let statusCode: number;
  let body: Awaited<ReturnType<typeof request>>["body"];
  try {
    ({ statusCode, body } = await request(`${workerUrl}/detect-keyframes`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${workerSecret}`,
      },
      body: JSON.stringify(params),
      signal: controller.signal,
      dispatcher: clipWorkerAgent,
    }));
  } catch (err) {
    if (isAbortError(err)) {
      throw new Error(
        `clip-worker /detect-keyframes timed out after ${DETECT_KEYFRAMES_TIMEOUT_MS / 1000}s for video ${params.videoId}`
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (statusCode < 200 || statusCode >= 300) {
    let detail = "";
    try {
      const errBody = (await body.json()) as { error?: string };
      detail = errBody.error ? `: ${errBody.error}` : "";
    } catch {
      // ignore parse errors — don't leak response body
    }
    throw new Error(
      `clip-worker /detect-keyframes returned ${statusCode} for video ${params.videoId}${detail}`
    );
  }

  return (await body.json()) as DetectKeyframesResult;
}

// Probe the source's real duration via the worker (ffprobe over the presigned
// URL, header-only). Used by /api/upload/complete to gate plan duration limits
// on the actual length before billing. 60s leaves headroom over the worker's
// 45s ffprobe cap for the round trip + cold-start readiness.
const PROBE_DURATION_TIMEOUT_MS = 60 * 1000;

export async function probeDuration(params: {
  videoUrl: string;
  videoId: string;
  userId: string;
}): Promise<{ durationSeconds: number }> {
  const workerUrl = process.env.CLIP_WORKER_URL;
  const workerSecret = process.env.CLIP_WORKER_SECRET;

  if (!workerUrl) throw new Error("CLIP_WORKER_URL is not set");
  if (!workerSecret) throw new Error("CLIP_WORKER_SECRET is not set");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROBE_DURATION_TIMEOUT_MS);

  let statusCode: number;
  let body: Awaited<ReturnType<typeof request>>["body"];
  try {
    ({ statusCode, body } = await request(`${workerUrl}/probe-duration`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${workerSecret}`,
      },
      body: JSON.stringify(params),
      signal: controller.signal,
      dispatcher: clipWorkerAgent,
    }));
  } catch (err) {
    if (isAbortError(err)) {
      throw new Error(
        `clip-worker /probe-duration timed out after ${PROBE_DURATION_TIMEOUT_MS / 1000}s for video ${params.videoId}`
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (statusCode < 200 || statusCode >= 300) {
    await body.dump().catch(() => {});
    throw new Error(
      `clip-worker /probe-duration returned ${statusCode} for video ${params.videoId}`
    );
  }

  return (await body.json()) as { durationSeconds: number };
}

// Kick off the async audio-extraction job. Expects 202 (the container runs
// extractAudio in the background and writes _audio_status.json). Mirror of
// startClipWorker — caller polls getAudioStatus() until the marker is terminal.
export async function startExtractAudio(params: {
  videoUrl: string;
  videoId: string;
  userId: string;
}): Promise<StartClipWorkerResult> {
  const workerUrl = process.env.CLIP_WORKER_URL;
  const workerSecret = process.env.CLIP_WORKER_SECRET;

  if (!workerUrl) throw new Error("CLIP_WORKER_URL is not set");
  if (!workerSecret) throw new Error("CLIP_WORKER_SECRET is not set");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), START_PROCESS_TIMEOUT_MS);

  let statusCode: number;
  let body: Awaited<ReturnType<typeof request>>["body"];
  try {
    ({ statusCode, body } = await request(`${workerUrl}/extract-audio-async`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${workerSecret}`,
      },
      body: JSON.stringify(params),
      signal: controller.signal,
      dispatcher: clipWorkerAgent,
    }));
  } catch (err) {
    if (isAbortError(err)) {
      throw new Error(
        `clip-worker /extract-audio-async start timed out after ${START_PROCESS_TIMEOUT_MS / 1000}s for video ${params.videoId}`
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (statusCode !== 202) {
    let detail = "";
    try {
      const errBody = (await body.json()) as { error?: string };
      detail = errBody.error ? `: ${errBody.error}` : "";
    } catch {
      // ignore parse errors — don't leak response body
    }
    throw new Error(
      `clip-worker /extract-audio-async returned ${statusCode} (expected 202) for video ${params.videoId}${detail}`
    );
  }

  return (await body.json()) as StartClipWorkerResult;
}

// Poll the async audio job's marker via GET /status?phase=audio. Each call resets
// the container's sleepAfter (keep-alive). Mirror of getClipWorkerStatus.
export async function getAudioStatus(
  videoId: string,
  userId: string
): Promise<AudioStatusMarker> {
  const workerUrl = process.env.CLIP_WORKER_URL;
  const workerSecret = process.env.CLIP_WORKER_SECRET;

  if (!workerUrl) throw new Error("CLIP_WORKER_URL is not set");
  if (!workerSecret) throw new Error("CLIP_WORKER_SECRET is not set");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STATUS_TIMEOUT_MS);

  const qs = new URLSearchParams({ videoId, userId, phase: "audio" }).toString();

  let statusCode: number;
  let body: Awaited<ReturnType<typeof request>>["body"];
  try {
    ({ statusCode, body } = await request(`${workerUrl}/status?${qs}`, {
      method: "GET",
      headers: { authorization: `Bearer ${workerSecret}` },
      signal: controller.signal,
      dispatcher: clipWorkerAgent,
    }));
  } catch (err) {
    if (isAbortError(err)) {
      throw new Error(
        `clip-worker /status?phase=audio timed out after ${STATUS_TIMEOUT_MS / 1000}s for video ${videoId}`
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (statusCode < 200 || statusCode >= 300) {
    // Consume the body so undici returns the socket to the pool (non-2xx leak).
    await body.dump().catch(() => {});
    throw new Error(
      `clip-worker /status?phase=audio returned ${statusCode} for video ${videoId}`
    );
  }

  return (await body.json()) as AudioStatusMarker;
}
