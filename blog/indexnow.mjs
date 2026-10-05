/* Tell IndexNow search engines (Bing, Yandex, Naver, Seznam) about every URL
   in the built sitemap. Run after deploying: node blog/indexnow.mjs
   Google doesn't use IndexNow — it reads the sitemap (submit it once in
   Search Console). */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const HOST = "travel-guide.kaynx1.com";
const key = readFileSync(join(here, "indexnow-key.txt"), "utf-8").trim();
const sitemap = readFileSync(join(here, "dist", "sitemap.xml"), "utf-8");
const urlList = [...sitemap.matchAll(/<loc>(https:\/\/travel-guide[^<]+)<\/loc>/g)].map((m) => m[1]);

const response = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: HOST, key, keyLocation: `https://${HOST}/${key}.txt`, urlList })
});
console.log(`IndexNow: ${urlList.length} URLs -> HTTP ${response.status}`);
