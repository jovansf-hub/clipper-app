import { Inngest } from "inngest";

const isDev = process.env.NODE_ENV === "development";

export const inngest = new Inngest({
  id: "clipper-app",
  // In dev mode, Inngest CLI auto-detects. Only set eventKey in production.
  ...(isDev ? {} : { eventKey: process.env.INNGEST_EVENT_KEY }),
});

export type Events = {
  "video/uploaded": { data: { videoId: string; userId: string } };
  "video/transcribed": { data: { videoId: string } };
  "video/failed": { data: { videoId: string; step: string; error: string } };
};
