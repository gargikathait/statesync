import { blend, contrastRatio } from "./contrast";

/** The five official StateSync brand colours. */
export const brand = {
  ivory: "#F3F1EC",
  moss: "#B6B8AB",
  smoke: "#9FA3AD",
  garden: "#E0DFD2",
  midnight: "#3C3E4A",
} as const;

/**
 * Semantic tokens. Names map to CSS variables `--ss-<name>` and Tailwind
 * colours (`bg-canvas`, `text-muted`, `border-line-strong`, ...).
 *
 * Derived values (muted, accent-ink, line-strong, semantic colours, dark
 * neutrals) exist because the raw brand colours cannot carry every role
 * accessibly — see docs/DESIGN_SYSTEM.md. Every pairing that matters is
 * enforced by test/contrast.test.ts.
 */
export const light = {
  canvas: brand.ivory,
  surface: brand.garden,
  raised: "#FBFAF7",
  strong: brand.midnight,
  ink: brand.midnight,
  muted: "#5A5C68",
  "on-strong": brand.ivory,
  "muted-on-strong": brand.garden,
  accent: brand.moss,
  "on-accent": brand.midnight,
  "accent-ink": "#565A47",
  primary: brand.midnight,
  "primary-hover": "#2E303A",
  "on-primary": brand.ivory,
  line: blend(brand.midnight, brand.ivory, 0.18),
  "line-strong": "#6A6D78",
  focus: brand.midnight,
  decor: brand.smoke,
  "success-bg": "#DCE6D5",
  "success-fg": "#2F5D3A",
  "success-icon": "#3F7A4E",
  "warning-bg": "#F0E3C3",
  "warning-fg": "#6B4A0B",
  "warning-icon": "#8A6212",
  "error-bg": "#F0DAD4",
  "error-fg": "#8A2E2E",
  "error-icon": "#B03E3E",
  "info-bg": "#D9E3EA",
  "info-fg": "#2F4F6B",
  "info-icon": "#3E6A8E",
} as const;

export type TokenName = keyof typeof light;

const DARK_CANVAS = "#25262E";

export const dark: Record<TokenName, string> = {
  canvas: DARK_CANVAS,
  surface: "#2F303A",
  raised: brand.midnight,
  strong: "#1C1D23",
  ink: brand.ivory,
  muted: "#BDBFC7",
  "on-strong": brand.ivory,
  "muted-on-strong": "#BDBFC7",
  accent: brand.moss,
  "on-accent": brand.midnight,
  "accent-ink": brand.moss,
  primary: brand.moss,
  "primary-hover": "#CBCDC0",
  "on-primary": brand.midnight,
  line: blend(brand.smoke, DARK_CANVAS, 0.28),
  "line-strong": brand.smoke,
  focus: brand.moss,
  decor: brand.smoke,
  "success-bg": "#2B3B2F",
  "success-fg": "#BCDCC2",
  "success-icon": "#7FBF8D",
  "warning-bg": "#3F3624",
  "warning-fg": "#EAD39A",
  "warning-icon": "#D4A83F",
  "error-bg": "#432A2B",
  "error-fg": "#F0BDB6",
  "error-icon": "#E27B73",
  "info-bg": "#273746",
  "info-fg": "#BCD3E6",
  "info-icon": "#7FB0D6",
};

export const themes = { light, dark } as const;
export type ThemeName = keyof typeof themes;

/** Non-colour tokens shared by both themes. Spacing uses Tailwind's 4px base. */
export const base = {
  "radius-control": "6px",
  "radius-panel": "10px",
  "focus-width": "2px",
  "focus-offset": "2px",
  // System stacks only: no webfont download, no layout shift, works offline.
  "font-display":
    '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
  "font-sans":
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  "font-mono": "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
} as const;

export interface ContrastRequirement {
  fg: TokenName;
  bg: TokenName;
  /** 4.5 for text (WCAG 1.4.3 AA), 3 for UI components / graphics (1.4.11). */
  min: 4.5 | 3;
  kind: "text" | "non-text";
}

const surfaces: TokenName[] = ["canvas", "surface", "raised"];
const semantic = ["success", "warning", "error", "info"] as const;

/** Every pairing the design system promises to keep accessible. */
export const requirements: ContrastRequirement[] = [
  ...surfaces.flatMap((bg): ContrastRequirement[] => [
    { fg: "ink", bg, min: 4.5, kind: "text" },
    { fg: "muted", bg, min: 4.5, kind: "text" },
    { fg: "accent-ink", bg, min: 4.5, kind: "text" },
    { fg: "line-strong", bg, min: 3, kind: "non-text" },
    { fg: "focus", bg, min: 3, kind: "non-text" },
  ]),
  { fg: "on-strong", bg: "strong", min: 4.5, kind: "text" },
  { fg: "muted-on-strong", bg: "strong", min: 4.5, kind: "text" },
  { fg: "decor", bg: "strong", min: 3, kind: "non-text" },
  { fg: "on-accent", bg: "accent", min: 4.5, kind: "text" },
  { fg: "on-primary", bg: "primary", min: 4.5, kind: "text" },
  { fg: "on-primary", bg: "primary-hover", min: 4.5, kind: "text" },
  ...semantic.flatMap((n): ContrastRequirement[] => [
    { fg: `${n}-fg` as TokenName, bg: `${n}-bg` as TokenName, min: 4.5, kind: "text" },
    { fg: `${n}-icon` as TokenName, bg: `${n}-bg` as TokenName, min: 3, kind: "non-text" },
  ]),
];

export interface RequirementResult extends ContrastRequirement {
  ratio: number;
  pass: boolean;
}

export function evaluateTheme(theme: ThemeName): RequirementResult[] {
  const t: Record<TokenName, string> = themes[theme];
  return requirements.map((r) => {
    const ratio = contrastRatio(t[r.fg], t[r.bg]);
    return { ...r, ratio, pass: ratio >= r.min };
  });
}

/** Raw brand pairings that must NOT be used for text or UI boundaries on light surfaces. */
export const brandPairingsToAvoid = [
  { fg: "smoke", bg: "ivory" },
  { fg: "smoke", bg: "garden" },
  { fg: "moss", bg: "ivory" },
  { fg: "moss", bg: "garden" },
] as const satisfies ReadonlyArray<{ fg: keyof typeof brand; bg: keyof typeof brand }>;
