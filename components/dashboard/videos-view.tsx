"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Film, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DeleteVideoButton } from "@/components/dashboard/delete-video-button";
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
  transcribing: "Transcribing",
  analyzing: "Analyzing",
  clipping: "Clipping",
  completed: "Completed",
  failed: "Failed",
};

type VideoStatus = keyof typeof STATUS_VARIANT;

export interface VideoListItem {
  id: string;
  title: string;
  status: string;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  created_at: string;
  content_type: string | null;
}

export function VideosView({ initialVideos }: { initialVideos: VideoListItem[] }) {
  // Client-owned list so a delete removes the card in place — no router.refresh()
  // round-trip (which briefly flashed the empty/upload state during the reload).
  const [videos, setVideos] = useState(initialVideos);

  const removeVideo = (id: string) =>
    setVideos((prev) => prev.filter((v) => v.id !== id));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            My Videos
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {videos.length} video{videos.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button render={<Link href="/upload" />} nativeButton={false}>
          <Upload className="size-4" />
          Upload Video
        </Button>
      </div>

      {/* Empty state — rendered inline so it appears instantly after the last
          row is removed, without navigating to /upload. */}
      {videos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Film className="size-12 text-slate-300 dark:text-slate-700 mb-4" />
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-1">
            No videos yet
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            Upload your first video and let AI find the viral moments.
          </p>
          <Button render={<Link href="/upload" />} nativeButton={false}>
            <Upload className="size-4" />
            Upload your first video
          </Button>
        </div>
      ) : (
        /* Video grid */
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((video) => {
            const status = video.status as VideoStatus;
            const variant = STATUS_VARIANT[status] ?? "outline";
            const label = STATUS_LABEL[video.status] ?? video.status;
            const isProcessing = ["transcribing", "analyzing", "clipping"].includes(
              video.status
            );

            return (
              <Link key={video.id} href={`/videos/${video.id}`} className="group">
                <Card className="h-full transition-shadow hover:shadow-md">
                  {/* Thumbnail placeholder */}
                  <div className="aspect-video bg-slate-100 dark:bg-slate-800 rounded-t-xl flex items-center justify-center relative overflow-hidden">
                    <Film className="size-10 text-slate-300 dark:text-slate-600" />
                    {isProcessing && (
                      <div className="absolute inset-0 bg-slate-900/10 dark:bg-slate-900/40 flex items-center justify-center">
                        <div className="size-2 rounded-full bg-violet-500 animate-pulse" />
                      </div>
                    )}
                    <div className="absolute top-2 right-2 z-10">
                      <DeleteVideoButton
                        videoId={video.id}
                        status={video.status}
                        onDeleted={() => removeVideo(video.id)}
                      />
                    </div>
                  </div>

                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 line-clamp-2 leading-snug group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
                        {video.title}
                      </p>
                      <Badge variant={variant} className="shrink-0 mt-0.5">
                        {label}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span>
                        {video.duration_seconds != null
                          ? formatDuration(video.duration_seconds)
                          : "—"}
                      </span>
                      <span>
                        {formatDistanceToNow(new Date(video.created_at), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 dark:text-slate-500 capitalize">
                      {video.content_type ?? "video"}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
