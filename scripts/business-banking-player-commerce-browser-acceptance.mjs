#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { runConnectedPlayerBffAcceptance } from "./connected-player-bff-acceptance-loader.mjs";
import { restartLocalEdgeRuntime } from "./local-edge-runtime-isolation.mjs";

const entryPath = fileURLToPath(import.meta.url);
const corePath = entryPath.replace(/\.mjs$/u, ".core.mjs");
const before = `  const form = sender.page.locator('form[data-endpoint="bankTransfer"]');
  await form.evaluate((element) => { const details = element.closest("details"); if (details) details.open = true; });
  await form.locator('[name="recipientPlayerIdentifier"]').fill(recipient.playerIdentifier);`;
const after = `  const transferForms = sender.page.locator('form[data-endpoint="bankTransfer"]');
  await transferForms.first().waitFor({ state: "attached", timeout: 30_000 });
  const transferHost = transferForms.first().locator(
    "xpath=ancestor::details[@data-player-live-refresh-pause][1]",
  ).first();
  let form = sender.page.locator('form[data-endpoint="bankTransfer"]:visible').first();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (await transferHost.count() && await transferHost.getAttribute("open") === null) {
      const summary = transferHost.locator(":scope > summary").first();
      if (await summary.count()) {
        try {
          await summary.click({ timeout: 7_500 });
        } catch {
          await transferHost.evaluate((element) => { element.open = true; });
        }
      } else {
        await transferHost.evaluate((element) => { element.open = true; });
      }
    }
    form = sender.page.locator('form[data-endpoint="bankTransfer"]:visible').first();
    const recipientInput = form.locator('[name="recipientPlayerIdentifier"]');
    if (
      await form.isVisible() &&
      await recipientInput.isVisible() &&
      await recipientInput.isEnabled()
    ) {
      await recipientInput.focus();
      await recipientInput.fill(recipient.playerIdentifier);
      break;
    }
    if (attempt === 3) {
      throw new Error("Player transfer form did not become interactable after bounded disclosure retries.");
    }
    await sender.page.waitForTimeout(250);
  }`;

const originalSource = await readFile(corePath, "utf8");
const matches = originalSource.split(before).length - 1;
if (matches !== 1) {
  throw new Error(`Connected commerce transfer stabilization expected one canonical match, found ${matches}.`);
}
const patchedSource = originalSource.replace(before, after);

await writeFile(corePath, patchedSource, "utf8");
try {
  await restartLocalEdgeRuntime();
  await runConnectedPlayerBffAcceptance(import.meta.url);
} finally {
  await writeFile(corePath, originalSource, "utf8");
}
