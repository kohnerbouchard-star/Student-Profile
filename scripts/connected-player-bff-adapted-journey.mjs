#!/usr/bin/env node

import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";

import { runPlayerBffAdaptedRunner } from "../player-terminal/tools/connected-player-bff-runner-adapter.mjs";

const targetPath = String(process.argv[2] || "").trim();
const label = String(process.argv[3] || "Connected Player journey").trim().slice(0, 120);

if (!targetPath || !isAbsolute(targetPath)) {
  throw new Error("An absolute connected Player runner path is required.");
}

await runPlayerBffAdaptedRunner(pathToFileURL(targetPath), label);
