import { Check, X } from "lucide-react";

const rows = [
  {
    feature: "Pricing model",
    opus: "Per minute (punishing)",
    clipper: "Per video (fair)",
  },
  {
    feature: "Clips expire",
    opus: "Yes (3 days on free)",
    clipper: "Never",
  },
  {
    feature: "Editor included",
    opus: "Pro plan only",
    clipper: "All paid plans",
  },
  {
    feature: "Cancel anytime",
    opus: "Hard to cancel",
    clipper: "One click",
  },
  {
    feature: "AI context understanding",
    opus: "Limited",
    clipper: "Powered by Claude",
  },
];

export function Comparison() {
  return (
    <section className="bg-slate-50 py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Why creators switch to Clipper
          </h2>
        </div>

        <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="w-1/2 px-6 py-4 text-left text-sm font-semibold text-slate-600">
                  Feature
                </th>
                <th className="px-6 py-4 text-center text-sm font-semibold text-slate-400">
                  Opus Clip
                </th>
                <th className="px-6 py-4 text-center text-sm font-semibold text-indigo-600">
                  Clipper
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ feature, opus, clipper }, i) => (
                <tr
                  key={feature}
                  className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}
                >
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">
                    {feature}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <X className="size-4 text-red-400" />
                      <span className="text-xs text-slate-500">{opus}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <Check className="size-4 text-emerald-500" />
                      <span className="text-xs font-medium text-indigo-600">
                        {clipper}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
