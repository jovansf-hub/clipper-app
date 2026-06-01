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
  r2BaseKey: string;
}

interface ClipResult {
  clipId: string;
  r2Key: string;
  r2Url: string;         // NOTE: not publicly accessible until 7a-2 (presigned URLs)
  thumbnailKey: string;
  thumbnailUrl: string;
  durationSeconds: number;
  fileSizeBytes: number;
}

interface ClipResponse {
  success: boolean;
  clips: ClipResult[];
  processingMs: number;
  error?: string;
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

// P0 PT3: r2BaseKey is "seg/seg/seg" — each segment must pass ID_REGEX.
// Prevents "../" traversal and arbitrary R2 key injection.
function validateR2BaseKey(key: string): void {
  if (typeof key !== "string" || key.length === 0 || key.length > 512) {
    throw new Error("Invalid r2BaseKey: empty or too long");
  }
  const segments = key.split("/");
  for (const segment of segments) {
    if (!ID_REGEX.test(segment)) {
      throw new Error(`Invalid r2BaseKey segment: "${segment}"`);
    }
  }
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

async function downloadVideo(url: string, destPath: string): Promise<void> {
  const response = await fetch(url);
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

  // Bun.write with a Response streams to disk — no full-buffer memory load
  await Bun.write(destPath, response);
}

async function runFFmpeg(args: string[]): Promise<void> {
  // Array-based exec (not shell) — no shell injection possible regardless of arg content
  const proc = Bun.spawn(["ffmpeg", "-y", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`FFmpeg failed (exit ${exitCode}): ${stderr.slice(-1000)}`);
  }
}

async function getClipDuration(filePath: string): Promise<number> {
  const proc = Bun.spawn([
    "ffprobe", "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    filePath,
  ], {
    stdout: "pipe",
    stderr: "pipe",
  });

  await proc.exited;
  const output = await new Response(proc.stdout).text();
  return parseFloat(output.trim()) || 0;
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

  const response = await r2Client.fetch(url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: buffer,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`R2 upload failed [${key}] (${response.status}): ${body}`);
  }
}

// ---------------------------------------------------------------------------
// Core processing logic
// ---------------------------------------------------------------------------

async function processClips(req: ClipRequest): Promise<ClipResult[]> {
  // IDs are pre-sanitized by the handler — safe to use directly in paths.
  const tmpDir = `/tmp/${req.videoId}`;
  const inputPath = `${tmpDir}/source`;

  if (!existsSync(tmpDir)) {
    await mkdir(tmpDir, { recursive: true });
  }

  try {
    console.log(`[${req.videoId}] Downloading source video...`);
    await downloadVideo(req.videoUrl, inputPath);
    console.log(`[${req.videoId}] Download complete. Processing ${req.clips.length} clip(s)...`);

    const r2Client = getR2Client();
    const { endpoint, bucket } = getR2Config();
    const crf = req.config?.crf ?? 23;
    const preset = req.config?.preset ?? "fast";
    const results: ClipResult[] = [];

    for (const clip of req.clips) {
      console.log(`[${req.videoId}] Clip ${clip.clipId}: ${clip.startSeconds}s → ${clip.endSeconds}s`);

      const clipPath = `${tmpDir}/${clip.clipId}.mp4`;
      const thumbPath = `${tmpDir}/${clip.clipId}_thumb.jpg`;

      // Cut segment + 9:16 center crop + scale to 1080x1920
      // crop=ih*9/16:ih:(iw-ih*9/16)/2:0  →  center horizontal crop to 9:16
      await runFFmpeg([
        "-i", inputPath,
        "-ss", String(clip.startSeconds),
        "-to", String(clip.endSeconds),
        "-vf", `crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1920:flags=lanczos`,
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

      const durationSeconds = await getClipDuration(clipPath);
      const fileSizeBytes = Bun.file(clipPath).size;

      const clipKey = `${req.r2BaseKey}/${clip.clipId}.mp4`;
      const thumbKey = `${req.r2BaseKey}/${clip.clipId}_thumb.jpg`;

      await uploadToR2(r2Client, endpoint, bucket, clipKey, clipPath, "video/mp4");
      await uploadToR2(r2Client, endpoint, bucket, thumbKey, thumbPath, "image/jpeg");

      results.push({
        clipId: clip.clipId,
        r2Key: clipKey,
        r2Url: `${endpoint}/${bucket}/${clipKey}`,
        thumbnailKey: thumbKey,
        thumbnailUrl: `${endpoint}/${bucket}/${thumbKey}`,
        durationSeconds,
        fileSizeBytes,
      });

      console.log(`[${req.videoId}] Clip ${clip.clipId} uploaded to R2 (${(fileSizeBytes / 1024 / 1024).toFixed(1)}MB)`);
    }

    return results;
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
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
    typeof b.r2BaseKey !== "string" ||
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
  }

  return true;
}

const server = Bun.serve({
  port: parseInt(process.env.PORT ?? "8080"),

  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/health") {
      return Response.json({ status: "ok", timestamp: new Date().toISOString() });
    }

    if (req.method === "POST" && url.pathname === "/process") {
      const startMs = Date.now();

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
        validateR2BaseKey(body.r2BaseKey);
        for (let i = 0; i < body.clips.length; i++) {
          sanitizeId(body.clips[i].clipId, "clipId");
          validateClip(body.clips[i], i);
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : "Validation error";
        console.error(`[validation] videoId=${body.videoId}: ${detail}`);
        return Response.json({ error: "Invalid request" }, { status: 400 });
      }

      try {
        const clips = await processClips(body);
        const response: ClipResponse = {
          success: true,
          clips,
          processingMs: Date.now() - startMs,
        };
        return Response.json(response);
      } catch (err) {
        const error = err instanceof Error ? err.message : "Unknown error";
        console.error(`[${body.videoId}] Fatal error:`, error);
        const response: ClipResponse = {
          success: false,
          clips: [],
          processingMs: Date.now() - startMs,
          error,
        };
        return Response.json(response, { status: 500 });
      }
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Clip worker server running on port ${server.port}`);
