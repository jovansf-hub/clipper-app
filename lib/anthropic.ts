import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface ViralMoment {
  start_time: number;
  end_time: number;
  duration: number;
  hook_type: "humor" | "insight" | "controversy" | "emotional" | "actionable" | "surprising";
  viral_score: number;
  title: string;
  reasoning: string;
  transcript_excerpt: string;
}

export interface ViralAnalysisResult {
  moments: ViralMoment[];
  reasoning: string;
  content_summary: string;
}

export async function analyzeViralMoments(
  transcript: {
    text: string;
    duration: number;
    segments: Array<{ start: number; end: number; text: string }>;
  },
  config: {
    contentType: string;
    clipCount: number;
    language: string;
  }
): Promise<ViralAnalysisResult> {
  if (!transcript.text || transcript.text.trim().length < 50) {
    return {
      moments: [],
      reasoning: "Transcript too short to identify viral moments.",
      content_summary: transcript.text || "Empty content",
    };
  }

  const segmentsWithTimestamps = transcript.segments
    .map((s) => `[${s.start.toFixed(1)}s - ${s.end.toFixed(1)}s] ${s.text}`)
    .join("\n");

  const systemPrompt = `You are an expert viral content analyst for short-form video platforms (TikTok, Instagram Reels, YouTube Shorts).

Your job: Analyze a transcript and identify the most viral moments that would perform well as standalone short clips.

CONTENT TYPE: ${config.contentType}
LANGUAGE: ${config.language}
TARGET CLIP COUNT: up to ${config.clipCount}
TOTAL DURATION: ${transcript.duration.toFixed(0)} seconds

CRITERIA for viral moments (rank by potential):
1. **Hooks** - statements that grab attention in 1-2 seconds
2. **Humor** - genuinely funny moments, witty observations
3. **Insights** - "aha" moments, counter-intuitive truths, expert takes
4. **Controversy** - bold opinions, hot takes, debate-worthy statements
5. **Emotional peaks** - heartfelt, raw, personal moments
6. **Actionable advice** - specific, immediately usable tips
7. **Surprising stories** - unexpected anecdotes, plot twists

CLIP DURATION RULES:
- Sweet spot: 15-45 seconds (mobile attention span)
- Minimum: 10 seconds (must have substance)
- Maximum: 60 seconds (rarely worth it)
- Must include complete thoughts (don't cut mid-sentence)
- Add 1-2s padding before hook starts (allows for visual setup)

CONTENT TYPE OVERRIDES:
- podcast: prioritize humor + insights, expect 8-12 strong moments
- interview: focus on the guest's best soundbites
- talk/keynote: pick the most quotable moments
- tutorial: extract the most actionable single tips
- vlog: emotional and relatable moments

IMPORTANT:
- Don't force ${config.clipCount} moments if content doesn't have them
- Return fewer high-quality moments over many mediocre ones
- viral_score should be honest: 80+ = great, 60-79 = good, 40-59 = okay
- If transcript is too short or has no viral potential, return empty moments array

OUTPUT: Valid JSON only, no markdown fences. Match this exact schema:
{
  "moments": [
    {
      "start_time": number,
      "end_time": number,
      "duration": number,
      "hook_type": "humor|insight|controversy|emotional|actionable|surprising",
      "viral_score": number,
      "title": "string (5-8 words)",
      "reasoning": "string (1-2 lines why this is viral)",
      "transcript_excerpt": "string (exact text from transcript)"
    }
  ],
  "reasoning": "string (2-3 lines explaining your selection)",
  "content_summary": "string (1-2 lines what video is about)"
}`;

  const userPrompt = `Here is the transcript with timestamps:

${segmentsWithTimestamps}

Analyze and return the top ${config.clipCount} viral moments as JSON.`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  let rawText = textBlock.text.trim();

  if (rawText.startsWith("```json")) rawText = rawText.slice(7);
  if (rawText.startsWith("```")) rawText = rawText.slice(3);
  if (rawText.endsWith("```")) rawText = rawText.slice(0, -3);
  rawText = rawText.trim();

  let parsed: ViralAnalysisResult;
  try {
    parsed = JSON.parse(rawText) as ViralAnalysisResult;
  } catch {
    throw new Error(`Failed to parse Claude JSON response: ${rawText.slice(0, 200)}`);
  }

  if (!Array.isArray(parsed.moments)) {
    parsed.moments = [];
  }

  parsed.moments = parsed.moments
    .filter(
      (m) =>
        typeof m.start_time === "number" &&
        typeof m.end_time === "number" &&
        m.start_time >= 0 &&
        m.end_time > m.start_time &&
        m.end_time <= transcript.duration + 5
    )
    .map((m) => ({
      ...m,
      duration: m.end_time - m.start_time,
      viral_score: Math.max(0, Math.min(100, m.viral_score || 50)),
    }));

  return parsed;
}
