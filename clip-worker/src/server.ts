import { AwsClient } from "aws4fetch";
import { rm, mkdir } from "fs/promises";
import { existsSync } from "fs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClipConfig {
  clipId: string;
  startSeconds: number;
  endSeconds: number;
  title: string;
  // Optional horizontal crop offset (source pixels) computed upstream by the
  // Claude Vision detect-crop step. When absent, falls back to a center crop.
  cropX?: number;
}

interface ClipRequest {
  videoUrl: string;
  videoId: string;
  userId: string;
  clips: ClipConfig[];
  config?: {
    crf?: number;
    preset?: string;
  };
}

interface ClipResult {
  clipId: string;
  r2Key: string;
  r2Url: string;         // NOTE: not publicly accessible until presigned URLs added
  thumbnailKey: string;
  thumbnailUrl: string;
  durationSeconds: number;
  fileSizeBytes: number;
}

interface FailedClip {
  clipId: string;
  error: string;
}

interface ClipResponse {
  success: boolean;
  clips: ClipResult[];
  failed: FailedClip[];
  processingMs: number;
  clipsTotalMs?: number; // total wall-clock of the clip-encode phase (telemetry)
  error?: string;
}

interface ExtractAudioRequest {
  videoUrl: string;
  videoId: string;
  userId: string;
}

interface KeyframeSpec {
  momentId: string;
  midSeconds: number;
}

interface DetectKeyframesRequest {
  videoUrl: string;
  videoId: string;
  userId: string;
  keyframes: KeyframeSpec[];
}

interface DetectKeyframesResponse {
  width: number;
  height: number;
  // One entry per successfully-extracted keyframe (a frame that fails to extract
  // is omitted; the caller treats a missing momentId as "center crop").
  keyframes: Array<{ momentId: string; jpegBase64: string }>;
}

interface ExtractAudioTimings {
  downloadMs: number;
  ffmpegMs: number;
  uploadMs: number;
  totalMs: number;
  sourceBytes: number;
}

interface ExtractAudioResponse {
  audioKey: string;
  audioSizeBytes: number;
  durationSeconds: number;
  timings: ExtractAudioTimings;
}

// ---------------------------------------------------------------------------
// P0: Input validation + sanitization
// ---------------------------------------------------------------------------

const ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const MAX_CLIPS = 15;
const MAX_CLIP_DURATION_S = 120;
const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024; // 2GB
const ALLOWED_URL_DOMAINS = [".supabase.co", ".r2.cloudflarestorage.com"];

// P0 PT1/PT2/PT3: Reject any id that could escape /tmp/ or pollute R2 keys.
// Allowlist: alphanumeric + dash + underscore, 1-128 chars. No dots, slashes, or whitespace.
function sanitizeId(id: string, field: string): string {
  if (typeof id !== "string" || !ID_REGEX.test(id)) {
    throw new Error(`Invalid ${field}: must match [a-zA-Z0-9_-]{1,128}`);
  }
  return id;
}

// P0 SS1: Only HTTPS from known Supabase/R2 domains. Blocks metadata endpoints,
// loopback, private ranges, and file:// URIs.
function validateVideoUrl(rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid videoUrl: malformed URL");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Invalid videoUrl: only HTTPS allowed");
  }
  if (!ALLOWED_URL_DOMAINS.some(d => parsed.hostname.endsWith(d))) {
    throw new Error(`Invalid videoUrl: domain "${parsed.hostname}" not in allowlist`);
  }
}

// P0 V2/D3: Per-clip semantic validation.
function validateClip(clip: ClipConfig, index: number): void {
  if (typeof clip.startSeconds !== "number" || !isFinite(clip.startSeconds) || clip.startSeconds < 0) {
    throw new Error(`clip[${index}].startSeconds must be a non-negative finite number`);
  }
  if (typeof clip.endSeconds !== "number" || !isFinite(clip.endSeconds) || clip.endSeconds <= clip.startSeconds) {
    throw new Error(`clip[${index}].endSeconds must be a finite number greater than startSeconds`);
  }
  if (clip.endSeconds - clip.startSeconds > MAX_CLIP_DURATION_S) {
    throw new Error(`clip[${index}] duration ${clip.endSeconds - clip.startSeconds}s exceeds max ${MAX_CLIP_DURATION_S}s`);
  }
}

// ---------------------------------------------------------------------------
// R2 client — reads credentials from process.env (injected via Worker envVars)
// ---------------------------------------------------------------------------

function getR2Client(): AwsClient {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("R2_ACCESS_KEY_ID or R2_SECRET_ACCESS_KEY not set");
  }

  return new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: "s3",
    region: "auto",
  });
}

function getR2Config(): { endpoint: string; bucket: string } {
  const endpoint = process.env.R2_ENDPOINT;
  const bucket = process.env.R2_BUCKET;

  if (!endpoint || !bucket) {
    throw new Error("R2_ENDPOINT or R2_BUCKET not set");
  }

  return { endpoint: endpoint.replace(/\/$/, ""), bucket };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Timeouts that turn a silent hang into a clean error so the caller's `finally`
// can delete the temp dir. ffmpeg default covers a legit clip encode (up to
// MAX_CLIP_DURATION_S at veryfast on ½ vCPU ≈ 90–180s) while killing a true hang
// faster than the old 5-min ceiling; short ops pass a tighter value. ffprobe,
// download, and R2 upload are bounded too — uploadToR2 had no timeout, which
// could hang processClips forever and leave _status.json stuck "processing".
const FFMPEG_DEFAULT_TIMEOUT_MS = 180_000; // 3 min — clip encode + thumbnail
const FFPROBE_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;
const R2_UPLOAD_TIMEOUT_MS = 120_000;
const R2_FETCH_TIMEOUT_MS = 10_000; // small R2 metadata ops (markers, status, breadcrumbs)
const DRAIN_GUARD_MS = 5_000; // cap on post-exit stderr/stdout drain
const PROGRESS_INTERVAL_BYTES = 5 * 1024 * 1024; // download_progress breadcrumb cadence

// Gates all diagnostic R2 phase breadcrumbs (_ea/_dk/_cl_phase.json) and the
// [timing] logs. Off by default → zero R2 overhead in production. Flip to "true"
// (Worker secret/var, injected into the container via worker.ts envVars) and
// redeploy to re-enable phase tracing without touching code.
const DEBUG_PHASE_MARKERS = process.env.DEBUG_PHASE_MARKERS === "true";

// Resolves (never rejects) after `ms` — used to bound an otherwise-unbounded await.
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function downloadVideo(
  url: string,
  destPath: string,
  timeoutMs = DOWNLOAD_TIMEOUT_MS,
  onProgress?: (received: number) => void | Promise<void>,
): Promise<void> {
  // GUARANTEED cut. A half-open socket stall makes Bun's native body sink block
  // on a read that AbortController alone does NOT interrupt — so we (a) read the
  // body manually via a reader we can cancel(), and (b) wrap the whole download
  // in Promise.race against a timer that THROWS. Even if the native read still
  // blocks, the race rejects at timeoutMs → throw → caller's catch writes an
  // error marker and finally cleans temp, instead of hanging forever.
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();              // best-effort: cancel the fetch
      reader?.cancel().catch(() => {}); // best-effort: unblock the manual read
      reject(new Error(`Video download timeout after ${timeoutMs / 1000}s`));
    }, timeoutMs);
  });

  const downloadInner = async (): Promise<void> => {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Video download failed: ${response.status} ${response.statusText}`);
    }

    // P0 D1: Reject oversized videos before writing to disk.
    // Content-Length may be absent for chunked transfers — allow those but log.
    const contentLengthHeader = response.headers.get("content-length");
    if (contentLengthHeader !== null) {
      const contentLength = parseInt(contentLengthHeader, 10);
      if (isNaN(contentLength) || contentLength > MAX_VIDEO_BYTES) {
        throw new Error(`Video too large (Content-Length: ${contentLengthHeader}, max ${MAX_VIDEO_BYTES}B)`);
      }
    }
    if (!response.body) {
      throw new Error("Video download failed: empty response body");
    }

    // Manual streamed read → WE control cancellation + can emit progress.
    reader = response.body.getReader();
    const writer = Bun.file(destPath).writer();
    let received = 0;
    let nextProgressAt = 1; // fire onProgress on the very first byte, then every interval
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        writer.write(value);
        received += value.byteLength;
        // D1 hard cap even when Content-Length is absent (chunked transfer).
        if (received > MAX_VIDEO_BYTES) {
          throw new Error(`Video too large (streamed > ${MAX_VIDEO_BYTES}B)`);
        }
        if (onProgress && received >= nextProgressAt) {
          await onProgress(received);
          nextProgressAt = received + PROGRESS_INTERVAL_BYTES;
        }
      }
    } finally {
      try { await writer.end(); } catch { /* best-effort flush+close */ }
      try { reader.releaseLock(); } catch { /* already released/cancelled */ }
    }
  };

  // Swallow a late rejection from the losing branch so the timeout path doesn't
  // surface an unhandledRejection once the race has already settled.
  const inner = downloadInner();
  inner.catch(() => {});
  try {
    await Promise.race([inner, timeoutPromise]);
  } catch (err) {
    if (timedOut || (err instanceof Error && err.name === "AbortError")) {
      throw new Error(`Video download timeout after ${timeoutMs / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function runFFmpeg(
  args: string[],
  timeoutMs = FFMPEG_DEFAULT_TIMEOUT_MS,
): Promise<void> {
  // Array-based exec (not shell) — no shell injection possible regardless of arg content
  const proc = Bun.spawn(["ffmpeg", "-y", ...args], {
    stdout: "ignore", // we never read ffmpeg stdout — don't pipe it
    stderr: "pipe",
  });

  // Hard kill: a stuck ffmpeg (malformed input, deadlock) would otherwise never
  // exit and hang the handler forever. SIGKILL makes proc.exited resolve so the
  // caller's finally cleans temp; we surface a clear timeout error below.
  let killedByTimeout = false;
  const killTimer = setTimeout(() => {
    killedByTimeout = true;
    proc.kill("SIGKILL");
  }, timeoutMs);

  // Drain stderr CONCURRENTLY while ffmpeg runs. ffmpeg is extremely chatty on
  // stderr (progress/stats); if nothing reads it the OS pipe buffer (~64KB)
  // fills, ffmpeg blocks on write(), and proc.exited never resolves. We keep
  // only the tail (capped) for the error message, so memory stays bounded.
  const STDERR_CAP = 8192;
  let stderrTail = "";
  const reader = (proc.stderr as ReadableStream<Uint8Array>).getReader();
  const drain = (async () => {
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        stderrTail += decoder.decode(value, { stream: true });
        if (stderrTail.length > STDERR_CAP) stderrTail = stderrTail.slice(-STDERR_CAP);
      }
    } finally {
      reader.releaseLock();
    }
  })();

  let exitCode: number;
  try {
    exitCode = await proc.exited;
  } finally {
    clearTimeout(killTimer);
  }

  // Bound the drain: once the process has exited all stderr is already produced,
  // so this finishes near-instantly. But on some Bun/stream versions the reader
  // can fail to observe EOF (lingering inherited pipe fd), making `await drain`
  // hang forever and freezing the handler past the client timeout. stderrTail is
  // only used in the error message below, so cap the wait, then cancel the
  // reader (releases the lock/stream) and move on. Success (exit 0) never reads
  // stderrTail, so a truncated tail cannot change the happy-path result.
  const drainSettled = await Promise.race([
    drain.then(() => true).catch(() => true),
    delay(DRAIN_GUARD_MS).then(() => false),
  ]);
  if (!drainSettled) {
    await reader.cancel().catch(() => {});
  }

  if (killedByTimeout) {
    throw new Error(`FFmpeg timeout after ${timeoutMs / 1000}s (killed)`);
  }
  if (exitCode !== 0) {
    throw new Error(`FFmpeg failed (exit ${exitCode}): ${stderrTail.slice(-1000)}`);
  }
}

// Run an ffprobe-style command and return trimmed stdout (empty string on
// failure/timeout — callers degrade: getClipDuration → 0, getVideoDimensions →
// throws "could not probe"). Reads stdout AND drains stderr CONCURRENTLY (never
// after exited) so neither pipe can fill and deadlock the process, with the same
// hard-kill timeout + bounded drain as runFFmpeg.
async function probeStdout(args: string[], timeoutMs = FFPROBE_TIMEOUT_MS): Promise<string> {
  const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });

  const killTimer = setTimeout(() => proc.kill("SIGKILL"), timeoutMs);

  // Start consuming both pipes immediately (concurrent with the process).
  const stdoutPromise = new Response(proc.stdout).text();
  const stderrPromise = new Response(proc.stderr).text();

  try {
    await proc.exited;
  } finally {
    clearTimeout(killTimer);
  }

  // Bound both collections so a never-closing pipe can't hang us.
  const stdout = await Promise.race([
    stdoutPromise.catch(() => ""),
    delay(DRAIN_GUARD_MS).then(() => ""),
  ]);
  await Promise.race([stderrPromise.catch(() => ""), delay(DRAIN_GUARD_MS).then(() => "")]);

  return stdout.trim();
}

async function getClipDuration(filePath: string): Promise<number> {
  const output = await probeStdout([
    "ffprobe", "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  return parseFloat(output) || 0;
}

// Probe the source's pixel dimensions once so the 9:16 crop window can be
// computed with concrete integers (needed for face-aware offsets). Throws on
// failure; the caller degrades to the legacy expression-based center crop.
async function getVideoDimensions(filePath: string): Promise<{ width: number; height: number }> {
  const output = await probeStdout([
    "ffprobe", "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height",
    "-of", "csv=p=0:s=x",
    filePath,
  ]);
  const [w, h] = output.split("x").map((s) => parseInt(s, 10));
  if (!w || !h || isNaN(w) || isNaN(h)) {
    throw new Error(`Could not probe video dimensions (got "${output}")`);
  }
  return { width: w, height: h };
}

// Round down to nearest even int — keeps crop dims chroma-aligned (yuv420).
function even(n: number): number {
  const i = Math.floor(n);
  return i - (i % 2);
}

// JS mirror of detect_face.py's center-crop math. Used when face detection is
// unavailable or fails, and handles the vertical-source edge case (a 9:16
// window wider than the frame → use full width, x=0).
function centerCrop(iw: number, ih: number): { cropW: number; x: number } {
  const cw = even((ih * 9) / 16);
  if (cw <= 0 || iw <= cw) return { cropW: even(iw), x: 0 };
  return { cropW: cw, x: even((iw - cw) / 2) };
}

// Clamp an upstream-provided crop offset into the valid range for the given
// crop window. Returns an even integer. Used by /process when the caller passes
// a Vision-computed cropX. For a vertical/narrow source cropW === iw, so maxX
// is 0 and x clamps to 0.
function clampCropX(cropX: number, iw: number, cropW: number): number {
  const maxX = Math.max(0, iw - cropW);
  return even(Math.max(0, Math.min(cropX, maxX)));
}

async function uploadToR2(
  r2Client: AwsClient,
  endpoint: string,
  bucket: string,
  key: string,
  filePath: string,
  contentType: string,
): Promise<void> {
  const url = `${endpoint}/${bucket}/${key}`;

  const file = Bun.file(filePath);
  const buffer = await file.arrayBuffer();

  // Bound the PUT: without this a stalled R2 connection hangs processClips
  // forever (no kill, no throw), leaving the clip unfinished and the _status.json
  // marker stuck "processing" with no final marker. On timeout we throw, the
  // clip-encode loop records a failed clip and continues, and the job still
  // writes a terminal marker. AbortController is forwarded to fetch by aws4fetch.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), R2_UPLOAD_TIMEOUT_MS);
  let response: Response;
  try {
    response = await r2Client.fetch(url, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: buffer,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`R2 upload timeout after ${R2_UPLOAD_TIMEOUT_MS / 1000}s [${key}]`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`R2 upload failed [${key}] (${response.status})`);
  }
}

// Bound a small R2 metadata fetch (marker read/write, status, breadcrumbs) with
// a short timeout so a hung R2 connection becomes an error instead of hanging the
// handler (and accumulating across polls). Success behavior is unchanged — it
// only adds the abort signal. uploadToR2 keeps its own larger budget.
async function r2FetchWithTimeout(
  r2Client: AwsClient,
  url: string,
  init: RequestInit,
  timeoutMs = R2_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await r2Client.fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`R2 request timeout after ${timeoutMs / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Read an object body from R2 as a string. Returns null on 404 (missing key).
// Same AWS4-signed pattern as uploadToR2, but a GET. Used for the async-job
// status marker (idempotency check + GET /status).
async function readFromR2(key: string): Promise<string | null> {
  const r2Client = getR2Client();
  const { endpoint, bucket } = getR2Config();
  const url = `${endpoint}/${bucket}/${key}`;

  const response = await r2FetchWithTimeout(r2Client, url, { method: "GET" });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`R2 read failed [${key}] (${response.status})`);
  }
  return await response.text();
}

// Write the async-job status marker as JSON at clips/{userId}/{videoId}/_status.json.
// Reuses the uploadToR2 PUT pattern (inline body instead of a file).
async function writeStatusMarker(
  userId: string,
  videoId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const r2Client = getR2Client();
  const { endpoint, bucket } = getR2Config();
  const key = `clips/${userId}/${videoId}/_status.json`;
  const url = `${endpoint}/${bucket}/${key}`;

  const response = await r2FetchWithTimeout(r2Client, url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`R2 status marker write failed [${key}] (${response.status})`);
  }
}

// [EA-DBG] Best-effort phase breadcrumb for /extract-audio. Writes {phase, ts}
// to clips/{userId}/{videoId}/_ea_phase.json so we can see where a hung job
// stalls WITHOUT relying on container stdout (which doesn't reliably reach
// `wrangler tail`). NEVER throws — a breadcrumb failure must not affect the job.
async function writeEaPhase(
  userId: string,
  videoId: string,
  phase: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  if (!DEBUG_PHASE_MARKERS) return;
  try {
    const r2Client = getR2Client();
    const { endpoint, bucket } = getR2Config();
    const key = `clips/${userId}/${videoId}/_ea_phase.json`;
    const url = `${endpoint}/${bucket}/${key}`;
    await r2FetchWithTimeout(r2Client, url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase, ts: Date.now(), ...extra }),
    });
  } catch {
    // best-effort — swallow everything
  }
}

// [DK-DBG] Best-effort phase breadcrumb for /detect-keyframes — same pattern as
// writeEaPhase but writes clips/{userId}/{videoId}/_dk_phase.json. NEVER throws.
async function writeDkPhase(
  userId: string,
  videoId: string,
  phase: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  if (!DEBUG_PHASE_MARKERS) return;
  try {
    const r2Client = getR2Client();
    const { endpoint, bucket } = getR2Config();
    const key = `clips/${userId}/${videoId}/_dk_phase.json`;
    const url = `${endpoint}/${bucket}/${key}`;
    await r2FetchWithTimeout(r2Client, url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase, ts: Date.now(), ...extra }),
    });
  } catch {
    // best-effort — swallow everything
  }
}

// [CL-DBG] Best-effort phase breadcrumb for /process clip-encode — same pattern
// as writeDkPhase but writes clips/{userId}/{videoId}/_cl_phase.json. NEVER throws.
async function writeClPhase(
  userId: string,
  videoId: string,
  phase: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  if (!DEBUG_PHASE_MARKERS) return;
  try {
    const r2Client = getR2Client();
    const { endpoint, bucket } = getR2Config();
    const key = `clips/${userId}/${videoId}/_cl_phase.json`;
    const url = `${endpoint}/${bucket}/${key}`;
    await r2FetchWithTimeout(r2Client, url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase, ts: Date.now(), ...extra }),
    });
  } catch {
    // best-effort — swallow everything
  }
}

// ---------------------------------------------------------------------------
// Core processing logic
// ---------------------------------------------------------------------------

// Max simultaneous clip encodes. Back to 1 (sequential): on standard-1 (1/2
// vCPU) concurrency 2 was a net regression — two ffmpeg processes contended for
// half a core AND for disk reads of the same source, making everything slower.
// A single encode already saturates the core, so sequential is fastest here.
// Revisit upward only on a larger instance_type (standard-2 = 1 vCPU → 2-3).
const CLIP_CONCURRENCY = 1;

// Bounded-concurrency map: runs `fn` over `items` with at most `limit` in flight,
// preserving input order in the result. No external deps — N persistent workers
// pull from a shared cursor. `fn` must handle its own errors (see caller).
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  };
  const n = Math.min(Math.max(1, limit), items.length || 1);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

async function processClips(
  req: ClipRequest
): Promise<{ results: ClipResult[]; failed: FailedClip[]; clipsTotalMs: number }> {
  // IDs are pre-sanitized by the handler — safe to use directly in paths.
  const tmpDir = `/tmp/${req.videoId}`;
  const inputPath = `${tmpDir}/source`;

  // P1 PT3: r2BaseKey generated server-side from sanitized userId/videoId.
  // Never accepted from the caller — prevents arbitrary R2 key injection.
  const r2BaseKey = `clips/${req.userId}/${req.videoId}`;

  if (!existsSync(tmpDir)) {
    await mkdir(tmpDir, { recursive: true });
  }

  try {
    console.log(`[${req.videoId}] Downloading source video...`);
    await downloadVideo(req.videoUrl, inputPath);
    console.log(`[${req.videoId}] Download complete. Processing ${req.clips.length} clip(s)...`);

    // Probe source dimensions once for face-aware cropping. On failure, fall
    // back to the legacy expression-based center crop (no smart crop).
    let dimensions: { width: number; height: number } | null = null;
    try {
      dimensions = await getVideoDimensions(inputPath);
      console.log(`[${req.videoId}] Source dimensions: ${dimensions.width}x${dimensions.height}`);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "unknown";
      console.error(`[${req.videoId}] Dimension probe failed (${detail}) — using legacy center crop`);
    }

    const r2Client = getR2Client();
    const { endpoint, bucket } = getR2Config();
    const crf = req.config?.crf ?? 23;
    // veryfast (2 steps faster than "fast"): ~30-40% quicker x264 encode for a
    // negligible quality delta at CRF 23 on 1080x1920 social clips. Biggest free
    // win on the most expensive step. Caller can still override via req.config.
    const preset = req.config?.preset ?? "veryfast";

    // Encode one clip end-to-end (cut+crop+scale → thumbnail → probe → R2 upload).
    // Self-contained so it can run concurrently; throws on any failure (the pool
    // caller catches and records it as a failed clip — partial-results preserved).
    const processOneClip = async (clip: (typeof req.clips)[number], index: number): Promise<ClipResult> => {
      console.log(`[${req.videoId}] Clip ${clip.clipId}: ${clip.startSeconds}s → ${clip.endSeconds}s`);
      await writeClPhase(req.userId, req.videoId, "clip_start", { index, clipId: clip.clipId });

      const clipPath = `${tmpDir}/${clip.clipId}.mp4`;
      const thumbPath = `${tmpDir}/${clip.clipId}_thumb.jpg`;

      // Cut segment + 9:16 crop + scale to 1080x1920.
      // Smart crop: when dimensions are known, use the upstream Vision-computed
      // cropX (clamped into frame) to centre the 9:16 window on the subject;
      // fall back to a center crop when no cropX is provided. Without known
      // dimensions, use the legacy expression-based center crop. scale params
      // stay identical either way.
      let cropFilter: string;
      if (dimensions) {
        const { cropW, x: centerX } = centerCrop(dimensions.width, dimensions.height);
        const hasCropX = typeof clip.cropX === "number" && isFinite(clip.cropX);
        const x = hasCropX ? clampCropX(clip.cropX!, dimensions.width, cropW) : centerX;
        console.log(
          `[${req.videoId}] Clip ${clip.clipId}: crop ${hasCropX ? "vision" : "center"} cropW=${cropW} x=${x}`
        );
        cropFilter = `crop=${cropW}:${dimensions.height}:${x}:0`;
      } else {
        cropFilter = `crop=ih*9/16:ih:(iw-ih*9/16)/2:0`;
      }

      // Fast (input) seek: -ss BEFORE -i jumps to the nearest keyframe instead of
      // decoding the source from 0 for every clip (the old output-seek cost that
      // dominated runtime). Because -ss is now before -i, -to (absolute) is wrong
      // here — use -t (segment duration) measured from the seek point. Trade-off:
      // the cut starts at the nearest keyframe ≤ startSeconds, so it can begin a
      // few frames early. Acceptable for MVP; for frame-exact, add a small output
      // -ss after -i to fine-tune.
      const segmentDuration = clip.endSeconds - clip.startSeconds;
      await writeClPhase(req.userId, req.videoId, "clip_ffmpeg_start", { index });
      await runFFmpeg([
        "-ss", String(clip.startSeconds),
        "-i", inputPath,
        "-t", String(segmentDuration),
        "-vf", `${cropFilter},scale=1080:1920:flags=lanczos`,
        "-c:v", "libx264",
        "-preset", preset,
        "-crf", String(crf),
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        clipPath,
      ]);

      // Thumbnail: grab frame at 1 second into the clip
      await runFFmpeg([
        "-i", clipPath,
        "-ss", "00:00:01",
        "-vframes", "1",
        "-q:v", "2",
        thumbPath,
      ]);
      await writeClPhase(req.userId, req.videoId, "clip_ffmpeg_done", { index });

      const durationSeconds = await getClipDuration(clipPath);
      const fileSizeBytes = Bun.file(clipPath).size;

      const clipKey = `${r2BaseKey}/${clip.clipId}.mp4`;
      const thumbKey = `${r2BaseKey}/${clip.clipId}_thumb.jpg`;

      await writeClPhase(req.userId, req.videoId, "clip_upload_start", { index, fileSizeBytes });
      await uploadToR2(r2Client, endpoint, bucket, clipKey, clipPath, "video/mp4");
      await uploadToR2(r2Client, endpoint, bucket, thumbKey, thumbPath, "image/jpeg");
      await writeClPhase(req.userId, req.videoId, "clip_upload_done", { index });

      console.log(`[${req.videoId}] Clip ${clip.clipId} uploaded to R2 (${(fileSizeBytes / 1024 / 1024).toFixed(1)}MB)`);

      return {
        clipId: clip.clipId,
        r2Key: clipKey,
        r2Url: `${endpoint}/${bucket}/${clipKey}`,
        thumbnailKey: thumbKey,
        thumbnailUrl: `${endpoint}/${bucket}/${thumbKey}`,
        durationSeconds,
        fileSizeBytes,
      };
    };

    // Run clips with bounded concurrency. Each task wraps its own failure so one
    // bad clip never aborts the others (partial-results preserved as before).
    // Measure the clip-encode phase wall-clock (reported as clipsTotalMs).
    const clipsStart = Date.now();
    const settled = await mapWithConcurrency(req.clips, CLIP_CONCURRENCY, async (clip, index) => {
      try {
        return { ok: true as const, result: await processOneClip(clip, index) };
      } catch (err) {
        const detail = err instanceof Error ? err.message : "Unknown error";
        await writeClPhase(req.userId, req.videoId, "clip_error", { index, message: detail });
        console.error(`[${req.videoId}] Clip ${clip.clipId} failed: ${detail}`);
        return { ok: false as const, failed: { clipId: clip.clipId, error: "Processing failed" } };
      }
    });
    const clipsTotalMs = Date.now() - clipsStart;

    const results: ClipResult[] = [];
    const failed: FailedClip[] = [];
    for (const s of settled) {
      if (s.ok) results.push(s.result);
      else failed.push(s.failed);
    }

    return { results, failed, clipsTotalMs };
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Audio extraction — downsample source to a small Opus file for Groq Whisper.
// Whisper internally resamples to 16kHz; mono Opus @ 32kbps keeps a 30-min
// video around ~7MB, well under Groq's 25MB upload cap.
// ---------------------------------------------------------------------------

async function extractAudio(req: ExtractAudioRequest): Promise<ExtractAudioResponse> {
  // IDs are pre-sanitized by the handler — safe to use directly in paths.
  const tmpDir = `/tmp/${req.videoId}`;
  const inputPath = `${tmpDir}/source`;
  const audioPath = `${tmpDir}/audio.ogg`;

  // Key generated server-side from sanitized userId/videoId — never from caller.
  const audioKey = `sources/${req.userId}/${req.videoId}.audio.ogg`;

  if (!existsSync(tmpDir)) {
    await mkdir(tmpDir, { recursive: true });
  }

  const totalStart = Date.now();
  try {
    // --- Phase 1: download source from R2/Supabase ---
    console.log(`[${req.videoId}] Downloading source for audio extraction...`);
    await writeEaPhase(req.userId, req.videoId, "download_start");
    const downloadStart = Date.now();
    await downloadVideo(req.videoUrl, inputPath, DOWNLOAD_TIMEOUT_MS, async (received) => {
      await writeEaPhase(req.userId, req.videoId, "download_progress", { received });
    });
    const downloadMs = Date.now() - downloadStart;
    const sourceBytes = Bun.file(inputPath).size;
    await writeEaPhase(req.userId, req.videoId, "download_done", { bytes: sourceBytes });
    if (DEBUG_PHASE_MARKERS) {
      console.log(
        `[${req.videoId}] [timing] download=${downloadMs}ms source=${(sourceBytes / 1024 / 1024).toFixed(1)}MB`
      );
    }

    // --- Phase 2: ffmpeg downsample to Opus ---
    console.log(`[${req.videoId}] Extracting audio (Opus 16kHz mono 32k)...`);
    await writeEaPhase(req.userId, req.videoId, "ffmpeg_start");
    const ffmpegStart = Date.now();
    await runFFmpeg([
      "-i", inputPath,
      "-vn",
      "-ac", "1",
      "-ar", "16000",
      "-c:a", "libopus",
      "-b:a", "32k",
      "-application", "voip",
      audioPath,
    ], 120_000);
    const ffmpegMs = Date.now() - ffmpegStart;
    await writeEaPhase(req.userId, req.videoId, "ffmpeg_done", { ffmpegMs });
    if (DEBUG_PHASE_MARKERS) console.log(`[${req.videoId}] [timing] ffmpeg=${ffmpegMs}ms`);

    const durationSeconds = await getClipDuration(audioPath);
    const audioSizeBytes = Bun.file(audioPath).size;

    // --- Phase 3: upload audio to R2 ---
    const r2Client = getR2Client();
    const { endpoint, bucket } = getR2Config();
    await writeEaPhase(req.userId, req.videoId, "upload_start", { audioKey });
    const uploadStart = Date.now();
    await uploadToR2(r2Client, endpoint, bucket, audioKey, audioPath, "audio/ogg");
    const uploadMs = Date.now() - uploadStart;
    await writeEaPhase(req.userId, req.videoId, "upload_done", { audioSizeBytes: Bun.file(audioPath).size });

    const totalMs = Date.now() - totalStart;
    if (DEBUG_PHASE_MARKERS) {
      console.log(
        `[${req.videoId}] [timing] upload=${uploadMs}ms audio=${(audioSizeBytes / 1024 / 1024).toFixed(1)}MB`
      );
      console.log(
        `[${req.videoId}] [timing] TOTAL=${totalMs}ms (download=${downloadMs} ffmpeg=${ffmpegMs} upload=${uploadMs})`
      );
    }
    console.log(
      `[${req.videoId}] Audio uploaded to R2 (${(audioSizeBytes / 1024 / 1024).toFixed(1)}MB, ${durationSeconds.toFixed(0)}s)`
    );

    return {
      audioKey,
      audioSizeBytes,
      durationSeconds,
      timings: { downloadMs, ffmpegMs, uploadMs, totalMs, sourceBytes },
    };
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

function validateExtractAudioRequest(body: unknown): body is ExtractAudioRequest {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.videoUrl === "string" &&
    typeof b.videoId === "string" &&
    typeof b.userId === "string"
  );
}

// ---------------------------------------------------------------------------
// Keyframe extraction — sample one frame per viral moment and return it as a
// base64 JPEG plus the source dimensions, so the upstream Inngest detect-crop
// step can run Claude Vision and compute a crop offset. Source is downloaded
// once; a frame that fails to extract is simply omitted from the result.
// ---------------------------------------------------------------------------

async function extractKeyframes(req: DetectKeyframesRequest): Promise<DetectKeyframesResponse> {
  // Separate tmp dir from /process (`-kf` suffix) so a concurrent clip job for
  // the same videoId can't clobber these files. IDs are pre-sanitized.
  const tmpDir = `/tmp/${req.videoId}-kf`;
  const inputPath = `${tmpDir}/source`;

  if (!existsSync(tmpDir)) {
    await mkdir(tmpDir, { recursive: true });
  }

  try {
    console.log(`[${req.videoId}] Downloading source for keyframe extraction...`);
    await writeDkPhase(req.userId, req.videoId, "download_start");
    await downloadVideo(req.videoUrl, inputPath);
    await writeDkPhase(req.userId, req.videoId, "download_done", { bytes: Bun.file(inputPath).size });

    await writeDkPhase(req.userId, req.videoId, "dimensions_start");
    const { width, height } = await getVideoDimensions(inputPath);
    await writeDkPhase(req.userId, req.videoId, "dimensions_done", { width, height, frames: req.keyframes.length });
    console.log(`[${req.videoId}] Keyframes: ${width}x${height}, ${req.keyframes.length} moment(s)`);

    const out: Array<{ momentId: string; jpegBase64: string }> = [];
    for (const [i, kf] of req.keyframes.entries()) {
      const framePath = `${tmpDir}/${kf.momentId}.jpg`;
      try {
        await writeDkPhase(req.userId, req.videoId, "frame_start", { index: i, momentId: kf.momentId });
        // Fast seek + single frame. Downscale long-landscape frames to ~1280px
        // wide to bound payload/token cost (crop is a fraction, so scaling is
        // lossless for the decision). Comma in the expression is escaped so the
        // filtergraph parser doesn't read it as a filter separator.
        await runFFmpeg([
          "-ss", String(kf.midSeconds),
          "-i", inputPath,
          "-frames:v", "1",
          "-vf", "scale=min(1280\\,iw):-2",
          "-q:v", "3",
          framePath,
        ], 60_000);
        const bytes = await Bun.file(framePath).arrayBuffer();
        out.push({ momentId: kf.momentId, jpegBase64: Buffer.from(bytes).toString("base64") });
        await writeDkPhase(req.userId, req.videoId, "frame_done", { index: i });
      } catch (err) {
        const detail = err instanceof Error ? err.message : "unknown";
        await writeDkPhase(req.userId, req.videoId, "frame_error", { index: i, message: detail });
        console.error(`[${req.videoId}] keyframe ${kf.momentId} failed: ${detail}`);
      } finally {
        await rm(framePath, { force: true }).catch(() => {});
      }
    }

    return { width, height, keyframes: out };
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

function validateDetectKeyframesRequest(body: unknown): body is DetectKeyframesRequest {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (
    typeof b.videoUrl !== "string" ||
    typeof b.videoId !== "string" ||
    typeof b.userId !== "string" ||
    !Array.isArray(b.keyframes) ||
    b.keyframes.length < 1 ||
    b.keyframes.length > MAX_CLIPS
  ) return false;

  for (const kf of b.keyframes) {
    if (!kf || typeof kf !== "object") return false;
    const k = kf as Record<string, unknown>;
    if (
      typeof k.momentId !== "string" ||
      typeof k.midSeconds !== "number" ||
      !isFinite(k.midSeconds) ||
      k.midSeconds < 0
    ) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Bun HTTP server
// ---------------------------------------------------------------------------

// P0 V1/D2: clips capped at MAX_CLIPS. Also type-checks each clip object
// so validateClip() can safely cast types without re-checking.
function validateRequest(body: unknown): body is ClipRequest {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;

  if (
    typeof b.videoUrl !== "string" ||
    typeof b.videoId !== "string" ||
    typeof b.userId !== "string" ||
    !Array.isArray(b.clips) ||
    b.clips.length < 1 ||
    b.clips.length > MAX_CLIPS
  ) return false;

  for (const clip of b.clips) {
    if (!clip || typeof clip !== "object") return false;
    const c = clip as Record<string, unknown>;
    if (
      typeof c.clipId !== "string" ||
      typeof c.startSeconds !== "number" ||
      typeof c.endSeconds !== "number" ||
      typeof c.title !== "string"
    ) return false;
    // cropX is optional, but if present must be a finite number.
    if (c.cropX !== undefined && (typeof c.cropX !== "number" || !isFinite(c.cropX))) {
      return false;
    }
  }

  return true;
}

const server = Bun.serve({
  port: parseInt(process.env.PORT ?? "8080"),

  // Max allowed (255s). Without this, Bun's default (~10s) closes the socket
  // during long /process & /extract-audio jobs — no bytes flow on the connection
  // while ffmpeg computes, so the socket looks "idle" and the server severs it
  // mid-job (surfacing as Canceled/timeout on the caller). 255s doesn't fully
  // cover multi-minute /process — that needs the async/heartbeat redesign — but
  // it removes the server-side cut that no client-timeout tuning could fix.
  idleTimeout: 255,

  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/health") {
      return Response.json({ status: "ok", timestamp: new Date().toISOString() });
    }

    if (req.method === "POST" && url.pathname === "/process") {
      const startMs = Date.now();

      // ASYNC job pattern: a multi-minute /process outlives any HTTP connection
      // lifetime (~255s max), so we return 202 immediately and run the work in a
      // fire-and-forget task (the container is a persistent process, so it keeps
      // running after the response). Inngest polls GET /status — each poll is an
      // incoming request that resets sleepAfter, keeping the instance alive while
      // the job runs. Progress lives in an R2 marker (durable across restarts).
      try {
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return Response.json({ error: "Invalid request" }, { status: 400 });
        }

        // Structural type check (clips count cap happens here via MAX_CLIPS)
        if (!validateRequest(body)) {
          return Response.json({ error: "Invalid request" }, { status: 400 });
        }

        // P0: Deep semantic validation — generic 400 to client, details logged internally
        try {
          sanitizeId(body.videoId, "videoId");
          sanitizeId(body.userId, "userId");
          validateVideoUrl(body.videoUrl);
          for (let i = 0; i < body.clips.length; i++) {
            sanitizeId(body.clips[i].clipId, "clipId");
            validateClip(body.clips[i], i);
          }
        } catch (err) {
          const detail = err instanceof Error ? err.message : "Validation error";
          console.error(`[validation] videoId=${body.videoId}: ${detail}`);
          return Response.json({ error: "Invalid request" }, { status: 400 });
        }

        // IDEMPOTENCY: Inngest retries re-POST /process. If a job is already
        // in flight or finished for this video, return 202 without starting a
        // second background task (which would double-encode / race the first).
        const markerKey = `clips/${body.userId}/${body.videoId}/_status.json`;
        const existing = await readFromR2(markerKey);
        if (existing) {
          try {
            const parsed = JSON.parse(existing) as { status?: string };
            if (parsed.status === "processing" || parsed.status === "completed") {
              console.log(`[${body.videoId}] [PROCESS] marker already ${parsed.status} — skip re-start`);
              return Response.json(
                { accepted: true, videoId: body.videoId, skipped: true },
                { status: 202 }
              );
            }
          } catch {
            // Corrupt marker — fall through and overwrite with a fresh one.
          }
        }

        // Mark processing BEFORE returning, so a poll that lands immediately
        // sees "processing" (not "not_found").
        await writeStatusMarker(body.userId, body.videoId, {
          status: "processing",
          startedAt: Date.now(),
          clipCount: body.clips.length,
        });

        // Capture the narrowed request in a const so the closure keeps its type.
        const job = body;
        // Fire-and-forget: NOT awaited. Survives the 202 response (persistent
        // container process). ALWAYS writes a final marker (completed | failed).
        void (async () => {
          try {
            const { results, failed, clipsTotalMs } = await processClips(job);

            // Job SUCCEEDED — the clips ARE in R2. BUG #5b: writing the "completed"
            // marker is now SEPARATE from the job outcome. A marker-write failure
            // (R2 blip) must NOT be recorded as "failed" — that would refund the
            // user and orphan real clips. Retry the marker write a few times; its
            // failures are caught HERE (inner try) and never reach the outer catch,
            // so they can never flip a successful job to "failed".
            const completedMarker = {
              status: "completed" as const,
              clips: results,
              failed,
              processingMs: Date.now() - startMs,
              clipsTotalMs,
            };
            const MARKER_WRITE_ATTEMPTS = 3;
            for (let attempt = 1; attempt <= MARKER_WRITE_ATTEMPTS; attempt++) {
              try {
                await writeStatusMarker(job.userId, job.videoId, completedMarker);
                console.log(
                  `[${job.videoId}] [PROCESS DONE] completed clips=${results.length} failed=${failed.length} processingMs=${Date.now() - startMs}`
                );
                return;
              } catch (markerErr) {
                console.error(
                  `[${job.videoId}] [PROCESS] completed-marker write failed (attempt ${attempt}/${MARKER_WRITE_ATTEMPTS}):`,
                  markerErr instanceof Error ? markerErr.message : markerErr
                );
                if (attempt < MARKER_WRITE_ATTEMPTS) {
                  await new Promise((r) => setTimeout(r, 1000 * attempt));
                }
              }
            }
            // Exhausted retries: job DID succeed (clips in R2), so do NOT mark
            // failed. Leave the marker as-is and log loudly; the poll loop's own
            // timeout will surface it rather than a false "failed"+refund+orphan.
            console.error(
              `[${job.videoId}] [PROCESS] CRITICAL: job succeeded (clips in R2) but completed-marker write failed after ${MARKER_WRITE_ATTEMPTS} attempts — NOT marking failed`
            );
          } catch (err) {
            // Only a REAL processClips failure reaches here (the completed-marker
            // write is handled in its own inner try above and never propagates).
            const error = err instanceof Error ? err.message : "Unknown error";
            console.error(`[${job.videoId}] [PROCESS ERROR]`, error);
            try {
              await writeStatusMarker(job.userId, job.videoId, { status: "failed", error });
            } catch (markerErr) {
              console.error(`[${job.videoId}] [PROCESS ERROR] could not write failure marker:`, markerErr);
            }
          }
        })();

        return Response.json({ accepted: true, videoId: body.videoId }, { status: 202 });
      } catch (err) {
        // Log the underlying crash reason (e.g. marker read/write) before the 500.
        console.error("[PROCESS ERROR]", err);
        const error = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error }, { status: 500 });
      }
    }

    if (req.method === "GET" && url.pathname === "/status") {
      // Async-job status poll. Every call is an incoming request that resets
      // sleepAfter → keeps the container alive while the background job runs.
      // Auth handled upstream in worker.ts (same as the other endpoints).
      const videoId = url.searchParams.get("videoId");
      const userId = url.searchParams.get("userId");
      if (!videoId || !userId) {
        return Response.json({ error: "videoId and userId are required" }, { status: 400 });
      }
      // Validate before composing the R2 key (same allowlist as elsewhere).
      try {
        sanitizeId(videoId, "videoId");
        sanitizeId(userId, "userId");
      } catch {
        return Response.json({ error: "Invalid request" }, { status: 400 });
      }

      try {
        const raw = await readFromR2(`clips/${userId}/${videoId}/_status.json`);
        if (raw === null) {
          return Response.json({ status: "not_found" });
        }
        // Marker is already JSON — pass it through verbatim.
        return new Response(raw, { headers: { "Content-Type": "application/json" } });
      } catch (err) {
        const error = err instanceof Error ? err.message : "Unknown error";
        console.error(`[${videoId}] [STATUS] read failed:`, error);
        return Response.json({ status: "error", error: "status read failed" }, { status: 500 });
      }
    }

    if (req.method === "POST" && url.pathname === "/extract-audio") {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return Response.json({ error: "Invalid request" }, { status: 400 });
      }

      if (!validateExtractAudioRequest(body)) {
        return Response.json({ error: "Invalid request" }, { status: 400 });
      }

      // Same hardening as /process: sanitize ids, allowlist the source domain.
      try {
        sanitizeId(body.videoId, "videoId");
        sanitizeId(body.userId, "userId");
        validateVideoUrl(body.videoUrl);
      } catch (err) {
        const detail = err instanceof Error ? err.message : "Validation error";
        console.error(`[validation] videoId=${body.videoId}: ${detail}`);
        return Response.json({ error: "Invalid request" }, { status: 400 });
      }

      await writeEaPhase(body.userId, body.videoId, "body_parsed");
      try {
        const result = await extractAudio(body);
        return Response.json(result);
      } catch (err) {
        const error = err instanceof Error ? err.message : "Unknown error";
        await writeEaPhase(body.userId, body.videoId, "error", { message: error });
        console.error(`[${body.videoId}] Audio extraction failed:`, error);
        return Response.json({ error: "Audio extraction failed" }, { status: 500 });
      }
    }

    if (req.method === "POST" && url.pathname === "/detect-keyframes") {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return Response.json({ error: "Invalid request" }, { status: 400 });
      }

      if (!validateDetectKeyframesRequest(body)) {
        return Response.json({ error: "Invalid request" }, { status: 400 });
      }

      // Same hardening as /process: sanitize ids (incl. each momentId so it's
      // safe as a /tmp filename) and allowlist the source domain.
      try {
        sanitizeId(body.videoId, "videoId");
        sanitizeId(body.userId, "userId");
        validateVideoUrl(body.videoUrl);
        for (const kf of body.keyframes) {
          sanitizeId(kf.momentId, "momentId");
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : "Validation error";
        console.error(`[validation] videoId=${body.videoId}: ${detail}`);
        return Response.json({ error: "Invalid request" }, { status: 400 });
      }

      await writeDkPhase(body.userId, body.videoId, "body_parsed", { frames: body.keyframes.length });
      try {
        const result = await extractKeyframes(body);
        return Response.json(result);
      } catch (err) {
        const error = err instanceof Error ? err.message : "Unknown error";
        await writeDkPhase(body.userId, body.videoId, "error", { message: error });
        console.error(`[${body.videoId}] Keyframe extraction failed:`, error);
        return Response.json({ error: "Keyframe extraction failed" }, { status: 500 });
      }
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Clip worker server running on port ${server.port}`);
