import { BrandMark } from "@/components/brand-mark";

/**
 * Shared auth card header — Gyrom wordmark + coral play-mark, a mono eyebrow,
 * and a Space Grotesk display title, matching the landing look.
 */
export function AuthHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BrandMark />
        <span className="font-[family-name:var(--font-space-grotesk)] text-lg font-bold text-foreground">
          Gyrom
        </span>
      </div>
      <div className="space-y-1.5">
        <p className="font-[family-name:var(--font-space-mono)] text-xs uppercase tracking-[0.18em] text-primary">
          {eyebrow}
        </p>
        <h1 className="font-[family-name:var(--font-space-grotesk)] text-2xl font-bold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
