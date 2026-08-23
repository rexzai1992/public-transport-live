/* Push notifications via Firebase Cloud Messaging. Server-originated only —
   for disruption alerts and admin announcements. On-device countdowns (bus in
   10/5 min, stop in 3 min) are LOCAL notifications handled in the app and need
   none of this.

   The whole module is optional: with no key file it silently no-ops, so the
   app runs identically in dev and on any host without FCM configured. Device
   tokens live in the same data/ dir as the other stats, no personal data
   attached — a token is an opaque handle, not an identity. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import type { Messaging } from "firebase-admin/messaging";

const DATA_DIR = new URL("../data/", import.meta.url);
const TOKENS_FILE = new URL("../data/push-tokens.json", import.meta.url);
const KEY_FILE = new URL("../fcm-key.json", import.meta.url);

let messaging: Messaging | null = null;
let ready = false;

async function init(): Promise<void> {
  if (ready) return;
  ready = true;
  let keyRaw: string;
  try {
    keyRaw = readFileSync(KEY_FILE, "utf-8");
  } catch {
    console.log("[push] no fcm-key.json — push notifications disabled");
    return;
  }
  try {
    const { initializeApp, cert, getApps } = await import("firebase-admin/app");
    const { getMessaging } = await import("firebase-admin/messaging");
    const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(JSON.parse(keyRaw)) });
    messaging = getMessaging(app);
    console.log("[push] FCM ready");
  } catch (error) {
    console.error("[push] init failed:", (error as Error).message);
  }
}

function loadTokens(): Set<string> {
  try {
    return new Set(JSON.parse(readFileSync(TOKENS_FILE, "utf-8")) as string[]);
  } catch {
    return new Set();
  }
}

function saveTokens(tokens: Set<string>): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(TOKENS_FILE, JSON.stringify([...tokens]));
  } catch {
    /* best effort */
  }
}

export function registerToken(token: string): void {
  if (!token || token.length < 20 || token.length > 4096) return;
  const tokens = loadTokens();
  if (!tokens.has(token)) {
    tokens.add(token);
    saveTokens(tokens);
  }
}

export function unregisterToken(token: string): void {
  const tokens = loadTokens();
  if (tokens.delete(token)) saveTokens(tokens);
}

export function tokenCount(): number {
  return loadTokens().size;
}

/* Fan out one notification to every registered device, in FCM's 500-per-batch
   limit, pruning tokens the service reports as permanently dead. */
export async function pushToAll(title: string, body: string): Promise<{ sent: number; failed: number }> {
  await init();
  if (!messaging) return { sent: 0, failed: 0 };
  const tokens = [...loadTokens()];
  if (!tokens.length) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  const dead = new Set<string>();

  for (let i = 0; i < tokens.length; i += 500) {
    const batch = tokens.slice(i, i + 500);
    const res = await messaging.sendEachForMulticast({
      tokens: batch,
      notification: { title, body },
      android: { priority: "high", notification: { sound: "default" } }
    });
    res.responses.forEach((r, index) => {
      if (r.success) {
        sent++;
      } else {
        failed++;
        const code = r.error?.code ?? "";
        if (code.includes("not-registered") || code.includes("invalid-argument")) {
          dead.add(batch[index]);
        }
      }
    });
  }

  if (dead.size) {
    const tokenSet = loadTokens();
    for (const token of dead) tokenSet.delete(token);
    saveTokens(tokenSet);
  }
  return { sent, failed };
}
