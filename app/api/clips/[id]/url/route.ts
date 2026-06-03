import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPresignedR2Url } from "@/lib/r2";

type Params = Promise<{ id: string }>;

export async function GET(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Ownership enforced in the query — user can only get URLs for their own clips
  const { data: clip, error } = await supabase
    .from("clips")
    .select("output_path, thumbnail_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !clip) {
    return NextResponse.json({ error: "Clip not found" }, { status: 404 });
  }

  const type = req.nextUrl.searchParams.get("type");
  const key = type === "thumbnail" ? clip.thumbnail_path : clip.output_path;

  if (!key) {
    return NextResponse.json({ error: "File path not available" }, { status: 404 });
  }

  const url = await getPresignedR2Url(key, 3600);
  return NextResponse.json({ url, expiresIn: 3600 });
}
