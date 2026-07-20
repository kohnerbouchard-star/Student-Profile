import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targetPath = path.join(repoRoot, "scripts", "seed-content-preflight-lib.mjs");
const checkOnly = process.argv.includes("--check");
const source = await readFile(targetPath, "utf8");

const oldBlock = `    if (manifest?.evidenceRetention?.status === "immutable-artifact-pending") {
      issues.push(issue(
        "blocker",
        "SIMULATION_RAW_EVIDENCE_NOT_RETAINED",
        displayPath,
        "The deterministic summary is retained, but raw simulation rows still require immutable workflow-artifact retention.",
      ));
    }`;

const retentionBlock = `    const retention = manifest?.evidenceRetention;
    if (retention?.status === "immutable-artifact-pending") {
      issues.push(issue(
        "blocker",
        "SIMULATION_RAW_EVIDENCE_NOT_RETAINED",
        displayPath,
        "The deterministic summary is retained, but raw simulation rows still require immutable workflow-artifact retention.",
      ));
    } else if (retention?.status === "immutable-workflow-artifact-retained") {
      const artifact = retention.artifact;
      const artifactValid =
        retention.immutableArtifactRetained === true &&
        isObject(artifact) &&
        artifact.provider === "github-actions" &&
        typeof artifact.name === "string" && artifact.name.trim() !== "" &&
        typeof artifact.artifactId === "string" && /^\\d+$/.test(artifact.artifactId) &&
        typeof artifact.workflowRunId === "string" && /^\\d+$/.test(artifact.workflowRunId) &&
        typeof artifact.artifactUrl === "string" && /^https:\\/\\/github\\.com\\//.test(artifact.artifactUrl) &&
        typeof artifact.artifactDigest === "string" && /^(sha256:)?[0-9a-f]{64}$/i.test(artifact.artifactDigest) &&
        typeof artifact.sourceCommit === "string" && /^[0-9a-f]{40}$/i.test(artifact.sourceCommit) &&
        Number.isInteger(artifact.retentionDays) && artifact.retentionDays > 0;
      if (!artifactValid) {
        issues.push(issue(
          "error",
          "SIMULATION_ARTIFACT_EVIDENCE_INVALID",
          displayPath,
          "Raw simulation evidence claims immutable retention without complete GitHub artifact identity, digest, source commit, workflow run, and retention metadata.",
        ));
      }
    } else if (retention?.requiredForApproval === true) {
      issues.push(issue(
        "blocker",
        "SIMULATION_RAW_EVIDENCE_RETENTION_UNRESOLVED",
        displayPath,
        "Raw simulation evidence is required for approval but its retention state is unresolved.",
      ));
    }`;

let expected = source;
if (source.includes(oldBlock)) {
  expected = source.replace(oldBlock, retentionBlock);
} else if (!source.includes("SIMULATION_ARTIFACT_EVIDENCE_INVALID")) {
  const anchor = `      if (await sha256(filePath) !== descriptor.checksum.toLowerCase()) {
        issues.push(issue(mismatchSeverity, "SIMULATION_CHECKSUM_MISMATCH", displayPath, \`\${descriptor.declaredPath} does not match its recorded SHA-256.\`));
      }
    }
  }
}`;
  const replacement = `      if (await sha256(filePath) !== descriptor.checksum.toLowerCase()) {
        issues.push(issue(mismatchSeverity, "SIMULATION_CHECKSUM_MISMATCH", displayPath, \`\${descriptor.declaredPath} does not match its recorded SHA-256.\`));
      }
    }
${retentionBlock}
  }
}`;
  if (!source.includes(anchor)) throw new Error("Simulation preflight policy anchor was not found.");
  expected = source.replace(anchor, replacement);
}

const installed = expected.includes("SIMULATION_ARTIFACT_EVIDENCE_INVALID") && expected.includes("immutable-workflow-artifact-retained");
if (checkOnly) {
  if (source !== expected || !installed) {
    console.error("Simulation evidence retention policy is not current.");
    process.exitCode = 1;
  } else {
    console.log("Verified simulation evidence retention policy.");
  }
} else if (source !== expected) {
  await writeFile(targetPath, expected, "utf8");
  console.log("Installed current simulation evidence retention policy.");
} else {
  console.log("Simulation evidence retention policy is already current.");
}
