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
