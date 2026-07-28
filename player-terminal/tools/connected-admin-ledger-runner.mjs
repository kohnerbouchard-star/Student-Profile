#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CORE_URL = new URL("./connected-admin-ledger-runner-v4.mjs", import.meta.url);
const SOURCE_DIRECTORY = new URL("./", import.meta.url);
const RETIRED_MATCHER = `/\\/functions\\/v1\\/web-session-api\\/proxy\\/games\\/[^/]+\\/players\\/[^/]+\\/ledger-adjustments$/u`;
const CANONICAL_MATCHER = `/\\/api\\/admin\\/games\\/[^/]+\\/players\\/[^/]+\\/ledger-adjustments$/u`;
const GENERIC_SUBMIT = `  const submit = modal.getByRole(
    "button",
    { name: /save ledger adjustment|apply|confirm|adjust|credit|update/iu },
  ).last();`;
const CANONICAL_SUBMIT = `  const submit = modal.locator(
    '[data-admin-terminal-action="confirm-player-balance-adjustment"]:visible',
  ).first();`;
const NOTE_COMPLETION = `  const note = modal.locator('textarea[name="ledgerNote"]:visible, textarea[name="reason"]:visible').first();
  if (await note.count()) await note.fill("Connected browser mutation verification");`;
const REQUIRED_COMPLETION = `  const note = modal.locator('textarea[name="ledgerNote"]:visible, textarea[name="reason"]:visible').first();
  if (await note.count()) await note.fill("Connected browser mutation verification");

  const requiredControls = modal.locator(
    'input[required]:visible, select[required]:visible, textarea[required]:visible',
  );
  for (let index = 0; index < await requiredControls.count(); index += 1) {
    const control = requiredControls.nth(index);
    const tagName = await control.evaluate((node) => node.tagName);
    const inputType = String(await control.getAttribute("type") || "").toLowerCase();
    if (tagName === "SELECT") {
      if (await control.inputValue()) continue;
      const values = await control.locator("option").evaluateAll((nodes) =>
        nodes.map((node) => node.value).filter((value) => Boolean(value))
      );
      if (values[0]) await control.selectOption(values[0]);
      continue;
    }
    if (["radio", "checkbox"].includes(inputType)) {
      if (!await control.isChecked()) await control.check();
      continue;
    }
    if (!await control.inputValue()) {
      await control.fill(inputType === "number" ? String(ADJUSTMENT) : "Connected browser mutation verification");
    }
  }`;
const SINGLE_CONFIRM = `  await submit.click();
  await completeMfaEnrollmentIfRequired(page, 3_000);`;
const CONFIRM_TRANSITION = `  await submit.click();
  await page.waitForTimeout(250);
  const followUp = page.locator(
    '[data-admin-terminal-action="confirm-player-balance-adjustment"]:visible',
  ).last();
  if (await followUp.count() && await followUp.isVisible()) await followUp.click();
  await completeMfaEnrollmentIfRequired(page, 3_000);`;

function replaceExactlyOnce(source, label, before, after) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label} expected one canonical source match, found ${count}.`);
  }
  return source.replace(before, after);
}

let source = await readFile(CORE_URL, "utf8");
source = replaceExactlyOnce(
  source,
  "Admin ledger response matcher",
  RETIRED_MATCHER,
  CANONICAL_MATCHER,
);
source = replaceExactlyOnce(
  source,
  "Admin ledger submit control",
  GENERIC_SUBMIT,
  CANONICAL_SUBMIT,
);
source = replaceExactlyOnce(
  source,
  "Admin ledger required fields",
  NOTE_COMPLETION,
  REQUIRED_COMPLETION,
);
source = replaceExactlyOnce(
  source,
  "Admin ledger confirmation transition",
  SINGLE_CONFIRM,
  CONFIRM_TRANSITION,
);

const materializedDirectory = await mkdtemp(
  join(fileURLToPath(SOURCE_DIRECTORY), ".connected-admin-ledger-materialized-"),
);
const materializedPath = join(materializedDirectory, "connected-admin-ledger-runner.mjs");
try {
  await writeFile(materializedPath, source, "utf8");
  await import(pathToFileURL(materializedPath).href);
} finally {
  await rm(materializedDirectory, { recursive: true, force: true });
}
