import { describe, expect, it } from "vitest";
import { blend, contrastRatio, gradeText, parseHex, relativeLuminance } from "../src/contrast";
import { brand, brandPairingsToAvoid, dark, evaluateTheme, light, requirements } from "../src/palette";

describe("contrast maths", () => {
  it("matches known WCAG reference values", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.48, 1);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
  });
  it("is symmetric", () => {
    expect(contrastRatio(brand.midnight, brand.ivory)).toBeCloseTo(contrastRatio(brand.ivory, brand.midnight), 10);
  });
  it("computes luminance bounds", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 5);
  });
  it("rejects malformed hex", () => {
    expect(() => parseHex("#12345")).toThrow();
    expect(() => parseHex("red")).toThrow();
  });
  it("blends with alpha", () => {
    expect(blend("#000000", "#FFFFFF", 0.5)).toBe("#808080");
    expect(blend("#123456", "#FFFFFF", 1)).toBe("#123456");
  });
  it("grades text", () => {
    expect(gradeText(7.1)).toBe("AAA");
    expect(gradeText(4.5)).toBe("AA");
    expect(gradeText(3.2)).toBe("AA large only");
    expect(gradeText(2.2)).toBe("Fail");
  });
});

describe("brand palette", () => {
  it("keeps the five official hex values exactly", () => {
    expect(brand).toEqual({
      ivory: "#F3F1EC",
      moss: "#B6B8AB",
      smoke: "#9FA3AD",
      garden: "#E0DFD2",
      midnight: "#3C3E4A",
    });
  });
  it("uses brand colours in their intended roles", () => {
    expect(light.canvas).toBe(brand.ivory);
    expect(light.surface).toBe(brand.garden);
    expect(light.ink).toBe(brand.midnight);
    expect(light.accent).toBe(brand.moss);
    expect(dark.raised).toBe(brand.midnight);
    expect(dark.accent).toBe(brand.moss);
  });
  it("defines identical token names in both themes", () => {
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
  });
  it("only uses valid 6-digit hex values", () => {
    for (const t of [light, dark]) for (const v of Object.values(t)) expect(() => parseHex(v)).not.toThrow();
  });
});

describe.each(["light", "dark"] as const)("%s theme accessibility", (theme) => {
  const results = evaluateTheme(theme);
  it("covers every declared requirement", () => {
    expect(results).toHaveLength(requirements.length);
  });
  it.each(results.map((r) => [`${r.fg} on ${r.bg} >= ${r.min}:1`, r] as const))("%s", (_n, r) => {
    expect(r.ratio, `${r.fg} on ${r.bg} is ${r.ratio.toFixed(2)}`).toBeGreaterThanOrEqual(r.min);
  });
});

describe("documented brand pairings that are NOT accessible", () => {
  it("keeps Smoke and Moss off light surfaces for text and UI boundaries (< 3:1)", () => {
    for (const p of brandPairingsToAvoid) {
      expect(contrastRatio(brand[p.fg], brand[p.bg])).toBeLessThan(3);
    }
  });
  it("confirms the pairings the design relies on", () => {
    expect(contrastRatio(brand.midnight, brand.ivory)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(brand.midnight, brand.garden)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(brand.midnight, brand.moss)).toBeGreaterThanOrEqual(4.5);
    // Midnight on Smoke is below AA for body text; the system must not use it for small text.
    expect(contrastRatio(brand.midnight, brand.smoke)).toBeLessThan(4.5);
  });
});
