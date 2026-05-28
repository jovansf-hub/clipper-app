const steps = [
  {
    number: "01",
    title: "Upload your video",
    description:
      "Drop any podcast, interview, or long-form video. MP4, MOV, or WEBM up to 3 hours.",
  },
  {
    number: "02",
    title: "AI does the work",
    description:
      "Transcription, viral analysis, clipping, and captions — all automatic. Takes just a few minutes.",
  },
  {
    number: "03",
    title: "Download & post",
    description:
      "Get ready-to-post clips for every platform. Vertical 9:16 with burned-in captions.",
  },
];

export function HowItWorks() {
  return (
    <section className="bg-slate-50 py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            From upload to viral in 3 steps
          </h2>
        </div>

        <div className="relative grid grid-cols-1 gap-8 sm:grid-cols-3">
          <div className="absolute left-[calc(1/6*100%)] right-[calc(1/6*100%)] top-8 hidden h-px bg-slate-200 sm:block" />

          {steps.map(({ number, title, description }) => (
            <div
              key={number}
              className="relative flex flex-col items-center text-center"
            >
              <div className="relative mb-6 flex size-16 items-center justify-center rounded-full border-2 border-indigo-200 bg-white text-xl font-bold text-indigo-600 shadow-sm">
                {number}
              </div>
              <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-600">
                {description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
