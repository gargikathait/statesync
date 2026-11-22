import type { ComponentType, SVGProps } from "react";
import { cn } from "@/lib/cn";
import { AlertIcon, CheckIcon, ClockIcon, OfflineIcon, ResumeIcon, SyncIcon } from "./icons";

/** The six synchronisation states from the product spec. */
export type SyncState = "synced" | "syncing" | "offline" | "pending" | "conflict" | "recovery";

interface Config {
  label: string;
  classes: string;
  iconClass: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  spin?: boolean;
}

export const syncStates: Record<SyncState, Config> = {
  synced: { label: "Synced", Icon: CheckIcon, classes: "bg-success-bg text-success-fg", iconClass: "text-success-icon" },
  syncing: { label: "Syncing", Icon: SyncIcon, spin: true, classes: "bg-info-bg text-info-fg", iconClass: "text-info-icon" },
  offline: { label: "Offline", Icon: OfflineIcon, classes: "bg-surface text-ink border-line-strong", iconClass: "text-ink" },
  pending: { label: "Pending changes", Icon: ClockIcon, classes: "bg-warning-bg text-warning-fg", iconClass: "text-warning-icon" },
  conflict: { label: "Conflict detected", Icon: AlertIcon, classes: "bg-error-bg text-error-fg", iconClass: "text-error-icon" },
  recovery: { label: "Recovery available", Icon: ResumeIcon, classes: "bg-accent text-on-accent border-line-strong", iconClass: "text-on-accent" },
};

/** State is conveyed by text and icon shape, never by colour alone. */
export function StatusPill({ state, className }: { state: SyncState; className?: string }) {
  const { label, Icon, classes, iconClass, spin } = syncStates[state];
  return (
    <span
      data-state={state}
      className={cn(
        "ss-forced-border inline-flex items-center gap-1.5 rounded-full border border-transparent px-2.5 py-0.5 text-sm font-medium",
        classes,
        className,
      )}
    >
      <Icon className={cn(iconClass, spin && "motion-safe:animate-spin")} />
      {label}
    </span>
  );
}
