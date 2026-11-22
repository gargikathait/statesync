import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type PanelTone = "surface" | "raised" | "strong";

const tones: Record<PanelTone, string> = {
  surface: "bg-surface text-ink border-line",
  raised: "bg-raised text-ink border-line-strong/40",
  strong: "bg-strong text-on-strong border-transparent",
};

export interface PanelProps extends HTMLAttributes<HTMLElement> {
  tone?: PanelTone;
  as?: "section" | "div" | "article" | "aside";
}

export function Panel({ tone = "surface", as: Tag = "section", className, ...rest }: PanelProps) {
  return <Tag className={cn("ss-forced-border rounded-panel border p-5 sm:p-6", tones[tone], className)} {...rest} />;
}
