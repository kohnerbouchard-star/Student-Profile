#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runConnectedPlayerBffAcceptance } from "./connected-player-bff-acceptance-loader.mjs";
import { restartLocalEdgeRuntime } from "./local-edge-runtime-isolation.mjs";

const entryPath = fileURLToPath(import.meta.url);
const corePath = entryPath.replace(/\.mjs$/u, ".core.mjs");
const before = `  const form = sender.page.locator('form[data-endpoint="bankTransfer"]');
  await form.evaluate((element) => { const details = element.closest("details"); if (details) details.open = true; });
  await form.locator('[name="recipientPlayerIdentifier"]').fill(recipient.playerIdentifier);`;
const after = `  const transferHost = sender.page.locator('form[data-endpoint="bankTransfer"]').locator("xpath=ancestor::details[1]").first();
  if (await transferHost.count()) {
    await transferHost.evaluate((element) => { element.open = true; });
  }
  const form = sender.page.locator('form[data-endpoint="bankTransfer"]:visible').first();
  await form.waitFor({ state: "visible", timeout: 30_000 });
  const recipientInput = form.locator('[name="recipientPlayerIdentifier"]');
  await recipientInput.waitFor({ state: "visible", timeout: 30_000 });
  await recipientInput.fill(recipient.playerIdentifier);`;

let source = await readFile(corePath, "utf8");
const matches = source.split(before).length - 1;
if (matches !== 1) {
  throw new Error(`Connected commerce transfer stabilization expected one canonical match, found ${matches}.`);
}
source = source.replace(before, after);

const temporaryDirectory = await mkdtemp(join(dirname(entryPath), ".commerce-bff-acceptance-"));
const temporaryEntryPath = join(temporaryDirectory, basename(entryPath));
const temporaryCorePath = temporaryEntryPath.replace(/\.mjs$/u, ".core.mjs");
try {
  await writeFile(temporaryCorePath, source, "utf8");
  await restartLocalEdgeRuntime();
  await runConnectedPlayerBffAcceptance(pathToFileURL(temporaryEntryPath).href);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
