#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runConnectedPlayerBffAcceptance as runBaseConnectedPlayerBffAcceptance } from "./connected-player-bff-acceptance-loader.mjs";
import { restartLocalEdgeRuntime } from "./local-edge-runtime-isolation.mjs";

const before = `  const form = sender.page.locator('form[data-endpoint="bankTransfer"]');
  await form.evaluate((element) => { const details = element.closest("details"); if (details) details.open = true; });
  await form.locator('[name="recipientPlayerIdentifier"]').fill(recipient.playerIdentifier);`;
const after = `  const transferHost = sender.page.locator('details[data-player-live-refresh-pause]').filter({
    has: sender.page.locator('form[data-endpoint="bankTransfer"]'),
  }).first();
  await transferHost.waitFor({ state: "attached", timeout: 30_000 });
  const form = transferHost.locator('form[data-endpoint="bankTransfer"]');
  const recipientInput = form.locator('[name="recipientPlayerIdentifier"]');
  let transferReady = false;
  for (let attempt = 0; attempt < 4 && !transferReady; attempt += 1) {
    const disclosureOpen = await transferHost.evaluate((element) => element.open === true);
    if (!disclosureOpen) {
      await transferHost.locator("summary").click();
    }
    try {
      await recipientInput.waitFor({ state: "visible", timeout: 5_000 });
      await recipientInput.focus();
      transferReady = true;
    } catch (error) {
      if (attempt === 3) throw error;
      await sender.page.waitForTimeout(250);
    }
  }
  await recipientInput.fill(recipient.playerIdentifier);`;

async function runConnectedPlayerBffAcceptance(entryUrl) {
  const entryPath = fileURLToPath(entryUrl);
  const corePath = entryPath.replace(/\.mjs$/u, ".core.mjs");
  const originalSource = await readFile(corePath, "utf8");
  const matches = originalSource.split(before).length - 1;
  if (matches !== 1) {
    throw new Error(`Connected commerce transfer stabilization expected one canonical match, found ${matches}.`);
  }
  const patchedSource = originalSource.replace(before, after);
  const temporaryDirectory = await mkdtemp(
    join(dirname(entryPath), ".commerce-bff-disclosure-"),
  );
  const temporaryEntryPath = join(temporaryDirectory, basename(entryPath));
  const temporaryCorePath = temporaryEntryPath.replace(/\.mjs$/u, ".core.mjs");

  try {
    await writeFile(temporaryCorePath, patchedSource, "utf8");
    await runBaseConnectedPlayerBffAcceptance(
      pathToFileURL(temporaryEntryPath).href,
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

await restartLocalEdgeRuntime();
await runConnectedPlayerBffAcceptance(import.meta.url);
