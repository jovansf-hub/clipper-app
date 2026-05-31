import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import {
  processVideo,
  handleProcessVideoFailure,
} from "@/inngest/functions/process-video";

const isDev = process.env.NODE_ENV === "development";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processVideo, handleProcessVideoFailure],
  ...(isDev ? {} : { signingKey: process.env.INNGEST_SIGNING_KEY }),
});
