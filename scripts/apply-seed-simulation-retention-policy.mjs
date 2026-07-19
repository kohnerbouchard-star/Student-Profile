import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targetPath = path.join(repoRoot, "scripts", "seed-content-preflight-lib.mjs");
const checkOnly = process.argv.includes("--check");
const source = await readFile(targetPath, "utf8");

const retentionBlock = `
    if (manifest?.evidenceRetention?.status === "immutable-artifact-pending") {
      issues.push(issue(
        "blocker",
        "SIMULATION_RAW_EVIDENCE_NOT_RETAINED",
        displayPath,
        "The deterministic summary is retained, but raw simulation rows still require immutable workflow-artifact retention.",
      ));
    }
`;

let expected = source;
if (!source.includes("SIMULATION_RAW_EVIDENCE_NOT_RETAINED")) {
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
${retentionBlock}  }
}`;
  if (!source.includes(anchor)) throw new Error("Simulation preflight policy anchor was not found.");
  expected = source.replace(anchor, replacement);
}

if (checkOnly) {
  if (source !== expected || !source.includes("SIMULATION_RAW_EVIDENCE_NOT_RETAINED")) {
    console.error("Simulation evidence retention policy is not installed.");
    process.exitCode = 1;
  } else {
    console.log("Verified simulation evidence retention policy.");
  }
} else if (source !== expected) {
  await writeFile(targetPath, expected, "utf8");
  console.log("Installed simulation evidence retention policy.");
} else {
  console.log("Simulation evidence retention policy is already installed.");
}
