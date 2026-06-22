/**
 * Shared app constants (safe for both client and server bundles — no secrets).
 */

/** Max source upload size. Single source of truth — imported everywhere. */
export const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1 GB

/** Human-readable size label, derived (no hardcoded numbers in the UI). */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) {
    const gb = bytes / 1024 ** 3;
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
  }
  const mb = bytes / 1024 ** 2;
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}

/** e.g. "1 GB" — derived from MAX_FILE_SIZE. */
export const MAX_FILE_SIZE_LABEL = formatBytes(MAX_FILE_SIZE);
