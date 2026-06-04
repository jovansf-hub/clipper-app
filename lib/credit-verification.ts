import { getCreditsNeeded } from "@/lib/utils";

export function calculateCreditCorrection(params: {
  realDurationSeconds: number;
  reportedDurationSeconds: number;
  creditsUsed: number;
}): {
  needsCorrection: boolean;
  realCredits: number;
  reportedCredits: number;
  diff: number;
} {
  const realCredits     = getCreditsNeeded(Math.ceil(params.realDurationSeconds));
  const reportedCredits = getCreditsNeeded(params.reportedDurationSeconds);
  const needsCorrection = realCredits > reportedCredits;
  return {
    needsCorrection,
    realCredits,
    reportedCredits,
    diff: needsCorrection ? realCredits - params.creditsUsed : 0,
  };
}
