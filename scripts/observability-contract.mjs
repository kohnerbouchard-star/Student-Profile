import fs from "node:fs";

const dashboard = JSON.parse(fs.readFileSync("docs/operations/observability-dashboard-alerts.json", "utf8"));
const profile = JSON.parse(fs.readFileSync("docs/operations/performance/beta-load-profile.json", "utf8"));
const plans = JSON.parse(fs.readFileSync("docs/operations/performance/query-plan-evidence.json", "utf8"));

export function validateObservabilityContracts({ dashboard, profile, plans }) {
  const failures = [];
  const panelIds = new Set(dashboard.dashboard?.panels?.map((panel) => panel.id));
  if (panelIds.size !== 13) failures.push("dashboard must contain 13 unique panels");
  if (dashboard.alerts?.length !== 12) failures.push("dashboard must contain 12 alerts");
  for (const alert of dashboard.alerts ?? []) {
    if (!panelIds.has(alert.id)) failures.push(`alert ${alert.id} has no dashboard panel`);
    if (!alert.threshold || !alert.recovery) failures.push(`alert ${alert.id} lacks threshold or recovery`);
  }
  if (profile.environment !== "isolated-staging" || profile.mode !== "plan-only" || profile.connectedExecutionAuthorized !== false) failures.push("load profile must remain isolated and plan-only");
  if (profile.expectedPlayers !== 30 || profile.maximumPlayers !== 40) failures.push("load profile must retain 30 expected and 40 maximum players");
  if (profile.maximumRequestsPerSecond > 25 || profile.maximumDurationMinutes > 20) failures.push("load profile exceeds bounded limits");
  for (const phase of profile.phases ?? []) {
    if (phase.players > profile.maximumPlayers || phase.requestsPerSecond > profile.maximumRequestsPerSecond) failures.push(`load phase ${phase.id} exceeds profile bounds`);
  }
  if (plans.status !== "pending-connected-load" || plans.environment !== "isolated-staging") failures.push("query plan evidence must remain pending isolated staging load");
  if (plans.queries?.length !== 5) failures.push("five high-value query plans are required");
  if (plans.queries?.some((query) => query.evidence !== null)) failures.push("repository evidence must not fabricate connected plans");
  const serialized = JSON.stringify({ dashboard, profile, plans });
  for (const marker of ["authorization", "password", "accessCode", "sessionToken", "serviceRoleKey", "requestBody"]) {
    if (serialized.includes(marker)) failures.push(`forbidden evidence marker ${marker}`);
  }
  return failures;
}

const failures = validateObservabilityContracts({ dashboard, profile, plans });
if (failures.length) {
  console.error("Observability contract validation failed:\n- " + failures.join("\n- "));
  process.exitCode = 1;
} else {
  console.log("Observability contract validation passed: 13 panels, 12 alerts, bounded 30/40-player plan, and 5 pending query-plan captures.");
}
