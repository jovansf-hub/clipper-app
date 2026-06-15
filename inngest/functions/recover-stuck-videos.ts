import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/server";

// Stuck-recovery backstop. The normal path (onFailure) handles failures, but if
// an Inngest run dies outright (process killed) onFailure never fires and the
// video is stranded in an in-flight status, charged but never refunded. This
// cron sweeps such rows and recovers them via refund_video_once (atomic flip +
// exactly-once refund). The 90-min threshold is well above the max legit
// lifetime (~40 min: pre-poll ~10 + #14 poll budget up to 30) so a live run is
// never touched. refund_video_once is idempotent, so re-runs are safe no-ops.
const STUCK_THRESHOLD_MS = 90 * 60 * 1000;
const IN_FLIGHT = ["transcribing", "analyzing", "clipping"] as const;

export const recoverStuckVideos = inngest.createFunction(
  {
    id: "recover-stuck-videos",
    name: "Recover Stuck Videos",
    triggers: [{ cron: "*/15 * * * *" }],
  },
  async ({ step }) => {
    const result = await step.run("recover", async () => {
      const supabase = createAdminClient();
      const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS).toISOString();

      const { data: stuck, error } = await supabase
        .from("videos")
        .select("id")
        .in("status", IN_FLIGHT as unknown as string[])
        .lt("processing_started_at", cutoff);
      if (error) throw error;

      let recovered = 0;
      for (const v of stuck ?? []) {
        const { data: didRefund, error: rpcErr } = await supabase.rpc(
          "refund_video_once",
          {
            p_video_id: v.id,
            p_error_step: "stuck-recovery",
            p_error_message:
              "Auto-recovered: processing exceeded 90 min with no terminal state",
          }
        );
        if (rpcErr) {
          // Don't fail the whole sweep on one bad row — log and continue.
          console.error(`[stuck-recovery] ${v.id} RPC failed: ${rpcErr.message}`);
          continue;
        }
        if (didRefund) recovered++;
      }

      return { scanned: (stuck ?? []).length, recovered };
    });

    console.log(
      `[stuck-recovery] scanned=${result.scanned} recovered=${result.recovered}`
    );
    return result;
  }
);
