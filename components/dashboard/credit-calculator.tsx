"use client";

import Link from "next/link";
import { Coins, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDuration, getCreditsNeeded } from "@/lib/utils";

type Plan = "free" | "creator" | "pro";

interface CreditCalculatorProps {
  duration: number | null;
  creditsRemaining: number;
  plan: Plan;
}

export function CreditCalculator({
  duration,
  creditsRemaining,
  plan: _plan,
}: CreditCalculatorProps) {
  if (duration === null) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center gap-3 text-slate-500 dark:text-slate-400">
          <Coins className="size-4 shrink-0" />
          <p className="text-sm">
            Credit cost will be calculated once duration is detected
          </p>
        </CardContent>
      </Card>
    );
  }

  const creditsNeeded = getCreditsNeeded(duration);
  const creditsAfter = creditsRemaining - creditsNeeded;
  const hasSufficient = creditsAfter >= 0;

  return (
    <Card
      className={
        !hasSufficient ? "border-red-200 dark:border-red-800" : undefined
      }
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Coins className="size-4 text-slate-500" />
          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
            Credit cost
          </span>
        </div>

        <div className="space-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Video duration</span>
            <span className="text-slate-900 dark:text-slate-100">
              {formatDuration(duration)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">This video costs</span>
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {creditsNeeded} credit{creditsNeeded !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">You have</span>
            <span className="text-slate-900 dark:text-slate-100">
              {creditsRemaining} credits
            </span>
          </div>
          <div className="border-t border-slate-100 dark:border-slate-800 pt-1.5 flex items-center justify-between">
            <span className="text-slate-500">After upload</span>
            <span
              className={`font-semibold ${
                hasSufficient
                  ? "text-slate-900 dark:text-slate-100"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {creditsAfter} credits
            </span>
          </div>
        </div>

        {!hasSufficient && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
            <AlertTriangle className="size-4 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs text-red-700 dark:text-red-400">
                Not enough credits. You need {creditsNeeded} but have{" "}
                {creditsRemaining}.
              </p>
              <Button
                render={<Link href="/billing" />}
                nativeButton={false}
                size="xs"
                className="mt-2"
              >
                Upgrade plan
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
