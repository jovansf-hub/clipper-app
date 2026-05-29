import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft, Clock, File, Film, Layers } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDuration } from "@/lib/utils";

const STATUS_VARIANT = {
  completed: "default",
  failed: "destructive",
  uploading: "outline",
  uploaded: "outline",
  transcribing: "secondary",
  analyzing: "secondary",
  clipping: "secondary",
} as const satisfies Record<string, "default" | "secondary" | "destructive" | "outline">;

const STATUS_LABEL: Record<string, string> = {
  uploading: "Uploading",
  uploaded: "Queued",
  transcribing: "Transcribing audio",
  analyzing: "Analyzing for viral moments",
  clipping: "Generating clips",
  completed: "Completed",
  failed: "Failed",
};

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
      "id, title, status, duration_seconds, file_size_bytes, created_at, content_type, clip_count_requested, error_message, language, mime_type"
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!video) notFound();

  const statusVariant =
    STATUS_VARIANT[video.status as keyof typeof STATUS_VARIANT] ?? "outline";
  const statusLabel = STATUS_LABEL[video.status] ?? video.status;
  const isProcessing = ["transcribing", "analyzing", "clipping"].includes(video.status);
  const isComplete = video.status === "completed";
  const isFailed = video.status === "failed";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back link */}
      <Link
        href="/videos"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
      >
        <ArrowLeft className="size-4" />
        My Videos
      </Link>

      {/* Title + Status */}
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 leading-tight">
          {video.title}
        </h1>
        <Badge variant={statusVariant} className="mt-1 shrink-0 text-sm px-3 py-1 h-auto">
          {statusLabel}
        </Badge>
      </div>

      {/* Status messaging */}
      {video.status === "uploading" && (
        <Card className="border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/20">
          <CardContent className="p-4">
            <p className="text-sm text-violet-700 dark:text-violet-300">
              Your file is being uploaded. Do not close the upload tab.
            </p>
          </CardContent>
        </Card>
      )}

      {video.status === "uploaded" && (
        <Card className="border-slate-200 dark:border-slate-700">
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Upload complete. Processing will begin shortly (Day 5 feature).
            </p>
            <Button variant="outline" size="sm" disabled>
              Start Processing
            </Button>
          </CardContent>
        </Card>
      )}

      {isProcessing && (
        <Card className="border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/20">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-2 rounded-full bg-violet-500 animate-pulse shrink-0" />
            <p className="text-sm text-violet-700 dark:text-violet-300">
              {statusLabel}… This usually takes 3–5 minutes.
            </p>
          </CardContent>
        </Card>
      )}

      {isComplete && (
        <Card className="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20">
          <CardContent className="p-4">
            <p className="text-sm text-green-700 dark:text-green-400">
              Processing complete! Your clips are ready. (Clip viewer coming in Day 7.)
            </p>
          </CardContent>
        </Card>
      )}

      {isFailed && (
        <Card className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-red-700 dark:text-red-400 mb-1">
              Processing failed
            </p>
            {video.error_message && (
              <p className="text-xs text-red-600 dark:text-red-400 font-mono bg-red-100 dark:bg-red-950/40 p-2 rounded">
                {video.error_message}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Metadata */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
            <Clock className="size-4 shrink-0" />
            <span>
              <span className="font-medium text-slate-900 dark:text-slate-100">Duration</span>
              <br />
              {video.duration_seconds != null
                ? formatDuration(video.duration_seconds)
                : "Unknown"}
            </span>
          </div>

          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
            <File className="size-4 shrink-0" />
            <span>
              <span className="font-medium text-slate-900 dark:text-slate-100">Size</span>
              <br />
              {video.file_size_bytes != null
                ? `${(video.file_size_bytes / 1024 / 1024).toFixed(1)} MB`
                : "Unknown"}
            </span>
          </div>

          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
            <Film className="size-4 shrink-0" />
            <span>
              <span className="font-medium text-slate-900 dark:text-slate-100">Type</span>
              <br />
              <span className="capitalize">{video.content_type ?? "—"}</span>
            </span>
          </div>

          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
            <Layers className="size-4 shrink-0" />
            <span>
              <span className="font-medium text-slate-900 dark:text-slate-100">Clips requested</span>
              <br />
              {video.clip_count_requested ?? "—"}
            </span>
          </div>

          <div className="col-span-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400">
            Uploaded {format(new Date(video.created_at), "PPpp")}
          </div>
        </CardContent>
      </Card>

      {/* Clips section placeholder */}
      {isComplete && (
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
