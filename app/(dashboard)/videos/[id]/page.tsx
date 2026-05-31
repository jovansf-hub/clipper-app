import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft, Clock, File, Film, Layers } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDuration } from "@/lib/utils";
import { VideoStatus } from "@/components/dashboard/video-status";

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
      "id, title, status, duration_seconds, file_size_bytes, created_at, content_type, clip_count_requested, error_message, language, mime_type, transcript_text"
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!video) notFound();

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link
        href="/videos"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
      >
        <ArrowLeft className="size-4" />
        My Videos
      </Link>

      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 leading-tight">
        {video.title}
      </h1>

      <VideoStatus
        initialVideo={{
          id: video.id,
          status: video.status,
          error_message: video.error_message ?? null,
          transcript_text: video.transcript_text ?? null,
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
            <Clock className="size-4 shrink-0" />
            <span>
              <span className="font-medium text-slate-900 dark:text-slate-100">
                Duration
              </span>
              <br />
              {video.duration_seconds != null
                ? formatDuration(video.duration_seconds)
                : "Unknown"}
            </span>
          </div>

          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
            <File className="size-4 shrink-0" />
            <span>
              <span className="font-medium text-slate-900 dark:text-slate-100">
                Size
              </span>
              <br />
              {video.file_size_bytes != null
                ? `${(video.file_size_bytes / 1024 / 1024).toFixed(1)} MB`
                : "Unknown"}
            </span>
          </div>

          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
            <Film className="size-4 shrink-0" />
            <span>
              <span className="font-medium text-slate-900 dark:text-slate-100">
                Type
              </span>
              <br />
              <span className="capitalize">{video.content_type ?? "—"}</span>
            </span>
          </div>

          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
            <Layers className="size-4 shrink-0" />
            <span>
              <span className="font-medium text-slate-900 dark:text-slate-100">
                Clips requested
              </span>
              <br />
              {video.clip_count_requested ?? "—"}
            </span>
          </div>

          <div className="col-span-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400">
            Uploaded {format(new Date(video.created_at), "PPpp")}
          </div>
        </CardContent>
      </Card>

      {video.status === "completed" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Clips</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Clip viewer will be available in Day 7. Check back soon!
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
