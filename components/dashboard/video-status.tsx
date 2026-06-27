"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import {
  Captions,
  Crop,
  Sparkles,
  Check,
  ArrowRight,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import type { ViralAnalysisResult, ViralMoment } from "@/lib/anthropic";
import "../upload/upload-zone.css";

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
  /** Real generated-clip count (from the clips table), passed by the server page. */
  clipCount?: number;
}

const ACCENT = "#d4ff3f";
const CORAL = "#ff4d6d";
const BLUE = "#5b8cff";

// Maps onto the real videos.status enum: transcribing → analyzing → clipping.
const STAGES = [
  { status: "transcribing", label: "Transcribing audio", icon: Captions, color: BLUE },
  { status: "analyzing", label: "Finding viral moments", icon: Sparkles, color: ACCENT },
  { status: "clipping", label: "Reframing to 9:16", icon: Crop, color: CORAL },
] as const;

const STATUS_TO_STAGE: Record<string, number> = {
  transcribing: 0,
  analyzing: 1,
  clipping: 2,
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

function cssVars(vars: Record<string, string | number>): CSSProperties {
  return vars as CSSProperties;
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
      <div className="w-20 h-1.5 rounded-full bg-muted shrink-0">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs text-muted-foreground shrink-0">
        {score} · {label}
      </span>
    </div>
  );
}

const EYEBROW: Record<string, string> = {
  uploading: "Finishing upload",
  uploaded: "Ready to process",
  transcribing: "Step 2 · Processing",
  analyzing: "Step 2 · Processing",
  clipping: "Step 2 · Processing",
  completed: "All done",
  failed: "Needs attention",
};

export function VideoStatus({ initialVideo, clipCount = 0 }: VideoStatusProps) {
  const router = useRouter();
  const [video, setVideo] = useState<VideoData>(initialVideo);
  const [isStarting, setIsStarting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const prevStatus = useRef(initialVideo.status);

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
          const next = payload.new as Partial<VideoData>;
          setVideo((prev) => ({ ...prev, ...next }));

          // On transition into 'completed', re-run the server component so it
          // fetches the clips rows (ClipsGrid + the real clip count below).
          if (next.status === "completed" && prevStatus.current !== "completed") {
            router.refresh();
          }
          if (next.status) prevStatus.current = next.status;
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [initialVideo.id, router]);

  async function startProcessing() {
    setIsStarting(true);
    try {
      const res = await fetch(`/api/videos/${video.id}/process`, { method: "POST" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to start processing");
      }
      toast.success("Processing started!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start processing");
      setIsStarting(false);
    }
  }

  async function handleRetry() {
    setIsRetrying(true);
    try {
      // Server resets status from 'failed' → 'uploaded', verifying ownership.
      const retryRes = await fetch(`/api/videos/${video.id}/retry`, { method: "POST" });
      if (!retryRes.ok) {
        const err = (await retryRes.json()) as { error?: string };
        toast.error(err.error ?? "Failed to reset video");
        return;
      }

      const processRes = await fetch(`/api/videos/${video.id}/process`, { method: "POST" });
      if (!processRes.ok) {
        const err = (await processRes.json()) as { error?: string };
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
  const moments = video.viral_analysis?.moments ?? [];
  const displayClipCount = clipCount > 0 ? clipCount : moments.length;
  const isProcessing =
    status === "transcribing" || status === "analyzing" || status === "clipping";
  const activeStage = STATUS_TO_STAGE[status] ?? -1;

  const scrollToClips = () =>
    document.getElementById("clips")?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <>
      <div className="cz-root" style={{ minHeight: "auto" }}>
        <div className="cz-blob a" />
        <div className="cz-blob b" />
        <div className="cz-grain" />

        <div className="cz-card">
          <div className="cz-eyebrow">
            <span className="dot" /> {EYEBROW[status] ?? "Processing"}
          </div>

          {/* ---------- UPLOADING (transient) ---------- */}
          {status === "uploading" && (
            <div className="cz-panel" style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div className="cz-spin" style={cssVars({ "--stage": BLUE, marginLeft: 0 })} />
              <div>
                <div className="cz-slabel">Finishing upload…</div>
                <div className="cz-sstatus">Hang tight</div>
              </div>
            </div>
          )}

          {/* ---------- UPLOADED (safety fallback if auto-process didn't fire) ---------- */}
          {status === "uploaded" && (
            <div className="cz-panel">
              <h2 className="cz-title" style={{ fontSize: 20, marginBottom: 6 }}>
                Upload complete
              </h2>
              <p className="cz-sub" style={{ textAlign: "left", margin: 0 }}>
                Your video is ready. Start processing to generate clips.
              </p>
              <button className="cz-btn" onClick={startProcessing} disabled={isStarting}>
                {isStarting ? (
                  "Starting…"
                ) : (
                  <>
                    Start processing
                    <ArrowRight className="arrow" size={19} strokeWidth={2.3} />
                  </>
                )}
              </button>
            </div>
          )}

          {/* ---------- PROCESSING STAGES ---------- */}
          {isProcessing && (
            <div className="cz-panel">
              <h2 className="cz-title" style={{ fontSize: 22, marginBottom: 4 }}>
                Working the magic
              </h2>
              <p className="cz-sub" style={{ textAlign: "left", margin: "0 0 8px" }}>
                This usually takes a minute or two.
              </p>
              {STAGES.map((s, i) => {
                const Icon = s.icon;
                const state = i < activeStage ? "done" : i === activeStage ? "active" : "";
                return (
                  <div
                    key={s.status}
                    className={`cz-stage ${state}`}
                    style={cssVars({ "--stage": s.color })}
                  >
                    <div className="cz-sicon">
                      {state === "done" ? (
                        <Check size={20} strokeWidth={2.6} />
                      ) : (
                        <Icon size={20} strokeWidth={2.2} />
                      )}
                    </div>
                    <div>
                      <div className="cz-slabel">{s.label}</div>
                      <div className="cz-sstatus">
                        {state === "done"
                          ? "Done"
                          : state === "active"
                          ? "In progress…"
                          : "Queued"}
                      </div>
                    </div>
                    {state === "active" && (
                      <div className="cz-spin" style={cssVars({ "--stage": s.color })} />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ---------- COMPLETED (celebratory banner) ---------- */}
          {status === "completed" && (
            <div className="cz-panel cz-done">
              <div style={{ position: "relative", display: "inline-block" }}>
                <div className="cz-burst">
                  <Check size={46} strokeWidth={3} />
                </div>
                {[...Array(8)].map((_, i) => {
                  const ang = (i / 8) * Math.PI * 2;
                  return (
                    <span
                      key={i}
                      className="cz-spark"
                      style={cssVars({
                        left: "50%",
                        top: "30%",
                        background: i % 2 ? CORAL : ACCENT,
                        "--dx": `${Math.cos(ang) * 70}px`,
                        "--dy": `${Math.sin(ang) * 70}px`,
                        animationDelay: `${i * 0.03}s`,
                      })}
                    />
                  );
                })}
              </div>
              {displayClipCount > 0 ? (
                <>
                  <div className="cz-bignum" style={{ color: ACCENT }}>
                    {displayClipCount} clip{displayClipCount !== 1 ? "s" : ""}
                  </div>
                  <p className="cz-sub" style={{ marginTop: 8 }}>
                    ready to download and post. Nice work.
                  </p>
                  <button className="cz-btn" style={{ marginTop: 22 }} onClick={scrollToClips}>
                    View clips
                    <ArrowRight className="arrow" size={19} strokeWidth={2.3} />
                  </button>
                </>
              ) : (
                <p className="cz-sub" style={{ marginTop: 8 }}>
                  Processing complete.
                </p>
              )}
            </div>
          )}

          {/* ---------- FAILED ---------- */}
          {status === "failed" && (
            <div className="cz-panel fail">
              <div className="cz-file">
                <div className="cz-thumb" style={{ background: "linear-gradient(135deg, #ff4d6d, #c8324e)" }}>
                  <AlertTriangle size={26} strokeWidth={2.2} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="cz-fname">Processing failed</div>
                  <div className="cz-fmeta">Your credits were refunded.</div>
                </div>
              </div>
              {video.error_message && <div className="cz-errbox">{video.error_message}</div>}
              <button className="cz-btn coral" onClick={handleRetry} disabled={isRetrying}>
                {isRetrying ? (
                  "Retrying…"
                ) : (
                  <>
                    <RotateCcw size={18} strokeWidth={2.4} />
                    Retry
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ---------- Completed: existing viral moments + transcript (kept) ---------- */}
      {status === "completed" && (
        <>
          {moments.length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground">
                Found {moments.length} viral moment{moments.length !== 1 ? "s" : ""}
              </p>

              {moments.map((moment, i) => {
                const hookStyle = HOOK_TYPE_STYLES[moment.hook_type] ?? {
                  label: moment.hook_type,
                  className: "bg-muted text-muted-foreground",
                };
                return (
                  <Card key={i} className="border-border">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-semibold text-foreground leading-snug">
                          {moment.title}
                        </p>
                        <span
                          className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${hookStyle.className}`}
                        >
                          {hookStyle.label}
                        </span>
                      </div>

                      <ViralScoreBadge score={moment.viral_score} />

                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>
                          {formatSeconds(moment.start_time)} – {formatSeconds(moment.end_time)}
                        </span>
                        <span>·</span>
                        <span>{Math.round(moment.duration)}s</span>
                      </div>

                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {moment.reasoning}
                      </p>

                      <p className="text-xs text-muted-foreground italic leading-relaxed border-l-2 border-border pl-2">
                        &ldquo;{moment.transcript_excerpt}&rdquo;
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : video.viral_analysis ? (
            <Card className="border-border">
              <CardContent className="p-4 space-y-1">
                <p className="text-sm text-foreground">
                  No viral moments found.
                </p>
                {video.viral_analysis.reasoning && (
                  <p className="text-xs text-muted-foreground">
                    {video.viral_analysis.reasoning}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Try a longer or more dynamic recording.
                </p>
              </CardContent>
            </Card>
          ) : null}

          {video.transcript_text && (
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                  Transcript Preview
                </p>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                  {isExpanded
                    ? video.transcript_text
                    : video.transcript_text.slice(0, 500)}
                  {!isExpanded && video.transcript_text.length > 500 && "..."}
                </p>
                {video.transcript_text.length > 500 && (
                  <button
                    onClick={() => setIsExpanded((v) => !v)}
                    className="mt-2 text-xs text-primary hover:underline"
                  >
                    {isExpanded ? "Show less" : "Read full transcript"}
                  </button>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </>
  );
}
