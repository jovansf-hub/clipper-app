import { createAdminClient } from "@/lib/supabase/server";

/**
 * Generates a short-lived presigned download URL for a source video in Supabase Storage.
 * Uses the admin/service client — safe to call from server-side only (Inngest, API routes).
 */
export async function getSignedSourceUrl(
  filePath: string,
  expiresIn = 3600
): Promise<string> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.storage
    .from("videos")
    .createSignedUrl(filePath, expiresIn);

  if (error || !data?.signedUrl) {
    throw new Error(
      `Failed to create signed URL for "${filePath}": ${error?.message ?? "no URL returned"}`
    );
  }

  return data.signedUrl;
}
