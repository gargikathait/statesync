import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateCss } from "../src/css";

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../tokens.css");
const next = generateCss();

if (process.argv.includes("--check")) {
  const current = existsSync(out) ? readFileSync(out, "utf8") : "";
  if (current !== next) {
    console.error("tokens.css is out of date. Run: npm run tokens:build");
    process.exit(1);
  }
  console.log("tokens.css is up to date.");
} else {
  writeFileSync(out, next);
  console.log(`Wrote ${out}`);
}
