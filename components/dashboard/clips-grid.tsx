"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import { Download, Play, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const HOOK_TYPE_STYLES: Record<string, { label: string; className: string }> = {
  humor:       { label: "Humor",       className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  insight:     { label: "Insight",     className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  controversy: { label: "Controversy", className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
  emotional:   { label: "Emotional",   className: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300" },
  actionable:  { label: "Actionable",  className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  surprising:  { label: "Surprising",  className: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300" },
};

function ViralScoreBar({ score }: { score: number }) {
  const { label, barClass } =
    score >= 80 ? { label: "Great", barClass: "bg-emerald-500" }
    : score >= 60 ? { label: "Good",  barClass: "bg-blue-500" }
    : score >= 40 ? { label: "Okay",  barClass: "bg-amber-500" }
    : { label: "Low",   barClass: "bg-slate-400" };
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 rounded-full bg-muted shrink-0">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs text-muted-foreground">{score} · {label}</span>
    </div>
  );
}

function formatDur(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export interface ClipGridItem {
  id: string;
  title: string;
  hook_type: string | null;
  viral_score: number | null;
  duration_seconds: number;
  thumbnailUrl: string | null; // presigned, generated server-side in page.tsx
}

function ClipCard({ clip }: { clip: ClipGridItem }) {
  const [loadingAction, setLoadingAction] = useState<"preview" | "download" | null>(null);

  const fetchMp4Url = useCallback(async (): Promise<string | null> => {
    const res = await fetch(`/api/clips/${clip.id}/url`);
    if (!res.ok) {
      toast.error("Could not generate clip URL");
      return null;
    }
    const data = await res.json() as { url: string };
    return data.url;
  }, [clip.id]);

  async function handlePreview() {
    setLoadingAction("preview");
    try {
      const url = await fetchMp4Url();
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleDownload() {
    setLoadingAction("download");
    try {
      const url = await fetchMp4Url();
      if (!url) return;
      const a = document.createElement("a");
      a.href = url;
      a.download = `${clip.title.replace(/\s+/g, "-").toLowerCase()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setLoadingAction(null);
    }
  }

  const hook = clip.hook_type
    ? (HOOK_TYPE_STYLES[clip.hook_type] ?? { label: clip.hook_type, className: "bg-muted text-muted-foreground" })
    : null;

  return (
    <Card className="border-border overflow-hidden">
      <div className="relative bg-muted" style={{ aspectRatio: "9/16" }}>
        {clip.thumbnailUrl ? (
          <Image
            src={clip.thumbnailUrl}
            alt={clip.title}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 50vw, 33vw"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Play className="size-8 text-muted-foreground" />
          </div>
        )}
      </div>

      <CardContent className="p-3 space-y-2">
        <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
          {clip.title}
        </p>

        <div className="flex items-center gap-2 flex-wrap">
          {hook && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${hook.className}`}>
              {hook.label}
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {formatDur(clip.duration_seconds)}
          </span>
        </div>

        {clip.viral_score !== null && <ViralScoreBar score={clip.viral_score} />}

        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-8 text-xs"
            onClick={handlePreview}
            disabled={loadingAction !== null}
          >
            {loadingAction === "preview"
              ? <Loader2 className="size-3 animate-spin" />
              : <><Play className="size-3 mr-1" />Preview</>}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-8 text-xs"
            onClick={handleDownload}
            disabled={loadingAction !== null}
          >
            {loadingAction === "download"
              ? <Loader2 className="size-3 animate-spin" />
              : <><Download className="size-3 mr-1" />Download</>}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function ClipsGrid({ clips }: { clips: ClipGridItem[] }) {
  if (clips.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No clips generated yet.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      {clips.map((clip) => (
        <ClipCard key={clip.id} clip={clip} />
      ))}
    </div>
  );
}
