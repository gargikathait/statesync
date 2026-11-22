import type { ComponentType, ReactNode, SVGProps } from "react";
import { cn } from "@/lib/cn";
import { AlertIcon, CheckIcon, InfoIcon } from "./icons";

export type CalloutTone = "info" | "success" | "warning" | "error";

const tones: Record<CalloutTone, { box: string; icon: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }> = {
  info: { box: "bg-info-bg text-info-fg border-info-icon", icon: "text-info-icon", Icon: InfoIcon },
  success: { box: "bg-success-bg text-success-fg border-success-icon", icon: "text-success-icon", Icon: CheckIcon },
  warning: { box: "bg-warning-bg text-warning-fg border-warning-icon", icon: "text-warning-icon", Icon: AlertIcon },
  error: { box: "bg-error-bg text-error-fg border-error-icon", icon: "text-error-icon", Icon: AlertIcon },
};

export function Callout({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: CalloutTone;
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  const { box, icon, Icon } = tones[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("ss-forced-border flex gap-3 rounded-control border-l-4 p-4", box, className)}
    >
      <Icon className={cn("mt-1 shrink-0", icon)} width={18} height={18} />
      <div>
        <p className="font-semibold">{title}</p>
        {children ? <div className="mt-1 text-[0.9375rem]">{children}</div> : null}
      </div>
    </div>
  );
}
