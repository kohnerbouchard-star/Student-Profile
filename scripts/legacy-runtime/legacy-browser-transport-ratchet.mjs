import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const config = JSON.parse(fs.readFileSync(path.join(root, "ops/legacy-runtime/route-allowlist.json"), "utf8"));
const textExtensions = new Set([".html", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".json"]);
const findings = [];

function collect(target) {
  const absolute = path.join(root, target);
  if (!fs.existsSync(absolute)) return [];
  const stat = fs.statSync(absolute);
  if (stat.isFile()) return [absolute];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    if (["node_modules", ".git", "dist", "build", "coverage"].includes(entry.name)) return [];
    return collect(path.relative(root, path.join(absolute, entry.name)));
  });
}

for (const file of [...new Set((config.browserScanRoots ?? []).flatMap(collect))]) {
  if (!textExtensions.has(path.extname(file))) continue;
  const relative = path.relative(root, file);
  const content = fs.readFileSync(file, "utf8");
  for (const marker of [...config.forbiddenBrowserMarkers, ...config.serviceOnlyTransports]) {
    if (content.includes(marker)) findings.push(`${relative}: forbidden browser transport marker ${marker}`);
  }
}

if (findings.length) {
  console.error("Legacy browser transport ratchet failed:\n- " + findings.join("\n- "));
  process.exitCode = 1;
} else {
  console.log("Legacy browser transport ratchet passed.");
}
