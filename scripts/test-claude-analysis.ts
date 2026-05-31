import { analyzeViralMoments } from "../lib/anthropic";

const fakeTranscript = {
  text: "Look, I tell people this all the time and they don't believe me. The biggest lie in business is that you need to work 80 hours a week to succeed. That's complete garbage. The truth is, most successful entrepreneurs I know work focused 4-hour blocks. The real secret? Saying no to 99% of opportunities. Steve Jobs said innovation is saying no to a thousand things. He was right. When I started my company, I made one rule: every Monday morning, I write down three things. Just three. If I do those three things, the day is a success. Everything else is a bonus. This changed my life. People always ask me how I built a 10 million dollar company in 18 months. The honest answer? I wasn't smarter than anyone else. I just refused to be distracted. That's the real superpower in 2025.",
  duration: 74.0,
  segments: [
    { id: 0, start: 0.0, end: 5.5, text: "Look, I tell people this all the time and they don't believe me." },
    { id: 1, start: 5.5, end: 12.0, text: "The biggest lie in business is that you need to work 80 hours a week to succeed." },
    { id: 2, start: 12.0, end: 14.5, text: "That's complete garbage." },
    { id: 3, start: 14.5, end: 22.0, text: "The truth is, most successful entrepreneurs I know work focused 4-hour blocks." },
    { id: 4, start: 22.0, end: 27.5, text: "The real secret? Saying no to 99% of opportunities." },
    { id: 5, start: 27.5, end: 33.0, text: "Steve Jobs said innovation is saying no to a thousand things. He was right." },
    { id: 6, start: 33.0, end: 38.0, text: "When I started my company, I made one rule:" },
    { id: 7, start: 38.0, end: 44.0, text: "every Monday morning, I write down three things. Just three." },
    { id: 8, start: 44.0, end: 49.0, text: "If I do those three things, the day is a success. Everything else is a bonus." },
    { id: 9, start: 49.0, end: 52.0, text: "This changed my life." },
    { id: 10, start: 52.0, end: 59.0, text: "People always ask me how I built a 10 million dollar company in 18 months." },
    { id: 11, start: 59.0, end: 64.0, text: "The honest answer? I wasn't smarter than anyone else." },
    { id: 12, start: 64.0, end: 69.0, text: "I just refused to be distracted." },
    { id: 13, start: 69.0, end: 74.0, text: "That's the real superpower in 2025." },
  ],
};

(async () => {
  console.log("[Test] Calling Claude Haiku for viral moment analysis...");
  const startTime = Date.now();

  try {
    const result = await analyzeViralMoments(fakeTranscript, {
      contentType: "podcast",
      clipCount: 5,
      language: "en",
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[Test] Completed in ${elapsed}s`);
    console.log("[Test] Result:");
    console.log(JSON.stringify(result, null, 2));
    console.log(`\n[Test] Found ${result.moments.length} viral moments`);
  } catch (err) {
    console.error("[Test] FAILED:", err);
    process.exit(1);
  }
})();
