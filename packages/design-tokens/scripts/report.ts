import { evaluateTheme, brand, brandPairingsToAvoid, contrastRatio, gradeText, type ThemeName } from "../src/index";

const row = (c: string[]) => `| ${c.join(" | ")} |`;
for (const theme of ["light", "dark"] as ThemeName[]) {
  console.log(`\n### ${theme === "light" ? "Light" : "Dark"} theme — enforced pairings\n`);
  console.log(row(["Foreground", "Background", "Ratio", "Required", "Result"]));
  console.log(row(["---", "---", "---:", "---:", "---"]));
  for (const r of evaluateTheme(theme)) {
    console.log(row([`\`${r.fg}\``, `\`${r.bg}\``, r.ratio.toFixed(2), `${r.min}:1 (${r.kind})`, r.pass ? "pass" : "**FAIL**"]));
  }
}
console.log("\n### Raw brand pairings to avoid\n");
console.log(row(["Foreground", "Background", "Ratio", "Text grade"]));
console.log(row(["---", "---", "---:", "---"]));
for (const p of brandPairingsToAvoid) {
  const ratio = contrastRatio(brand[p.fg], brand[p.bg]);
  console.log(row([p.fg, p.bg, ratio.toFixed(2), gradeText(ratio)]));
}
