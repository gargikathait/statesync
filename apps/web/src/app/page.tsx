import Link from "next/link";
import { Callout } from "@/components/ui/callout";
import { buttonClasses } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";

const categories = [
  ["UI position", "Scroll, active section, panel layout and viewport context."],
  ["Unsaved work", "Drafts, form input and in-progress edits, without overwriting newer work."],
  ["Workflow stage", "Where you are in a multi-step task, and what is done or pending."],
  ["Selected components", "Selected widgets, active filters and the arrangement you built."],
  ["Temporary calculations", "Inputs, intermediate values, options and the results they produced."],
  ["Navigation state", "Open windows and tabs, their order, the active tab and URLs."],
  ["Permissions", "What a feature needs, re-checked on each device. Grants never transfer."],
  ["Partially completed actions", "Checkpoints and retry state, with confirmation before anything irreversible."],
] as const;

export default function HomePage() {
  return (
    <div className="flex flex-col gap-16">
      <section aria-labelledby="hero" className="max-w-3xl">
        <p className="mb-3 text-sm font-medium uppercase tracking-widest text-accent-ink">
          SpectoV National Hackathon 2026 · WD-01
        </p>
        <h1 id="hero" className="text-4xl sm:text-6xl">
          Your browser remembers where you left off.
        </h1>
        <p className="mt-5 text-xl text-muted">Don&apos;t just restore your tabs. Restore your work.</p>
        <p className="mt-4 max-w-2xl text-lg">
          Ordinary session restore reopens pages. StateSync reconstructs the working state around them, so you can
          continue on another device, after a crash, or days later, with as much fidelity as the browser and its
          permissions allow.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/design" className={buttonClasses("primary")}>
            See the design system
          </Link>
        </div>
      </section>

      <Callout tone="info" title="Milestone 1 of 7: design foundation">
        Capture, synchronisation and recovery are not built yet. This build contains the design system, themes and
        reusable components that the product will be assembled from.
      </Callout>

      <section aria-labelledby="difference" className="grid gap-4 md:grid-cols-2">
        <h2 id="difference" className="text-2xl md:col-span-2">
          Restoring tabs is not restoring work
        </h2>
        <Panel tone="surface">
          <h3 className="text-lg">Tab restore</h3>
          <p className="mt-2 text-muted">Reopens a list of URLs. Everything you were doing inside them is gone.</p>
        </Panel>
        <Panel tone="strong">
          <h3 className="text-lg">StateSync</h3>
          <p className="mt-2 text-muted-on-strong">
            Rebuilds the draft, the workflow step, the selections, the calculation and the pending action, and tells
            you what needs your attention before anything is repeated.
          </p>
        </Panel>
      </section>

      <section aria-labelledby="categories">
        <h2 id="categories" className="text-2xl">
          Eight kinds of state, one recovery
        </h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map(([title, body], i) => (
            <li key={title} className="rounded-panel border border-line bg-raised p-4">
              <span className="font-display text-sm text-accent-ink">0{i + 1}</span>
              <h3 className="mt-1 text-base">{title}</h3>
              <p className="mt-1 text-sm text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
