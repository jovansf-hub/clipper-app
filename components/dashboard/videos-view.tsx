"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Film, Upload, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  // GitHub-style typed confirmation — submit is gated until this equals "DELETE".
  const [confirmText, setConfirmText] = useState("");

  const removeVideo = (id: string) =>
    setVideos((prev) => prev.filter((v) => v.id !== id));

  // Reset the typed confirmation whenever the modal opens or closes so it never
  // carries a stale "DELETE" into the next open.
  function handleBulkOpenChange(open: boolean) {
    setBulkOpen(open);
    if (!open) setConfirmText("");
  }

  async function handleBulkDelete() {
    setBulkDeleting(true);
    try {
      const res = await fetch("/api/videos/bulk-delete", { method: "POST" });
      if (!res.ok) throw new Error("bulk delete failed");
      const { deleted, skipped, failed, deletedIds } = (await res.json()) as {
        deleted: number;
        skipped: number;
        failed: number;
        deletedIds: string[];
      };
      // Remove only the rows actually deleted; in-flight (skipped) stay visible.
      const ids = new Set(deletedIds);
      setVideos((prev) => prev.filter((v) => !ids.has(v.id)));
      setBulkOpen(false);
      setConfirmText("");

      const parts = [`${deleted} deleted`];
      if (skipped) parts.push(`${skipped} still processing — skipped`);
      if (failed) parts.push(`${failed} failed`);
      const summary = parts.join(", ");
      if (failed) toast.error(summary);
      else toast.success(summary);
    } catch {
      toast.error("Could not delete, please retry");
    } finally {
      setBulkDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            My Videos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {videos.length} video{videos.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setBulkOpen(true)}
            disabled={videos.length === 0 || bulkDeleting}
          >
            <Trash2 className="size-4" />
            Delete all
          </Button>
          <Button render={<Link href="/upload" />} nativeButton={false}>
            <Upload className="size-4" />
            Upload Video
          </Button>
        </div>
      </div>

      {/* Bulk delete confirm — GitHub-style typed confirmation */}
      <Dialog open={bulkOpen} onOpenChange={handleBulkOpenChange}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete all videos?</DialogTitle>
            <DialogDescription>
              Type <span className="font-semibold text-foreground">DELETE</span>{" "}
              to confirm deleting all {videos.length} video
              {videos.length !== 1 ? "s" : ""}. This cannot be undone. Videos
              still processing are skipped.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="bulk-confirm" className="sr-only">
              Type DELETE to confirm
            </Label>
            <Input
              id="bulk-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
              disabled={bulkDeleting}
            />
          </div>
          <DialogFooter>
            <DialogClose
              render={<Button variant="outline" disabled={bulkDeleting} />}
            >
              Cancel
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={bulkDeleting || confirmText !== "DELETE"}
            >
              {bulkDeleting ? (
                <>
                  <Loader2 className="animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete all"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Empty state — rendered inline so it appears instantly after the last
          row is removed, without navigating to /upload. */}
      {videos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Film className="size-12 text-muted-foreground/50 mb-4" />
          <p className="text-sm font-medium text-foreground mb-1">
            No videos yet
          </p>
          <p className="text-sm text-muted-foreground mb-6">
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
                  <div className="aspect-video bg-muted rounded-t-xl flex items-center justify-center relative overflow-hidden">
                    <Film className="size-10 text-muted-foreground/50" />
                    {isProcessing && (
                      <div className="absolute inset-0 bg-foreground/10 flex items-center justify-center">
                        <div className="size-2 rounded-full bg-primary animate-pulse" />
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
                      <p className="text-sm font-medium text-foreground line-clamp-2 leading-snug group-hover:text-primary transition-colors">
                        {video.title}
                      </p>
                      <Badge variant={variant} className="shrink-0 mt-0.5">
                        {label}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
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

                    <p className="text-xs text-muted-foreground capitalize">
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
