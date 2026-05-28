import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { Coins, Film, Scissors, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/dashboard/stat-card";

const PLAN_CREDITS: Record<string, number> = {
  free: 5,
  creator: 50,
  pro: 200,
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  completed: "default",
  failed: "destructive",
  uploading: "outline",
  uploaded: "outline",
  transcribing: "secondary",
  analyzing: "secondary",
  clipping: "secondary",
};

const STATUS_LABEL: Record<string, string> = {
  uploading: "Uploading",
  uploaded: "Uploaded",
  transcribing: "Transcribing",
  analyzing: "Analyzing",
  clipping: "Clipping",
  completed: "Completed",
  failed: "Failed",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: profile }, { data: videos }] = await Promise.all([
    supabase
      .from("profiles")
      .select("email, plan, credits_remaining, credits_reset_at, videos_processed_total, clips_generated_total")
      .eq("id", user.id)
      .single(),
    supabase
      .from("videos")
      .select("id, title, status, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const plan = profile?.plan ?? "free";
  const creditsRemaining = profile?.credits_remaining ?? 0;
  const planLimit = PLAN_CREDITS[plan] ?? 5;
  const creditProgress = Math.round((creditsRemaining / planLimit) * 100);

  const resetAt = profile?.credits_reset_at
    ? format(new Date(profile.credits_reset_at), "MMM d")
    : null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Welcome back!
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {profile?.email ?? user.email}
          </p>
        </div>
        <Button render={<Link href="/upload" />} size="default" nativeButton={false}>
          <Upload className="size-4" />
          Upload Video
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title="Credits Remaining"
          value={`${creditsRemaining} / ${planLimit}`}
          icon={Coins}
          subtitle={resetAt ? `Resets ${resetAt}` : undefined}
          progress={creditProgress}
        />
        <StatCard
          title="Videos Processed"
          value={profile?.videos_processed_total ?? 0}
          icon={Film}
          subtitle="All time"
        />
        <StatCard
          title="Clips Generated"
          value={profile?.clips_generated_total ?? 0}
          icon={Scissors}
          subtitle="All time"
        />
      </div>

      {/* Recent videos */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Recent Videos</CardTitle>
            {videos && videos.length > 0 && (
              <Link
                href="/videos"
                className="text-sm text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
              >
                View all
              </Link>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!videos || videos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Film className="size-12 text-slate-300 dark:text-slate-700 mb-4" />
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-1">
                No videos yet
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                Upload your first video and let AI find the viral moments.
              </p>
              <Button render={<Link href="/upload" />} nativeButton={false}>
                <Upload className="size-4" />
                Upload your first video
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {videos.map((video) => (
                <div
                  key={video.id}
                  className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/videos/${video.id}`}
                      className="text-sm font-medium text-slate-900 dark:text-slate-100 hover:underline truncate block"
                    >
                      {video.title}
                    </Link>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {format(new Date(video.created_at), "MMM d, yyyy")}
                    </p>
                  </div>
                  <Badge variant={STATUS_VARIANT[video.status] ?? "outline"}>
                    {STATUS_LABEL[video.status] ?? video.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
