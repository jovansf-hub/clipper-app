import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VideosView, type VideoListItem } from "@/components/dashboard/videos-view";

export default async function VideosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: videos } = await supabase
    .from("videos")
    .select(
      "id, title, status, duration_seconds, file_size_bytes, created_at, content_type"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return <VideosView initialVideos={(videos ?? []) as VideoListItem[]} />;
}
