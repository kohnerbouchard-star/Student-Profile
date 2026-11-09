import assert from "node:assert/strict";
import { test } from "node:test";
import * as readModel from "../src/api/read-model.js";

// Frozen behavioral expectations characterized from read-model.js at
// 4226ca9391df4cafa2c3c3004abd5c5ba552c48d, before its projection extraction.
// Exercise only the existing public API, without importing private helpers or
// loading git/a second implementation at test runtime.
const { normalizeTerminalBootstrap, mergeTerminalRead, readSessionContext } = readModel;
const directSession = { playerId: "public-player", gameSessionId: "public-game", displayName: "Test Player" };
const seed = () => normalizeTerminalBootstrap(directSession, null);
function snapshot(market = {}) {
  return {
    gameSession: { marketStatus: "open" },
    me: { countryCode: "AB", cash: { primaryCurrencyCode: "ALT", totalBalance: 77 } },
    public: { market }
  };
}
const marketBootstrap = (news, stocks = []) => normalizeTerminalBootstrap(directSession, snapshot({ news, stocks }));
const worldRead = (items, data = seed()) => mergeTerminalRead(data, "news", { items });
const countryRead = (items, data = seed()) => mergeTerminalRead(data, "countries", { items });
const defaultCountry = {
  id: "", profileId: "", name: "Unknown country", capital: "Not available", currencyCode: "",
  mapRegion: "", mapColor: "", tone: "cyan", market: "Unavailable", condition: "No live snapshot",
  index: 0, growth: 0, inflation: 0, unemployment: 0, baseRate: 0, currencyTrend: 0,
  stability: 50, risk: "Unavailable", resources: [], exports: [], tradePartners: [],
  policy: "No live economic policy snapshot is available.", isPlayerCountry: false,
  economy: null, relatedAssetIds: [], eventIds: []
};
const defaultMarketNews = {
  id: "", category: "Market", time: "Current", title: "Market update", summary: "", analysis: "",
  severity: "Low", tone: "cyan", effects: [], countryIds: [], assetIds: []
};
const defaultWorldNews = {
  ...defaultMarketNews, category: "World", title: "World update",
  effects: ["Magnitude 0.00", "Confidence 0%"], tick: {}, source: ""
};
function unchangedSiblings(before, after, changed) {
  assert.notStrictEqual(after, before);
  assert.deepEqual(Object.keys(after), Object.keys(before));
  for (const key of Object.keys(before)) {
    if (!changed.includes(key)) assert.strictEqual(after[key], before[key], `${key} retains identity`);
  }
}
function typeError(run, message) {
  assert.throws(run, { name: "TypeError", message });
}

test("the existing public read-model exports and session-context contract stay bounded", () => {
  assert.deepEqual(Object.keys(readModel).sort(), ["mergeTerminalRead", "normalizeTerminalBootstrap", "readSessionContext"]);
  assert.deepEqual([normalizeTerminalBootstrap.length, mergeTerminalRead.length, readSessionContext.length], [2, 3, 1]);
  for (const raw of [undefined, null, false, 9, "input", [], { gameSession: [], session: [] }]) {
    assert.deepEqual(readSessionContext(raw), { gameSessionId: "", playerSessionId: "" });
  }
  assert.deepEqual(readSessionContext({ gameSession: { id: " game " }, session: { id: " session " }, token: "ignored" }), {
    gameSessionId: "game", playerSessionId: "session"
  });
  assert.deepEqual(readSessionContext({ gameSessionId: 7, playerSessionId: " live ", gameSession: { id: "ignored" } }), {
    gameSessionId: "", playerSessionId: "live"
  });
  assert.deepEqual(readSessionContext({ gameSessionId: "", playerSessionId: "", gameSession: { id: "nested" } }), {
    gameSessionId: "nested", playerSessionId: ""
  });
});

test("empty bootstraps preserve defaults and allocate independent projections", () => {
  const first = normalizeTerminalBootstrap(null, null), second = normalizeTerminalBootstrap([], []);
  assert.deepEqual(first, second);
  assert.deepEqual(first.countries, []);
  assert.deepEqual(first.news, { categories: ["All"], selectedId: "", items: [] });
  assert.equal(first.session.countryName, "Unassigned");
  assert.equal(first.session.currencyCode, "ECO");
  assert.equal(first.dashboard.economyPhase, "Unavailable");
  assert.equal(first.dashboard.countryScore, 0);
  for (const key of ["session", "dashboard", "countries", "news", "market", "banking", "progression"]) {
    assert.notStrictEqual(first[key], second[key]);
  }
  assert.notStrictEqual(first.news.categories, second.news.categories);
  assert.notStrictEqual(first.news.items, second.news.items);
});

test("dashboard Market news preserves raw category order, case and target coercion", () => {
  const createdAt = "2026-01-02T03:04:00.000Z";
  const stocks = [
    { ticker: " DUP ", assetId: "old", countryCode: "AB" },
    { ticker: "dup", assetId: "winner", countryCode: "AB" },
    { ticker: "BLANK", assetId: "listed" }, { ticker: "blank", assetId: "" }
  ];
  const items = [
    {},
    { id: " country ", category: " macro_policy ", createdAt, headline: " Headline ", explanation: " Explanation ", sentiment: "negative", scope: "country", targetKey: " AB ", source: "ignored", tick: { index: 1 } },
    { id: "mixed", category: "All", sentiment: "mixed", scope: "ticker", targetKey: "DUP" },
    { id: "positive", category: "macro_policy", sentiment: "positive", scope: "ticker", targetKey: "BLANK" },
    { id: "case", category: "Macro_policy", sentiment: " Negative ", scope: " COUNTRY ", targetKey: "AB" },
    { id: "numeric", sentiment: "Positive", scope: "country", targetKey: 17 }
  ];
  const before = structuredClone({ items, stocks });
  const data = marketBootstrap(items, stocks);
  assert.deepEqual(data.news.categories, ["All", "Market", "macro_policy", "All", "Macro_policy"]);
  assert.equal(data.news.selectedId, "", "selection does not skip a blank first ID");
  assert.deepEqual(data.news.items[0], defaultMarketNews);
  assert.deepEqual(data.news.items[1], {
    id: "country", category: "macro_policy",
    time: new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(createdAt)),
    title: "Headline", summary: "Explanation", analysis: "Explanation", severity: "High", tone: "warn",
    effects: ["Explanation"], countryIds: [" ab "], assetIds: []
  });
  assert.deepEqual(data.news.items.map(({ severity, tone }) => [severity, tone]), [
    ["Low", "cyan"], ["High", "warn"], ["Medium", "purple"], ["Low", "good"], ["Low", "cyan"], ["Low", "cyan"]
  ]);
  assert.deepEqual(data.news.items.map((item) => item.assetIds), [[], [], ["winner"], [], [], []]);
  assert.deepEqual(data.news.items[4].countryIds, []);
  assert.deepEqual(data.news.items[5].countryIds, ["17"]);
  assert.deepEqual(data.market.assets.map((asset) => asset.newsIds), [[], ["mixed"], [], []]);
  assert.equal(data.dashboard.worldEvents.length, 5);
  assert.deepEqual(data.dashboard.worldEvents[1], { id: "country", title: "Headline", region: " AB ", impact: "Explanation", tone: "warn" });
  assert.deepEqual({ items, stocks }, before);
});

test("World News projects all fields, normalized case and unbounded impact text", () => {
  const tick = { index: 4, nested: { observed: true } };
  const item = {
    id: " news ", category: " macro_POLICY-news ", headline: " Headline ", explanation: " Explanation ",
    createdAt: "not-a-date", sentiment: " NeGaTiVe ", scope: " COUNTRY ", targetKey: " AB ",
    impact: { magnitude: "-0.75", confidence: "1.235", volatility: false, volume: "" },
    tick, source: " source ", internalId: "ignored", privatePayload: { ignored: true }
  };
  const result = worldRead([item]);
  assert.deepEqual(result.news, {
    categories: ["All", "Macro POLICY News"], selectedId: "news", items: [{
      id: "news", category: "Macro POLICY News", time: "Current", title: "Headline", summary: "Explanation", analysis: "Explanation",
      severity: "High", tone: "warn", effects: ["Magnitude -0.75", "Confidence 124%", "Volatility 0.00", "Volume 0.00"],
      countryIds: ["ab"], assetIds: [], tick, source: "source"
    }]
  });
  assert.strictEqual(result.news.items[0].tick, tick);
  assert.notStrictEqual(result.news.items[0], item);
  assert.notStrictEqual(result.news.items[0].effects, item.impact);
  assert.deepEqual(worldRead([{}]).news.items[0], defaultWorldNews);
  assert.deepEqual(worldRead([{ impact: { volatility: null, volume: undefined, confidence: -0.125 } }]).news.items[0].effects, ["Magnitude 0.00", "Confidence -12%"]);
});

test("World News severity thresholds, numeric coercion and sentiment defaults stay exact", () => {
  for (const [magnitude, severity, formatted] of [
    [-0.75, "High", "-0.75"], [0.75, "High", "0.75"], [0.749, "Medium", "0.75"],
    [-0.25, "Medium", "-0.25"], [0.25, "Medium", "0.25"], [0.249, "Low", "0.25"],
    ["0.8", "High", "0.80"], [true, "High", "1.00"], [[0.5], "Medium", "0.50"],
    [null, "Low", "0.00"], ["", "Low", "0.00"], ["bad", "Low", "0.00"], [Infinity, "Low", "0.00"]
  ]) {
    const result = worldRead([{ impact: { magnitude } }]).news.items[0];
    assert.equal(result.severity, severity, String(magnitude));
    assert.equal(result.effects[0], `Magnitude ${formatted}`);
  }
  for (const [sentiment, tone] of [[" POSITIVE ", "good"], ["Negative", "warn"], ["mIxEd", "purple"], ["other", "cyan"], [true, "cyan"], [null, "cyan"]]) {
    assert.equal(worldRead([{ sentiment }]).news.items[0].tone, tone);
  }
});

test("World News duplicate ticker lookup, category insertion and first-ID selection stay exact", () => {
  const data = seed();
  data.market.assets = [
    { id: "old", symbol: " DUP " }, { id: " winner ", symbol: "dup" },
    { id: "listed", symbol: "BLANK" }, { id: " ", symbol: "blank" }
  ];
  const result = worldRead([
    { category: "all", scope: " TICKER ", targetKey: " DUP " },
    { id: "second", category: "macro_policy", scope: "ticker", targetKey: "BLANK" },
    { category: "macro-policy", scope: "country", targetKey: 17 },
    { category: "MACRO_policy", scope: "country", targetKey: " AB " },
    { category: "all", scope: "ticker", targetKey: 17 },
    { category: false, scope: "country", targetKey: "" }
  ], data);
  assert.deepEqual(result.news.categories, ["All", "All", "Macro Policy", "MACRO Policy", "World"]);
  assert.equal(result.news.selectedId, "");
  assert.deepEqual(result.news.items.map((item) => item.assetIds), [["winner"], [], [], [], [], []]);
  assert.deepEqual(result.news.items.map((item) => item.countryIds), [[], [], [], ["ab"], [], []]);
  assert.equal(result.dashboard.worldEvents.length, 5);
  assert.deepEqual(result.dashboard.worldEvents[3], { id: "", title: "World update", region: "AB", impact: "", tone: "cyan" });
  assert.strictEqual(result.market, data.market, "World News does not rewrite Market newsIds");
});

test("Countries preserve default fields, title casing and numeric policy formatting", () => {
  assert.deepEqual(countryRead([{}]).countries[0], defaultCountry);
  const economy = {
    difficultyPreset: " very_hARD-mode ", label: " Current condition ", realGdpIndex: "2.5", gdpGrowthRate: "-0.125",
    inflationRate: "0.1", unemploymentRate: "0.04", interestRate: "0.025", exchangeRateIndex: "1.5",
    politicalStabilityIndex: "1.33", marketRiskIndex: "1.4", taxRate: "0.07", subsidyRate: "0.015"
  };
  const item = { id: " profile ", countryCode: " AB ", countryName: " Country ", capitalName: " Capital ", currencyCode: " alt ", map: { region: " North ", color: " ViOlEt " }, economy, isPlayerCountry: "true", internalId: "ignored" };
  assert.deepEqual(countryRead([item]).countries[0], {
    id: "ab", profileId: "profile", name: "Country", capital: "Capital", currencyCode: "alt", mapRegion: "North", mapColor: "ViOlEt", tone: "purple",
    market: "Very HARD Mode", condition: "Current condition", index: 2.5, growth: -12.5, inflation: 10, unemployment: 4, baseRate: 2.5, currencyTrend: 50,
    stability: 67, risk: "High", resources: [], exports: [], tradePartners: [],
    policy: "Tax 7.00% · subsidy 1.50% · base rate 2.50%.", isPlayerCountry: false, economy, relatedAssetIds: [], eventIds: []
  });
  assert.equal(countryRead([{ countryCode: " AB ", countryName: " " }]).countries[0].name, "AB");
  assert.equal(countryRead([{ countryCode: 17, countryName: false }]).countries[0].name, "Unknown country");
  assert.equal(countryRead([{ economy: { taxRate: "bad", subsidyRate: null, interestRate: Infinity } }]).countries[0].policy, "Tax 0.00% · subsidy 0.00% · base rate 0.00%.");
});

test("Country colors, risk and stability preserve exact thresholds and coercion", () => {
  for (const [color, tone] of [[" RED ", "red"], ["orange", "amber"], ["Gold", "amber"], ["yellow", "amber"], ["amber", "amber"], ["purple", "purple"], ["violet", "purple"], ["GREEN", "green"], ["blue", "cyan"], [7, "cyan"]]) {
    assert.equal(countryRead([{ map: { color } }]).countries[0].tone, tone);
  }
  for (const [marketRiskIndex, risk] of [[1.4, "High"], [1.399, "Moderate"], [0.9, "Moderate"], [0.899, "Low"], [undefined, "Moderate"], ["bad", "Moderate"], [null, "Low"], [false, "Low"]]) {
    assert.equal(countryRead([{ economy: { marketRiskIndex } }]).countries[0].risk, risk);
  }
  for (const [politicalStabilityIndex, stability] of [[3, 100], [-1, 0], [1.01, 51], [undefined, 50], ["bad", 50], [null, 0], ["", 0]]) {
    assert.equal(countryRead([{ economy: { politicalStabilityIndex } }]).countries[0].stability, stability);
  }
});

test("Country economy accepts arrays by reference, while news tick excludes arrays", () => {
  for (const economy of [[], {}, new Date("2026-01-01T00:00:00Z")]) {
    const country = countryRead([{ economy }]).countries[0];
    assert.strictEqual(country.economy, economy);
    assert.equal(country.market, "Current");
    assert.equal(country.condition, "Current snapshot");
    assert.equal(country.risk, "Moderate");
    assert.equal(country.policy, "Tax 0.00% · subsidy 0.00% · base rate 0.00%.");
  }
  for (const economy of [undefined, null, 0, false, "snapshot"]) assert.equal(countryRead([{ economy }]).countries[0].economy, null);
  for (const tick of [{ index: 1 }, new Date("2026-01-01T00:00:00Z")]) assert.strictEqual(worldRead([{ tick }]).news.items[0].tick, tick);
  for (const tick of [[], null, undefined, false, 9, "tick"]) {
    const item = worldRead([{ tick }]).news.items[0];
    assert.deepEqual(item.tick, {});
    assert.notStrictEqual(item.tick, tick);
  }
});

test("Countries selects the first strictly true player country and preserves currency fallbacks", () => {
  const data = seed();
  data.session = { ...data.session, currencyCode: "OLD", currencyName: "Old name" };
  const next = countryRead([
    { countryCode: "ignored", isPlayerCountry: 1 },
    { countryCode: " AB ", countryName: " First ", capitalName: " Capital ", isPlayerCountry: true, economy: { label: " Phase ", inflationRate: 0.1, interestRate: 0.025, politicalStabilityIndex: 1.5 } },
    { countryCode: "second", countryName: "Second", currencyCode: "NEW", isPlayerCountry: true }
  ], data);
  assert.deepEqual(next.session, { ...data.session, countryId: "ab", countryName: "First", capital: "Capital" });
  assert.deepEqual(next.dashboard, { ...data.dashboard, economyPhase: "Phase", inflationRate: 10, baseRate: 2.5, countryScore: 75 });
  assert.notStrictEqual(next.session, data.session);
  assert.notStrictEqual(next.dashboard, data.dashboard);
  unchangedSiblings(data, next, ["countries", "session", "dashboard"]);
  const withCurrency = countryRead([{ countryCode: "ab", currencyCode: " alt ", isPlayerCountry: true }], data);
  assert.equal(withCurrency.session.currencyCode, "alt");
  assert.equal(withCurrency.session.currencyName, "alt");
  assert.equal(data.session.countryId, "");
});

test("country and news relation order preserves duplicates, exact IDs and fresh shells", () => {
  const data = seed(), economy = { label: "kept" };
  data.market.assets = [
    { id: "b", symbol: "B", countryId: "ab" }, { id: "wrong-case", symbol: "C", countryId: "AB" },
    { id: "a", symbol: "A", countryId: "ab" }, { id: "b", symbol: "B", countryId: "ab" }
  ];
  data.news.items = [{ id: "z", countryIds: ["ab"] }, { id: "a", countryIds: ["AB"] }, { id: "z", countryIds: ["ab", "ab"] }, { id: "other", countryIds: "ab" }];
  const countries = countryRead([{ countryCode: "ab", economy }, { countryCode: "cd" }], data);
  assert.deepEqual(countries.countries[0].relatedAssetIds, ["b", "a", "b"]);
  assert.deepEqual(countries.countries[0].eventIds, ["z", "z"]);
  assert.strictEqual(countries.countries[0].economy, economy);
  unchangedSiblings(data, countries, ["countries"]);
  const before = structuredClone(countries);
  const next = worldRead([{ id: "n2", scope: "country", targetKey: "AB" }, { id: "n1", scope: "country", targetKey: "ab" }, { id: "n2", scope: "country", targetKey: "ab" }], countries);
  unchangedSiblings(countries, next, ["news", "countries", "dashboard"]);
  assert.deepEqual(next.countries[0].eventIds, ["n2", "n1", "n2"]);
  assert.deepEqual(next.countries[0].relatedAssetIds, ["b", "a", "b"]);
  for (let i = 0; i < countries.countries.length; i++) {
    assert.notStrictEqual(next.countries[i], countries.countries[i]);
    for (const key of ["relatedAssetIds", "eventIds"]) assert.notStrictEqual(next.countries[i][key], countries.countries[i][key]);
    for (const key of ["economy", "resources", "exports", "tradePartners"]) assert.strictEqual(next.countries[i][key], countries.countries[i][key]);
  }
  assert.deepEqual(countries, before);
  assert.notStrictEqual(next.news.items, countries.news.items);
  assert.notStrictEqual(next.news.categories, countries.news.categories);
});

test("news refresh replaces selection and allocates projection objects without modifying inputs", () => {
  const data = countryRead([{ countryCode: "ab", economy: {} }]);
  const tick = { index: 8 }, response = { items: [{ id: "first", tick }, { id: "second", tick }] };
  const first = mergeTerminalRead(data, "news", response);
  first.news.selectedId = "second";
  const second = mergeTerminalRead(first, "news", response);
  assert.equal(second.news.selectedId, "first");
  assert.notStrictEqual(second.news, first.news);
  for (let i = 0; i < second.news.items.length; i++) {
    assert.notStrictEqual(second.news.items[i], first.news.items[i]);
    for (const key of ["effects", "countryIds", "assetIds"]) assert.notStrictEqual(second.news.items[i][key], first.news.items[i][key]);
    assert.strictEqual(second.news.items[i].tick, tick);
  }
  assert.notStrictEqual(second.dashboard.worldEvents, first.dashboard.worldEvents);
  assert.notStrictEqual(second.dashboard.worldEvents[0], first.dashboard.worldEvents[0]);
  assert.deepEqual(response, { items: [{ id: "first", tick }, { id: "second", tick }] });
});

test("Market reads do not refresh Countries relations or World News links", () => {
  const countries = countryRead([{ countryCode: "ab" }]);
  const data = worldRead([{ id: "news", scope: "ticker", targetKey: "NEW" }], countries);
  const next = mergeTerminalRead(data, "market", { assets: [{ assetId: "new", ticker: "NEW", countryCode: "AB" }] });
  assert.strictEqual(next.countries, data.countries);
  assert.strictEqual(next.news, data.news);
  assert.deepEqual(next.countries[0].relatedAssetIds, []);
  assert.deepEqual(next.news.items[0].assetIds, []);
  assert.deepEqual(worldRead([{ id: "news", scope: "ticker", targetKey: "NEW" }], next).countries[0].relatedAssetIds, ["new"]);
});

test("malformed outer containers become empty reads and leave unrelated siblings untouched", () => {
  for (const response of [undefined, null, false, 9, "input", [], { items: null }, { items: {} }, { items: "rows" }]) {
    const data = seed();
    const countries = mergeTerminalRead(data, "countries", response);
    assert.deepEqual(countries.countries, []);
    unchangedSiblings(data, countries, ["countries"]);
    const news = mergeTerminalRead(data, "news", response);
    assert.deepEqual(news.news, { categories: ["All"], selectedId: "", items: [] });
    assert.deepEqual(news.dashboard.worldEvents, []);
    unchangedSiblings(data, news, ["countries", "news", "dashboard"]);
  }
  for (const news of [undefined, null, {}, "rows"]) assert.deepEqual(marketBootstrap(news).news, { categories: ["All"], selectedId: "", items: [] });
  assert.deepEqual(countryRead([false, 7, "row", []]).countries, Array.from({ length: 4 }, () => defaultCountry));
  assert.deepEqual(worldRead([false, 7, "row", []]).news.items, Array.from({ length: 4 }, () => defaultWorldNews));
  assert.deepEqual(marketBootstrap([false, 7, "row", []]).news.items, Array.from({ length: 4 }, () => defaultMarketNews));
  const data = seed();
  unchangedSiblings(data, mergeTerminalRead(data, "unknown", { items: [null] }), []);
});

test("full dashboard merge retains the established nested mutation and stale country relations", () => {
  const data = countryRead([{ countryCode: "ab", economy: {}, isPlayerCountry: true }]);
  data.session.displayName = "Changed Player";
  const oldChecking = data.banking.checking, oldDashboard = data.dashboard, oldCountry = data.countries[0];
  const response = snapshot({ news: [{ id: "event", scope: "country", targetKey: "AB" }], stocks: [] });
  const next = mergeTerminalRead(data, "dashboard", response);
  assert.notStrictEqual(next, data);
  for (const key of ["session", "banking", "progression", "countries"]) assert.strictEqual(next[key], data[key]);
  assert.equal(data.session.currencyCode, "ALT");
  assert.equal(data.session.currencyName, "ALT");
  assert.equal(data.session.countryId, "ab");
  assert.equal(data.session.countryName, "AB");
  assert.notStrictEqual(data.banking.checking, oldChecking);
  assert.deepEqual(data.banking.checking, { accountId: "CHECKING", balance: 77, available: 77, pending: 0 });
  assert.equal(data.progression.playerName, "Changed Player");
  assert.notStrictEqual(next.dashboard, oldDashboard);
  assert.equal(oldDashboard.liquidBalance, 0);
  assert.equal(next.dashboard.liquidBalance, 77);
  assert.strictEqual(next.countries[0], oldCountry);
  assert.deepEqual(next.countries[0].eventIds, []);
  assert.deepEqual(next.news.items[0].countryIds, ["ab"]);
  const shallow = mergeTerminalRead(seed(), "dashboard", { economyPhase: "Shallow" });
  assert.equal(shallow.dashboard.economyPhase, "Shallow");
  assert.deepEqual(shallow.news, { categories: ["All"], selectedId: "", items: [] });
});

test("malformed rows and unsupported coercions preserve exact existing TypeErrors", () => {
  for (const [row, word] of [[null, "null"], [undefined, "undefined"]]) {
    typeError(() => countryRead([row]), `Cannot read properties of ${word} (reading 'economy')`);
    typeError(() => worldRead([row]), `Cannot read properties of ${word} (reading 'impact')`);
    typeError(() => marketBootstrap([row]), `Cannot read properties of ${word} (reading 'id')`);
    typeError(() => marketBootstrap([], [row]), `Cannot read properties of ${word} (reading 'ticker')`);
    const data = seed();
    data.market.assets = [row];
    typeError(() => worldRead([], data), `Cannot read properties of ${word} (reading 'symbol')`);
    typeError(() => countryRead([{}], data), `Cannot read properties of ${word} (reading 'countryId')`);
  }
  const data = seed();
  data.news.items = [null];
  typeError(() => countryRead([{}], data), "Cannot read properties of null (reading 'countryIds')");
  typeError(() => mergeTerminalRead({}, "news", {}), "Cannot read properties of undefined (reading 'assets')");
  typeError(() => mergeTerminalRead({}, "countries", {}), "Cannot read properties of undefined (reading 'assets')");
  typeError(() => countryRead([{ economy: { realGdpIndex: Symbol("number") } }]), "Cannot convert a Symbol value to a number");
  typeError(() => worldRead([{ impact: { magnitude: Symbol("number") } }]), "Cannot convert a Symbol value to a number");
  typeError(() => worldRead([{ createdAt: Symbol("date") }]), "Cannot convert a Symbol value to a string");
  typeError(() => marketBootstrap([{ createdAt: Symbol("date") }]), "Cannot convert a Symbol value to a string");
});
