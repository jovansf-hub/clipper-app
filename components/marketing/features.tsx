import { Crop, MessageSquare, Sparkles } from "lucide-react";

const features = [
  {
    icon: Sparkles,
    title: "AI finds viral moments",
    description:
      "Our AI analyzes your entire video and picks the moments most likely to go viral — humor, hot takes, emotional peaks.",
  },
  {
    icon: MessageSquare,
    title: "Auto-captions in 4 styles",
    description:
      "Word-by-word animated captions that grab attention. TikTok highlight, karaoke, classic, and minimal styles.",
  },
  {
    icon: Crop,
    title: "Smart 9:16 reframe",
    description:
      "Face-tracking automatically keeps the speaker centered when converting to vertical format.",
  },
];

export function Features() {
  return (
    <section className="bg-white py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Everything you need to go viral
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            No editing experience needed. Clipper handles everything from
            transcription to final export.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          {features.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="group relative rounded-2xl border border-slate-200 bg-white p-8 transition-shadow hover:shadow-lg"
            >
              <div className="mb-4 inline-flex size-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 transition-colors group-hover:bg-indigo-100">
                <Icon className="size-6" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
