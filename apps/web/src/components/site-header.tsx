"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { ThemeToggle } from "./ui/theme-toggle";

const links = [
  { href: "/", label: "Home" },
  { href: "/design", label: "Design system" },
];

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2 font-display text-xl font-semibold">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" focusable="false">
        <rect x="1" y="1" width="20" height="20" rx="5" fill="var(--ss-strong)" />
        <rect x="6" y="6" width="10" height="10" rx="2.5" fill="var(--ss-accent)" />
      </svg>
      StateSync
    </span>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <Link href="/" aria-label="StateSync home" className="no-underline">
          <Wordmark />
        </Link>
        <nav aria-label="Primary" className="flex flex-wrap items-center gap-1">
          {links.map((l) => {
            const current = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "rounded-control px-3 py-1.5 text-sm no-underline hover:bg-surface",
                  current ? "font-semibold shadow-[inset_0_-2px_0_var(--ss-accent-ink)]" : "text-ink",
                )}
              >
                {l.label}
              </Link>
            );
          })}
          <span className="ml-2">
            <ThemeToggle />
          </span>
        </nav>
      </div>
    </header>
  );
}
