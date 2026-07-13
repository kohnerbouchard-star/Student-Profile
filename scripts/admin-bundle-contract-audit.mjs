import { readFileSync } from "node:fs";

const source = readFileSync("admin/dist/admin-overview-terminal.js", "utf8");

function unique(values) {
  return [...new Set(values)].sort();
}

const endpointFragments = unique(
  [...source.matchAll(/(["'`])(\/[^"'`\n]{2,180})\1/g)]
    .map((match) => match[2])
    .filter((value) =>
      /\b(?:api|games|account|session|notifications|help|auth)\b/i.test(value) &&
      /(?:dashboard|players|attendance|contracts|store|market|settings|logs|profile|security|sign-out|bootstrap|notifications|help)/i.test(value)
    ),
);

const actionNames = unique([
  ...[...source.matchAll(/data-admin-terminal-action=["']([^"']+)["']/g)].map((match) => match[1]),
  ...[...source.matchAll(/dataset\.adminTerminalAction\s*=\s*["']([^"']+)["']/g)].map((match) => match[1]),
]);

const requestMethods = unique(
  [...source.matchAll(/method\s*:\s*["'](GET|POST|PUT|PATCH|DELETE)["']/g)].map((match) => match[1]),
);

console.log(JSON.stringify({ endpointFragments, actionNames, requestMethods }, null, 2));
