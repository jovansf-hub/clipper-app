"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const faqs = [
  {
    question: "How is this different from Opus Clip?",
    answer:
      "Opus Clip charges per minute of video processed, which gets expensive fast. Clipper charges per video upload regardless of length. We also use Claude — one of the world's best AI models — for viral analysis, meaning our clips have more context and nuance. Plus, your clips never expire.",
  },
  {
    question: "Can I cancel anytime?",
    answer:
      "Yes. No contracts, no cancellation fees. Cancel with one click from your billing page. You keep access to your existing clips after cancelling.",
  },
  {
    question: "What video formats are supported?",
    answer:
      "We support MP4, MOV, and WEBM files up to 2GB. Most recordings from Zoom, Riverside, Descript, CapCut, or your phone will work out of the box.",
  },
  {
    question: "How long does processing take?",
    answer:
      "Most videos process in 3–10 minutes depending on length. A 1-hour podcast typically takes about 5 minutes. Pro plan gets priority processing.",
  },
  {
    question: "Do clips expire?",
    answer:
      "Never on paid plans. Unlike Opus Clip (which deletes clips after 3 days on the free plan), your clips stay in your dashboard for the full retention period — even if you downgrade.",
  },
  {
    question: "What languages are supported?",
    answer:
      "The transcription engine (Groq Whisper) supports 50+ languages. Viral analysis is currently optimised for English content, with other languages coming soon.",
  },
  {
    question: "Do I need to install anything?",
    answer:
      "No. Clipper is fully web-based. Just sign up, upload, and download. No software to install, no plugins.",
  },
  {
    question: "Is there a free plan?",
    answer:
      "Yes. The Free plan gives you 5 credits per month — enough to clip 5 short videos. No credit card required to sign up.",
  },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section className="bg-white py-24">
      <div className="mx-auto max-w-3xl px-6">
        <div className="mb-16 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Frequently asked questions
          </h2>
        </div>

        <div className="divide-y divide-slate-200">
          {faqs.map(({ question, answer }, i) => (
            <div key={i}>
              <button
                className="flex w-full items-center justify-between py-5 text-left"
                onClick={() => setOpen(open === i ? null : i)}
              >
                <span className="text-base font-semibold text-slate-900">
                  {question}
                </span>
                <ChevronDown
                  className={cn(
                    "size-5 shrink-0 text-slate-400 transition-transform duration-200",
                    open === i && "rotate-180"
                  )}
                />
              </button>
              {open === i && (
                <p className="pb-5 text-sm leading-relaxed text-slate-600">
                  {answer}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
