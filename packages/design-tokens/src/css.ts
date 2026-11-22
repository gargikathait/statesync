import { base, brand, dark, light } from "./palette";

const block = (vars: Record<string, string>, indent: string) =>
  Object.entries(vars)
    .map(([k, v]) => `${indent}--ss-${k}: ${v};`)
    .join("\n");

/** Generates tokens.css from the typed palette. tokens.css must never be edited by hand. */
export function generateCss(): string {
  const brandVars = Object.fromEntries(Object.entries(brand).map(([k, v]) => [`brand-${k}`, v]));
  return `/* GENERATED FILE — do not edit.
 * Source: packages/design-tokens/src/palette.ts
 * Regenerate: npm run tokens:build   (CI fails if this file is stale)
 *
 * Theme selection:
 *   <html data-theme="light"> or "dark" forces a theme.
 *   No data-theme attribute follows the operating-system preference.
 */

:root {
${block(brandVars, "  ")}
${block(base, "  ")}
}

:root,
:root[data-theme="light"] {
  color-scheme: light;
${block(light, "  ")}
}

:root[data-theme="dark"] {
  color-scheme: dark;
${block(dark, "  ")}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]):not([data-theme="dark"]) {
    color-scheme: dark;
${block(dark, "    ")}
  }
}
`;
}
