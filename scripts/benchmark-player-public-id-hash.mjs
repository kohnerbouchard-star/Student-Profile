import assert from "node:assert/strict";
import { cpuUsage } from "node:process";
import { pathToFileURL } from "node:url";

// Synthetic CPU characterization, not a substitute for the connected load gate.
// Optional argument selects an unchanged checkout for a baseline comparison.
const moduleUrl = process.argv[2]
  ? pathToFileURL(process.argv[2])
  : new URL("../backend/src/security/playerBrowserResponsePrivacy.ts", import.meta.url);
const { enforcePlayerBrowserResponsePrivacy } = await import(moduleUrl);
const uuid = (index) => `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
const catalog = Array.from({ length: 512 }, (_, index) => ({
  id: uuid(index + 100), gameSessionId: uuid(1), itemKey: `item-${index}`,
  name: `Example item ${index}`,
  description: "A catalog entry used only for deterministic local load characterization.",
  category: "equipment", price: index, currencyCode: "ECO", stockQuantity: 10,
  status: "active", visibility: "visible",
}));
const input = JSON.stringify({
  ok: true,
  gameSession: { id: uuid(1) },
  me: { playerId: uuid(2), store: { listings: catalog } },
  public: {
    storeListings: catalog,
    players: Array.from({ length: 40 }, (_, index) => ({
      playerId: uuid(index + 2), displayName: `Synthetic ${index}`,
    })),
  },
});
const originalDigest = crypto.subtle.digest;
let digests = 0;
crypto.subtle.digest = function (algorithm, data) {
  digests += 1;
  return originalDigest.call(this, algorithm, data);
};

try {
  for (let round = 0; round < 4; round += 1) {
    digests = 0;
    const cpu = cpuUsage();
    const started = performance.now();
    const outputs = await Promise.all(Array.from({ length: 40 }, async () => {
      const response = await enforcePlayerBrowserResponsePrivacy(new Response(input, {
        headers: { "content-type": "application/json" },
      }));
      return await response.text();
    }));
    const used = cpuUsage(cpu);
    assert.ok(outputs.every((output) => output === outputs[0]));
    assert.doesNotMatch(outputs[0], /00000000-0000-4000-8000/u);
    console.log(JSON.stringify({
      round, bytes: input.length, responses: outputs.length, digests,
      cpuMs: (used.user + used.system) / 1_000,
      elapsedMs: performance.now() - started,
      identicalOutputs: true, rawUuidPresent: false,
    }));
  }
} finally {
  crypto.subtle.digest = originalDigest;
}
