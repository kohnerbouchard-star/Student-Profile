import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { validateSeedConsumerContract } from "./physical-economy-pack-contract.mjs";
import { parseArgs } from "./physical-economy-pack-utils.mjs";

const APPROVED_SOURCE = "b".repeat(40);
const IMPLEMENTATION_SOURCE = "a".repeat(40);

async function fixture() {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "crafting-seed-contract-"));
  const packPath = path.join(sourceRoot, "pack.json");
  const content = "{\"pack\":true}\n";
  await writeFile(packPath, content);
  const packDigest = createHash("sha256").update(content).digest("hex");
  const contract = {
    packId: "econovaria.beta-seed-pack.v1",
    packVersion: "1.0.0-beta",
    packDigest,
    productionAuthorized: false,
    acceptedImplementationSourceSha: IMPLEMENTATION_SOURCE,
    consumerRules: {
      copySeedCatalogFiles: false,
      failClosedWhenDefinitionMissingOrInactive: true,
      requireExactDigest: true,
      requireExactPackIdAndVersion: true,
      stableIdReimportCompatible: true,
      treatDeploymentAsActivation: false,
    },
    fileBindings: {
      pack: { path: "pack.json", sha256: packDigest },
    },
  };
  return {
    sourceRoot,
    contract,
    cleanup: () => rm(sourceRoot, { recursive: true, force: true }),
  };
}

function validate(input) {
  return validateSeedConsumerContract({
    contract: input.contract,
    sourceCommit: input.sourceCommit ?? APPROVED_SOURCE,
    approvedSourceCommit: input.approvedSourceCommit ?? APPROVED_SOURCE,
    packKey: "econovaria.beta-seed-pack.v1",
    contentVersion: "1.0.0-beta",
    sourceRoot: input.sourceRoot,
  });
}

test("Seed consumer accepts the exact approved merged source and digest", async () => {
  const value = await fixture();
  try {
    await validate(value);
  } finally {
    await value.cleanup();
  }
});

test("Seed consumer rejects a different well-formed source SHA", async () => {
  const value = await fixture();
  try {
    await assert.rejects(
      validate({ ...value, sourceCommit: "c".repeat(40) }),
      /does not match the controller-approved merged source/,
    );
  } finally {
    await value.cleanup();
  }
});

test("Seed consumer rejects a pack binding that differs from the contract digest", async () => {
  const value = await fixture();
  try {
    value.contract.packDigest = "d".repeat(64);
    await assert.rejects(
      validate(value),
      /pack binding does not match the exact pack digest/,
    );
  } finally {
    await value.cleanup();
  }
});

test("Seed consumer fails closed when the inactive-definition rule is missing or disabled", async () => {
  const missing = await fixture();
  try {
    delete missing.contract.consumerRules.failClosedWhenDefinitionMissingOrInactive;
    await assert.rejects(
      validate(missing),
      /missing failClosedWhenDefinitionMissingOrInactive/,
    );
  } finally {
    await missing.cleanup();
  }

  const disabled = await fixture();
  try {
    disabled.contract.consumerRules.failClosedWhenDefinitionMissingOrInactive = false;
    await assert.rejects(
      validate(disabled),
      /consumer rules are not safe for Crafting/,
    );
  } finally {
    await disabled.cleanup();
  }
});

test("Seed consumer rejects missing or escaping definition bindings", async () => {
  const missing = await fixture();
  try {
    missing.contract.fileBindings.pack.path = "missing.json";
    await assert.rejects(
      validate(missing),
      /bound definition is missing: missing\.json/,
    );
  } finally {
    await missing.cleanup();
  }

  const escaping = await fixture();
  try {
    escaping.contract.fileBindings.pack.path = "../outside.json";
    await assert.rejects(
      validate(escaping),
      /file binding escapes the approved Seed source/,
    );
  } finally {
    await escaping.cleanup();
  }
});

test("pack CLI requires identical source and approved-source arguments", () => {
  assert.throws(
    () => parseArgs([
      "--source-commit", APPROVED_SOURCE,
      "--approved-source-commit", "c".repeat(40),
    ]),
    /must match/,
  );
  const parsed = parseArgs([
    "--source-commit", APPROVED_SOURCE,
    "--approved-source-commit", APPROVED_SOURCE,
  ]);
  assert.equal(parsed.sourceCommit, APPROVED_SOURCE);
  assert.equal(parsed.approvedSourceCommit, APPROVED_SOURCE);
});
