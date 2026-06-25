import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Gyrom coral play-mark — the shared brand glyph used in the landing nav,
 * dashboard sidebar, and auth header. Uses the primary (coral) token + an
 * on-palette coral glow so it tracks theme/palette changes.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex size-6 items-center justify-center rounded-md bg-primary shadow-[0_0_14px_rgba(216,90,48,0.4)]",
        className
      )}
    >
      <Play className="size-3 fill-primary-foreground text-primary-foreground" />
    </span>
  );
}
