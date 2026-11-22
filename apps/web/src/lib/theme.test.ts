import { describe, expect, it } from "vitest";
import { THEME_STORAGE_KEY, applyTheme, isThemePreference, readStoredTheme, themeInitScript } from "./theme";

describe("theme helpers", () => {
  it("validates preferences", () => {
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("sepia")).toBe(false);
  });
  it("ignores corrupted stored values", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "purple");
    expect(readStoredTheme()).toBe("system");
  });
  it("applies and clears the data-theme attribute", () => {
    applyTheme("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    applyTheme("system");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });
  it("ships a pre-paint script that sets the stored theme", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    new Function(themeInitScript)();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});
