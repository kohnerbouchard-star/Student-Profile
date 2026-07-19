import fs from "node:fs";

const path = "docs/roadmaps/econovaria-beta-completion-roadmap-v1.md";
let source = fs.readFileSync(path, "utf8");
const before = "**Current audited main baseline:** `b8d227d8d8d0cd178efc63935371ab53eee8b78b`";
const after = "**Current audited main baseline:** `249fc53a23ad23058d376e4e394524af0bdee265`";
const count = source.split(before).length - 1;
if (count !== 1) throw new Error(`Expected one Banking baseline anchor, found ${count}.`);
source = source.replace(before, after);
fs.writeFileSync(path, source);
console.log("Updated Banking roadmap baseline to synchronized main.");
