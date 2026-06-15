import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { processVideo } from "@/inngest/functions/process-video";
import { recoverStuckVideos } from "@/inngest/functions/recover-stuck-videos";

const isDev = process.env.NODE_ENV === "development";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processVideo, recoverStuckVideos],
  ...(isDev ? {} : { signingKey: process.env.INNGEST_SIGNING_KEY }),
});
