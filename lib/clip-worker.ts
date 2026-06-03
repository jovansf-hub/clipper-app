// Types mirror clip-worker/src/server.ts — keep in sync if server types change

export interface ClipInput {
  clipId: string;
  startSeconds: number;
  endSeconds: number;
  title: string;
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

const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes — FFmpeg processing can be slow

export async function callClipWorker(
  params: ClipWorkerRequest
): Promise<ClipWorkerResponse> {
  const workerUrl = process.env.CLIP_WORKER_URL;
  const workerSecret = process.env.CLIP_WORKER_SECRET;

  if (!workerUrl) throw new Error("CLIP_WORKER_URL is not set");
  if (!workerSecret) throw new Error("CLIP_WORKER_SECRET is not set");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${workerUrl}/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${workerSecret}`,
      },
      body: JSON.stringify(params),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `clip-worker timed out after ${TIMEOUT_MS / 1000}s for video ${params.videoId}`
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json() as { error?: string };
      detail = body.error ? `: ${body.error}` : "";
    } catch {
      // ignore parse errors — don't leak response body
    }
    throw new Error(
      `clip-worker returned ${response.status} for video ${params.videoId}${detail}`
    );
  }

  return response.json() as Promise<ClipWorkerResponse>;
}
