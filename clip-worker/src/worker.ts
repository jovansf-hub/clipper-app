// Cloudflare Worker — entry point for the clip-worker service.
// Handles auth (Bearer WORKER_SECRET) then routes to the Container
// instance via Durable Objects (Cloudflare Containers API).

import { Container } from "@cloudflare/containers";
import { env } from "cloudflare:workers";

export interface Env {
  CLIP_CONTAINER: DurableObjectNamespace;
  WORKER_SECRET: string;
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET: string;
  R2_ENDPOINT: string;
}

// Container class — extends Container<Env> (Durable Object backed by Docker image).
// defaultPort must match EXPOSE in Dockerfile and Bun.serve port in server.ts.
// sleepAfter: hibernates the container after inactivity to save cost.
// envVars: injects Worker Secrets into the Container process as process.env.*
export class ClipContainer extends Container<Env> {
  defaultPort = 8080;
  sleepAfter = "3m";
  envVars = {
    R2_ACCOUNT_ID: env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET: env.R2_BUCKET,
    R2_ENDPOINT: env.R2_ENDPOINT,
    WORKER_SECRET: env.WORKER_SECRET,
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Auth check — all requests must carry the shared secret
    const auth = request.headers.get("Authorization");
    if (!auth || auth !== `Bearer ${env.WORKER_SECRET}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Use a singleton container named "main".
    // For parallel processing in future, use idFromName(videoId) to get
    // per-video containers — each clip job gets its own isolated instance.
    const id = env.CLIP_CONTAINER.idFromName("main");
    const container = env.CLIP_CONTAINER.get(id);

    return container.fetch(request);
  },
} satisfies ExportedHandler<Env>;
