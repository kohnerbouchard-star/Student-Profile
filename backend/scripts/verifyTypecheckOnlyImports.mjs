#!/usr/bin/env node

import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { TYPECHECK_MAP, trustedTslibConfigs } from "./verifyNeutralDenoTestConfig.mjs";

// Compatibility entry point retained for existing Cutover and every-root calls.
export function verifyTypecheckOnlyImports(backendRoot) {
  trustedTslibConfigs(backendRoot);
  return join(backendRoot, TYPECHECK_MAP);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.equal(process.argv.length, 2, "No guard overrides are supported");
  verifyTypecheckOnlyImports(dirname(dirname(fileURLToPath(import.meta.url))));
  console.log("Verified original lock pin, canonical tslib and Edge config mappings");
}
