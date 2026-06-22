// Isolated smoke test for the clip-worker POST /probe-duration route.
//
// 1. Lists sources/ in R2 (or uses a key passed as argv[2])
// 2. Presigns a GET URL (3600s) using the SAME aws4fetch logic as lib/r2.ts
//    (signQuery:true, X-Amz-Expires set before signing, raw key — identical to
//    getPresignedR2Url so we test exactly what the app sends)
// 3. POSTs to {CLIP_WORKER_URL}/probe-duration with Bearer {CLIP_WORKER_SECRET}
//    and body { videoUrl, videoId:"smoke1", userId:"smoke1" }
// 4. Prints { durationSeconds } and, if a local ffprobe exists, compares it
//    against an independent probe of the same presigned URL (ground truth).
//
// Usage:
//   node scripts/smoke-probe-duration.mjs                 # first key under sources/
//   node scripts/smoke-probe-duration.mjs sources/<uid>/<vid>.mp4
//
// Reads secrets from .env.local. Never prints secret values.

import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { AwsClient } from "aws4fetch";

// ── env ────────────────────────────────────────────────────────────────────
function loadEnv(path = ".env.local") {
  const out = {};
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    console.error(`Could not read ${path} — run from the project root.`);
    process.exit(1);
  }
  for (const line of raw.split("\n")) {
    const t = line.replace(/\r$/, "");
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return out;
}

const env = loadEnv();
const need = (k) => {
  const v = env[k];
  if (!v) {
    console.error(`Missing ${k} in .env.local`);
    process.exit(1);
  }
  return v;
};

const R2_ACCESS_KEY_ID = need("R2_ACCESS_KEY_ID");
const R2_SECRET_ACCESS_KEY = need("R2_SECRET_ACCESS_KEY");
const R2_ENDPOINT = need("R2_ENDPOINT").replace(/\/$/, "");
const R2_BUCKET = need("R2_BUCKET");
const CLIP_WORKER_URL = need("CLIP_WORKER_URL").replace(/\/$/, "");
const CLIP_WORKER_SECRET = need("CLIP_WORKER_SECRET");

const r2 = new AwsClient({
  accessKeyId: R2_ACCESS_KEY_ID,
  secretAccessKey: R2_SECRET_ACCESS_KEY,
  service: "s3",
  region: "auto",
});

// ── R2 helpers (mirror lib/r2.ts) ────────────────────────────────────────────
async function listSources(prefix = "sources/") {
  const keys = [];
  let token;
  do {
    const u = new URL(`${R2_ENDPOINT}/${R2_BUCKET}`);
    u.searchParams.set("list-type", "2");
    u.searchParams.set("prefix", prefix);
    if (token) u.searchParams.set("continuation-token", token);
    const res = await r2.fetch(u.toString(), { method: "GET" });
    const body = await res.text();
    if (!res.ok) {
      console.error(`R2 list failed (${res.status}): ${body}`);
      process.exit(1);
    }
    for (const m of body.matchAll(/<Key>(.*?)<\/Key>/g)) keys.push(m[1]);
    const truncated = /<IsTruncated>true<\/IsTruncated>/.test(body);
    const tok = body.match(/<NextContinuationToken>(.*?)<\/NextContinuationToken>/);
    token = truncated && tok ? tok[1] : undefined;
  } while (token);
  return keys;
}

async function presignGet(key, expiresIn = 3600) {
  const u = new URL(`${R2_ENDPOINT}/${R2_BUCKET}/${key}`);
  u.searchParams.set("X-Amz-Expires", String(expiresIn));
  const signed = await r2.sign(new Request(u.toString(), { method: "GET" }), {
    aws: { signQuery: true },
  });
  return signed.url;
}

// Independent ground truth: local ffprobe over the same presigned URL.
// Resolves null if ffprobe isn't installed (ENOENT) — test still prints worker result.
function localFfprobe(url) {
  return new Promise((resolve) => {
    const p = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      url,
    ]);
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("error", () => resolve(null)); // ffprobe not installed
    p.on("close", () => {
      const d = parseFloat(out.trim());
      resolve(isFinite(d) && d > 0 ? d : null);
    });
  });
}

// ── main ─────────────────────────────────────────────────────────────────────
const argKey = process.argv[2];

let key = argKey;
if (!key) {
  const keys = await listSources();
  const videos = keys.filter((k) => !k.endsWith(".audio.ogg") && !k.endsWith("/"));
  if (videos.length === 0) {
    console.error("No objects found under sources/. Pass a key explicitly.");
    process.exit(1);
  }
  console.log(`Found ${videos.length} object(s) under sources/. Using the first:`);
  for (const k of videos.slice(0, 10)) console.log(`  ${k}${k === videos[0] ? "   <-- using" : ""}`);
  if (videos.length > 10) console.log(`  ... (${videos.length - 10} more)`);
  key = videos[0];
}

console.log(`\nKey:        ${key}`);
const url = await presignGet(key, 3600);
console.log(`Presigned:  ${url.slice(0, 80)}... (${url.length} chars)`);

console.log(`\nPOST ${CLIP_WORKER_URL}/probe-duration  (videoId/userId="smoke1")`);
const res = await fetch(`${CLIP_WORKER_URL}/probe-duration`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${CLIP_WORKER_SECRET}`,
  },
  body: JSON.stringify({ videoUrl: url, videoId: "smoke1", userId: "smoke1" }),
});

const text = await res.text();
console.log(`HTTP ${res.status}`);
console.log(`Body: ${text}`);

let workerDuration = null;
try {
  workerDuration = JSON.parse(text).durationSeconds ?? null;
} catch {
  /* non-JSON body */
}

if (res.status !== 200 || workerDuration == null) {
  console.error("\n✗ Probe did not return a duration. Check Bearer/URL/rollout.");
  process.exit(1);
}

console.log(`\nWorker durationSeconds: ${workerDuration}`);

const truth = await localFfprobe(url);
if (truth == null) {
  console.log("Local ffprobe: not available — compare the value above against the");
  console.log("known length of this video manually.");
} else {
  const diff = Math.abs(truth - workerDuration);
  console.log(`Local ffprobe:          ${truth}`);
  console.log(`Diff:                   ${diff.toFixed(3)}s`);
  console.log(diff < 1 ? "\n✓ Match (within 1s)." : "\n✗ Mismatch (>1s) — investigate.");
}
