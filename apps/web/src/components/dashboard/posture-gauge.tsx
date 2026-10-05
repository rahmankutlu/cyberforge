import { cn } from "@cyberforge/ui";
import { createTranslator, type Locale } from "@/lib/i18n";

export function postureTone(
  score: number,
  locale: Locale = "en",
): { label: string; className: string } {
  const t = createTranslator(locale);
  if (score >= 75) return { label: t("posture.strong"), className: "text-ok" };
  if (score >= 50) return { label: t("posture.fair"), className: "text-sev-medium" };
  return { label: t("posture.needsAttention"), className: "text-sev-high" };
}

/** A restrained ring gauge: one colour, no glow. The number matters more than the graphic. */
export function PostureGauge({
  score,
  size = 76,
  locale = "en",
}: {
  score: number;
  size?: number;
  locale?: Locale;
}) {
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const tone = postureTone(clamped, locale);
  const t = createTranslator(locale);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        viewBox="0 0 76 76"
        className="size-full -rotate-90"
        role="img"
        aria-label={t("posture.scoreLabel", { score: clamped })}
      >
        <circle cx="38" cy="38" r={radius} fill="none" stroke="var(--muted)" strokeWidth="6" />
        <circle
          cx="38"
          cy="38"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${(clamped / 100) * circumference} ${circumference}`}
          className={cn("transition-[stroke-dasharray]", tone.className)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-semibold tabular-nums leading-none">{clamped}</span>
        <span className="mt-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
          / 100
        </span>
      </div>
    </div>
  );
}
