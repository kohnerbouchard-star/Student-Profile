import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const GIT_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;

export async function validateSeedConsumerContract({
  contract,
  sourceCommit,
  approvedSourceCommit,
  packKey,
  contentVersion,
  sourceRoot,
}) {
  if (contract.packId !== packKey || contract.packVersion !== contentVersion) {
    throw new Error("PR #163 downstream contract pack identity does not match the requested runtime pack");
  }
  if (contract.productionAuthorized !== false) {
    throw new Error("PR #163 downstream contract must keep production authorization disabled");
  }
  const rules = contract.consumerRules ?? {};
  for (const key of [
    "copySeedCatalogFiles",
    "failClosedWhenDefinitionMissingOrInactive",
    "requireExactDigest",
    "requireExactPackIdAndVersion",
    "stableIdReimportCompatible",
    "treatDeploymentAsActivation",
  ]) {
    if (!(key in rules)) throw new Error(`PR #163 downstream contract is missing ${key}`);
  }
  if (rules.copySeedCatalogFiles !== false ||
      rules.failClosedWhenDefinitionMissingOrInactive !== true ||
      rules.requireExactDigest !== true ||
      rules.requireExactPackIdAndVersion !== true ||
      rules.stableIdReimportCompatible !== true ||
      rules.treatDeploymentAsActivation !== false) {
    throw new Error("PR #163 downstream consumer rules are not safe for Crafting");
  }
  if (!GIT_SHA.test(sourceCommit) || !GIT_SHA.test(approvedSourceCommit)) {
    throw new Error("Crafting source and approved source commits must be full Git SHAs");
  }
  if (sourceCommit !== approvedSourceCommit) {
    throw new Error("Crafting Seed source commit does not match the controller-approved merged source");
  }
  if (!GIT_SHA.test(contract.acceptedImplementationSourceSha ?? "")) {
    throw new Error("PR #163 downstream contract accepted implementation SHA is invalid");
  }
  if (!SHA256.test(contract.packDigest ?? "")) {
    throw new Error("PR #163 downstream contract pack digest is invalid");
  }
  const packBinding = contract.fileBindings?.pack;
  if (!packBinding || packBinding.sha256 !== contract.packDigest) {
    throw new Error("PR #163 downstream contract pack binding does not match the exact pack digest");
  }
  const bindings = Object.values(contract.fileBindings ?? {});
  if (!bindings.length) {
    throw new Error("PR #163 downstream contract contains no file bindings");
  }

  const root = path.resolve(sourceRoot);
  const resolvedPaths = new Set();
  for (const binding of bindings) {
    if (!binding?.path || !SHA256.test(binding.sha256 ?? "")) {
      throw new Error("PR #163 downstream contract contains an invalid file binding");
    }
    const resolvedPath = path.resolve(root, binding.path);
    if (resolvedPath !== root && !resolvedPath.startsWith(`${root}${path.sep}`)) {
      throw new Error(`PR #163 file binding escapes the approved Seed source: ${binding.path}`);
    }
    if (resolvedPaths.has(resolvedPath)) {
      throw new Error(`PR #163 downstream contract repeats file binding ${binding.path}`);
    }
    resolvedPaths.add(resolvedPath);

    let content;
    try {
      content = await readFile(resolvedPath);
    } catch (error) {
      if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
        throw new Error(`PR #163 bound definition is missing: ${binding.path}`);
      }
      throw error;
    }
    const digest = createHash("sha256").update(content).digest("hex");
    if (digest !== binding.sha256) {
      throw new Error(`PR #163 file binding mismatch for ${binding.path}`);
    }
  }
}
