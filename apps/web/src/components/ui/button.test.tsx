import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { Button, buttonClasses } from "./button";

describe("Button", () => {
  it("renders an accessible button that defaults to type=button", () => {
    render(<Button>Restore session</Button>);
    const b = screen.getByRole("button", { name: "Restore session" });
    expect(b).toHaveAttribute("type", "button");
  });
  it("fires onClick and respects disabled", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<Button onClick={onClick}>Go</Button>);
    await user.click(screen.getByRole("button", { name: "Go" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(<Button onClick={onClick} disabled>Go</Button>);
    await user.click(screen.getByRole("button", { name: "Go" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it("uses Midnight-on-Ivory token pairing for primary and Moss with dark text for accent", () => {
    expect(buttonClasses("primary")).toContain("bg-primary");
    expect(buttonClasses("primary")).toContain("text-on-primary");
    expect(buttonClasses("accent")).toContain("bg-accent");
    expect(buttonClasses("accent")).toContain("text-on-accent");
  });
});
