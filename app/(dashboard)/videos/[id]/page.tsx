import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft, Clock, File, Film, Layers } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDuration } from "@/lib/utils";
import { VideoStatus } from "@/components/dashboard/video-status";
import { DeleteVideoButton } from "@/components/dashboard/delete-video-button";
import { ClipsGrid, type ClipGridItem } from "@/components/dashboard/clips-grid";
import { getPresignedR2Url } from "@/lib/r2";
import type { ViralAnalysisResult } from "@/lib/anthropic";

type Params = Promise<{ id: string }>;

export default async function VideoPage({ params }: { params: Params }) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) notFound();

  const { data: video } = await supabase
    .from("videos")
    .select(
      "id, title, status, duration_seconds, file_size_bytes, created_at, content_type, clip_count_requested, error_message, language, mime_type, transcript_text, viral_analysis"
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!video) notFound();

  // Fetch clips + generate thumbnail presigned URLs server-side (so thumbnails render on load)
  let clips: ClipGridItem[] = [];
  if (video.status === "completed") {
    const { data: rawClips } = await supabase
      .from("clips")
      .select("id, title, hook_type, viral_score, duration_seconds, thumbnail_path")
      .eq("video_id", id)
      .eq("user_id", user.id)
      .order("viral_score", { ascending: false });

    if (rawClips && rawClips.length > 0) {
      clips = await Promise.all(
        rawClips.map(async (c) => ({
          id: c.id,
          title: c.title,
          hook_type: c.hook_type,
          viral_score: c.viral_score,
          duration_seconds: c.duration_seconds,
          thumbnailUrl: c.thumbnail_path
            ? await getPresignedR2Url(c.thumbnail_path, 3600).catch(() => null)
            : null,
        }))
      );
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link
        href="/videos"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        My Videos
      </Link>

      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground leading-tight">
          {video.title}
        </h1>
        <DeleteVideoButton
          videoId={video.id}
          status={video.status}
          label="Delete"
          redirectTo="/videos"
          className="shrink-0"
        />
      </div>

      <VideoStatus
        initialVideo={{
          id: video.id,
          status: video.status,
          error_message: video.error_message ?? null,
          transcript_text: video.transcript_text ?? null,
          viral_analysis: (video.viral_analysis ?? null) as ViralAnalysisResult | null,
        }}
        clipCount={clips.length}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="size-4 shrink-0" />
            <span>
              <span className="font-medium text-foreground">
                Duration
              </span>
              <br />
              {video.duration_seconds != null
                ? formatDuration(video.duration_seconds)
                : "Unknown"}
            </span>
          </div>

          <div className="flex items-center gap-2 text-muted-foreground">
            <File className="size-4 shrink-0" />
            <span>
              <span className="font-medium text-foreground">
                Size
              </span>
              <br />
              {video.file_size_bytes != null
                ? `${(video.file_size_bytes / 1024 / 1024).toFixed(1)} MB`
                : "Unknown"}
            </span>
          </div>

          <div className="flex items-center gap-2 text-muted-foreground">
            <Film className="size-4 shrink-0" />
            <span>
              <span className="font-medium text-foreground">
                Type
              </span>
              <br />
              <span className="capitalize">{video.content_type ?? "—"}</span>
            </span>
          </div>

          <div className="flex items-center gap-2 text-muted-foreground">
            <Layers className="size-4 shrink-0" />
            <span>
              <span className="font-medium text-foreground">
                Clips requested
              </span>
              <br />
              {video.clip_count_requested ?? "—"}
            </span>
          </div>

          <div className="col-span-2 pt-2 border-t border-border text-muted-foreground">
            Uploaded {format(new Date(video.created_at), "PPpp")}
          </div>
        </CardContent>
      </Card>

      {video.status === "completed" && (
        <Card id="clips">
          <CardHeader>
            <CardTitle className="text-base">
              Clips {clips.length > 0 && `(${clips.length})`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ClipsGrid clips={clips} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
