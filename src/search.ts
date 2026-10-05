/* Forgiving text matching for stop and place names.

   Plain substring search fails the way people actually type: words in another
   order ("kajang mrt"), signage abbreviations ("jln tun razak"), a slipped key
   ("sentrel"). Here a name and a query are both reduced to words with the
   abbreviations spelled out, and every meaningful query word has to land on
   some name word — exactly, as a prefix, inside it, or within a typo or two.

   public/app.js carries a copy of this for the client-side route index; keep
   the two in step. */

/* Signage shorthand on Malaysian and Singaporean stop names, spelled out so
   "jalan" finds "JLN" and "jln" finds "JALAN". */
const ABBREVIATIONS: Record<string, string> = {
  jln: "jalan",
  jl: "jalan",
  tmn: "taman",
  kg: "kampung",
  kpg: "kampung",
  kampong: "kampung",
  bdr: "bandar",
  bkt: "bukit",
  lrg: "lorong",
  sek: "seksyen",
  sksyn: "seksyen",
  psr: "pasar",
  hosp: "hospital",
  univ: "universiti",
  university: "universiti",
  sri: "seri",
  stn: "station",
  sta: "station",
  stesen: "station",
  rd: "road",
  ave: "avenue",
  st: "street",
  ctr: "centre",
  center: "centre",
  int: "interchange",
  blk: "block",
  opp: "opposite",
  bef: "before",
  aft: "after"
};

/* Words that describe the kind of place rather than which one. A query
   containing them must not fail because the name leaves them out — "LRT
   Ampang" should find the station named "AMPANG", and Klang Valley stop names
   drop the road ("AMPANG", not "JALAN AMPANG") — so they only ever help. */
const OPTIONAL_WORDS = new Set([
  "lrt", "mrt", "ktm", "brt", "monorail", "komuter", "ets",
  "station", "hentian", "perhentian", "stop", "bus", "bas",
  "jalan", "lorong", "persiaran", "road", "street", "avenue",
  "the", "di", "ke", "to"
]);

/* Bus stop names lead with an operator code ("KL2212 PASAR SENI", "AJ106 LRT
   AMPANG"). Searchable, but not part of the name a passenger would say, so the
   phrase comparisons skip it. Neighbourhood codes (SS15, USJ 1, PJU 5) are
   real place names and stay. */
const STOP_CODE = /^(?!ss|usj|pju)[a-z]{1,3}\d{1,5}$/;

export type SearchDoc = {
  words: string[];
  /** The plain name: no stop code, no parenthetical, kind-of-place words out. */
  phrase: string;
  compact: string;
};

export function normalizeWords(text: string): string[] {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((word) => ABBREVIATIONS[word] ?? word);
}

export function makeDoc(text: string): SearchDoc {
  const words = normalizeWords(text);
  const core = normalizeWords(text.replace(/\([^)]*\)/g, " ")).filter((word) => !OPTIONAL_WORDS.has(word));
  if (core.length > 1 && STOP_CODE.test(core[0])) core.shift();
  return { words, phrase: core.join(" "), compact: core.join("") };
}

/** Optimal-string-alignment distance, giving up once it exceeds max. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prevPrev: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, prevPrev[j - 2] + 1);
      }
      row.push(value);
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    prevPrev = prev;
    prev = row;
  }
  return prev[b.length];
}

function typoBudget(word: string): number {
  // Numbers are identities — 250 and 251 are different buses.
  if (/\d/.test(word)) return 0;
  if (word.length >= 8) return 2;
  if (word.length >= 4) return 1;
  return 0;
}

/** How well one query word lands on one name word; 0 means not at all. */
export function wordScore(query: string, word: string, isLast: boolean): number {
  if (word === query) return 10;
  if (word.startsWith(query)) return 7 + 2 * (query.length / word.length);
  if (query.length >= 3 && word.includes(query)) return 4;
  const budget = typoBudget(query);
  if (!budget) return 0;
  const whole = editDistance(query, word, budget);
  if (whole <= budget) return 6 - 1.5 * whole;
  // Still typing: "sentrl" is a slip on the way to "sentral".
  if (isLast && word.length > query.length) {
    const head = editDistance(query, word.slice(0, query.length), 1);
    if (head <= 1) return 4;
  }
  return 0;
}

/** Score a name against a query; 0 means no match, higher is better. */
export function scoreDoc(queryWords: string[], doc: SearchDoc): number {
  if (!queryWords.length || !doc.words.length) return 0;
  const multi = queryWords.length > 1;
  const core = multi ? queryWords.filter((word) => !OPTIONAL_WORDS.has(word)) : queryWords;
  const queryPhrase = (core.length ? core : queryWords).join(" ");
  const queryCompact = queryPhrase.replace(/ /g, "");

  if (doc.phrase === queryPhrase) return 100;

  let total = 0;
  let required = 0;
  let firstAt = -1;
  let lastPosition = -1;
  let inOrder = true;
  for (let q = 0; q < queryWords.length; q++) {
    const query = queryWords[q];
    const optional = multi && OPTIONAL_WORDS.has(query);
    let best = 0;
    let bestAt = -1;
    for (let w = 0; w < doc.words.length; w++) {
      const score = wordScore(query, doc.words[w], q === queryWords.length - 1);
      if (score > best) {
        best = score;
        bestAt = w;
      }
    }
    if (!best) {
      if (optional) continue;
      // "klsentral" against "KL SENTRAL": the words ran together.
      if (!multi && query.length >= 4 && doc.compact.includes(query)) {
        return doc.compact.startsWith(query) ? 30 : 15;
      }
      return 0;
    }
    if (optional) {
      total += best / 4;
      continue;
    }
    required++;
    total += best;
    if (firstAt < 0) firstAt = bestAt;
    if (bestAt < lastPosition) inOrder = false;
    lastPosition = bestAt;
  }
  if (!required) return 0;

  if (doc.phrase.startsWith(queryPhrase)) total += 12;
  else if (doc.compact.startsWith(queryCompact)) total += 8;
  if (inOrder) total += 2;
  // Among equals, the plainer name is the one meant.
  const extra = doc.phrase ? doc.phrase.split(" ").length - required : 0;
  total -= Math.max(0, extra) * 0.5;
  return Math.max(total, 0.1);
}
