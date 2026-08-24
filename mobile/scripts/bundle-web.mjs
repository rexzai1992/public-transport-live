/* Copies the web app into the Capacitor bundle and injects the API base.
   The shell serves the page from the app itself, so same-origin requests would
   hit the bundle rather than the server — RAPIDBUS_API_BASE points them at the
   hosted API instead. Set it in .env or the environment before syncing. */
import { cp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const source = resolve(root, "..", "public");
const target = resolve(root, "www");

import { readFileSync } from "node:fs";
const appVersion = JSON.parse(readFileSync(resolve(root, "..", "app-version.json"), "utf-8")).version;
const apiBase = process.env.RAPIDBUS_API_BASE?.trim();
if (!apiBase) {
  console.error("\nRAPIDBUS_API_BASE is not set.");
  console.error("The APK cannot reach localhost — point it at your hosted API, e.g.");
  console.error("  RAPIDBUS_API_BASE=https://api.example.com npm run sync\n");
  process.exit(1);
}
const isPrivateHost = (() => {
  try {
    const { hostname } = new URL(apiBase);
    return (
      hostname === "localhost" ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    );
  } catch {
    return false;
  }
})();

if (!/^https:\/\//.test(apiBase)) {
  // Cleartext is allowed only for a LAN dev server, and only when asked for
  // explicitly — the debug manifest carries the matching exception.
  if (!(process.env.RAPIDBUS_ALLOW_CLEARTEXT === "1" && isPrivateHost)) {
    console.error(`\nRAPIDBUS_API_BASE must be https (got ${apiBase}).`);
    console.error("Android blocks cleartext traffic by default.");
    console.error("For a LAN dev server, re-run with RAPIDBUS_ALLOW_CLEARTEXT=1.\n");
    process.exit(1);
  }
  console.warn(`\n  cleartext allowed for ${apiBase} — DEBUG BUILDS ONLY\n`);
}
if (!existsSync(source)) {
  console.error(`\nCannot find the web app at ${source}\n`);
  process.exit(1);
}

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });

const indexPath = resolve(target, "index.html");
const html = await readFile(indexPath, "utf8");
const injected = html.replace(
  "<script src=\"/vendor/leaflet.js\"></script>",
  `<script>window.RAPIDBUS_API_BASE = ${JSON.stringify(apiBase)}; window.APP_BUILD_VERSION = ${appVersion};</script>\n    <script src="/vendor/leaflet.js"></script>`
);
if (injected === html) {
  console.error("\nCould not inject the API base — index.html markup changed.\n");
  process.exit(1);
}
await writeFile(indexPath, injected);

// Absolute asset paths resolve against the bundle root in the shell.
console.log(`bundled web app -> www (API base ${apiBase})`);
