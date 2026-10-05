/* Forgiving search matching for the browser — the app's route and stop search
   and the server-rendered /routes page both load this file.

   It is a copy of src/search.ts (the server's stop search); keep the two in
   step. Plain script, no modules: everything here is a global. */

function searchEscape(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]
  ));
}

/* Signage shorthand, spelled out so "jalan" finds "JLN" and "jln" finds "JALAN". */
const SEARCH_ABBREVIATIONS = {
  jln: "jalan", jl: "jalan", tmn: "taman", kg: "kampung", kpg: "kampung", kampong: "kampung",
  bdr: "bandar", bkt: "bukit", lrg: "lorong", sek: "seksyen", sksyn: "seksyen", psr: "pasar",
  hosp: "hospital", univ: "universiti", university: "universiti", sri: "seri",
  stn: "station", sta: "station", stesen: "station", rd: "road", ave: "avenue", st: "street",
  ctr: "centre", center: "centre", int: "interchange", blk: "block", opp: "opposite",
  bef: "before", aft: "after"
};

/* Kind-of-place words: they help a match but never sink one, so "LRT Ampang"
   still finds a name that leaves "LRT" out. */
const SEARCH_OPTIONAL = new Set([
  "lrt", "mrt", "ktm", "brt", "monorail", "komuter", "ets",
  "station", "hentian", "perhentian", "stop", "bus", "bas",
  "jalan", "lorong", "persiaran", "road", "street", "avenue",
  "the", "di", "ke", "to"
]);

const SEARCH_STOP_CODE = /^(?!ss|usj|pju)[a-z]{1,3}\d{1,5}$/;

function searchWords(text) {
  return String(text || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((word) => SEARCH_ABBREVIATIONS[word] || word);
}

function compactKey(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/* `words` is everything searchable; `phrase` is the plain name the phrase and
   prefix bonuses compare against (no stop code, no parenthetical). */
function makeSearchDoc(text, coreText = text) {
  const words = searchWords(text);
  const core = searchWords(String(coreText).replace(/\([^)]*\)/g, " ")).filter((word) => !SEARCH_OPTIONAL.has(word));
  if (core.length > 1 && SEARCH_STOP_CODE.test(core[0])) core.shift();
  return { words, phrase: core.join(" "), compact: core.join("") };
}

/* Optimal-string-alignment distance, giving up once it passes max. */
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prevPrev = [];
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

function typoBudget(word) {
  // Numbers are identities — 250 and 251 are different buses.
  if (/\d/.test(word)) return 0;
  if (word.length >= 8) return 2;
  if (word.length >= 4) return 1;
  return 0;
}

/* How well one query word lands on one name word; 0 means not at all. */
function wordScore(query, word, isLast) {
  if (word === query) return 10;
  if (word.startsWith(query)) return 7 + 2 * (query.length / word.length);
  if (query.length >= 3 && word.includes(query)) return 4;
  const budget = typoBudget(query);
  if (!budget) return 0;
  const whole = editDistance(query, word, budget);
  if (whole <= budget) return 6 - 1.5 * whole;
  // Still typing: "sentrl" is a slip on the way to "sentral".
  if (isLast && word.length > query.length && editDistance(query, word.slice(0, query.length), 1) <= 1) {
    return 4;
  }
  return 0;
}

/* Score a name against a query; 0 means no match, higher is better. */
function scoreDoc(queryWords, doc) {
  if (!queryWords.length || !doc.words.length) return 0;
  const multi = queryWords.length > 1;
  const core = multi ? queryWords.filter((word) => !SEARCH_OPTIONAL.has(word)) : queryWords;
  const queryPhrase = (core.length ? core : queryWords).join(" ");
  const queryCompact = queryPhrase.replace(/ /g, "");

  if (doc.phrase === queryPhrase) return 100;

  let total = 0;
  let required = 0;
  let lastPosition = -1;
  let inOrder = true;
  for (let q = 0; q < queryWords.length; q++) {
    const query = queryWords[q];
    const optional = multi && SEARCH_OPTIONAL.has(query);
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

/* Escape `text` for HTML, wrapping the parts the query matched in <mark>.
   Abbreviations and typo matches light up the whole word ("Jln" for "jalan"). */
function highlightMatches(text, queryWords) {
  const value = String(text || "");
  if (!queryWords.length) return searchEscape(value);
  return value
    .split(/([^A-Za-z0-9À-ɏ]+)/)
    .map((piece) => {
      const word = searchWords(piece)[0];
      if (!word) return searchEscape(piece);
      const lower = piece.toLowerCase();
      let best = 0;
      let hit = null;
      for (const query of queryWords) {
        const score = wordScore(query, word, true);
        if (score > best) {
          best = score;
          hit = query;
        }
      }
      if (!hit || best < 4) return searchEscape(piece);
      const at = lower.indexOf(hit);
      if (at < 0) return `<mark>${searchEscape(piece)}</mark>`;
      return `${searchEscape(piece.slice(0, at))}<mark>${searchEscape(piece.slice(at, at + hit.length))}</mark>${searchEscape(piece.slice(at + hit.length))}`;
    })
    .join("");
}
