import { writeFileSync } from "node:fs";
import {
  BASE_URL,
  createSpecializedQualityHarness,
  GAME_ID,
} from "./admin-specialized-quality-fixture.mjs";

const CONTRACT_ID = "00000000-0000-4000-8000-000000001003";
const PROGRESS_ID = "00000000-0000-4000-8000-000000001004";
const PLAYER_ID = "00000000-0000-4000-8000-000000001005";
const CONTRACT_TITLE = "Market Evidence Review";
const contract = {
  id: CONTRACT_ID,
  contractId: CONTRACT_ID,
  title: CONTRACT_TITLE,
  description: "Review the submitted market analysis.",
  instructions: "Submit evidence and complete the quiz.",
  category: "analysis",
  status: "active",
  visibility: "public",
  meta: "Advanced · Teacher review",
  reward: "NRC 75 + 2 items",
  rewardPayload: {
    cash: { amount: 75, currencyCode: "NRC" },
    items: [{
      storeItemId: "00000000-0000-4000-8000-000000001006",
      quantity: 2,
      name: "Research Pass",
    }],
  },
  deadlineAt: "2026-07-20T17:00:00.000Z",
  submittedCount: 1,
  submissionCount: 1,
  completedCount: 0,
  rewardIssuedCount: 0,
  progressCount: 1,
};
const submissionEvidence = "The evidence supports the recommendation. · Name the source.: Market evidence guide · Explain the conclusion.: Costs and incentives support it.";
const submission = {
  id: PROGRESS_ID,
  progressId: PROGRESS_ID,
  submissionId: PROGRESS_ID,
  contractId: CONTRACT_ID,
  contract_id: CONTRACT_ID,
  playerId: PLAYER_ID,
  player_id: PLAYER_ID,
  playerName: "Review Smoke Player",
  displayName: "Review Smoke Player",
  rosterLabel: "G10-REVIEW",
  countryCode: "NORTHREACH",
  country: "Northreach",
  status: "submitted",
  summary: submissionEvidence,
  evidence: submissionEvidence,
  before: "—",
  after: "submitted",
  evidencePayload: {
    writtenResponse: "The evidence supports the recommendation.",
    answers: [
      { prompt: "Name the source.", answer: "Market evidence guide" },
      { prompt: "Explain the conclusion.", answer: "Costs and incentives support it." },
    ],
  },
  evidence_payload: { writtenResponse: "The evidence supports the recommendation." },
  resultPayload: {},
  result_payload: {},
  submittedAt: "2026-07-15T09:00:00.000Z",
  submitted_at: "2026-07-15T09:00:00.000Z",
  rewardIssuedAt: null,
  reward_issued_at: null,
};
const player = {
  id: PLAYER_ID,
  playerId: PLAYER_ID,
  displayName: "Review Smoke Player",
  rosterLabel: "G10-REVIEW",
  countryCode: "NORTHREACH",
  status: "active",
};

const harness = await createSpecializedQualityHarness("contract-review", {
  model: {
    players: [player],
    contracts: [contract],
    assignments: [contract],
    contractSubmissions: [submission],
    submissions: [submission],
    dashboard: {
      activePlayerCount: 1,
      totalPlayers: 1,
      onlinePlayerCount: 1,
      attendanceSummary: { presentCount: 0, lateCount: 0, absentCount: 0 },
      leaderboard: [],
      recentActivity: [],
      marketStatus: "open",
      contracts: [contract],
    },
  },
  handleProxy: ({ method, path }) => {
    if (method === "GET" && path.endsWith(`/games/${GAME_ID}/contracts/${CONTRACT_ID}/submissions`)) {
      return { body: { data: { contractId: CONTRACT_ID, contractSubmissions: [submission], submissions: [submission] } } };
    }
    if (method === "GET" && path.endsWith(`/games/${GAME_ID}/contract-submissions`)) {
      return { body: { data: { contractSubmissions: [submission], submissions: [submission] } } };
    }
    if (method === "POST" && path.endsWith(`/games/${GAME_ID}/contract-submissions/${PROGRESS_ID}/decision`)) {
      return {
        body: {
          data: {
            reviewed: true,
            rewardIssued: true,
            alreadyIssued: false,
            progress: {
              ...submission,
              status: "completed",
              after: "completed",
              completedAt: "2026-07-15T10:00:00.000Z",
              rewardIssuedAt: "2026-07-15T10:00:00.000Z",
            },
            rewardResult: { status: "applied" },
          },
        },
      };
    }
    return null;
  },
});
const { page, writes, errors, dir } = harness;

await page.addInitScript(() => {
  window.__adminKeyboardPointerEvents = [];
  for (const type of ["pointerdown", "mousedown", "touchstart"]) {
    window.addEventListener(type, (event) => {
      window.__adminKeyboardPointerEvents.push({
        type: event.type,
        target: event.target?.tagName || "",
      });
    }, true);
  }
});

async function keyboardActivate(locator, key = "Enter") {
  await locator.waitFor({ state: "visible", timeout: 8000 });
  await locator.focus();
  if (!(await locator.evaluate((node) => document.activeElement === node))) {
    throw new Error(
      `Keyboard target did not receive focus: ${await locator.getAttribute("data-admin-terminal-action") || await locator.textContent()}`,
    );
  }
  await page.keyboard.press(key);
}

async function keyboardTabToAndActivate(locator, key = "Enter", maxTabs = 40) {
  await locator.waitFor({ state: "visible", timeout: 8000 });
  for (let tabs = 0; tabs <= maxTabs; tabs += 1) {
    if (await locator.evaluate((node) => document.activeElement === node)) {
      await page.keyboard.press(key);
      return tabs;
    }
    await page.keyboard.press("Tab");
  }
  throw new Error(
    `Keyboard Tab path did not reach: ${await locator.getAttribute("data-admin-terminal-action") || await locator.textContent()}`,
  );
}

try {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });
  await keyboardActivate(page.locator('[data-admin-section="Assignments"]').first(), "Enter");
  await page.waitForTimeout(800);

  const focus = page.locator(
    `[data-admin-terminal-action="focus-contract"][data-contract-title="${CONTRACT_TITLE}"]`,
  ).first();
  await keyboardActivate(focus, "Enter");
  await page.waitForTimeout(300);

  const review = page.locator(
    `[data-admin-terminal-action="review-contract-submissions"][data-contract-id="${CONTRACT_ID}"]:visible`,
  ).first();
  await keyboardActivate(review, "Enter");
  const modal = page.locator(".admin-terminal-contract-submissions-modal-v470").first();
  await modal.waitFor({ state: "visible", timeout: 8000 });
  const modalText = await modal.innerText();
  if (!modalText.includes("Review Smoke Player") || !modalText.includes("The evidence supports")) {
    throw new Error(`Submission modal omitted player evidence: ${modalText}`);
  }

  const accept = modal.locator('[data-admin-terminal-action="contract-submission-accept"]').first();
  const acceptTabs = await keyboardTabToAndActivate(accept, "Space");
  const decision = page.locator('[data-admin-terminal-action="contract-submission-confirm-decision"]:visible').first();
  const decisionTabs = await keyboardTabToAndActivate(decision, "Enter");
  await page.waitForTimeout(900);

  const decisionWrites = writes.filter((write) =>
    write.path.endsWith(`/games/${GAME_ID}/contract-submissions/${PROGRESS_ID}/decision`)
  );
  if (decisionWrites.length !== 1) {
    throw new Error(`Expected one decision write, received ${decisionWrites.length}. Writes: ${JSON.stringify(writes)}`);
  }
  const write = decisionWrites[0];
  const body = write.parsedBody || {};
  const rawDecision = String(
    body.payload?.decision || body.decision || body.action || body.status || "",
  ).toLowerCase();
  if (!["accept", "accepted", "approve", "approved"].includes(rawDecision)) {
    throw new Error(`Accept action sent unexpected body: ${JSON.stringify(body)}`);
  }
  if ("staffId" in body || "playerId" in body) {
    throw new Error("Decision body contains client-supplied authority fields.");
  }
  if (write.headers.authorization !== undefined) {
    throw new Error("Decision request exposed a Staff bearer token.");
  }
  if (
    write.headers["x-econovaria-game-id"] !== GAME_ID ||
    !write.headers["x-econovaria-csrf-token"]
  ) {
    throw new Error("Decision request omitted BFF game scope or cookie-bound CSRF.");
  }

  const keyboardEvidence = await page.evaluate(() => ({
    modality: document.documentElement.getAttribute("data-admin-input-modality"),
    pointerEvents: window.__adminKeyboardPointerEvents || [],
  }));
  if (keyboardEvidence.modality !== "keyboard" || keyboardEvidence.pointerEvents.length !== 0) {
    throw new Error(`Contract review was not keyboard-only: ${JSON.stringify(keyboardEvidence)}`);
  }

  writeFileSync(`${dir}/admin-contract-review-runtime.json`, JSON.stringify({
    writes,
    errors,
    modalText,
    keyboardEvidence,
    focusPath: { acceptTabs, decisionTabs },
  }, null, 2));
  await harness.capture("admin-contract-review");
  if (errors.length) throw new Error(errors[0]);
  await harness.finish({ modalText, keyboardEvidence, focusPath: { acceptTabs, decisionTabs } });
  console.log("Keyboard-only accepted admin Contract review flow passed.");
} catch (error) {
  writeFileSync(
    `${dir}/admin-contract-review-runtime.json`,
    JSON.stringify({ writes, errors, failure: error.message }, null, 2),
  );
  await harness.capture("admin-contract-review-failure").catch(() => {});
  await harness.finish({ failure: error.stack || error.message || String(error) });
  throw error;
}
