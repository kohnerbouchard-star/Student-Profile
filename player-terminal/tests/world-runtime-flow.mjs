import assert from "node:assert/strict";
import { resolvePlayerBackendRequest } from "../src/api/backend-routes.js";
import { isEndpointEnabled } from "../src/api/capabilities.js";
import { normalizeWritePayload } from "../src/api/payload-normalizer.js";
import { normalizeApiResponse } from "../src/api/response-normalizer.js";
import { PreviewTransport } from "../src/api/preview-transport.js";
import { createResourceSupport } from "../src/api/resource-support.js";
import { formatCurrency } from "../src/core/format.js";
import { renderWorldPage } from "../src/pages/world-page.js";
import { validateStudentProfileCapabilityManifest } from "../src/integrations/student-profile-capability-manifest.js";

const manifest = validateStudentProfileCapabilityManifest({
  schemaVersion: 1,
  manifestVersion: "2026-07-21.1",
  service: "classroom-api",
  capabilities: {
    routes: { world: true },
    actions: {
      arrivalClassSubmit: true,
      travelQuote: true,
      travelExecute: true,
      travelComplete: true,
      residencyRequest: true,
    },
  },
  endpoints: [
    { key: "worldRuntime", operations: [{ method: "GET", pathTemplate: "/players/me/world-runtime" }] },
    { key: "arrivalClass", operations: [{ method: "POST", pathTemplate: "/players/me/arrival-class" }] },
    { key: "travelQuote", operations: [{ method: "POST", pathTemplate: "/players/me/travel/quotes" }] },
    { key: "travelExecute", operations: [{ method: "POST", pathTemplate: "/players/me/travel" }] },
    { key: "travelComplete", operations: [{ method: "POST", pathTemplate: "/players/me/travel/:journeyId/complete" }] },
    { key: "residencyRequest", operations: [{ method: "POST", pathTemplate: "/players/me/residency" }] },
  ],
});
assert.equal(manifest.capabilities.routes.world, true);
assert.equal(isEndpointEnabled(manifest.capabilities, "arrivalClass"), true);
assert.equal(isEndpointEnabled({ actions: { arrivalClassSubmit: false } }, "arrivalClass"), false);
assert.equal(createResourceSupport({ session: { capabilityEndpointKeys: manifest.endpoints.map((item) => item.key) } }).worldRuntime, true);

assert.deepEqual(resolvePlayerBackendRequest({
  endpointKey: "worldRuntime", method: "GET", path: "/world-runtime", params: {}, payload: undefined, session: {},
}), {
  endpointKey: "worldRuntime", method: "GET", path: "/players/me/world-runtime", payload: undefined,
  provisional: { method: "GET", path: "/world-runtime", payload: undefined },
});

const answers = Array.from({ length: 6 }, (_, index) => ({ questionId: `preference-${index + 1}`, optionId: `analyze-${index + 1}` }));
assert.deepEqual(normalizeWritePayload("arrivalClass", { answers }), { answers });
assert.deepEqual(normalizeWritePayload("travelQuote", {
  toLocationId: "loc_valerion_capital_v1",
  allowedModes: ["land", "sea", "land"],
}), { toLocationId: "loc_valerion_capital_v1", allowedModes: ["land", "sea"] });
assert.deepEqual(normalizeWritePayload("travelExecute", {
  quoteId: "trq_00000000000000000000000000000001",
}), { quoteId: "trq_00000000000000000000000000000001" });
assert.deepEqual(normalizeWritePayload("travelComplete", {
  journeyId: "trj_00000000000000000000000000000001",
}), { journeyId: "trj_00000000000000000000000000000001" });
assert.deepEqual(normalizeWritePayload("residencyRequest", {
  countryId: "valerion", expectedRevision: 0,
}), { countryId: "valerion", expectedRevision: 0 });
assert.throws(() => normalizeWritePayload("travelQuote", { toLocationId: "bad", allowedModes: ["teleport"] }));
assert.throws(() => normalizeWritePayload("travelExecute", { quoteId: "00000000-0000-4000-8000-000000000001" }));

const preview = new PreviewTransport({ simulateWrites: true });
const runtime = normalizeApiResponse("worldRuntime", await preview.request({ endpointKey: "worldRuntime", method: "GET" }), {
  path: "/players/me/world-runtime", requestId: "world-read-1", config: {},
});
assert.equal(runtime.world.locations.length, 50);
assert.equal(runtime.arrival.required, true);
assert.doesNotMatch(JSON.stringify(runtime), /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);

await preview.request({ endpointKey: "arrivalClass", method: "POST", payload: { answers } });
const quoteResponse = await preview.request({
  endpointKey: "travelQuote", method: "POST",
  payload: { toLocationId: "loc_valerion_capital_v1", allowedModes: ["land"] },
});
assert.match(quoteResponse.quote.publicQuoteId, /^trq_[0-9a-f]{32}$/);
const executeResponse = await preview.request({
  endpointKey: "travelExecute", method: "POST", payload: { quoteId: quoteResponse.quote.publicQuoteId },
});
assert.equal(executeResponse.journey.status, "in_transit");
assert.match(executeResponse.journey.publicJourneyId, /^trj_[0-9a-f]{32}$/);
await preview.request({ endpointKey: "travelComplete", method: "POST", payload: { journeyId: executeResponse.journey.publicJourneyId } });
await preview.request({ endpointKey: "residencyRequest", method: "POST", payload: { countryId: "valerion", expectedRevision: 0 } });
const completed = await preview.request({ endpointKey: "worldRuntime", method: "GET" });
assert.equal(completed.arrival.assignment.classId, "analyst");
assert.equal(completed.travel.state.currentLocationId, "loc_valerion_capital_v1");
assert.equal(completed.residency.pendingCountryId, "valerion");

const html = renderWorldPage(completed, {
  state: "ready",
  capabilities: manifest.capabilities,
  quote: quoteResponse.quote,
  offline: false,
  stale: false,
});
for (const required of [
  "Campaign, geography, and travel",
  "ARRIVAL CLASS",
  "GEOGRAPHY & TRAVEL",
  "RESIDENCY",
  'data-world-form="travelQuote"',
  'data-world-form="residencyRequest"',
  'aria-live="polite"',
]) assert.match(html, new RegExp(required));
assert.match(html, new RegExp(formatCurrency(quoteResponse.quote.totalCostMinor / 100, quoteResponse.quote.currencyCode).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.doesNotMatch(html, /playerUuid|gameSessionId|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);

assert.match(renderWorldPage(null, { state: "loading" }), /aria-busy="true"/);
assert.match(renderWorldPage(null, { state: "unavailable", message: "Offline" }), /role="alert"/);

const controllerSource = await import("node:fs").then((fs) => fs.readFileSync(new URL("../src/features/world/world-runtime-flow.js", import.meta.url), "utf8"));
assert.doesNotMatch(controllerSource, /@ts-nocheck|\bas any\b|playerUuid|gameSessionId/);
assert.match(controllerSource, /Refresh failed; the committed result will reconcile/);
assert.match(controllerSource, /Number\(normalized\.status\) === 401/);
assert.match(controllerSource, /isEndpointEnabled\(currentCapabilities\(\), endpointKey\)/);

console.log("World runtime Player publication checks passed");
