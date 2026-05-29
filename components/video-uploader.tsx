"use client";

import { useState, useCallback, useRef } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Upload,
  X,
  Film,
  Music,
  AlertCircle,
  Lock,
  Loader2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { CreditCalculator } from "@/components/dashboard/credit-calculator";
import { getCreditsNeeded } from "@/lib/utils";

type Plan = "free" | "creator" | "pro";
type ContentType = "podcast" | "interview" | "talk" | "tutorial" | "vlog";
type CaptionStyle = "tiktok_highlight" | "karaoke" | "classic" | "minimal";
type Phase = "idle" | "preparing" | "uploading" | "error";

// TODO: raise to 500MB when on paid Supabase storage plan
const MAX_FILE_SIZE = 50 * 1024 * 1024;

const MAX_DURATION: Record<Plan, number> = {
  free: 1800,
  creator: 5400,
  pro: 10800,
};

const UPGRADE_NAME: Record<Plan, string> = {
  free: "Creator",
  creator: "Pro",
  pro: "Pro",
};

const ALLOWED_ACCEPT = {
  "video/mp4": [".mp4"],
  "video/quicktime": [".mov"],
  "video/webm": [".webm"],
  "audio/mpeg": [".mp3"],
  "audio/mp4": [".m4a"],
  "audio/wav": [".wav"],
} as const;

const CONTENT_TYPES: { value: ContentType; label: string }[] = [
  { value: "podcast", label: "Podcast" },
  { value: "interview", label: "Interview" },
  { value: "talk", label: "Talk / Keynote" },
  { value: "tutorial", label: "Tutorial" },
  { value: "vlog", label: "Vlog" },
];

const CAPTION_STYLES: {
  id: CaptionStyle;
  name: string;
  desc: string;
  free: boolean;
}[] = [
  { id: "tiktok_highlight", name: "TikTok Highlight", desc: "Word-by-word highlight", free: true },
  { id: "karaoke", name: "Karaoke", desc: "Progressive color shift", free: false },
  { id: "classic", name: "Classic", desc: "Centered white captions", free: false },
  { id: "minimal", name: "Minimal", desc: "Subtle bottom text", free: false },
];

interface ApiUploadResponse {
  signedUrl?: string;
  videoId?: string;
  token?: string;
  path?: string;
  error?: string;
  reason?: string;
}

interface VideoUploaderProps {
  plan: Plan;
  creditsRemaining: number;
}

export function VideoUploader({ plan, creditsRemaining }: VideoUploaderProps) {
  const router = useRouter();

  // File
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  // Config
  const [contentType, setContentType] = useState<ContentType>("podcast");
  const [clipCount, setClipCount] = useState(5);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>("tiktok_highlight");
  const [language, setLanguage] = useState<"en" | "auto">("en");

  // Upload
  const [phase, setPhase] = useState<Phase>("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const videoIdRef = useRef<string | null>(null);

  const detectDuration = useCallback((f: File): Promise<number | null> => {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(f);
      const el: HTMLVideoElement | HTMLAudioElement = f.type.startsWith("audio/")
        ? new Audio()
        : document.createElement("video");
      el.preload = "metadata";
      el.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve(Number.isFinite(el.duration) ? Math.round(el.duration) : null);
      };
      el.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      el.src = url;
    });
  }, []);

  const onDrop = useCallback(
    async (accepted: File[], rejected: FileRejection[]) => {
      setFileError(null);
      setFile(null);
      setDuration(null);
      setUploadError(null);
      setPhase("idle");
      videoIdRef.current = null;

      if (rejected.length > 0) {
        const err = rejected[0]?.errors[0];
        if (err?.code === "file-too-large") {
          setFileError("File too large. Max 50MB on free storage. Pro storage coming soon.");
        } else {
          setFileError("Unsupported file. Accepted: MP4, MOV, WEBM, MP3, M4A, WAV · Max 50MB.");
        }
        return;
      }

      const f = accepted[0];
      if (!f) return;

      const det = await detectDuration(f);
      const maxDur = MAX_DURATION[plan];

      if (det !== null && det > maxDur) {
        setFileError(
          `Video too long for your plan (max ${Math.floor(maxDur / 60)} min). Upgrade to ${UPGRADE_NAME[plan]} for longer videos.`
        );
        return;
      }

      setFile(f);
      setDuration(det);
    },
    [plan, detectDuration]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: ALLOWED_ACCEPT,
    maxSize: MAX_FILE_SIZE,
    disabled: phase === "preparing" || phase === "uploading",
  });

  const creditsNeeded = duration !== null ? getCreditsNeeded(duration) : null;
  const canUpload =
    !!file &&
    phase === "idle" &&
    creditsNeeded !== null &&
    creditsRemaining >= creditsNeeded;

  const clearFile = () => {
    setFile(null);
    setDuration(null);
    setFileError(null);
    setUploadError(null);
    setPhase("idle");
    videoIdRef.current = null;
  };

  const startUpload = async () => {
    if (!file || duration === null || creditsNeeded === null) return;

    setPhase("preparing");
    setUploadError(null);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          file_size_bytes: file.size,
          duration_seconds: duration,
          mime_type: file.type,
          content_type: contentType,
          clip_count_requested: plan === "free" ? 5 : clipCount,
          caption_style_requested: captionStyle,
          language,
        }),
      });

      const data = (await res.json()) as ApiUploadResponse;

      if (!res.ok) {
        const msg = data.error ?? "Failed to prepare upload";
        throw new Error(msg);
      }

      if (!data.signedUrl || !data.videoId || !data.token || !data.path) {
        throw new Error("Invalid server response");
      }

      videoIdRef.current = data.videoId;
      setPhase("uploading");

      const supabase = createClient();
      const { error: storageError } = await supabase.storage
        .from("videos")
        .uploadToSignedUrl(data.path, data.token, file);

      if (storageError) throw new Error(storageError.message);

      await supabase
        .from("videos")
        .update({ status: "uploaded" })
        .eq("id", data.videoId);

      toast.success("Upload complete! Processing will begin shortly.");
      router.push(`/videos/${data.videoId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed. Please try again.";
      setUploadError(msg);
      setPhase("error");

      if (videoIdRef.current) {
        await fetch(`/api/upload?videoId=${videoIdRef.current}`, {
          method: "DELETE",
        }).catch(() => undefined);
        videoIdRef.current = null;
      }
    }
  };

  // ── UPLOADING SCREEN ──────────────────────────────────────────────────────
  if (phase === "preparing" || phase === "uploading") {
    return (
      <Card>
        <CardContent className="p-10 space-y-4 text-center">
          <Loader2 className="size-8 mx-auto text-violet-500 animate-spin" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {phase === "preparing" ? "Preparing upload…" : "Uploading your file…"}
          </p>
          <Progress value={null} />
          <p className="text-xs text-slate-400">Do not close this window</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── DROP ZONE / FILE INFO ─────────────────────────────────────────── */}
      {!file ? (
        <div
          {...getRootProps()}
          className={[
            "border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors select-none",
            isDragActive
              ? "border-violet-400 bg-violet-50 dark:bg-violet-950/20"
              : "border-slate-200 dark:border-slate-700 hover:border-violet-300 dark:hover:border-violet-700",
          ].join(" ")}
        >
          <input {...getInputProps()} />
          <Upload className="size-10 mx-auto mb-4 text-slate-400" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            {isDragActive ? "Drop your file here" : "Drag & drop your video or audio"}
          </p>
          <p className="text-xs text-slate-400 mb-4">
            MP4, MOV, WEBM, MP3, M4A, WAV · Max 50MB
          </p>
          <Button type="button" variant="outline" size="sm">
            Browse files
          </Button>
        </div>
      ) : (
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            {file.type.startsWith("audio/") ? (
              <Music className="size-8 text-violet-500 shrink-0" />
            ) : (
              <Film className="size-8 text-violet-500 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                {file.name}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {(file.size / 1024 / 1024).toFixed(1)} MB
                {duration !== null && ` · ${formatDur(duration)}`}
                {duration === null && " · detecting duration…"}
              </p>
            </div>
            <button
              type="button"
              onClick={clearFile}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 shrink-0"
            >
              <X className="size-4" />
              <span className="sr-only">Remove file</span>
            </button>
          </CardContent>
        </Card>
      )}

      {/* ── FILE VALIDATION ERROR ─────────────────────────────────────────── */}
      {fileError && (
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
          <AlertCircle className="size-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-400">{fileError}</p>
        </div>
      )}

      {/* ── CONFIGURATION + CREDIT CALC + SUBMIT (shown when file selected) ── */}
      {file && (
        <>
          <Card>
            <CardContent className="p-6 space-y-6">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Configuration
              </h3>

              {/* Content type */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Content type
                </label>
                <select
                  value={contentType}
                  onChange={(e) => setContentType(e.target.value as ContentType)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                >
                  {CONTENT_TYPES.map((ct) => (
                    <option key={ct.value} value={ct.value}>
                      {ct.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Clip count */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    Number of clips
                  </label>
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1">
                    {plan === "free" ? 5 : clipCount} clips
                    {plan === "free" && <Lock className="size-3 text-slate-400" />}
                  </span>
                </div>
                {plan === "free" ? (
                  <p className="text-xs text-slate-400">
                    Upgrade to Creator or Pro to generate 5–15 clips per video
                  </p>
                ) : (
                  <Slider
                    min={5}
                    max={15}
                    value={[clipCount]}
                    onValueChange={(val) => {
                      const v = Array.isArray(val) ? val[0] : val;
                      if (typeof v === "number") setClipCount(v);
                    }}
                  />
                )}
              </div>

              {/* Caption style */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Caption style
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {CAPTION_STYLES.map((s) => {
                    const locked = !s.free && plan === "free";
                    const active = captionStyle === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        disabled={locked}
                        onClick={() => !locked && setCaptionStyle(s.id)}
                        className={[
                          "relative text-left rounded-lg border p-3 transition-all",
                          active
                            ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30"
                            : "border-slate-200 dark:border-slate-700",
                          locked
                            ? "opacity-50 cursor-not-allowed"
                            : "hover:border-violet-300 dark:hover:border-violet-700 cursor-pointer",
                        ].join(" ")}
                      >
                        <span className="text-xs font-medium text-slate-900 dark:text-slate-100 block">
                          {s.name}
                        </span>
                        <span className="text-xs text-slate-500 block mt-0.5">
                          {s.desc}
                        </span>
                        {locked && (
                          <Badge
                            variant="outline"
                            className="absolute top-2 right-2 text-[10px] leading-none px-1.5 py-0.5 border-violet-300 text-violet-600 dark:border-violet-700 dark:text-violet-400"
                          >
                            Creator
                          </Badge>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Language */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Language
                </label>
                <div className="flex gap-5">
                  {(
                    [
                      { value: "en", label: "English" },
                      { value: "auto", label: "Auto-detect" },
                    ] as const
                  ).map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="language"
                        value={opt.value}
                        checked={language === opt.value}
                        onChange={() => setLanguage(opt.value)}
                        className="accent-violet-600"
                      />
                      <span className="text-sm text-slate-700 dark:text-slate-300">
                        {opt.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Credit calculator */}
          <CreditCalculator
            duration={duration}
            creditsRemaining={creditsRemaining}
            plan={plan}
          />

          {/* Upload error */}
          {phase === "error" && uploadError && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
              <AlertCircle className="size-4 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-red-700 dark:text-red-400">{uploadError}</p>
                <button
                  type="button"
                  onClick={() => { setPhase("idle"); setUploadError(null); }}
                  className="text-xs text-red-600 dark:text-red-400 underline mt-1"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {/* Start button */}
          <Button
            className="w-full"
            onClick={startUpload}
            disabled={!canUpload}
          >
            <Upload className="size-4" />
            Start Processing
          </Button>
        </>
      )}
    </div>
  );
}

function formatDur(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
