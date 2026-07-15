import { BASE_URL, createQualityHarness } from "./admin-quality-smoke-fixture.mjs";

const h = await createQualityHarness("contract-validation");
const { page, writes, errors, capture, finish } = h;
const fail = (message) => { throw new Error(message); };

try {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15000 });
  await page.locator('[data-admin-terminal-action="add-contract"]').first().click();
  await page.waitForSelector("[data-admin-terminal-contract-form]", { timeout: 5000 });
  const form = page.locator("[data-admin-terminal-contract-form]");
  const submit = form.locator('[data-admin-terminal-action="create-contract"]');
  const before = writes.length;
  await submit.click();
  await page.waitForTimeout(120);
  if (await form.locator('[aria-invalid="true"]').count() < 4) fail("Contract required fields were not marked invalid.");
  if (await form.locator(".admin-qol-field-error").count() < 4) fail("Contract field errors were not displayed.");
  if (writes.length !== before) fail("Invalid contract issued a write request.");
  await capture("required-errors");

  await form.locator('[name="title"]').fill("Quality contract");
  await form.locator('[name="objective"]').fill("Verify states");
  await form.locator('[name="instructions"]').fill("Complete the task.");
  await form.locator('[name="evidence"]').fill("Submit evidence.");
  await submit.click();
  await page.waitForTimeout(80);
  if (await submit.getAttribute("data-admin-qol-state") !== "loading") fail("Contract button did not show processing.");
  await page.waitForTimeout(520);
  if (await submit.getAttribute("data-admin-qol-state") !== "success") fail("Contract button did not show completion.");
  if (errors.length) fail(errors[0]);
  await capture("completed");
  await finish({ passed: true });
  console.log("Contract validation and button states passed.");
} catch (error) {
  await capture("failure").catch(() => {});
  await finish({ passed: false, failure: error.stack || error.message || String(error) });
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
}
