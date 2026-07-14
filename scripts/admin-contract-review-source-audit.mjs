import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const source = readFileSync("admin/dist/admin-overview-terminal.js", "utf8");
const artifactDir = "admin-browser-smoke-artifacts/contracts";
mkdirSync(artifactDir, { recursive: true });

const actions = [...source.matchAll(/data-admin-terminal-action=["'`]([^"'`]+)["'`]/g)]
  .map((match) => match[1]);
const stringActions = [...source.matchAll(/["'`]([a-z][a-z0-9-]{2,80})["'`]/g)]
  .map((match) => match[1])
  .filter((value) => /(contract|submission|review|reward|approve|reject|revision)/i.test(value));
const contexts = [];
for (const pattern of ["submission", "review", "reward", "approve", "reject", "revision"]) {
  let index = 0;
  while ((index = source.toLowerCase().indexOf(pattern, index)) >= 0 && contexts.length < 300) {
    contexts.push({
      pattern,
      context: source.slice(Math.max(0, index - 180), Math.min(source.length, index + 260)),
    });
    index += pattern.length;
  }
}

const report = {
  actions: [...new Set(actions)].sort(),
  relevantStringTokens: [...new Set(stringActions)].sort(),
  contexts,
};
writeFileSync(`${artifactDir}/admin-contract-review-source.json`, JSON.stringify(report, null, 2));
console.log("ADMIN_CONTRACT_REVIEW_ACTIONS", JSON.stringify(report.actions));
console.log("ADMIN_CONTRACT_REVIEW_TOKENS", JSON.stringify(report.relevantStringTokens));
