const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const fragmentDir = path.join(root, "src", "admin-overview", "fragments");
const distFile = path.join(root, "dist", "admin-overview-terminal.js");

function stripBuildNoise(source) {
  return source
    .replace(/\/\*\s*Build fragment:[\s\S]*?\*\//g, "")
    .replace(/\/\* Eco Novaria Admin Overview Terminal Package[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => line.trim() && !line.trim().startsWith("// "))
    .join("\n");
}

const fragments = fs.readdirSync(fragmentDir)
  .filter((name) => name.endsWith(".fragment.js"))
  .sort();

if (!fragments.length) {
  throw new Error("No admin overview fragments found.");
}

const output = fragments
  .map((name) => stripBuildNoise(fs.readFileSync(path.join(fragmentDir, name), "utf8")).trimEnd())
  .join("\n") + "\n";

fs.mkdirSync(path.dirname(distFile), { recursive: true });
fs.writeFileSync(distFile, output);
console.log(`Built compact ${path.relative(root, distFile)} from ${fragments.length} fragments.`);
