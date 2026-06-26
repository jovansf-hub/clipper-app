import type { Metadata } from "next";
import { ClipperLanding } from "@/components/marketing/clipper-landing";

export const metadata: Metadata = {
  title: "Gyrom — AI Video Clipper for Podcasts, Interviews and Long Videos",
  description:
    "Gyrom turns long videos into short, vertical clips for TikTok, Reels and YouTube Shorts. Free during beta.",
};

export default function LandingPage() {
  return <ClipperLanding />;
}
