"use client";

import { useEffect, useState } from "react";
import { applyTheme, readStoredTheme, type ThemePreference } from "@/lib/theme";

const options: Array<{ value: ThemePreference; label: string }> = [
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
  { value: "dark", label: "Dark" },
];

export function ThemeToggle() {
  const [pref, setPref] = useState<ThemePreference>("system");

  useEffect(() => {
    setPref(readStoredTheme());
  }, []);

  function choose(next: ThemePreference) {
    setPref(next);
    applyTheme(next);
  }

  return (
    <fieldset className="inline-flex rounded-control border border-line-strong bg-raised p-0.5">
      <legend className="sr-only">Colour theme</legend>
      {options.map((o) => (
        <label key={o.value} className="relative">
          <input
            type="radio"
            name="statesync-theme"
            value={o.value}
            checked={pref === o.value}
            onChange={() => choose(o.value)}
            className="peer sr-only"
          />
          <span className="block cursor-pointer rounded-[4px] px-3 py-1.5 text-sm text-ink peer-checked:bg-primary peer-checked:text-on-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus">
            {o.label}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
