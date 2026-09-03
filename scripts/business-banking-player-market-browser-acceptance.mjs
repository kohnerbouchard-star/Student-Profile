#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runConnectedPlayerBffAcceptance } from "./connected-player-bff-acceptance-loader.mjs";
import { restartLocalEdgeRuntime } from "./local-edge-runtime-isolation.mjs";

await restartLocalEdgeRuntime();

const entryPath = fileURLToPath(import.meta.url);
const corePath = entryPath.replace(/\.mjs$/u, ".core.mjs");
if (corePath === entryPath) throw new Error("Market acceptance entrypoint must use .mjs.");

const source = await readFile(corePath, "utf8");
const filledSelector = 'getByText("FILLED", { exact: false })';
const filledSelectorCount = source.split(filledSelector).length - 1;
if (filledSelectorCount !== 2) {
  throw new Error(`Market acceptance expected two FILLED status selectors, found ${filledSelectorCount}.`);
}
const exactStatusSource = source.replaceAll(
  filledSelector,
  'getByText("FILLED", { exact: true })',
);

const materializedDirectory = await mkdtemp(
  join(dirname(entryPath), ".business-banking-player-market-exact-status-"),
);
const materializedEntryPath = join(materializedDirectory, basename(entryPath));
const materializedCorePath = materializedEntryPath.replace(/\.mjs$/u, ".core.mjs");
try {
  await Promise.all([
    writeFile(materializedEntryPath, "// Exact-status connected Player market acceptance entry.\n", "utf8"),
    writeFile(materializedCorePath, exactStatusSource, "utf8"),
  ]);
  await runConnectedPlayerBffAcceptance(pathToFileURL(materializedEntryPath).href);
} finally {
  await rm(materializedDirectory, { recursive: true, force: true });
}
