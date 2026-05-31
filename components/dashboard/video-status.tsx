"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Scissors, XCircle } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ViralAnalysisResult, ViralMoment } from "@/lib/anthropic";

type VideoStatusValue =
  | "uploading"
  | "uploaded"
  | "transcribing"
  | "analyzing"
  | "clipping"
  | "completed"
  | "failed";

interface VideoData {
  id: string;
  status: string;
  error_message: string | null;
  transcript_text: string | null;
  viral_analysis: ViralAnalysisResult | null;
}

interface VideoStatusProps {
  initialVideo: VideoData;
}

const STATUS_VARIANT: Record<
  VideoStatusValue,
  "default" | "secondary" | "destructive" | "outline"
> = {
  completed: "default",
  failed: "destructive",
  uploading: "outline",
  uploaded: "outline",
  transcribing: "secondary",
  analyzing: "secondary",
  clipping: "secondary",
};

const STATUS_LABEL: Record<VideoStatusValue, string> = {
  uploading: "Uploading",
  uploaded: "Ready",
  transcribing: "Transcribing",
  analyzing: "Analyzing",
  clipping: "Clipping",
  completed: "Completed",
  failed: "Failed",
};

const HOOK_TYPE_STYLES: Record<
  ViralMoment["hook_type"],
  { label: string; className: string }
> = {
  humor:       { label: "Humor",       className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  insight:     { label: "Insight",     className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  controversy: { label: "Controversy", className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
  emotional:   { label: "Emotional",   className: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300" },
  actionable:  { label: "Actionable",  className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  surprising:  { label: "Surprising",  className: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300" },
};

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function ViralScoreBadge({ score }: { score: number }) {
  const { label, barClass } =
    score >= 80
      ? { label: "Great", barClass: "bg-emerald-500" }
      : score >= 60
      ? { label: "Good", barClass: "bg-blue-500" }
      : score >= 40
      ? { label: "Okay", barClass: "bg-amber-500" }
      : { label: "Low", barClass: "bg-slate-400" };

  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="w-20 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 shrink-0">
        <div
          className={`h-full rounded-full ${barClass}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">
        {score} · {label}
      </span>
    </div>
  );
}

function BounceDots() {
  return (
    <div className="flex gap-1 shrink-0">
      <div className="size-1.5 rounded-full bg-violet-500 animate-bounce [animation-delay:-0.3s]" />
      <div className="size-1.5 rounded-full bg-violet-500 animate-bounce [animation-delay:-0.15s]" />
      <div className="size-1.5 rounded-full bg-violet-500 animate-bounce" />
    </div>
  );
}

export function VideoStatus({ initialVideo }: VideoStatusProps) {
  const [video, setVideo] = useState<VideoData>(initialVideo);
  const [isStarting, setIsStarting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`video-${initialVideo.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "videos",
          filter: `id=eq.${initialVideo.id}`,
        },
        (payload) => {
          setVideo((prev) => ({
            ...prev,
            ...(payload.new as Partial<VideoData>),
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [initialVideo.id]);

  async function startProcessing() {
    setIsStarting(true);
    try {
      const res = await fetch(`/api/videos/${video.id}/process`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to start processing");
      }
      toast.success("Processing started!");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to start processing"
      );
      setIsStarting(false);
    }
  }

  async function handleRetry() {
    setIsRetrying(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("videos")
        .update({
          status: "uploaded",
          error_message: null,
          error_step: null,
          processing_started_at: null,
        })
        .eq("id", video.id);

      if (error) {
        toast.error("Failed to reset video status");
        return;
      }

      const res = await fetch(`/api/videos/${video.id}/process`, {
        method: "POST",
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        toast.error(err.error ?? "Retry failed");
        return;
      }

      toast.success("Retry started");
    } catch {
      toast.error("Retry failed");
    } finally {
      setIsRetrying(false);
    }
  }

  const status = video.status as VideoStatusValue;
  const statusVariant = STATUS_VARIANT[status] ?? "outline";
  const statusLabel = STATUS_LABEL[status] ?? video.status;
  const moments = video.viral_analysis?.moments ?? [];

  return (
    <div className="space-y-3">
      <div>
        <Badge variant={statusVariant} className="text-sm px-3 py-1 h-auto">
          {statusLabel}
        </Badge>
      </div>

      {status === "uploading" && (
        <Card className="border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/20">
          <CardContent className="p-4 flex items-center gap-3">
            <Loader2 className="size-4 text-violet-500 animate-spin shrink-0" />
            <p className="text-sm text-violet-700 dark:text-violet-300">
              Uploading...
            </p>
          </CardContent>
        </Card>
      )}

      {status === "uploaded" && (
        <Card className="border-slate-200 dark:border-slate-700">
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Upload complete. Ready to process.
            </p>
            <Button size="sm" onClick={startProcessing} disabled={isStarting}>
              {isStarting ? (
                <>
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                  Starting...
                </>
              ) : (
                "Start Processing"
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {status === "transcribing" && (
        <Card className="border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/20">
          <CardContent className="p-4 flex items-center gap-3">
            <BounceDots />
            <p className="text-sm text-violet-700 dark:text-violet-300">
              Transcribing audio...
            </p>
          </CardContent>
        </Card>
      )}

      {status === "analyzing" && (
        <Card className="border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/20">
          <CardContent className="p-4 flex items-center gap-3">
            <BounceDots />
            <p className="text-sm text-violet-700 dark:text-violet-300">
              Finding viral moments... (Claude is thinking)
            </p>
          </CardContent>
        </Card>
      )}

      {status === "clipping" && (
        <Card className="border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/20">
          <CardContent className="p-4 flex items-center gap-3">
            <BounceDots />
            <p className="text-sm text-violet-700 dark:text-violet-300">
              Generating clips... (Day 7)
            </p>
          </CardContent>
        </Card>
      )}

      {status === "completed" && (
        <>
          <Card className="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20">
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle2 className="size-5 text-green-600 dark:text-green-400 shrink-0" />
              <p className="text-sm text-green-700 dark:text-green-400">
                Done! Processing complete.
              </p>
            </CardContent>
          </Card>

          {moments.length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Found {moments.length} viral moment{moments.length !== 1 ? "s" : ""}
              </p>

              {moments.map((moment, i) => {
                const hookStyle = HOOK_TYPE_STYLES[moment.hook_type] ?? {
                  label: moment.hook_type,
                  className: "bg-slate-100 text-slate-700",
                };
                return (
                  <Card key={i} className="border-slate-200 dark:border-slate-700">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                          {moment.title}
                        </p>
                        <span
                          className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${hookStyle.className}`}
                        >
                          {hookStyle.label}
                        </span>
                      </div>

                      <ViralScoreBadge score={moment.viral_score} />

                      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                        <span>
                          {formatSeconds(moment.start_time)} –{" "}
                          {formatSeconds(moment.end_time)}
                        </span>
                        <span>·</span>
                        <span>{Math.round(moment.duration)}s</span>
                      </div>

                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        {moment.reasoning}
                      </p>

                      <p className="text-xs text-slate-500 dark:text-slate-500 italic leading-relaxed border-l-2 border-slate-200 dark:border-slate-700 pl-2">
                        &ldquo;{moment.transcript_excerpt}&rdquo;
                      </p>
                    </CardContent>
                  </Card>
                );
              })}

              <Button size="sm" disabled className="w-full" variant="outline">
                <Scissors className="size-3.5 mr-1.5" />
                Generate Clips (coming soon)
              </Button>
            </div>
          ) : video.viral_analysis ? (
            <Card className="border-slate-200 dark:border-slate-700">
              <CardContent className="p-4 space-y-1">
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  No viral moments found.
                </p>
                {video.viral_analysis.reasoning && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {video.viral_analysis.reasoning}
                  </p>
                )}
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Try a longer or more dynamic recording.
                </p>
              </CardContent>
            </Card>
          ) : null}

          {video.transcript_text && (
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider">
                  Transcript Preview
                </p>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {isExpanded
                    ? video.transcript_text
                    : video.transcript_text.slice(0, 500)}
                  {!isExpanded && video.transcript_text.length > 500 && "..."}
                </p>
                {video.transcript_text.length > 500 && (
                  <button
                    onClick={() => setIsExpanded((v) => !v)}
                    className="mt-2 text-xs text-violet-600 dark:text-violet-400 hover:underline"
                  >
                    {isExpanded ? "Show less" : "Read full transcript"}
                  </button>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {status === "failed" && (
        <Card className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <XCircle className="size-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-700 dark:text-red-400 mb-1">
                  Processing failed
                </p>
                {video.error_message && (
                  <p className="text-xs text-red-600 dark:text-red-400 font-mono bg-red-100 dark:bg-red-950/40 p-2 rounded mb-3">
                    {video.error_message}
                  </p>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRetry}
                  disabled={isRetrying}
                >
                  {isRetrying ? (
                    <>
                      <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                      Retrying...
                    </>
                  ) : (
                    "Retry"
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
