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

/* Han ideographs, hiragana, katakana (incl. half-width and the prolonged-sound
   mark) and CJK compatibility forms. Chinese and Japanese names have no spaces
   between words and typos don't map to letter edits, so they match by
   substring instead of by edit distance. */
const CJK = /[\u3005\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/;

export function isCjk(word: string): boolean {
  return CJK.test(word);
}

export function normalizeWords(text: string): string[] {
  return text
    // NFKD folds full-width ＴＯＫＹＯ/１２３ to ASCII and splits accents; drop
    // Latin accents only, then NFC puts kana voicing marks back (が stays が).
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/&/g, " and ")
    // 駅 (Japanese) and 站 (Chinese) mean "station": optional, like the word.
    // Chinese 火车站 (railway), 地铁站 (metro), 车站/車站 also all mean "station".
    .replace(/火车站|地铁站|地下鉄駅|车站|車站|[駅站]/g, " station ")
    // Letters and digits of every script are kept — not just a-z.
    .replace(/[^\p{L}\p{N}]+/gu, " ")
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
  // One wrong ideograph is a different place, not a typo.
  if (isCjk(word)) return 0;
  if (word.length >= 8) return 2;
  if (word.length >= 4) return 1;
  return 0;
}

/** How well one query word lands on one name word; 0 means not at all. */
export function wordScore(query: string, word: string, isLast: boolean): number {
  if (word === query) return 10;
  if (word.startsWith(query)) return 7 + 2 * (query.length / word.length);
  // Inside a word: 3+ letters, or 2+ CJK characters (新宿 in 新宿西口).
  if ((query.length >= 3 || (isCjk(query) && query.length >= 2)) && word.includes(query)) return 4;
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

/* ------------------------------------------------------------------------- */
/* Japanese kana -> romaji, so "shinjuku" finds a stop whose only Latin form  */
/* is its kana reading (しんじゅく). Modified Hepburn without macrons:          */
/* とうきょう -> "toukyou"; romajiForms() adds the long-vowel-collapsed        */
/* "tokyo" people actually type. Kanji carry no reading here — a name written */
/* only in kanji is romanised only when the feed supplies a kana or Latin      */
/* translation. Kept identical to kanaToRomaji in public/search-core.js.      */

const KANA_ROMAJI: Record<string, string> = {
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
const SMALL_Y: Record<string, string> = { ゃ: "a", ゅ: "u", ょ: "o" };
const SMALL_VOWEL: Record<string, string> = { ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o" };
/* Romanisable kana: hiragana ぁ..ゔ, katakana ァ..ヴ, half-width ｦ..ﾝ. ヶ (as in
   霞ヶ関, read "ga" or "ke" by context) is left alone. */
const KANA = /[ぁ-ゔァ-ヴｦ-ﾝ]/;

export function hasKana(text: string): boolean {
  return KANA.test(text);
}

/** Kana to lower-case romaji; everything else passes through, with a space
    put between a romanised run and an adjacent kanji. */
export function kanaToRomaji(text: string): string {
  // NFKC: half-width ｼﾝｼﾞｭｸ -> full-width シンジュク, voicing marks combined.
  const chars = [...String(text || "").normalize("NFKC")].map((char) => {
    const code = char.charCodeAt(0);
    // Katakana ァ..ヴ sit 0x60 above their hiragana.
    return code >= 0x30a1 && code <= 0x30f4 ? String.fromCharCode(code - 0x60) : char;
  });
  let out = "";
  let geminate = false;
  let last: "kana" | "cjk" | "other" = "other";
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    if (char === "っ") {
      geminate = true;
      continue;
    }
    if (char === "ー") {
      // Long mark: say the vowel again (ラーメン raamen).
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
    if (next && SMALL_Y[next] && syllable.length > 1 && syllable.endsWith("i")) {
      // きゃ kya, しゃ sha, ちゃ cha, じゃ ja.
      const head = syllable.slice(0, -1);
      syllable = /^(sh|ch|j)$/.test(head) ? head + SMALL_Y[next] : head + "y" + SMALL_Y[next];
      i++;
    } else if (next && SMALL_VOWEL[next] && !SMALL_VOWEL[char] && /^([^aeiou]+[aeiou]|[ui])$/.test(syllable)) {
      // Loanword pairs: ファ fa, ティ ti, ウィ wi, イェ ye, ヴァ va, シェ she.
      const head = syllable === "u" ? "w" : syllable === "i" ? "y" : syllable.slice(0, -1);
      syllable = head + SMALL_VOWEL[next];
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

/** Latin spellings of a name's kana — the plain Hepburn form, the form with
    long vowels collapsed (toukyou -> tokyo) and with n -> m before b/m/p
    (shinbashi -> shimbashi) — or none when the name has no kana. */
export function romajiForms(text: string): string[] {
  if (!hasKana(text)) return [];
  const plain = kanaToRomaji(text);
  const collapsed = plain.replace(/ou/g, "o").replace(/([aeiou])\1/g, "$1");
  const forms = [plain, collapsed, collapsed.replace(/n(?=[bmp])/g, "m")];
  return forms.filter((form, index) => forms.indexOf(form) === index && form !== text);
}

/** One search doc per spelling of a name: the name itself first, then each
    alternative name from the feed, then romaji of any kana among them. */
export function makeDocs(name: string, altNames: readonly string[] = []): SearchDoc[] {
  const texts: string[] = [];
  for (const text of [name, ...altNames]) {
    for (const form of [text, ...romajiForms(text)]) {
      if (form.trim() && !texts.includes(form)) texts.push(form);
    }
  }
  return texts.map((text) => makeDoc(text));
}

/** The best score any spelling of a name gets; 0 means none matched. */
export function scoreDocs(queryWords: string[], docs: readonly SearchDoc[]): number {
  let best = 0;
  for (const doc of docs) {
    const score = scoreDoc(queryWords, doc);
    if (score > best) best = score;
  }
  return best;
}

/** The ways to read a query: its own words, then — when it is kana — its
    romaji, so katakana シンジュク finds a stop indexed by hiragana しんじゅく
    (both romanise to "shinjuku"). */
export function queryVariants(query: string): string[][] {
  const variants = [normalizeWords(query)];
  for (const form of romajiForms(query)) variants.push(normalizeWords(form));
  return variants.filter((words) => words.length);
}
