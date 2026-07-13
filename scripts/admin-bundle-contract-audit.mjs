import { readFileSync } from "node:fs";

const source = readFileSync("admin/dist/admin-overview-terminal.js", "utf8");
const routeManifest = JSON.parse(
  readFileSync("scripts/admin-visible-route-manifest.json", "utf8"),
);

function unique(values) {
  return [...new Set(values)].sort();
}

function normalizeContext(value) {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedRoute(value) {
  return String(value).split("?", 1)[0];
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

const actionContracts = [...source.matchAll(
  /["']([^"']+)["']\s*:\s*\{\s*method\s*:\s*["'](GET|POST|PUT|PATCH|DELETE)["']\s*,\s*path\s*:\s*["']([^"']+)["']/g,
)].map((match) => ({
  action: match[1],
  method: match[2],
  path: match[3],
  route: normalizedRoute(match[3]),
}));

const actionNames = unique([
  ...[...source.matchAll(/data-admin-terminal-action=["']([^"']+)["']/g)].map((match) => match[1]),
  ...[...source.matchAll(/dataset\.adminTerminalAction\s*=\s*["']([^"']+)["']/g)].map((match) => match[1]),
]);

const requestMethods = unique(
  [...source.matchAll(/method\s*:\s*["'](GET|POST|PUT|PATCH|DELETE)["']/g)].map((match) => match[1]),
);

const visibleRoutes = unique(endpointFragments.map(normalizedRoute));
const actionRoutes = unique(actionContracts.map((contract) => contract.route));
const auditedRoutes = unique([...visibleRoutes, ...actionRoutes]);
const manifestRoutes = Object.keys(routeManifest).sort();
const missingDispositions = auditedRoutes.filter((route) => !routeManifest[route]);
const staleDispositions = manifestRoutes.filter((route) => !auditedRoutes.includes(route));
const invalidDispositions = Object.entries(routeManifest)
  .filter(([, disposition]) => ![
    "implemented",
    "explicitly_disabled",
    "read_only_or_disabled_mutations",
  ].includes(disposition))
  .map(([route, disposition]) => ({ route, disposition }));
const actionContractsWithoutDisposition = actionContracts
  .filter((contract) => !routeManifest[contract.route]);
const actionRoutesWithoutDisposition = unique(
  actionContractsWithoutDisposition.map((contract) => contract.route),
);

if (
  missingDispositions.length ||
  staleDispositions.length ||
  invalidDispositions.length ||
  actionRoutesWithoutDisposition.length
) {
  console.error(JSON.stringify({
    missingDispositions,
    staleDispositions,
    invalidDispositions,
    actionRoutesWithoutDisposition,
    actionContractsWithoutDisposition,
  }, null, 2));
  throw new Error("Visible admin route coverage is incomplete or stale.");
}

const dispositionCounts = Object.values(routeManifest).reduce((counts, disposition) => {
  counts[disposition] = (counts[disposition] || 0) + 1;
  return counts;
}, {});

console.log(JSON.stringify({
  endpointFragments,
  endpointOccurrences,
  actionContracts,
  actionNames,
  requestMethods,
  routeCoverage: {
    visibleRouteCount: visibleRoutes.length,
    actionRouteCount: actionRoutes.length,
    auditedRouteCount: auditedRoutes.length,
    manifestRouteCount: manifestRoutes.length,
    dispositionCounts,
    complete: true,
  },
}, null, 2));
