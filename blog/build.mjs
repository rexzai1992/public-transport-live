/* Static blog builder — zero dependencies, same philosophy as the app.
   Posts are HTML fragments in posts/ with a <!--meta {...}--> header; this
   wraps them in the site template and emits dist/ ready for Cloudflare Pages:
   index, per-post pages, sitemap and RSS. */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "dist");
const SITE = "https://blog.kaynx1.com";
const APP = "https://public.kaynx1.com";

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const style = `<style>
:root { --bg:#f5f5f5; --card:#fff; --ink:#16202c; --ink2:#5b6b7d; --rule:#e3e8ee; --accent:#175fc0; }
@media (prefers-color-scheme: dark){ :root { --bg:#050810; --card:#111825; --ink:#eaf2ff; --ink2:#a9c9ec; --rule:#22304a; --accent:#7cc4ff; } }
*{box-sizing:border-box} body{background:var(--bg);color:var(--ink);font:16px/1.75 system-ui,sans-serif;margin:0;padding:32px 20px 72px}
main{margin:0 auto;max-width:680px} h1{font-size:28px;line-height:1.25;margin:0 0 6px}
h2{font-size:20px;margin:30px 0 10px} h3{font-size:16.5px;margin:22px 0 8px}
.sub{color:var(--ink2);font-size:13.5px;margin:0 0 24px}
a{color:var(--accent)} p,li{max-width:66ch}
table{border-collapse:collapse;width:100%;margin:14px 0;font-size:14.5px}
td,th{border:1px solid var(--rule);padding:8px 12px;text-align:left}
th{background:var(--card)}
.cta{background:var(--accent);border-radius:10px;color:#fff;display:inline-block;font-weight:600;margin:10px 0;padding:11px 20px;text-decoration:none}
.card{background:var(--card);border:1px solid var(--rule);border-radius:12px;display:block;margin:12px 0;padding:16px 18px;text-decoration:none}
.card b{color:var(--ink);display:block;font-size:17px} .card span{color:var(--ink2);font-size:13.5px}
.foot{border-top:1px solid var(--rule);color:var(--ink2);font-size:12.5px;margin-top:40px;padding-top:14px}
nav{font-size:13.5px;margin-bottom:24px}
blockquote{border-left:3px solid var(--accent);color:var(--ink2);margin:14px 0;padding:2px 16px}
</style>`;

const page = (title, desc, canonical, body) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${canonical}">
<link rel="alternate" type="application/rss+xml" href="${SITE}/rss.xml">
<meta property="og:title" content="${title}"><meta property="og:description" content="${desc}">
${style}</head><body><main>
<nav><a href="/">Transit Guide</a> · <a href="${APP}">Live tracker app</a> · <a href="${APP}/routes">All routes</a></nav>
${body}
<p class="foot">Public Transport Live — independent guide built on open data. Times shown are typical and change;
always check the <a href="${APP}">live tracker</a> before you travel. <a href="${APP}/terms.html">Terms &amp; Privacy</a></p>
</main></body></html>`;

const posts = readdirSync(join(here, "posts")).filter((f) => f.endsWith(".html")).sort().reverse()
  .map((file) => {
    const raw = readFileSync(join(here, "posts", file), "utf-8");
    const metaMatch = raw.match(/<!--meta\s*({[\s\S]*?})\s*-->/);
    const meta = JSON.parse(metaMatch[1]);
    const body = raw.replace(/<!--meta[\s\S]*?-->/, "").trim();
    const slug = file.replace(/^\d+-/, "").replace(/\.html$/, "");
    return { ...meta, slug, body };
  });

for (const post of posts) {
  const body = `<h1>${post.title}</h1><p class="sub">${post.date} · Public Transport Live guide</p>
${post.body}
<p><a class="cta" href="${APP}">Open the live tracker — free, no login</a></p>`;
  writeFileSync(join(out, `${post.slug}.html`), page(`${post.title} | Transit Guide`, post.desc, `${SITE}/${post.slug}.html`, body));
}

writeFileSync(join(out, "index.html"), page(
  "Malaysia & Singapore Public Transport Guide",
  "Schedules, line guides and how-tos for KL and Singapore buses, MRT, LRT and KTM — from the makers of the Public Transport Live tracker.",
  `${SITE}/`,
  `<h1>Malaysia &amp; Singapore Transit Guide</h1>
<p class="sub">Practical guides to buses, MRT, LRT, Monorail and KTM — paired with a <a href="${APP}">free live tracker</a>.</p>
${posts.map((p) => `<a class="card" href="/${p.slug}.html"><b>${p.title}</b><span>${p.desc}</span></a>`).join("")}`
));

writeFileSync(join(out, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>${SITE}/</loc></url>\n` +
  posts.map((p) => `<url><loc>${SITE}/${p.slug}.html</loc></url>`).join("\n") + `\n</urlset>`);

writeFileSync(join(out, "rss.xml"),
  `<?xml version="1.0"?><rss version="2.0"><channel><title>Malaysia & Singapore Transit Guide</title><link>${SITE}</link><description>Public transport guides for KL and Singapore</description>` +
  posts.map((p) => `<item><title>${p.title}</title><link>${SITE}/${p.slug}.html</link><description>${p.desc}</description></item>`).join("") +
  `</channel></rss>`);

writeFileSync(join(out, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
writeFileSync(join(out, "_headers"), `/*\n  Cache-Control: public, max-age=3600\n  X-Content-Type-Options: nosniff\n`);

// Self-hosted map images (credited in each figure) ride along.
mkdirSync(join(out, "img"), { recursive: true });
for (const img of readdirSync(join(here, "img"))) {
  writeFileSync(join(out, "img", img), readFileSync(join(here, "img", img)));
}

console.log(`built ${posts.length} posts + ${readdirSync(join(here, "img")).length} images -> dist/`);
