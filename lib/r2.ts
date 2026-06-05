import "server-only";
import { AwsClient } from "aws4fetch";

function getR2Client(): AwsClient {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("R2_ACCESS_KEY_ID or R2_SECRET_ACCESS_KEY is not set");
  }
  return new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
}

function getR2Base(): { endpoint: string; bucket: string } {
  const endpoint = process.env.R2_ENDPOINT;
  const bucket = process.env.R2_BUCKET;
  if (!endpoint || !bucket) {
    throw new Error("R2_ENDPOINT or R2_BUCKET is not set");
  }
  return { endpoint: endpoint.replace(/\/$/, ""), bucket };
}

export async function getPresignedR2Url(
  key: string,
  expiresIn = 3600
): Promise<string> {
  const r2 = getR2Client();
  const { endpoint, bucket } = getR2Base();

  // X-Amz-Expires must be in the URL before signing so it's covered by the signature
  const urlObj = new URL(`${endpoint}/${bucket}/${key}`);
  urlObj.searchParams.set("X-Amz-Expires", String(expiresIn));

  const signed = await r2.sign(
    new Request(urlObj.toString(), { method: "GET" }),
    { aws: { signQuery: true } }
  );
  return signed.url;
}

// Encode each path segment but preserve the slash separators between them.
function encodeR2Key(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

// Minimal XML entity decode for object keys returned by ListObjectsV2.
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * List every object key under a prefix via ListObjectsV2.
 * Follows continuation tokens so the full set is returned even past 1000 keys.
 * Throws on a non-OK response; the R2 XML body is logged internally, never surfaced.
 */
export async function listR2Objects(prefix: string): Promise<string[]> {
  const r2 = getR2Client();
  const { endpoint, bucket } = getR2Base();

  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const urlObj = new URL(`${endpoint}/${bucket}`);
    urlObj.searchParams.set("list-type", "2");
    urlObj.searchParams.set("prefix", prefix);
    if (continuationToken) {
      urlObj.searchParams.set("continuation-token", continuationToken);
    }

    const res = await r2.fetch(urlObj.toString(), { method: "GET" });
    const body = await res.text();

    if (!res.ok) {
      console.error(`R2 list failed (${res.status}) for prefix ${prefix}: ${body}`);
      throw new Error("R2 list failed");
    }

    for (const match of body.matchAll(/<Key>(.*?)<\/Key>/g)) {
      keys.push(decodeXmlEntities(match[1]));
    }

    const truncated = /<IsTruncated>true<\/IsTruncated>/.test(body);
    const tokenMatch = body.match(/<NextContinuationToken>(.*?)<\/NextContinuationToken>/);
    continuationToken = truncated && tokenMatch ? decodeXmlEntities(tokenMatch[1]) : undefined;
  } while (continuationToken);

  return keys;
}

/**
 * Delete a single object by key. Idempotent — R2 returns 204 even for a
 * key that no longer exists. Throws on a real failure; body logged internally.
 */
export async function deleteR2Object(key: string): Promise<void> {
  const r2 = getR2Client();
  const { endpoint, bucket } = getR2Base();

  const res = await r2.fetch(`${endpoint}/${bucket}/${encodeR2Key(key)}`, {
    method: "DELETE",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`R2 delete failed (${res.status}) for key ${key}: ${body}`);
    throw new Error("R2 delete failed");
  }
}
