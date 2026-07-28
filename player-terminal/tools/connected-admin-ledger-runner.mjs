#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CORE_URL = new URL("./connected-admin-ledger-runner-v4.mjs", import.meta.url);
const SOURCE_DIRECTORY = new URL("./", import.meta.url);
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
const INTERNAL_REPLAY = `async function replayThroughBrowser(page, original) {
  return page.evaluate(async ({ url, headers, body }) => {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      cache: "no-store",
      credentials: "include",
    });
    return { status: response.status, payload: await response.json().catch(() => null) };
  }, original);
}`;
const CANONICAL_REPLAY = `async function replayThroughBrowser(page, original) {
  return page.evaluate(async ({ url, headers, body }) => {
    const internal = new URL(url, window.location.href);
    const prefix = "/functions/v1/web-session-api/proxy";
    const replayUrl = internal.pathname.startsWith(prefix)
      ? \`/api/admin\${internal.pathname.slice(prefix.length)}\${internal.search}\`
      : url;
    const response = await fetch(replayUrl, {
      method: "POST",
      headers,
      body,
      cache: "no-store",
      credentials: "include",
    });
    return { status: response.status, payload: await response.json().catch(() => null) };
  }, original);
}`;
const REPLAY_RELOAD = `  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitForAdmin(page);
  evidence.replayBalance = await readBalance(page);`;
const REPLAY_REFRESH_SAFE = `  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 }).catch((error) => {
    if (!String(error?.message || error).includes("ERR_ABORTED")) throw error;
  });
  await waitForAdmin(page);
  evidence.replayBalance = await readBalance(page);`;

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
  "Admin ledger canonical replay",
  INTERNAL_REPLAY,
  CANONICAL_REPLAY,
);
source = replaceExactlyOnce(
  source,
  "Admin ledger replay refresh",
  REPLAY_RELOAD,
  REPLAY_REFRESH_SAFE,
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
