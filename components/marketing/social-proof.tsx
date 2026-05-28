const logos = ["Podcasters", "YouTubers", "Clippers", "Agencies", "Course Creators"];

export function SocialProof() {
  return (
    <section className="border-y border-slate-200 bg-slate-50 py-10">
      <div className="mx-auto max-w-7xl px-6">
        <p className="mb-6 text-center text-sm font-medium text-slate-500">
          Built for creators, clippers, and agencies
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          {logos.map((name) => (
            <div
              key={name}
              className="flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-6 text-sm font-medium text-slate-400"
            >
              {name}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
