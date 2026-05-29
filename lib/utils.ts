import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function getCreditsNeeded(durationSeconds: number): number {
  if (durationSeconds <= 1800) return 1  // ≤30 min
  if (durationSeconds <= 5400) return 2  // ≤90 min
  return 4                                // ≤180 min
}
