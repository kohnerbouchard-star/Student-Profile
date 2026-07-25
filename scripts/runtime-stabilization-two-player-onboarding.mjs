#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFile, unlink, writeFile } from "node:fs/promises";

const SOURCE = new URL(
  "./game-feature-activation-v2-local-acceptance.mjs",
  import.meta.url,
);
const TEMP_FILE = `/tmp/econovaria-runtime-stabilization-two-player-${process.pid}.mjs`;

const replacements = [
  [
    'const TARGET_GAME_NAME = "Provisioning Acceptance Target";',
    'const TARGET_GAME_NAME = "Runtime Stabilization Two Player Target";',
  ],
  [
    "'game.create.local.acceptance.001',",
    "'game.create.runtime-stabilization.two-player.001',",
  ],
  [
    'requireCondition(result.outcome === "replayed", `V2 returned ${result.outcome}`);',
    'requireCondition(result.outcome === "created", `V2 returned ${result.outcome}`);',
  ],
  [
    'requireCondition(result.joinCode === null, "V2 replay exposed the original Game Code");',
    'requireCondition(typeof result.joinCode === "string" && result.joinCode.length >= 8, "V2 creation did not return a one-time Game Code");',
  ],
];

function replaceExactlyOnce(source, expected, replacement) {
  const occurrences = source.split(expected).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `Acceptance adapter expected one source occurrence, found ${occurrences}: ${expected}`,
    );
  }
  return source.replace(expected, replacement);
}

async function main() {
  let source = await readFile(SOURCE, "utf8");
  for (const [expected, replacement] of replacements) {
    source = replaceExactlyOnce(source, expected, replacement);
  }

  await writeFile(TEMP_FILE, source, "utf8");
  try {
    const result = spawnSync(process.execPath, [TEMP_FILE], {
      env: process.env,
      stdio: "inherit",
    });
    if (result.error) throw result.error;
    if (result.signal) {
      throw new Error(`Two-Player onboarding acceptance ended by ${result.signal}`);
    }
    process.exitCode = result.status ?? 1;
  } finally {
    await unlink(TEMP_FILE).catch(() => {});
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    error: String(error?.message || error).slice(0, 3000),
    productionTouched: false,
    credentialsRecorded: false,
  }));
  process.exitCode = 1;
});
