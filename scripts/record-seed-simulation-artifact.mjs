import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const simulationRoot = path.join(repoRoot, "docs", "seed-content", "simulation");
const countries = ["northreach", "thaloris", "yrethia"];

const artifact = {
  provider: "github-actions",
  name: process.env.SEED_RAW_ARTIFACT_NAME,
  artifactId: process.env.SEED_RAW_ARTIFACT_ID,
  artifactUrl: process.env.SEED_RAW_ARTIFACT_URL,
  artifactDigest: process.env.SEED_RAW_ARTIFACT_DIGEST,
  sourceCommit: process.env.SEED_RAW_SOURCE_COMMIT,
  workflowRunId: process.env.SEED_RAW_WORKFLOW_RUN_ID,
  retentionDays: Number(process.env.SEED_RAW_RETENTION_DAYS ?? "90"),
  retainedAt: "2026-07-19",
};

for (const [key, value] of Object.entries(artifact)) {
  if (key === "retentionDays") {
    if (!Number.isInteger(value) || value < 1) throw new Error("Artifact retentionDays must be a positive integer.");
  } else if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing required artifact field ${key}.`);
  }
}
if (!/^\d+$/.test(artifact.artifactId) || !/^\d+$/.test(artifact.workflowRunId)) throw new Error("Artifact and workflow run IDs must be numeric strings.");
if (!/^https:\/\/github\.com\//.test(artifact.artifactUrl)) throw new Error("Artifact URL must be an HTTPS GitHub URL.");
if (!/^(sha256:)?[0-9a-f]{64}$/i.test(artifact.artifactDigest)) throw new Error("Artifact digest must be a SHA-256 value.");
if (!/^[0-9a-f]{40}$/i.test(artifact.sourceCommit)) throw new Error("Source commit must be a 40-character commit SHA.");

for (const country of countries) {
  const countryRoot = path.join(simulationRoot, country);
  const rawPath = path.join(countryRoot, "raw-evidence-manifest-v1.json");
  const runPath = path.join(countryRoot, "run-manifest-v1.json");
  const rawEvidence = JSON.parse(await readFile(rawPath, "utf8"));
  const runManifest = JSON.parse(await readFile(runPath, "utf8"));

  if (!Array.isArray(rawEvidence.files) || rawEvidence.files.length === 0) throw new Error(`${country} has no raw evidence files to retain.`);
  if (rawEvidence.files.some((entry) => typeof entry.sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(entry.sha256) || !Number.isInteger(entry.sizeBytes) || entry.sizeBytes < 1)) {
    throw new Error(`${country} raw evidence file metadata is incomplete.`);
  }

  rawEvidence.retentionStatus = "immutable-workflow-artifact-retained";
  rawEvidence.artifact = artifact;
  rawEvidence.files = rawEvidence.files.map((entry) => ({ ...entry, artifactRetained: true }));
  const rawContent = `${JSON.stringify(rawEvidence, null, 2)}\n`;
  await writeFile(rawPath, rawContent, "utf8");
  const rawChecksum = createHash("sha256").update(rawContent).digest("hex");

  runManifest.status = "executed-summary-and-raw-artifact-retained";
  runManifest.files = {
    ...(runManifest.files ?? {}),
    "raw-evidence-manifest-v1.json": rawChecksum,
  };
  runManifest.evidenceRetention = {
    ...(runManifest.evidenceRetention ?? {}),
    status: "immutable-workflow-artifact-retained",
    rawEvidenceManifest: "raw-evidence-manifest-v1.json",
    repositoryRetained: false,
    immutableArtifactRetained: true,
    requiredForApproval: true,
    artifact,
  };

  await writeFile(runPath, `${JSON.stringify(runManifest, null, 2)}\n`, "utf8");
}

console.log(`Recorded immutable artifact ${artifact.artifactId} for ${countries.length} simulation evidence packages.`);
