import assert from "node:assert/strict";

import { PlayerApi } from "../src/api/player-api.js";
import { previewData } from "../src/data/preview-data.js";

const CSRF_TEST = "R".repeat(43);
let readCount = 0;
let releaseStaleRead;
let markStaleReadStarted;
const staleReadGate = new Promise((resolve) => { releaseStaleRead = resolve; });
const staleReadStarted = new Promise((resolve) => { markStaleReadStarted = resolve; });

const api = new PlayerApi({
  usePreviewData: false,
  requestTimeoutMs: 1000,
  writeCooldownMs: 0,
  allowedImageHosts: [],
  capabilities: null,
  authenticated: true,
  csrfToken: CSRF_TEST,
  gameSessionId: "game_read_ordering",
  apiCall: async ({ endpointKey }) => {
    assert.equal(endpointKey, "news");
    readCount += 1;
    const model = structuredClone(previewData.news);
    const marker = readCount === 1 ? "stale-before-mutation" : "fresh-after-mutation";
    model.items[0] = { ...model.items[0], title: marker };
    if (readCount === 1) {
      markStaleReadStarted();
      await staleReadGate;
    }
    return model;
  }
});

const staleRead = api.request("news", { force: true });
await staleReadStarted;
api.invalidateResources(["news"]);

const freshRead = await api.request("news", { force: true });
assert.equal(freshRead.items[0].title, "fresh-after-mutation", "Invalidation must start a fresh authoritative read.");

releaseStaleRead();
await assert.rejects(
  staleRead,
  (error) => error.code === "REQUEST_SUPERSEDED",
  "A pre-invalidation read must not resolve into newer player state."
);

const cachedRead = await api.request("news");
assert.equal(cachedRead.items[0].title, "fresh-after-mutation", "A late stale completion must not overwrite the refreshed cache.");
assert.equal(readCount, 2, "The fresh response should remain cacheable after the stale read is superseded.");
assert.equal(api.inFlightReads.size, 0, "All read bookkeeping should settle after both generations complete.");

console.log("Player read ordering passed: invalidation supersedes stale in-flight reads without overwriting newer state.");
