"use client";

import { useState, useCallback, useRef, type CSSProperties } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  UploadCloud,
  Film,
  Music,
  X,
  Sparkles,
  ArrowRight,
  Lock,
  AlertTriangle,
} from "lucide-react";
import { getCreditsNeeded, formatDuration } from "@/lib/utils";
import { MAX_FILE_SIZE, MAX_FILE_SIZE_LABEL } from "@/lib/constants";
import "./upload/upload-zone.css";

type Plan = "free" | "creator" | "pro";
type ContentType = "podcast" | "interview" | "talk" | "tutorial" | "vlog";
type CaptionStyle = "tiktok_highlight" | "karaoke" | "classic" | "minimal";
type Phase = "idle" | "selected" | "uploading";

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
  uploadUrl?: string;
  videoId?: string;
  key?: string;
  contentType?: string;
  error?: string;
  reason?: string;
}

interface VideoUploaderProps {
  plan: Plan;
  creditsRemaining: number;
}

function fmtSize(bytes: number): string {
  if (!bytes) return "—";
  const mb = bytes / (1024 * 1024);
  return mb >= 1000 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`;
}

/**
 * Real-progress raw PUT to a Cloudflare R2 presigned URL. The presigned URL
 * carries the AWS SigV4 auth in its query params, so the only request header is
 * Content-Type — which MUST equal the contentType the server returned (R2 stores
 * it as the object's content type; it's outside the signature, so no 403 risk).
 * xhr.upload.onprogress drives the real percentage.
 */
function uploadFileToR2WithProgress(params: {
  uploadUrl: string;
  file: File;
  contentType: string;
  onProgress: (pct: number) => void;
}): Promise<void> {
  const { uploadUrl, file, contentType, onProgress } = params;
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", contentType);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress((e.loaded / e.total) * 100);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (HTTP ${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.onabort = () => reject(new Error("Upload was cancelled"));

    xhr.send(file);
  });
}

export function VideoUploader({ plan, creditsRemaining }: VideoUploaderProps) {
  const router = useRouter();

  // File
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  // Config (unchanged settings — only restyled below)
  const [contentType, setContentType] = useState<ContentType>("podcast");
  const [clipCount, setClipCount] = useState(5);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>("tiktok_highlight");
  const [language, setLanguage] = useState<"en" | "auto">("en");

  // Upload
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [uploadLabel, setUploadLabel] = useState("Preparing upload…");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const videoIdRef = useRef<string | null>(null);
  // Guards against a fast double-click on "Generate clips" creating two video
  // rows / two storage uploads. Reset on every exit path of startUpload.
  const submittingRef = useRef(false);

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
      setUploadError(null);

      if (rejected.length > 0) {
        const err = rejected[0]?.errors[0];
        if (err?.code === "file-too-large") {
          setFileError(`File too large. Max ${MAX_FILE_SIZE_LABEL}.`);
        } else {
          setFileError(`Unsupported file. Accepted: MP4, MOV, WEBM, MP3, M4A, WAV · Max ${MAX_FILE_SIZE_LABEL}.`);
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
      setPhase("selected");
    },
    [plan, detectDuration]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: ALLOWED_ACCEPT,
    maxSize: MAX_FILE_SIZE,
    disabled: phase === "uploading",
  });

  const creditsNeeded = duration !== null ? getCreditsNeeded(duration) : null;
  const creditsAfter = creditsNeeded !== null ? creditsRemaining - creditsNeeded : null;
  const hasSufficient = creditsAfter !== null && creditsAfter >= 0;
  const tooLarge = !!file && file.size > MAX_FILE_SIZE;
  const canUpload = !!file && duration !== null && hasSufficient && !tooLarge;

  const clearFile = () => {
    setFile(null);
    setDuration(null);
    setFileError(null);
    setUploadError(null);
    setProgress(0);
    setPhase("idle");
    videoIdRef.current = null;
  };

  const startUpload = async () => {
    if (!file || duration === null || creditsNeeded === null) return;
    if (submittingRef.current) return;
    submittingRef.current = true;

    setPhase("uploading");
    setProgress(0);
    setUploadError(null);
    setUploadLabel("Preparing upload…");

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
      if (!res.ok) throw new Error(data.error ?? "Failed to prepare upload");
      if (!data.uploadUrl || !data.videoId || !data.contentType) {
        throw new Error("Invalid server response");
      }

      const videoId = data.videoId;
      videoIdRef.current = videoId;

      setUploadLabel(`Uploading ${file.name}`);
      await uploadFileToR2WithProgress({
        uploadUrl: data.uploadUrl,
        file,
        contentType: data.contentType,
        onProgress: (pct) => setProgress(pct),
      });
      setProgress(100);

      // Server verifies the file landed in storage before flipping to 'uploaded'.
      setUploadLabel("Finishing upload…");
      const completeRes = await fetch("/api/upload/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId }),
      });
      if (!completeRes.ok) {
        const err = (await completeRes.json()) as { error?: string };
        throw new Error(err.error ?? "Failed to confirm upload");
      }

      // Auto-start processing — replaces the old manual second click. This endpoint
      // does the atomic claim + credit deduction + Inngest video/uploaded event.
      setUploadLabel("Starting processing…");
      const processRes = await fetch(`/api/videos/${videoId}/process`, {
        method: "POST",
      });
      if (!processRes.ok) {
        // Non-fatal: row is in 'uploaded' state — the detail page shows a manual
        // "Start processing" fallback so the video isn't stuck. No throw, so we
        // don't delete the row or refund (credits weren't deducted on failure).
        const err = (await processRes.json().catch(() => ({}))) as { error?: string };
        toast.error(
          err.error ?? "Couldn't auto-start processing. You can start it from the video page."
        );
      } else {
        toast.success("Upload complete — generating your clips!");
      }

      submittingRef.current = false;
      router.push(`/videos/${videoId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed. Please try again.";
      setUploadError(msg);
      setPhase("selected");
      setProgress(0);
      submittingRef.current = false;

      // Clean up the orphan 'uploading' row. Processing was never triggered, so no
      // credits were spent and there's nothing to refund.
      if (videoIdRef.current) {
        await fetch(`/api/upload?videoId=${videoIdRef.current}`, {
          method: "DELETE",
        }).catch(() => undefined);
        videoIdRef.current = null;
      }
    }
  };

  const isAudio = file?.type.startsWith("audio/") ?? false;

  return (
    <div className="cz-root">
      <div className="cz-blob a" />
      <div className="cz-blob b" />
      <div className="cz-grain" />

      <div className="cz-card">
        <div className="cz-eyebrow">
          <span className="dot" /> Step 1 · Upload your video
        </div>

        {/* ---------- IDLE / DRAG ---------- */}
        {phase === "idle" && (
          <>
            <div
              {...getRootProps()}
              className={`cz-drop${isDragActive ? " drag" : ""}`}
            >
              <input {...getInputProps()} />
              <div className="cz-iconwrap">
                <UploadCloud size={38} strokeWidth={2.2} />
              </div>
              <h2 className="cz-title">
                {isDragActive ? (
                  <>
                    Drop it. <span className="hl">Let&apos;s go.</span>
                  </>
                ) : (
                  <>
                    Drop a video or <span className="hl">browse</span>
                  </>
                )}
              </h2>
              <p className="cz-sub">
                Upload your long-form video or audio and we&apos;ll cut it into
                scroll-stopping vertical clips, captioned and ready to post.
              </p>
              <div className="cz-formats">
                <span className="cz-chip">MP4</span>
                <span className="cz-chip">MOV</span>
                <span className="cz-chip">WEBM</span>
                <span className="cz-chip">MP3</span>
                <span className="cz-chip">up to {MAX_FILE_SIZE_LABEL}</span>
              </div>
            </div>

            {fileError && (
              <div className="cz-alert" style={{ marginTop: 16 }}>
                <AlertTriangle size={16} />
                <span>{fileError}</span>
              </div>
            )}
          </>
        )}

        {/* ---------- SELECTED (file + folded-in config) ---------- */}
        {phase === "selected" && file && (
          <div className="cz-panel">
            <div className="cz-file">
              <div className="cz-thumb">
                {isAudio ? (
                  <Music size={26} strokeWidth={2.2} />
                ) : (
                  <Film size={26} strokeWidth={2.2} />
                )}
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="cz-fname">{file.name}</div>
                <div className="cz-fmeta">
                  {fmtSize(file.size)}
                  {duration !== null
                    ? ` · ${formatDuration(duration)}`
                    : " · detecting duration…"}
                </div>
              </div>
              <button className="cz-x" onClick={clearFile} aria-label="Remove file">
                <X size={18} />
              </button>
            </div>

            <div className="cz-form">
              {/* Content type */}
              <div className="cz-field">
                <label className="cz-flabel" htmlFor="cz-content-type">
                  Content type
                </label>
                <select
                  id="cz-content-type"
                  className="cz-select"
                  value={contentType}
                  onChange={(e) => setContentType(e.target.value as ContentType)}
                >
                  {CONTENT_TYPES.map((ct) => (
                    <option key={ct.value} value={ct.value}>
                      {ct.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Clip count */}
              <div className="cz-field">
                <span className="cz-flabel">
                  Number of clips
                  <span className="val">
                    {plan === "free" ? 5 : clipCount} clips
                    {plan === "free" && <Lock size={12} />}
                  </span>
                </span>
                {plan === "free" ? (
                  <p className="cz-hint">
                    Upgrade to Creator or Pro to generate 5–15 clips per video.
                  </p>
                ) : (
                  <input
                    type="range"
                    className="cz-range"
                    min={5}
                    max={15}
                    value={clipCount}
                    onChange={(e) => setClipCount(Number(e.target.value))}
                  />
                )}
              </div>

              {/* Caption style */}
              <div className="cz-field">
                <span className="cz-flabel">Caption style</span>
                <div className="cz-styles">
                  {CAPTION_STYLES.map((s) => {
                    const locked = !s.free && plan === "free";
                    const active = captionStyle === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        disabled={locked}
                        onClick={() => !locked && setCaptionStyle(s.id)}
                        className={`cz-style${active ? " active" : ""}`}
                      >
                        <span className="cz-sname">{s.name}</span>
                        <span className="cz-sdesc">{s.desc}</span>
                        {locked && <span className="cz-styletag">Creator</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Language */}
              <div className="cz-field">
                <span className="cz-flabel">Language</span>
                <div className="cz-radios">
                  {(
                    [
                      { value: "en", label: "English" },
                      { value: "auto", label: "Auto-detect" },
                    ] as const
                  ).map((opt) => (
                    <label key={opt.value} className="cz-radio">
                      <input
                        type="radio"
                        name="language"
                        value={opt.value}
                        checked={language === opt.value}
                        onChange={() => setLanguage(opt.value)}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Credit summary */}
              {duration !== null && creditsNeeded !== null && (
                <div className={`cz-credits${hasSufficient ? "" : " low"}`}>
                  <div className="cz-crow">
                    <span className="k">This video costs</span>
                    <span className="v">
                      {creditsNeeded} credit{creditsNeeded !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="cz-crow">
                    <span className="k">You have</span>
                    <span className="v">{creditsRemaining} credits</span>
                  </div>
                  <div className="cz-crow total">
                    <span className="k">After processing</span>
                    <span className={`v${hasSufficient ? "" : " bad"}`}>
                      {creditsAfter} credits
                    </span>
                  </div>
                </div>
              )}

              {tooLarge && (
                <div className="cz-alert">
                  <AlertTriangle size={16} />
                  <span>
                    This file is {fmtSize(file.size)} — the limit is{" "}
                    {MAX_FILE_SIZE_LABEL}. Pick a smaller file to continue.
                  </span>
                </div>
              )}

              {!hasSufficient && duration !== null && (
                <div className="cz-alert">
                  <AlertTriangle size={16} />
                  <span>
                    Not enough credits. You need {creditsNeeded} but have{" "}
                    {creditsRemaining}. <a href="/billing">Upgrade plan</a>
                  </span>
                </div>
              )}

              {uploadError && (
                <div className="cz-alert">
                  <AlertTriangle size={16} />
                  <span>{uploadError}</span>
                </div>
              )}
            </div>

            <button className="cz-btn" onClick={startUpload} disabled={!canUpload}>
              <Sparkles size={19} strokeWidth={2.3} />
              Generate clips
              <ArrowRight className="arrow" size={19} strokeWidth={2.3} />
            </button>
          </div>
        )}

        {/* ---------- UPLOADING ---------- */}
        {phase === "uploading" && (
          <div className="cz-panel">
            <div className="cz-prow">
              <span className="cz-pct">{Math.round(progress)}%</span>
              <span className="cz-plabel">{uploadLabel}</span>
            </div>
            <div className="cz-track">
              <div
                className="cz-fill"
                style={{ width: `${Math.max(2, progress)}%` } as CSSProperties}
              />
            </div>
            <p className="cz-sub" style={{ textAlign: "left", marginTop: 6 }}>
              Keep this tab open — processing starts automatically.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
