#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runConnectedPlayerBffAcceptance } from "./connected-player-bff-acceptance-loader.mjs";
import { restartLocalEdgeRuntime } from "./local-edge-runtime-isolation.mjs";

function replaceExactlyOnce(source, label, before, after) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label} expected one canonical source match, found ${count}.`);
  }
  return source.replace(before, after);
}

function adaptBusinessReplayVerification(source) {
  source = replaceExactlyOnce(
    source,
    "Business replay admin fixture",
    "async function createBusiness(page) {",
    "async function createBusiness(page, admin) {",
  );

  const oldBlock = `  const replay = await replayRequest(page, operation.request);
  if (replay.status !== 200 || replay.payload?.ok !== true || !replayed(replay.payload)) {
    throw new Error(\`Business creation replay was not recognized: \${replay.status} \${redact(JSON.stringify(replay.payload))}\`);
  }
  await reloadBusiness(page);
  if ((await page.getByText(COMPANY_NAME, { exact: true }).count()) < 1) {
    throw new Error("Business disappeared after idempotent replay.");
  }
  evidence.mutations.businessReplayDeniedDuplicate = true;`;

  const newBlock = `  const businessCountBeforeReplay = await page.getByText(COMPANY_NAME, { exact: true }).count();
  const balanceBeforeReplay = databaseFundingState(admin, evidence.businessCurrencyCode).cashBalance;
  const replay = await replayRequest(page, operation.request);
  if (replay.status !== 200 || replay.payload?.ok !== true) {
    throw new Error(\`Business creation replay failed: \${replay.status} \${redact(JSON.stringify(replay.payload))}\`);
  }
  await reloadBusiness(page);
  const businessCountAfterReplay = await page.getByText(COMPANY_NAME, { exact: true }).count();
  if (businessCountBeforeReplay < 1 || businessCountAfterReplay !== businessCountBeforeReplay) {
    throw new Error(
      \`Business replay changed the persisted business surface: \${businessCountBeforeReplay} -> \${businessCountAfterReplay}.\`,
    );
  }
  const balanceAfterReplay = databaseFundingState(admin, evidence.businessCurrencyCode).cashBalance;
  if (Math.abs(balanceAfterReplay - balanceBeforeReplay) > 0.001) {
    throw new Error(
      \`Business replay charged capitalization twice: \${balanceBeforeReplay} -> \${balanceAfterReplay}.\`,
    );
  }
  evidence.mutations.businessReplayDeniedDuplicate = true;`;

  source = replaceExactlyOnce(
    source,
    "Business durable replay verification",
    oldBlock,
    newBlock,
  );
  return replaceExactlyOnce(
    source,
    "Business replay admin call",
    "const originalCreate = await createBusiness(player.page);",
    "const originalCreate = await createBusiness(player.page, admin);",
  );
}

async function runBusinessConnectedAcceptance(entryUrl) {
  const entryPath = fileURLToPath(entryUrl);
  const canonicalCorePath = entryPath.replace(/\.mjs$/u, ".core.mjs");
  const source = adaptBusinessReplayVerification(await readFile(canonicalCorePath, "utf8"));
  const temporaryDirectory = await mkdtemp(join(dirname(entryPath), ".business-bff-replay-"));
  const temporaryEntryPath = join(temporaryDirectory, basename(entryPath));
  const temporaryCorePath = temporaryEntryPath.replace(/\.mjs$/u, ".core.mjs");
  try {
    await writeFile(temporaryCorePath, source, "utf8");
    await runConnectedPlayerBffAcceptance(pathToFileURL(temporaryEntryPath).href);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

await restartLocalEdgeRuntime();
await runBusinessConnectedAcceptance(import.meta.url);
