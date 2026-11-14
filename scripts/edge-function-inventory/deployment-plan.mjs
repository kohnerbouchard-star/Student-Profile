import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { validateManifest } from "./validate.mjs";

// Only canonical and compatibility functions are release targets. Validation
// completes before any output, so a rejected manifest cannot partially deploy.
export function deploymentPlan(manifest) {
  assert.ok(Array.isArray(manifest?.canonicalFunctions), "canonicalFunctions must be an array.");
  assert.ok(Array.isArray(manifest?.compatibilityFunctions), "compatibilityFunctions must be an array.");
  const { canonical } = validateManifest(manifest);
  assert.ok(canonical.size > 0, "Deployment inventory must not be empty.");
  return [...canonical].map(([slug, entry]) => {
    assert.match(slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/u, "Invalid deployment slug.");
    assert.equal(slug, entry.slug, "Deployment slug must not contain whitespace.");
    assert.equal(entry.entrypoint, `backend/supabase/functions/${slug}/index.ts`, "Deployment entrypoint must match slug.");
    return { slug, verifyJwt: entry.verifyJwt };
  });
}

export function formatDeploymentPlan(manifest) {
  return deploymentPlan(manifest)
    .map(({ slug, verifyJwt }) => `${slug}\t${verifyJwt}\n`)
    .join("");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.equal(process.argv.length, 3, "Usage: deployment-plan.mjs <manifest.json>");
  const manifest = JSON.parse(await readFile(process.argv[2], "utf8"));
  process.stdout.write(formatDeploymentPlan(manifest));
}
