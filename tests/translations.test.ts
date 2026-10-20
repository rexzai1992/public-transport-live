/* Latin-letter search for Chinese and Japanese names.

   A passenger types "Shinjuku" or "People's Square"; the feed's own
   translations.txt (GTFS standard or legacy GTFS-JP layout) supplies those
   names as altNames, and kana readings are romanised. Nothing here invents a
   reading: kanji with no feed-provided translation stay unsearchable in Latin.
   The fixtures are small in-memory zips, not real provider data. Run: npm test */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import vm from "node:vm";
import JSZip from "jszip";
import { parseFeedZip } from "../src/gtfsStatic.js";
import {
  kanaToRomaji,
  makeDoc,
  makeDocs,
  normalizeWords,
  queryVariants,
  romajiForms,
  scoreDoc,
  scoreDocs
} from "../src/search.js";
import type { GtfsStop, StaticGtfsFeed } from "../src/types.js";

const csv = (rows: string[][]) => rows.map((row) => row.map(cell).join(",")).join("\n") + "\n";
const cell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

async function zipOf(files: Record<string, string[][]>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, rows] of Object.entries(files)) zip.file(name, csv(rows));
  return zip.generateAsync({ type: "nodebuffer" });
}

const tokyoFiles = {
  "routes.txt": [
    ["route_id", "route_short_name", "route_long_name", "route_type"],
    ["JY", "", "山手線", "2"]
  ],
  "stops.txt": [
    ["stop_id", "stop_name", "stop_lat", "stop_lon"],
    ["shinjuku", "新宿", "35.6896", "139.7006"],
    ["shibuya", "渋谷", "35.6580", "139.7016"],
    ["tokyo", "東京", "35.6812", "139.7671"],
    ["yoyogi", "代々木", "35.6830", "139.7020"],
    ["saitama", "さいたま新都心", "35.8937", "139.6337"]
  ],
  "trips.txt": [
    ["route_id", "service_id", "trip_id"],
    ["JY", "WK", "JY1"]
  ],
  "stop_times.txt": [
    ["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"],
    ["JY1", "08:00:00", "08:00:00", "tokyo", "1"],
    ["JY1", "08:10:00", "08:10:00", "shinjuku", "2"],
    ["JY1", "08:14:00", "08:14:00", "shibuya", "3"]
  ],
  // GTFS standard layout: by record_id, and (for 渋谷) by field_value.
  "translations.txt": [
    ["table_name", "field_name", "language", "translation", "record_id", "record_sub_id", "field_value"],
    ["stops", "stop_name", "en", "Shinjuku", "shinjuku", "", ""],
    ["stops", "stop_name", "ja-Hrkt", "しんじゅく", "shinjuku", "", ""],
    ["stops", "stop_name", "ja", "新宿", "shinjuku", "", ""],
    ["stops", "stop_name", "en", "Shibuya", "", "", "渋谷"],
    ["stops", "stop_name", "ja-Hrkt", "しぶや", "", "", "渋谷"],
    // 東京 only has its kana reading: "Tokyo" must come from romanisation.
    ["stops", "stop_name", "ja-Hrkt", "とうきょう", "tokyo", "", ""],
    ["routes", "route_long_name", "en", "Yamanote Line", "JY", "", ""],
    ["routes", "route_long_name", "ja-Hrkt", "やまのてせん", "JY", "", ""],
    ["agency", "agency_name", "en", "JR East", "JR", "", ""]
  ]
};

const shanghaiFiles = {
  "routes.txt": [
    ["route_id", "route_short_name", "route_long_name", "route_type"],
    ["M1", "1号线", "地铁1号线", "1"]
  ],
  "stops.txt": [
    ["stop_id", "stop_name", "stop_lat", "stop_lon"],
    ["rmgc", "人民广场", "31.2335", "121.4754"],
    ["shhcz", "上海火车站", "31.2497", "121.4555"],
    ["xjh", "徐家汇", "31.1940", "121.4369"]
  ],
  "trips.txt": [
    ["route_id", "service_id", "trip_id"],
    ["M1", "WK", "M1-1"]
  ],
  "stop_times.txt": [
    ["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"],
    ["M1-1", "07:00:00", "07:00:00", "shhcz", "1"],
    ["M1-1", "07:06:00", "07:06:00", "rmgc", "2"],
    ["M1-1", "07:14:00", "07:14:00", "xjh", "3"]
  ],
  // Legacy GTFS-JP layout: trans_id is the original text.
  "translations.txt": [
    ["trans_id", "lang", "translation"],
    ["人民广场", "en", "People's Square"],
    ["人民广场", "zh-Latn", "Renmin Guangchang"],
    ["人民广场", "zh-Hans", "人民广场"],
    ["上海火车站", "en", "Shanghai Railway Station"],
    ["地铁1号线", "en", "Metro Line 1"]
  ]
};

const malaysiaFiles = {
  "routes.txt": [["route_id", "route_short_name", "route_long_name"], ["KJ", "KJ", "LRT KELANA JAYA LINE"]],
  "stops.txt": [
    ["stop_id", "stop_name", "stop_lat", "stop_lon"],
    ["KJ15", "KL SENTRAL", "3.1340", "101.6862"],
    ["KJ14", "PASAR SENI", "3.1425", "101.6955"]
  ]
};

/* A real GTFS-JP line (Nagano City, 2026-10) with unescaped quotes, which a
   strict CSV parser rejects. Appended raw, not through csv(). */
const naganoLine = 'routes,route_long_name,en,Nagano city area bus "Gururin-go",22,,';

async function zipWithRawTranslations(): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, rows] of Object.entries(tokyoFiles)) {
    zip.file(name, name === "translations.txt" ? csv(rows) + naganoLine + "\n" : csv(rows));
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

const tokyo = await parseFeedZip(await zipOf(tokyoFiles));
const shanghai = await parseFeedZip(await zipOf(shanghaiFiles));
const malaysia = await parseFeedZip(await zipOf(malaysiaFiles));

const allStops = [...tokyo.stops.values(), ...shanghai.stops.values(), ...malaysia.stops.values()];

/** The stop search would offer first: best score over every spelling. */
function bestStop(query: string, stops: GtfsStop[] = allStops): string | undefined {
  let best: { name: string; score: number } | undefined;
  for (const stop of stops) {
    const docs = makeDocs(stop.name, stop.altNames);
    const score = Math.max(0, ...queryVariants(query).map((words) => scoreDocs(words, docs)));
    if (score > 0 && (!best || score > best.score)) best = { name: stop.name, score };
  }
  return best?.name;
}

const stop = (feed: StaticGtfsFeed, id: string) => feed.stops.get(id)!;

describe("translations.txt parsing", () => {
  it("reads the GTFS standard layout by record_id and by field_value", () => {
    assert.deepEqual(stop(tokyo, "shinjuku").altNames, ["Shinjuku", "しんじゅく"]);
    assert.deepEqual(stop(tokyo, "shibuya").altNames, ["Shibuya", "しぶや"]);
    assert.deepEqual(stop(tokyo, "tokyo").altNames, ["とうきょう"]);
    assert.equal(stop(tokyo, "yoyogi").altNames, undefined);
    assert.deepEqual(tokyo.routes.get("JY")!.altNames, ["Yamanote Line", "やまのてせん"]);
  });

  it("reads the legacy GTFS-JP layout keyed by the original text", () => {
    assert.deepEqual(stop(shanghai, "rmgc").altNames, ["People's Square", "Renmin Guangchang"]);
    assert.deepEqual(stop(shanghai, "shhcz").altNames, ["Shanghai Railway Station"]);
    assert.equal(stop(shanghai, "xjh").altNames, undefined);
    assert.deepEqual(shanghai.routes.get("M1")!.altNames, ["Metro Line 1"]);
  });

  it("survives unescaped quotes in translations.txt (Nagano regression)", async () => {
    const feed = await parseFeedZip(await zipWithRawTranslations());
    assert.equal(feed.stops.size, 5);
    assert.equal(feed.trips.size, 1);
    assert.deepEqual(feed.stops.get("shinjuku")!.altNames, ["Shinjuku", "しんじゅく"]);
    assert.deepEqual(feed.routes.get("JY")!.altNames, ["Yamanote Line", "やまのてせん"]);
  });

  it("drops an unreadable translations.txt without failing the feed", async () => {
    const zip = new JSZip();
    for (const [name, rows] of Object.entries(tokyoFiles)) {
      if (name !== "translations.txt") zip.file(name, csv(rows));
    }
    zip.file("translations.txt", 'table_name,field_name\n"unterminated,stops\n');
    const feed = await parseFeedZip(await zip.generateAsync({ type: "nodebuffer" }));
    assert.equal(feed.stops.size, 5);
    assert.equal(feed.stops.get("shinjuku")!.altNames, undefined);
  });

  it("leaves a feed without translations.txt untouched", () => {
    for (const s of malaysia.stops.values()) assert.equal("altNames" in s, false);
    for (const r of malaysia.routes.values()) assert.equal("altNames" in r, false);
  });
});

describe("kanaToRomaji", () => {
  const cases: [string, string][] = [
    ["しんじゅく", "shinjuku"],
    ["シンジュク", "shinjuku"],
    ["ｼﾝｼﾞｭｸ", "shinjuku"],
    ["しぶや", "shibuya"],
    ["とうきょう", "toukyou"],
    ["おおさか", "oosaka"],
    ["にっぽり", "nippori"],
    ["ろっぽんぎ", "roppongi"],
    ["まっちゃ", "matcha"],
    ["きょうと", "kyouto"],
    ["しゃ・ちゅ・じょ", "sha chu jo"],
    ["ラーメン", "raamen"],
    ["ファミリー", "famirii"],
    ["ティー", "tii"],
    ["ウィーン", "wiin"],
    ["シェア", "shea"],
    ["しんばし", "shinbashi"],
    ["さいたま新都心", "saitama 新都心"],
    ["新宿", "新宿"],
    ["霞ヶ関", "霞ヶ関"],
    ["KL Sentral", "KL Sentral"]
  ];
  for (const [kana, romaji] of cases) {
    it(`${kana} -> ${romaji}`, () => assert.equal(kanaToRomaji(kana), romaji));
  }

  it("offers long-vowel-collapsed and m-before-labial spellings", () => {
    assert.deepEqual(romajiForms("とうきょう"), ["toukyou", "tokyo"]);
    assert.deepEqual(romajiForms("おおさか"), ["oosaka", "osaka"]);
    assert.deepEqual(romajiForms("しんばし"), ["shinbashi", "shimbashi"]);
    assert.deepEqual(romajiForms("しんじゅく"), ["shinjuku"]);
    assert.deepEqual(romajiForms("新宿"), []);
    assert.deepEqual(romajiForms("KL SENTRAL"), []);
  });
});

describe("Latin-letter stop search", () => {
  const hits: [string, string][] = [
    ["Shinjuku", "新宿"],
    ["shinjuku", "新宿"],
    ["SHINJUKU", "新宿"],
    ["しんじゅく", "新宿"],
    ["シンジュク", "新宿"],
    ["新宿", "新宿"],
    ["新宿駅", "新宿"],
    ["Tokyo", "東京"],
    ["toukyou", "東京"],
    ["Shibuya Station", "渋谷"],
    ["saitama", "さいたま新都心"],
    ["People's Square", "人民广场"],
    ["peoples square", "人民广场"],
    ["renmin guangchang", "人民广场"],
    ["人民广场", "人民广场"],
    ["Shanghai Railway Station", "上海火车站"],
    ["上海站", "上海火车站"],
    ["KL Sentral", "KL SENTRAL"],
    ["pasar seni", "PASAR SENI"]
  ];
  for (const [query, name] of hits) {
    it(`"${query}" finds ${name}`, () => assert.equal(bestStop(query), name));
  }

  it("scores an exact alt-name phrase like the main name", () => {
    const words = normalizeWords("Shinjuku");
    const s = stop(tokyo, "shinjuku");
    assert.equal(scoreDocs(words, makeDocs(s.name, s.altNames)), 100);
    assert.equal(scoreDocs(normalizeWords("新宿"), makeDocs(s.name, s.altNames)), 100);
  });

  const misses = ["Osaka", "Beijing", "Kyoto", "xujiahui", "yoyogi", "Hong Kong", "ampang"];
  for (const query of misses) {
    it(`"${query}" matches nothing`, () => assert.equal(bestStop(query), undefined));
  }
});

describe("Malaysia scoring is unchanged", () => {
  // Values recorded from src/search.ts before altNames/romaji existed.
  const recorded: [string, string, number][] = [
    ["KL Sentral", "KL SENTRAL", 100],
    ["KL Sentral", "KL1234 KL SENTRAL (PLATFORM 3)", 100],
    ["klsentral", "KL SENTRAL", 12.5],
    ["sentrel", "KL SENTRAL", 6],
    ["sentral station", "KL SENTRAL", 11.5],
    ["pasar seni", "KL2212 PASAR SENI", 100],
    ["psr seni", "PASAR SENI", 100],
    ["jln tun razak", "JALAN TUN RAZAK (HOSPITAL)", 100],
    ["tun razak", "JLN TUN RAZAK", 100],
    ["bukit", "Bukit Bintang", 23.5],
    ["int", "Bt Batok Int", 11],
    ["usj", "USJ 1", 23.5],
    ["ampang", "KL SENTRAL", 0]
  ];
  for (const [query, name, score] of recorded) {
    it(`"${query}" vs ${name} = ${score}`, () => {
      const words = normalizeWords(query);
      assert.equal(scoreDoc(words, makeDoc(name)), score);
      assert.equal(scoreDocs(words, makeDocs(name)), score);
      assert.equal(makeDocs(name).length, 1);
    });
  }
});

describe("public/search-core.js parity with src/search.ts", () => {
  const context = vm.createContext({});
  vm.runInContext(readFileSync(new URL("../public/search-core.js", import.meta.url), "utf8"), context);
  const client = context as unknown as {
    searchWords(text: string): string[];
    kanaToRomaji(text: string): string;
    romajiForms(text: string): string[];
    makeSearchDoc(text: string): unknown;
    scoreDoc(words: string[], doc: unknown): number;
  };

  const corpus = [
    "KL Sentral", "KL1234 KL SENTRAL (PLATFORM 3)", "Jln Tun Razak", "PASAR SENI", "Stesen Bas Medan Kidd",
    "Tmn Bkt Indah", "Bt Batok Int", "Opp Blk 123", "Woodlands Stn", "USJ 1", "SS15", "Kampong Bahru",
    "新宿", "新宿駅", "新宿西口", "しんじゅく", "シンジュク", "ｼﾝｼﾞｭｸ", "とうきょう", "東京駅", "渋谷",
    "さいたま新都心", "霞ヶ関", "ＴＯＫＹＯ", "ラーメン", "にっぽり", "Shin-Ōkubo",
    "人民广场", "上海火车站", "上海站", "徐家汇", "地铁1号线", "車站", "People's Square",
    "Renmin Guangchang", "JR 新宿 Shinjuku", "MRT 新加坡 Singapore", "Café Ñandú"
  ];
  const queries = ["shinjuku", "新宿", "tokyo", "kl sentral", "jalan tun razak", "人民", "people square", "sentrel", "上海 station", "ramen"];

  it("searchWords agrees", () => {
    for (const text of corpus) assert.deepEqual([...client.searchWords(text)], normalizeWords(text), text);
  });

  it("kanaToRomaji and romajiForms agree", () => {
    for (const text of corpus) {
      assert.equal(client.kanaToRomaji(text), kanaToRomaji(text), text);
      assert.deepEqual([...client.romajiForms(text)], romajiForms(text), text);
    }
  });

  it("scoreDoc agrees", () => {
    for (const query of queries) {
      for (const text of corpus) {
        const server = scoreDoc(normalizeWords(query), makeDoc(text));
        const browser = client.scoreDoc(client.searchWords(query), client.makeSearchDoc(text));
        assert.equal(browser, server, `${query} vs ${text}`);
      }
    }
  });
});
