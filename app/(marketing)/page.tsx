import type { Metadata } from "next";
import { ClipperLanding } from "@/components/marketing/clipper-landing";

export const metadata: Metadata = {
  title: "Gyrom — find the clips hiding in your long videos",
  description:
    "Drop in a podcast, interview, or stream. Gyrom finds the moments worth posting, adds captions, and reframes them vertical for TikTok, Reels, and Shorts.",
};

export default function LandingPage() {
  return <ClipperLanding />;
}
