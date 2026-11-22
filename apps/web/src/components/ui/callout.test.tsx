import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Callout } from "./callout";

describe("Callout", () => {
  it("announces errors assertively", () => {
    render(<Callout tone="error" title="Conflict detected">Both versions kept.</Callout>);
    expect(screen.getByRole("alert")).toHaveTextContent("Conflict detected");
  });
  it("uses a polite status role for non-errors", () => {
    render(<Callout tone="info" title="Heads up" />);
    expect(screen.getByRole("status")).toHaveTextContent("Heads up");
  });
});
