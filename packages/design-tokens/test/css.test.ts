import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { generateCss } from "../src/css";
import { brand, dark, light } from "../src/palette";

const css = generateCss();
const here = dirname(fileURLToPath(import.meta.url));

describe("generated tokens.css", () => {
  it("is in sync with the committed file", () => {
    expect(readFileSync(resolve(here, "../tokens.css"), "utf8")).toBe(css);
  });
  it("emits every token for both themes", () => {
    for (const k of Object.keys(light) as Array<keyof typeof light>) {
      expect(css).toContain(`--ss-${k}: ${light[k]};`);
      expect(css).toContain(`--ss-${k}: ${dark[k]};`);
    }
  });
  it("supports forced themes and OS preference", () => {
    expect(css).toContain(':root[data-theme="dark"]');
    expect(css).toContain(':root[data-theme="light"]');
    expect(css).toContain("@media (prefers-color-scheme: dark)");
    expect(css).toContain(':root:not([data-theme="light"]):not([data-theme="dark"])');
  });
  it("exposes the brand colours as variables", () => {
    for (const [k, v] of Object.entries(brand)) expect(css).toContain(`--ss-brand-${k}: ${v};`);
  });
});
