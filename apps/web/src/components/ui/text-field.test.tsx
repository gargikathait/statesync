import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TextField } from "./text-field";

describe("TextField", () => {
  it("associates label and input", () => {
    render(<TextField label="Session name" />);
    expect(screen.getByLabelText("Session name")).toBeInTheDocument();
  });
  it("links hint and error via aria-describedby and flags invalid state", () => {
    render(<TextField label="Device" hint="Shown in lists" error="Required" />);
    const input = screen.getByLabelText("Device");
    expect(input).toHaveAttribute("aria-invalid", "true");
    const described = input.getAttribute("aria-describedby")?.split(" ") ?? [];
    expect(described).toHaveLength(2);
    expect(document.getElementById(described[0]!)).toHaveTextContent("Shown in lists");
    expect(document.getElementById(described[1]!)).toHaveTextContent("Required");
  });
  it("is not marked invalid without an error", () => {
    render(<TextField label="Name" />);
    expect(screen.getByLabelText("Name")).not.toHaveAttribute("aria-invalid");
  });
});
