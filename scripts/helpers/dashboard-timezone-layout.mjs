// Bounded historical replay compatibility, not a runtime authorization decision.
const compact = (source) => source.replace(/\s+/gu, "");
const fields = "input,gameSession,marketOpen,publicMarket,players,countryByPlayerId,financialBalances,holdings,orders,trades,storeListings,inventory,purchases,marketNews,playerContracts";
const current = 'marketStatus:gameSession.status==="active"&&marketOpen?"open":"closed",';
const count = (source, token) => source.split(token).length - 1;

export function reconcileDashboardMarketStatus(repositorySource, projectionSource = "") {
  const repository = compact(repositorySource);
  const projection = compact(projectionSource);
  const delegated = repository.includes("projectDashboardPanels") || repository.includes("dashboardPanelProjection.ts");
  if (delegated) {
    if (
      count(repository, "projectDashboardPanels") !== 2 ||
      !repository.includes('import{projectDashboardPanels}from"./dashboardPanelProjection.ts";') ||
      !repository.includes(`returnprojectDashboardPanels({${fields}});`) ||
      count(repository, "marketStatus:") !== 0 ||
      count(projection, "projectDashboardPanels") !== 1 ||
      !projection.includes(`exportfunctionprojectDashboardPanels({${fields}}:DashboardPanelInputs):PlayerGameDashboardSnapshot{`) ||
      count(projection, "marketStatus:") !== 1 ||
      !projection.includes(current)
    ) throw new Error("Unsupported Dashboard delegated market-status layout.");
    return repositorySource;
  }
  if (count(repository, "marketStatus:") !== 1) {
    throw new Error("Unsupported Dashboard inline market-status ownership.");
  }
  if (repository.includes(current)) return repositorySource;
  const historical = /marketStatus:\s*gameSession\.status === "active"\s*\? evaluateStockMarketSession\(\s*DEFAULT_STOCK_EXCHANGE_CODE,\s*this\.now\(\),?\s*\)\.status\s*: "closed",/gu;
  const plain = /marketStatus:\s*gameSession\.status === "active"\s*\? "open"\s*: "closed",/gu;
  const patterns = [historical, plain].filter((pattern) => [...repositorySource.matchAll(pattern)].length === 1);
  if (patterns.length !== 1) throw new Error("Unsupported Dashboard inline market-status predicate.");
  return repositorySource.replace(patterns[0], 'marketStatus: gameSession.status === "active" && marketOpen\n          ? "open"\n          : "closed",');
}
