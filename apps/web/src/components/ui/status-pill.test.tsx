import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusPill, syncStates, type SyncState } from "./status-pill";

describe("StatusPill", () => {
  const states = Object.keys(syncStates) as SyncState[];
  it("covers the six specified sync states", () => {
    expect(states.sort()).toEqual(["conflict", "offline", "pending", "recovery", "synced", "syncing"]);
  });
  it.each(states)("%s exposes a text label (not colour alone) and a decorative icon", (state) => {
    const { container } = render(<StatusPill state={state} />);
    expect(screen.getByText(syncStates[state].label)).toBeInTheDocument();
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });
  it("uses a distinct icon shape per state", () => {
    const shapes = states.map((s) => {
      const { container, unmount } = render(<StatusPill state={s} />);
      const d = container.querySelector("svg")?.innerHTML ?? "";
      unmount();
      return d;
    });
    expect(new Set(shapes).size).toBe(states.length);
  });
});
