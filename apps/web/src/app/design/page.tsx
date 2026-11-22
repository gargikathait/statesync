import type { Metadata } from "next";
import {
  brand,
  brandPairingsToAvoid,
  contrastRatio,
  evaluateTheme,
  gradeText,
  type ThemeName,
} from "@statesync/design-tokens";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Panel } from "@/components/ui/panel";
import { StatusPill, syncStates, type SyncState } from "@/components/ui/status-pill";
import { TabStrip, type TabItem } from "@/components/ui/tab-strip";
import { TextField } from "@/components/ui/text-field";

export const metadata: Metadata = { title: "Design system" };

const roles = [
  { name: "Ivory", hex: brand.ivory, role: "Canvas", swatch: "bg-canvas" },
  { name: "Moss", hex: brand.moss, role: "Brand accent", swatch: "bg-accent" },
  { name: "Smoke", hex: brand.smoke, role: "Decor, charts, icons on strong surfaces", swatch: "bg-decor" },
  { name: "Garden", hex: brand.garden, role: "Panels and grouped surfaces", swatch: "bg-surface" },
  { name: "Midnight", hex: brand.midnight, role: "Text, primary actions, navigation", swatch: "bg-strong" },
];

// Illustrative sample for the design reference only; real tabs arrive with capture (Milestone 5).
const sampleTabs: TabItem[] = [
  { id: "1", title: "Quarterly dashboard", host: "dashboard.example", active: true },
  { id: "2", title: "Metrics spec", host: "docs.example", pinned: true },
  { id: "3", title: "Release checklist", host: "tasks.example" },
  { id: "4", title: "Standup recording", host: "video.example", muted: true },
];

const grouped = (theme: ThemeName) => evaluateTheme(theme);

function ContrastTable({ theme }: { theme: ThemeName }) {
  const rows = grouped(theme);
  const failing = rows.filter((r) => !r.pass).length;
  return (
    <details className="rounded-control border border-line bg-raised p-4">
      <summary className="cursor-pointer font-medium">
        {theme === "light" ? "Light" : "Dark"} theme: {rows.length} enforced pairings, {failing} failing
      </summary>
      <div className="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label={`${theme} theme contrast table`}>
        <table className="w-full min-w-[32rem] text-left text-sm">
          <caption className="sr-only">Contrast ratios computed from the {theme} theme tokens</caption>
          <thead>
            <tr className="border-b border-line-strong">
              <th scope="col" className="py-2 pr-4">Foreground</th>
              <th scope="col" className="py-2 pr-4">Background</th>
              <th scope="col" className="py-2 pr-4 text-right">Ratio</th>
              <th scope="col" className="py-2 pr-4 text-right">Needs</th>
              <th scope="col" className="py-2">Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.fg}-${r.bg}`} className="border-b border-line">
                <td className="py-1.5 pr-4 font-mono">{r.fg}</td>
                <td className="py-1.5 pr-4 font-mono">{r.bg}</td>
                <td className="py-1.5 pr-4 text-right tabular-nums">{r.ratio.toFixed(2)}</td>
                <td className="py-1.5 pr-4 text-right tabular-nums">{r.min}:1</td>
                <td className="py-1.5 font-medium">{r.pass ? "Pass" : "Fail"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export default function DesignPage() {
  return (
    <div className="flex flex-col gap-14">
      <header className="max-w-3xl">
        <h1 className="text-4xl">Design system</h1>
        <p className="mt-3 text-lg text-muted">
          Five brand colours, two themes, and the components built from them. Use the theme switch in the header to
          compare themes; every colour on this page comes from the same tokens.
        </p>
      </header>

      <section aria-labelledby="palette" className="flex flex-col gap-4">
        <h2 id="palette" className="text-2xl">Brand palette</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {roles.map((c) => (
            <li key={c.name} className="overflow-hidden rounded-panel border border-line-strong bg-raised">
              <div className={`h-20 ${c.swatch}`} aria-hidden="true" />
              <div className="p-3">
                <p className="font-semibold">{c.name}</p>
                <p className="font-mono text-sm text-muted">{c.hex}</p>
                <p className="mt-1 text-sm">{c.role}</p>
              </div>
            </li>
          ))}
        </ul>
        <Callout tone="warning" title="Two brand colours cannot carry text or boundaries on light surfaces">
          <ul className="mt-1 list-disc pl-5">
            {brandPairingsToAvoid.map((p) => {
              const ratio = contrastRatio(brand[p.fg], brand[p.bg]);
              return (
                <li key={`${p.fg}-${p.bg}`}>
                  {p.fg} on {p.bg}: {ratio.toFixed(2)}:1 ({gradeText(ratio)})
                </li>
              );
            })}
          </ul>
          <p className="mt-2">
            Muted text, accent text and strong borders use derived tokens (<code className="font-mono">muted</code>,{" "}
            <code className="font-mono">accent-ink</code>, <code className="font-mono">line-strong</code>) instead.
          </p>
        </Callout>
        <div className="flex flex-col gap-3">
          <ContrastTable theme="light" />
          <ContrastTable theme="dark" />
        </div>
      </section>

      <section aria-labelledby="type" className="flex flex-col gap-4">
        <h2 id="type" className="text-2xl">Typography</h2>
        <Panel tone="raised" className="flex flex-col gap-3">
          <p className="font-display text-5xl">Restore your work</p>
          <p className="font-display text-3xl">Editorial serif for headings</p>
          <p className="text-base">Interface text uses the system sans stack: fast, native on every browser, no webfont download.</p>
          <p className="font-mono text-sm text-muted">Monospace for URLs, versions and identifiers · v12 · 3 windows · 14 tabs</p>
        </Panel>
      </section>

      <section aria-labelledby="buttons" className="flex flex-col gap-4">
        <h2 id="buttons" className="text-2xl">Buttons</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Restore session</Button>
          <Button variant="accent">Review changes</Button>
          <Button variant="secondary">Compare versions</Button>
          <Button variant="ghost">Dismiss</Button>
          <Button variant="primary" disabled>Disabled</Button>
          <Button variant="secondary" size="sm">Small</Button>
        </div>
      </section>

      <section aria-labelledby="status" className="flex flex-col gap-4">
        <h2 id="status" className="text-2xl">Sync states</h2>
        <p className="max-w-2xl text-muted">State is communicated by label and icon shape as well as colour.</p>
        <ul className="flex flex-wrap gap-3">
          {(Object.keys(syncStates) as SyncState[]).map((s) => (
            <li key={s}>
              <StatusPill state={s} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="callouts" className="flex flex-col gap-4">
        <h2 id="callouts" className="text-2xl">Messages</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <Callout tone="info" title="Recovery available">A snapshot from another device is ready to review.</Callout>
          <Callout tone="success" title="Changes synchronised">All queued edits reached the server.</Callout>
          <Callout tone="warning" title="Permission needed">Notifications must be granted again on this device.</Callout>
          <Callout tone="error" title="Conflict detected">Both versions were kept. Choose how to continue.</Callout>
        </div>
      </section>

      <section aria-labelledby="forms" className="flex max-w-md flex-col gap-4">
        <h2 id="forms" className="text-2xl">Fields</h2>
        <TextField label="Session name" hint="Shown in your session list." placeholder="Q4 dashboard review" />
        <TextField label="Device name" defaultValue="" error="Enter a name so you can recognise this device." />
      </section>

      <section aria-labelledby="tabs" className="flex flex-col gap-4">
        <h2 id="tabs" className="text-2xl">Browser-aware tabs</h2>
        <p className="max-w-2xl text-muted">
          Captured tabs follow browser conventions: pinned tabs collapse, the active tab joins its content, muted tabs
          show an icon. Sample data for this reference only.
        </p>
        <div>
          <TabStrip label="Sample captured tabs" tabs={sampleTabs} />
          <Panel tone="raised" className="rounded-t-none border-t-0">
            <p className="text-sm text-muted">Active tab content area</p>
          </Panel>
        </div>
      </section>

      <section aria-labelledby="surfaces" className="flex flex-col gap-4">
        <h2 id="surfaces" className="text-2xl">Surfaces</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <Panel tone="surface"><p className="font-semibold">Surface</p><p className="text-muted">Grouped content</p></Panel>
          <Panel tone="raised"><p className="font-semibold">Raised</p><p className="text-muted">Fields and cards</p></Panel>
          <Panel tone="strong"><p className="font-semibold">Strong</p><p className="text-muted-on-strong">Navigation and emphasis</p></Panel>
        </div>
        <p className="text-sm text-muted">Radii: 6px controls, 10px panels. Spacing: 4px base. Borders: 1px hairlines, no heavy shadows.</p>
      </section>
    </div>
  );
}
