/* Web Push for PWA and browser users — the counterpart to FCM's Android
   channel. Uses the VAPID standard (no Firebase, no Google account): the
   browser hands us a subscription object, we POST notifications to the push
   service URL inside it. Keys come from the environment; absent keys disable
   web push cleanly, same optional pattern as FCM. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const DATA_DIR = new URL("../data/", import.meta.url);
const SUBS_FILE = new URL("../data/web-subs.json", import.meta.url);

type Sub = { endpoint: string; keys: { p256dh: string; auth: string } };

let webpush: typeof import("web-push") | null = null;
let ready = false;

async function init(): Promise<void> {
  if (ready) return;
  ready = true;
  const pub = process.env.VAPID_PUBLIC;
  const priv = process.env.VAPID_PRIVATE;
  if (!pub || !priv) {
    console.log("[webpush] no VAPID keys — web push disabled");
    return;
  }
  const mod = await import("web-push");
  mod.default.setVapidDetails("mailto:izzulfitreee@gmail.com", pub, priv);
  webpush = mod.default as unknown as typeof import("web-push");
  console.log("[webpush] ready");
}

function load(): Sub[] {
  try {
    return JSON.parse(readFileSync(SUBS_FILE, "utf-8")) as Sub[];
  } catch {
    return [];
  }
}

function save(subs: Sub[]): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(SUBS_FILE, JSON.stringify(subs));
  } catch {
    /* best effort */
  }
}

export function subscribeWeb(sub: Sub): void {
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return;
  const subs = load();
  if (!subs.some((s) => s.endpoint === sub.endpoint)) {
    subs.push(sub);
    save(subs);
  }
}

export function unsubscribeWeb(endpoint: string): void {
  const subs = load().filter((s) => s.endpoint !== endpoint);
  save(subs);
}

export function webSubCount(): number {
  return load().length;
}

export async function pushWebAll(title: string, body: string): Promise<{ sent: number; failed: number }> {
  await init();
  if (!webpush) return { sent: 0, failed: 0 };
  const subs = load();
  if (!subs.length) return { sent: 0, failed: 0 };

  const payload = JSON.stringify({ title, body, url: "https://public.kaynx1.com/" });
  let sent = 0;
  let failed = 0;
  const dead = new Set<string>();

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush!.sendNotification(sub, payload);
        sent++;
      } catch (error) {
        failed++;
        // 404/410 mean the subscription is permanently gone.
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.add(sub.endpoint);
      }
    })
  );

  if (dead.size) save(load().filter((s) => !dead.has(s.endpoint)));
  return { sent, failed };
}
