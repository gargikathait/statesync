import { cn } from "@/lib/cn";
import { MutedIcon, PinIcon } from "./icons";

export interface TabItem {
  id: string;
  title: string;
  host: string;
  pinned?: boolean;
  active?: boolean;
  muted?: boolean;
}

/**
 * Browser-style representation of captured tabs (read-only). Mirrors browser
 * conventions: pinned tabs collapse to a monogram, the active tab joins the
 * content below it, muted state is shown with an icon plus text for screen readers.
 * Real favicons arrive with capture; until then a monogram stands in.
 */
export function TabStrip({ tabs, label }: { tabs: TabItem[]; label: string }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className="overflow-x-auto rounded-t-control">
      <ul className="flex min-w-max items-end gap-1 border-b border-line-strong bg-surface px-2 pt-2">
        {tabs.map((t) => (
          <li key={t.id}>
            <div
              aria-current={t.active ? "true" : undefined}
              className={cn(
                "flex h-9 items-center gap-2 rounded-t-control border border-b-0 px-3 text-sm",
                t.active
                  ? "relative -mb-px border-line-strong bg-raised text-ink before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:rounded-t-control before:bg-accent-ink"
                  : "border-transparent text-muted",
                t.pinned ? "w-10 justify-center px-0" : "w-44",
              )}
            >
              <span
                aria-hidden="true"
                className="grid size-5 shrink-0 place-items-center rounded-[4px] bg-strong text-[0.6875rem] font-semibold uppercase text-on-strong"
              >
                {t.host.charAt(0)}
              </span>
              {t.pinned ? (
                <span className="sr-only">{t.title} (pinned)</span>
              ) : (
                <>
                  <span className="truncate">{t.title}</span>
                  {t.muted ? (
                    <>
                      <MutedIcon className="ml-auto shrink-0" />
                      <span className="sr-only">muted</span>
                    </>
                  ) : null}
                </>
              )}
              {t.pinned ? <PinIcon className="sr-only" /> : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
