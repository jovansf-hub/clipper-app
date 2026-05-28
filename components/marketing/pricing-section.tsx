import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const plans = [
  {
    name: "Free",
    price: "€0",
    period: "/month",
    description: "Try Clipper with no commitment.",
    features: [
      "5 credits/month",
      "30 min max video length",
      "Watermark on clips",
      "1 caption style",
    ],
    cta: "Start free",
    href: "/signup",
    popular: false,
  },
  {
    name: "Creator",
    price: "€12",
    period: "/month",
    description: "For serious creators who post consistently.",
    features: [
      "50 credits/month",
      "90 min max video length",
      "No watermark",
      "All 4 caption styles",
      "Viral scores",
    ],
    cta: "Get Creator",
    href: "/signup?plan=creator",
    popular: true,
  },
  {
    name: "Pro",
    price: "€29",
    period: "/month",
    description: "For agencies and power users.",
    features: [
      "200 credits/month",
      "3 hour max video length",
      "Priority processing",
      "No watermark",
      "All 4 caption styles",
      "Viral scores",
    ],
    cta: "Get Pro",
    href: "/signup?plan=pro",
    popular: false,
  },
];

export function PricingSection() {
  return (
    <section className="bg-white py-24" id="pricing">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Simple, transparent pricing
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Pay per video, not per minute. Cancel anytime.
          </p>
        </div>

        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 sm:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={cn(
                "relative flex flex-col rounded-2xl border p-8",
                plan.popular
                  ? "border-indigo-600 bg-indigo-600 text-white shadow-xl shadow-indigo-200"
                  : "border-slate-200 bg-white"
              )}
            >
              {plan.popular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="inline-block rounded-full border border-indigo-400 bg-indigo-500 px-4 py-1 text-xs font-semibold text-white">
                    Most popular
                  </span>
                </div>
              )}

              <div className="mb-6">
                <p
                  className={cn(
                    "text-sm font-semibold",
                    plan.popular ? "text-indigo-200" : "text-indigo-600"
                  )}
                >
                  {plan.name}
                </p>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold">{plan.price}</span>
                  <span
                    className={cn(
                      "text-sm",
                      plan.popular ? "text-indigo-200" : "text-slate-500"
                    )}
                  >
                    {plan.period}
                  </span>
                </div>
                <p
                  className={cn(
                    "mt-2 text-sm",
                    plan.popular ? "text-indigo-200" : "text-slate-500"
                  )}
                >
                  {plan.description}
                </p>
              </div>

              <ul className="mb-8 flex-1 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2.5 text-sm">
                    <Check
                      className={cn(
                        "size-4 shrink-0",
                        plan.popular ? "text-indigo-200" : "text-indigo-600"
                      )}
                    />
                    <span className={plan.popular ? "text-indigo-50" : "text-slate-700"}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <Link
                href={plan.href}
                className={cn(
                  "inline-flex items-center justify-center rounded-full py-3 text-sm font-semibold transition-all",
                  plan.popular
                    ? "bg-white text-indigo-600 hover:bg-indigo-50"
                    : "bg-indigo-600 text-white hover:bg-indigo-700"
                )}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
