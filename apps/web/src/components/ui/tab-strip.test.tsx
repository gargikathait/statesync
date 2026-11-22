import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TabStrip } from "./tab-strip";

const tabs = [
  { id: "a", title: "Dashboard", host: "dash.example", active: true },
  { id: "b", title: "Spec", host: "docs.example", pinned: true },
  { id: "c", title: "Call", host: "video.example", muted: true },
];

describe("TabStrip", () => {
  it("marks only the active tab with aria-current", () => {
    const { container } = render(<TabStrip label="Captured tabs" tabs={tabs} />);
    expect(container.querySelectorAll('[aria-current="true"]')).toHaveLength(1);
    expect(screen.getByText("Dashboard").closest("[aria-current]")).not.toBeNull();
  });
  it("keeps pinned tab names available to screen readers", () => {
    render(<TabStrip label="Captured tabs" tabs={tabs} />);
    expect(screen.getByText("Spec (pinned)")).toBeInTheDocument();
  });
  it("announces muted tabs in text", () => {
    render(<TabStrip label="Captured tabs" tabs={tabs} />);
    expect(screen.getByText("muted")).toBeInTheDocument();
  });
  it("exposes a labelled, keyboard-focusable scroll region", () => {
    render(<TabStrip label="Captured tabs" tabs={tabs} />);
    const region = screen.getByRole("region", { name: "Captured tabs" });
    expect(region).toHaveAttribute("tabindex", "0");
  });
});
