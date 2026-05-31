import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
}

export interface TranscriptSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionResult {
  text: string;
  duration: number;
  language: string;
  segments: TranscriptSegment[];
  words: TranscriptWord[];
}

export async function transcribeAudio(
  audioUrl: string,
  language?: string
): Promise<TranscriptionResult> {
  const response = await fetch(audioUrl);
  if (!response.ok) {
    throw new Error(`Failed to download audio: ${response.status}`);
  }
  const audioBlob = await response.blob();

  const sizeMB = audioBlob.size / (1024 * 1024);
  if (sizeMB > 25) {
    throw new Error(
      `Audio too large for Groq direct (${sizeMB.toFixed(1)}MB > 25MB). Audio extraction needed - implementing in Day 7.`
    );
  }

  const mimeToExt: Record<string, string> = {
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/mp4": "m4a",
    "audio/m4a": "m4a",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/flac": "flac",
    "video/mp4": "mp4",
    "video/quicktime": "mp4",
    "video/webm": "webm",
  };

  const mimeType = audioBlob.type || "audio/mpeg";
  const extension = mimeToExt[mimeType] || "mp3";
  const fileName = `audio.${extension}`;

  const file = new File([audioBlob], fileName, { type: mimeType });

  const transcription = await groq.audio.transcriptions.create({
    file,
    model: "whisper-large-v3-turbo",
    response_format: "verbose_json",
    timestamp_granularities: ["word", "segment"],
    language: language && language !== "auto" ? language : undefined,
    temperature: 0,
  });

  return {
    text: transcription.text,
    duration: (transcription as unknown as { duration: number }).duration || 0,
    language:
      (transcription as unknown as { language: string }).language ||
      language ||
      "en",
    segments: (
      (transcription as unknown as { segments: TranscriptSegment[] })
        .segments || []
    ) as TranscriptSegment[],
    words: (
      (transcription as unknown as { words: TranscriptWord[] }).words || []
    ) as TranscriptWord[],
  };
}
