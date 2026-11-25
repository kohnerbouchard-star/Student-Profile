import assert from "node:assert/strict";
import { renderContractsPage } from "../src/pages/contracts-page.js";
import { normalizePlayerContracts } from "../src/features/contracts/contract-read-model.js";

const render = (status, evidencePayload, metadata = {}, extra = {}, contractKey = "review-example", rewardPayload) => {
  const contracts = normalizePlayerContracts({
    contracts: [{ contractKey, title: "Reviewed mission", metadata, rewardPayload }],
    progress: [{ contractKey, status, evidencePayload,
      submittedAt: "2026-11-17T12:00:00Z", resultPayload: { feedback: "Review guidance" }, ...extra }]
  });
  return renderContractsPage({ contracts, session: { currencyCode: "ECO" } }, {});
};
for (const status of ["approved", "rejected", "completed"]) {
  const html = render(status, { note: "Recorded explanation", submissionUrl: "https://example.test/evidence" });
  assert.match(html, /RECORDED SUBMISSION/);
  assert.match(html, /Recorded explanation/);
  assert.match(html, /https:\/\/example.test\/evidence/);
  assert.match(html, /latest recorded response, not a history of every revision/);
  assert.match(html, /Review guidance/);
  assert.doesNotMatch(html, /data-player-form="contract-submit"|data-player-contract-accept=/);
  assert.equal(html, render(status, { note: "Recorded explanation", submissionUrl: "https://example.test/evidence" }), "Repeated reads must not duplicate history or mutate the read model");
}
const quiz = { materials: [{ type: "quiz", questions: [{ questionKey: "q1", prompt: "Which policy?", options: [{ optionKey: "a", label: "Chosen policy" }, { optionKey: "b", label: "Other policy" }] }] }] };
for (const status of ["approved", "rejected", "completed"]) {
  const html = render(status, { answers: [{ questionKey: "q1", optionKey: "a" }] }, quiz);
  assert.match(html, /SUBMITTED ANSWERS/); assert.match(html, /Chosen policy/);
}
const escaped = render("completed", { note: '<img src=x onerror="bad()">', submissionUrl: 'javascript:alert("bad")' });
assert.doesNotMatch(escaped, /<img src=x|href="javascript:/);
assert.match(escaped, /&lt;img/);
assert.match(render("approved", {}, {}, { submittedAt: null }), /No submission content is available/);
assert.doesNotMatch(render("active", {}), /RECORDED SUBMISSION/);
assert.doesNotMatch(render("revision_requested", {}), /RECORDED SUBMISSION/);
assert.match(render("revision_requested", {}), /data-player-form="contract-submit"/);
assert.match(render("approved", {}, {}, {}, "review-example", { cash: { amount: 50 } }), /Awaiting confirmation/);
assert.match(render("approved", {}), /Reward status is not available/);
console.log("Contracts reviewed-submission history checks passed.");

for (const status of ["approved", "rejected", "completed"]) {
  const html = render(status, { storyDecision: { optionKey: "multilateral", rationale: "My recorded Story rationale" } }, {}, {}, "contract.meridian.compare-financing-governance.v1");
  assert.match(html, /COMMITTED STORY DECISION/);
  assert.match(html, /Multilateral governance/);
  assert.match(html, /My recorded Story rationale/);
  assert.doesNotMatch(html, /name="storyOption"|Commit decision|Resubmit explanation/);
}
// A different server response replaces the current record; no stale prior response is retained.
assert.match(render("rejected", { note: "First response" }), /First response/);
const refreshed = render("completed", { note: "Revised response" });
assert.match(refreshed, /Revised response/); assert.doesNotMatch(refreshed, /First response/);

const frozenContracts = normalizePlayerContracts({ contracts: [{ contractKey: "immutable", title: "Recorded" }], progress: [{ contractKey: "immutable", status: "completed", evidencePayload: { note: "Do not change" } }] });
const freeze = (value) => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const frozenData = freeze({ contracts: frozenContracts, session: { currencyCode: "ECO" } });
const before = JSON.stringify(frozenData);
const firstRender = renderContractsPage(frozenData, {});
assert.equal(renderContractsPage(frozenData, {}), firstRender);
assert.equal(JSON.stringify(frozenData), before);
