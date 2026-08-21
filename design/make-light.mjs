/* Light.dc.html is generated from Main.dc.html so both modes can never drift
   apart in layout — only the default theme prop differs. Re-run after editing
   Main.dc.html: node make-light.mjs */
import { readFileSync, writeFileSync } from "node:fs";

const source = readFileSync("Main.dc.html", "utf8");
const needle = '"theme":{"editor":"enum","options":["dark","light"],"default":"dark"';
if (!source.includes(needle)) {
  throw new Error("theme prop declaration not found in Main.dc.html");
}
const light = source.replace(needle, needle.replace('"default":"dark"', '"default":"light"'));
writeFileSync("Light.dc.html", light);
console.log("Light.dc.html regenerated from Main.dc.html");
