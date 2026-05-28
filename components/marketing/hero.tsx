import Link from "next/link";
import { Play } from "lucide-react";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-white py-24 sm:py-32">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(99,102,241,0.1),transparent)]" />

      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-4 py-1.5 text-sm font-medium text-indigo-700">
            <span className="inline-block size-1.5 animate-pulse rounded-full bg-indigo-500" />
            Now in early access
          </div>

          <h1 className="text-5xl font-extrabold tracking-tight text-slate-900 sm:text-6xl lg:text-7xl">
            Turn long videos into{" "}
            <span className="text-indigo-600">viral clips.</span>{" "}
            In minutes.
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-xl leading-relaxed text-slate-600">
            Upload your podcast, talk, or interview. Our AI finds the 10 most
            viral moments, adds captions, and reframes them for TikTok, Reels &
            Shorts — automatically.
          </p>

          <div className="mt-10 flex flex-col items-center gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-8 py-4 text-base font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-200"
            >
              Start free — no credit card
            </Link>
            <p className="text-sm text-slate-500">5 free clips every month</p>
          </div>
        </div>

        {/* Demo placeholder */}
        <div className="mx-auto mt-16 max-w-4xl">
          <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl border border-slate-800/50 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 shadow-2xl shadow-indigo-900/20">
            <div className="absolute inset-0 bg-[linear-gradient(rgba(99,102,241,0.05)_1px,transparent_1px),linear-gradient(to_right,rgba(99,102,241,0.05)_1px,transparent_1px)] bg-[size:40px_40px]" />

            <div className="relative flex flex-col items-center gap-4">
              <div className="flex size-16 items-center justify-center rounded-2xl border border-white/20 bg-white/10 shadow-lg backdrop-blur-sm">
                <Play className="ml-0.5 size-7 fill-white text-white" />
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-white">Demo coming soon</p>
                <p className="mt-1 text-sm text-slate-400">
                  Watch how Clipper turns a 2-hour podcast into 10 viral clips
                </p>
              </div>

              <div className="mt-2 flex gap-3">
                {[92, 87, 81].map((score) => (
                  <div
                    key={score}
                    className="flex w-24 flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 p-3"
                  >
                    <div className="aspect-[9/16] w-full rounded-lg border border-white/10 bg-gradient-to-b from-indigo-400/20 to-purple-400/20" />
                    <div className="flex items-center gap-1">
                      <div className="size-1.5 rounded-full bg-emerald-400" />
                      <span className="text-xs font-semibold text-white">{score}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
