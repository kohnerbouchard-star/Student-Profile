import { readFileSync } from "node:fs";

const source = readFileSync("admin/dist/admin-overview-terminal.js", "utf8");

function unique(values) {
  return [...new Set(values)].sort();
}

function normalizeContext(value) {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

const endpointMatches = [...source.matchAll(/(["'`])(\/[^"'`\n]{2,180})\1/g)]
  .filter((match) =>
    /\b(?:api|games|account|session|notifications|help|auth)\b/i.test(match[2]) &&
    /(?:dashboard|players|attendance|contracts|store|market|settings|logs|profile|security|sign-out|bootstrap|notifications|help)/i.test(match[2])
  );

const endpointFragments = unique(endpointMatches.map((match) => match[2]));
const endpointOccurrences = endpointMatches.map((match) => {
  const index = match.index ?? 0;
  const start = Math.max(0, index - 900);
  const end = Math.min(source.length, index + match[0].length + 1100);
  const context = normalizeContext(source.slice(start, end));
  const methods = unique(
    [...context.matchAll(/method\s*:\s*["'](GET|POST|PUT|PATCH|DELETE)["']/g)]
      .map((methodMatch) => methodMatch[1]),
  );
  return {
    endpoint: match[2],
    sourceIndex: index,
    methodsNearby: methods,
    context,
  };
});

const actionNames = unique([
  ...[...source.matchAll(/data-admin-terminal-action=["']([^"']+)["']/g)].map((match) => match[1]),
  ...[...source.matchAll(/dataset\.adminTerminalAction\s*=\s*["']([^"']+)["']/g)].map((match) => match[1]),
]);

const requestMethods = unique(
  [...source.matchAll(/method\s*:\s*["'](GET|POST|PUT|PATCH|DELETE)["']/g)].map((match) => match[1]),
);

console.log(JSON.stringify({
  endpointFragments,
  endpointOccurrences,
  actionNames,
  requestMethods,
}, null, 2));
