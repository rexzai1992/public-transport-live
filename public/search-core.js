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

/* Han ideographs, kana and CJK compatibility forms; see src/search.ts. */
const SEARCH_CJK = /[\u3005\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/;

function isCjk(word) {
  return SEARCH_CJK.test(word);
}

function searchWords(text) {
  return String(text || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/&/g, " and ")
    // Chinese 火车站 (railway), 地铁站 (metro), 车站/車站 also all mean "station".
    .replace(/火车站|地铁站|地下鉄駅|车站|車站|[駅站]/g, " station ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((word) => SEARCH_ABBREVIATIONS[word] || word);
}

function compactKey(text) {
  return String(text || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
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
  if (isCjk(word)) return 0;
  if (word.length >= 8) return 2;
  if (word.length >= 4) return 1;
  return 0;
}

/* How well one query word lands on one name word; 0 means not at all. */
function wordScore(query, word, isLast) {
  if (word === query) return 10;
  if (word.startsWith(query)) return 7 + 2 * (query.length / word.length);
  if ((query.length >= 3 || (isCjk(query) && query.length >= 2)) && word.includes(query)) return 4;
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
    .split(/([^\p{L}\p{N}]+)/u)
    .map((piece) => {
      // Chinese/Japanese run words together: mark the matched characters
      // wherever they sit in the unspaced name (新宿 in 新宿駅西口).
      if (isCjk(piece)) {
        const hit = queryWords.filter((q) => isCjk(q) && piece.includes(q)).sort((x, y) => y.length - x.length)[0];
        if (!hit) return searchEscape(piece);
        const at = piece.indexOf(hit);
        return `${searchEscape(piece.slice(0, at))}<mark>${searchEscape(hit)}</mark>${searchEscape(piece.slice(at + hit.length))}`;
      }
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

/* Japanese kana -> romaji (modified Hepburn, no macrons), so "shinjuku" finds
   a name whose Latin form is only its kana reading. Copy of kanaToRomaji and
   romajiForms in src/search.ts; kanji carry no reading here. */
const KANA_ROMAJI = {
  あ: "a", い: "i", う: "u", え: "e", お: "o",
  か: "ka", き: "ki", く: "ku", け: "ke", こ: "ko",
  が: "ga", ぎ: "gi", ぐ: "gu", げ: "ge", ご: "go",
  さ: "sa", し: "shi", す: "su", せ: "se", そ: "so",
  ざ: "za", じ: "ji", ず: "zu", ぜ: "ze", ぞ: "zo",
  た: "ta", ち: "chi", つ: "tsu", て: "te", と: "to",
  だ: "da", ぢ: "ji", づ: "zu", で: "de", ど: "do",
  な: "na", に: "ni", ぬ: "nu", ね: "ne", の: "no",
  は: "ha", ひ: "hi", ふ: "fu", へ: "he", ほ: "ho",
  ば: "ba", び: "bi", ぶ: "bu", べ: "be", ぼ: "bo",
  ぱ: "pa", ぴ: "pi", ぷ: "pu", ぺ: "pe", ぽ: "po",
  ま: "ma", み: "mi", む: "mu", め: "me", も: "mo",
  や: "ya", ゆ: "yu", よ: "yo",
  ら: "ra", り: "ri", る: "ru", れ: "re", ろ: "ro",
  わ: "wa", ゐ: "i", ゑ: "e", を: "o", ん: "n", ゔ: "vu",
  ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o", ゎ: "wa",
  ゃ: "ya", ゅ: "yu", ょ: "yo"
};
const KANA_SMALL_Y = { ゃ: "a", ゅ: "u", ょ: "o" };
const KANA_SMALL_VOWEL = { ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o" };
const SEARCH_KANA = /[ぁ-ゔァ-ヴｦ-ﾝ]/;

function hasKana(text) {
  return SEARCH_KANA.test(String(text || ""));
}

function kanaToRomaji(text) {
  const chars = [...String(text || "").normalize("NFKC")].map((char) => {
    const code = char.charCodeAt(0);
    return code >= 0x30a1 && code <= 0x30f4 ? String.fromCharCode(code - 0x60) : char;
  });
  let out = "";
  let geminate = false;
  let last = "other";
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    if (char === "っ") {
      geminate = true;
      continue;
    }
    if (char === "ー") {
      if (last === "kana" && /[aeiou]$/.test(out)) out += out[out.length - 1];
      continue;
    }
    let syllable = KANA_ROMAJI[char];
    if (syllable === undefined) {
      geminate = false;
      const kind = char !== "・" && isCjk(char) ? "cjk" : "other";
      if (kind === "cjk" && last === "kana") out += " ";
      out += char === "・" ? " " : char;
      last = kind;
      continue;
    }
    const next = chars[i + 1];
    if (next && KANA_SMALL_Y[next] && syllable.length > 1 && syllable.endsWith("i")) {
      const head = syllable.slice(0, -1);
      syllable = /^(sh|ch|j)$/.test(head) ? head + KANA_SMALL_Y[next] : head + "y" + KANA_SMALL_Y[next];
      i++;
    } else if (next && KANA_SMALL_VOWEL[next] && !KANA_SMALL_VOWEL[char] && /^([^aeiou]+[aeiou]|[ui])$/.test(syllable)) {
      const head = syllable === "u" ? "w" : syllable === "i" ? "y" : syllable.slice(0, -1);
      syllable = head + KANA_SMALL_VOWEL[next];
      i++;
    }
    if (geminate && syllable !== "n" && /^[^aeiou]/.test(syllable)) {
      syllable = (syllable.startsWith("ch") ? "t" : syllable[0]) + syllable;
    }
    geminate = false;
    if (last === "cjk") out += " ";
    out += syllable;
    last = "kana";
  }
  return out;
}

/* Plain Hepburn, long vowels collapsed (toukyou -> tokyo), n -> m before
   b/m/p (shinbashi -> shimbashi); none when the text has no kana. */
function romajiForms(text) {
  const value = String(text || "");
  if (!hasKana(value)) return [];
  const plain = kanaToRomaji(value);
  const collapsed = plain.replace(/ou/g, "o").replace(/([aeiou])\1/g, "$1");
  const forms = [plain, collapsed, collapsed.replace(/n(?=[bmp])/g, "m")];
  return forms.filter((form, index) => forms.indexOf(form) === index && form !== value);
}
