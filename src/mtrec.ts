/* Klang Valley line status from MTREC (api.mtrec.name.my) — the Malaysian
   counterpart to LTA's train alerts, run by the local rail-enthusiast
   community. Their limit is 1 request/second; a two-minute cache keeps us
   far under it while staying fresh enough for a disruption banner.
   Community-run, no SLA: failures degrade to "no alerts", never to errors. */

type MtrecRow = {
  LineID?: string;
  Line?: string;
  Status?: string;
  Remark?: string;
};

export type KlAlert = { lineId: string; line: string; message: string; severe: boolean };

let cache: { expiresAt: number; alerts: KlAlert[] } | null = null;

export async function getKlAlerts(): Promise<KlAlert[]> {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.alerts;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch("https://api.mtrec.name.my/api/servicestatus", {
      signal: controller.signal,
      headers: { "user-agent": "public-transport-live/1.0 (public.kaynx1.com)" }
    });
    if (!response.ok) {
      return cache?.alerts ?? [];
    }
    const data = (await response.json()) as { Data?: MtrecRow[] };
    const alerts = (data.Data ?? [])
      .filter((row) => row.Status && row.Status !== "Normal Service")
      .map((row) => ({
        lineId: row.LineID || "",
        line: row.Line || row.LineID || "Rail",
        message: [row.Status, row.Remark].filter(Boolean).join(" — "),
        // A full suspension is anything worse than "Degraded Service" — no/
        // suspended/disrupted service. Degraded (slower, minor) is not severe.
        severe: !/degraded/i.test(String(row.Status || ""))
      }));
    cache = { expiresAt: Date.now() + 2 * 60 * 1000, alerts };
    return alerts;
  } catch {
    return cache?.alerts ?? [];
  } finally {
    clearTimeout(timeout);
  }
}
