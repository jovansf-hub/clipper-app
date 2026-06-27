import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VideoUploader } from "@/components/video-uploader";

export default async function UploadPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, credits_remaining")
    .eq("id", user.id)
    .single();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Upload Video
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Drop your video or audio file and let AI find the viral moments
        </p>
      </div>
      <VideoUploader
        plan={profile?.plan ?? "free"}
        creditsRemaining={profile?.credits_remaining ?? 0}
      />
    </div>
  );
}
