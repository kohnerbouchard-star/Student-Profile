import { writeFileSync } from "node:fs";
import {
  BASE_URL,
  createSpecializedQualityHarness,
  GAME_ID,
} from "./admin-specialized-quality-fixture.mjs";

const STORE_ITEM_ID = "00000000-0000-4000-8000-000000000803";
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const array = (value) => Array.isArray(value) ? value : [];
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const storeItem = {
  id: STORE_ITEM_ID,
  storeItemId: STORE_ITEM_ID,
  itemUuid: STORE_ITEM_ID,
  name: "Contract Reward Tablet",
  title: "Contract Reward Tablet",
  description: "A contract reward item.",
  category: "material",
  price: 40,
  currencyCode: "NRC",
  stockQuantity: 25,
  stock: 25,
  status: "active",
  visibility: "visible",
};

const harness = await createSpecializedQualityHarness("contracts", {
  model: { store: [storeItem], storeItems: [storeItem] },
  handleProxy: ({ method, path }) => {
    if (method === "POST" && path.endsWith(`/games/${GAME_ID}/contracts`)) {
      return {
        status: 200,
        body: {
          data: {
            created: true,
            contract: {
              id: "00000000-0000-4000-8000-000000000804",
              title: "Contract Wiring Audit",
              status: "scheduled",
            },
          },
        },
      };
    }
    return null;
  },
});
const { page, writes, errors, dir } = harness;

const capture = (name) => harness.capture(name);
const waitForWrite = async (start, timeout = 8000) => {
  const began = Date.now();
  while (Date.now() - began < timeout) {
    if (writes.length > start) return writes.at(-1);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
};
const setCheckbox = async (form, value, checked) => {
  await form.locator(`input[type="checkbox"][value="${value}"]`).evaluate((node, nextChecked) => {
    node.checked = nextChecked;
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  }, checked);
};

async function attachLink(form) {
  await form.locator('[data-admin-terminal-action="open-contract-material-builder"][data-contract-material-type="link"]').click();
  const builder = form.locator("[data-admin-terminal-contract-material-builder]");
  await builder.waitFor({ state: "visible" });
  await builder.locator('[name="materialTitle"]').fill("Market evidence guide");
  await builder.locator('[name="materialUrl"]').fill("https://example.test/market-evidence");
  await builder.locator('[data-admin-terminal-action="save-contract-material-builder"]').click();
  await builder.waitFor({ state: "hidden" });
}

async function attachQuiz(form) {
  await form.locator('[data-admin-terminal-action="open-contract-material-builder"][data-contract-material-type="quiz"]').click();
  const builder = form.locator("[data-admin-terminal-contract-material-builder]");
  await builder.waitFor({ state: "visible" });
  await builder.locator('[name="materialTitle"]').fill("Evidence check quiz");
  await builder.locator("[data-admin-terminal-contract-quiz-template]").selectOption("evidence_check");
  await builder.locator("[data-admin-terminal-contract-quiz-grading-mode]").selectOption("graded");
  await builder.locator('[data-admin-terminal-action="apply-contract-quiz-template"]').click();
  assert(
    await builder.locator("[data-admin-terminal-contract-quiz-question-list] > *").count() > 0,
    "Quiz template created no questions.",
  );
  await builder.locator('[data-admin-terminal-action="save-contract-material-builder"]').click();
  await builder.waitFor({ state: "hidden" });
}

async function addRewards(form) {
  const cash = form.locator("[data-admin-terminal-reward-stage-cash]");
  await cash.locator("[data-admin-terminal-stage-cash]").fill("75");
  await cash.locator('[data-admin-terminal-action="confirm-staged-reward"]').click();
  await form.locator('[data-admin-terminal-action="stage-item-reward"]').click();
  const item = form.locator("[data-admin-terminal-reward-stage-item]");
  await item.locator("[data-admin-terminal-stage-item]").selectOption(STORE_ITEM_ID);
  await item.locator("[data-admin-terminal-stage-item-quantity]").fill("2");
  await item.locator('[data-admin-terminal-action="confirm-staged-reward"]').click();
}

async function schedule(form) {
  await form.locator('[data-admin-terminal-action="toggle-contract-post-menu"]').click();
  await form.locator('[data-admin-terminal-action="schedule-contract-later"]').click();
  const picker = form.locator("[data-admin-terminal-contract-schedule-picker]");
  await picker.waitFor({ state: "visible" });
  await picker.locator("[data-admin-terminal-schedule-date]").fill("2027-01-15");
  await picker.locator("[data-admin-terminal-schedule-time]").fill("10:30");
  await picker.locator('[data-admin-terminal-action="confirm-contract-schedule"]').click();
  await picker.waitFor({ state: "hidden" });
}

const rewardItems = (payload) => array(payload.itemRewards).length
  ? array(payload.itemRewards)
  : array(object(payload.rewards).items).length
    ? array(object(payload.rewards).items)
    : array(object(payload.rewardPayload).items);
const cashReward = (payload) => object(object(payload.rewardPayload).cash).amount
  ? object(object(payload.rewardPayload).cash)
  : object(object(payload.rewards).cash).amount
    ? object(object(payload.rewards).cash)
    : { amount: payload.cashRewardAmount || payload.rewardCash || payload.cashAmount };

try {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });
  await page.locator('[data-admin-terminal-action="add-contract"]').first().click();
  const form = page.locator("[data-admin-terminal-contract-form]");
  await form.waitFor({ state: "visible" });
  await form.locator('[name="title"]').fill("Contract Wiring Audit");
  await form.locator('[name="objective"]').fill("Verify complete contract persistence.");
  await form.locator('[name="instructions"]').fill("Complete all attached work.");
  await form.locator('[name="evidence"]').fill("Submit the attached quiz and written response.");
  await form.locator('[name="deadline"]').fill("2027-01-20T17:00");
  await form.locator('[name="quantity"]').fill("5");
  await form.locator('[name="quantityScope"]').selectOption("per_location");
  await form.locator('[name="reviewType"]').selectOption("teacher");
  await form.locator("details.admin-terminal-contract-advanced-v495").evaluate((node) => { node.open = true; });
  await form.locator('[name="difficulty"]').selectOption("Advanced");
  await form.locator('[name="reviewNote"]').fill("Use the rubric and verify the attached quiz.");
  await setCheckbox(form, "all", false);
  await setCheckbox(form, "NORTHREACH", true);
  await setCheckbox(form, "YRETHIA", true);
  await attachLink(form);
  await attachQuiz(form);
  await addRewards(form);
  await capture("contract-before-submit");

  const start = writes.length;
  await schedule(form);
  const write = await waitForWrite(start);
  assert(write, "Schedule post sent no contract create request.");
  await page.waitForTimeout(750);
  assert(writes.length === start + 1, `Expected one contract create request, received ${writes.length - start}.`);

  const requestBody = object(write.parsedBody);
  const payload = object(requestBody.payload || requestBody.contract || requestBody);
  const materials = array(payload.materials);
  const requirements = array(payload.submissionRequirements);
  const items = rewardItems(payload);
  const cash = cashReward(payload);
  const targeting = object(payload.targeting || payload.targetingPayload);

  assert(write.method === "POST" && write.path.endsWith(`/games/${GAME_ID}/contracts`), `Unexpected write ${write.method} ${write.path}.`);
  assert(payload.title === "Contract Wiring Audit", "Title was not preserved.");
  assert(payload.instructions === "Complete all attached work.", "Instructions were not preserved.");
  assert(materials.length === 2, `Expected 2 materials, received ${materials.length}.`);
  assert(materials.some((item) => String(item?.type || item?.kind).toLowerCase() === "link"), "Link material was not serialized.");
  assert(materials.some((item) => String(item?.type || item?.kind).toLowerCase() === "quiz"), "Quiz material was not serialized.");
  assert(requirements.length > 0 || object(payload.submissionRequirement).required === true, "Submission requirement was not serialized.");
  assert(Number(cash.amount) === 75, `Expected cash 75, received ${cash.amount ?? "none"}.`);
  assert(items.length === 1, `Expected one item reward, received ${items.length}.`);
  assert(
    String(items[0]?.storeItemId || items[0]?.itemUuid || items[0]?.id) === STORE_ITEM_ID &&
      Number(items[0]?.quantity) === 2,
    "Store-item UUID or quantity was lost.",
  );
  assert(
    array(targeting.countryCodes).includes("NORTHREACH") &&
      array(targeting.countryCodes).includes("YRETHIA"),
    "Country targeting was lost.",
  );
  assert(
    payload.status === "scheduled" && Boolean(payload.scheduledAt || payload.postAt || payload.publishedAt),
    "Scheduled posting was lost.",
  );
  assert(
    payload.reviewType === "teacher" || payload.completionMode === "manual_review",
    "Review mode was lost.",
  );
  assert(
    String(payload.difficulty || object(payload.metadata).difficulty).toLowerCase() === "advanced",
    "Difficulty was lost.",
  );

  writeFileSync(`${dir}/contract-create-request.json`, JSON.stringify(write, null, 2));
  await capture("contract-after-submit");
  assert(errors.length === 0, errors[0] || "Contract workflow emitted a browser error.");
  await harness.finish({ write });
  console.log("Full admin contract creation payload smoke passed.");
} catch (error) {
  writeFileSync(
    `${dir}/contract-create-request.json`,
    JSON.stringify({ writes, errors, failure: error.message }, null, 2),
  );
  await capture("contract-end-to-end-failure").catch(() => {});
  await harness.finish({ failure: error.stack || error.message || String(error) });
  throw error;
}
