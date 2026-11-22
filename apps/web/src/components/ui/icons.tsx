import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = (p: IconProps) => ({
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
  ...p,
});

export const CheckIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M3 8.5l3.2 3L13 4.5" /></svg>
);
export const SyncIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M13 5.5A5.5 5.5 0 003.2 6M3 2.5V6h3.5M3 10.5A5.5 5.5 0 0012.8 10M13 13.5V10H9.5" /></svg>
);
export const OfflineIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M2 2l12 12M5.2 8.6a4.5 4.5 0 012.3-1.4M3 6a7.5 7.5 0 012.4-1.6M10.8 8.6a4.5 4.5 0 011 .8M13 6a7.5 7.5 0 00-3-1.8" /><circle cx="8" cy="12" r=".6" fill="currentColor" /></svg>
);
export const ClockIcon = (p: IconProps) => (
  <svg {...base(p)}><circle cx="8" cy="8" r="5.5" /><path d="M8 5v3.2l2 1.3" /></svg>
);
export const AlertIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M8 2.2l6 10.6H2L8 2.2zM8 6.5v3M8 11.4v.1" /></svg>
);
export const ResumeIcon = (p: IconProps) => (
  <svg {...base(p)}><circle cx="8" cy="8" r="5.5" /><path d="M6.8 5.6l3.4 2.4-3.4 2.4V5.6z" /></svg>
);
export const InfoIcon = (p: IconProps) => (
  <svg {...base(p)}><circle cx="8" cy="8" r="5.5" /><path d="M8 7.2v3.6M8 5.2v.1" /></svg>
);
export const MutedIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M2.5 6v4h2.2L8 12.5v-9L4.7 6H2.5zM11 6l3 4M14 6l-3 4" /></svg>
);
export const PinIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M9.5 2.5l4 4-2 .8-2 2.7-.3 2.2-2.4-2.4-3.4 3.4M9.5 2.5l-.8 2-2.7 2-2.2.3 2.4 2.4" /></svg>
);
