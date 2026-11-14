import { resourceState } from "../api/resource-status.js";

// Absence, failed reads and country-only views cannot certify onboarding.
// This is guidance only. World owns the questionnaire and all mutations.
export function dashboardArrivalGuidance(data) {
  const state = resourceState(data, "worldRuntime");
  const runtime = data.worldRuntime;
  const base = { route: "world", iconName: "globe", tone: "amber", eyebrow: "Arrival Class" };
  if (data.resourceStatus?.worldRuntime?.code === "CAPABILITY_UNAVAILABLE") {
    return { ...base, title: "Arrival runtime not supported", detail: "This service does not expose Arrival status. Country intelligence remains available in World." };
  }
  if (state === "loading") return { ...base, title: "Checking Arrival status", detail: "Waiting for the World service. Other sections remain available." };
  if (state === "unavailable" || runtime?.runtimeAvailable === false) {
    return { ...base, title: "Arrival status unavailable", detail: "Open World to retry the current Arrival status. This does not establish an economic lockout." };
  }
  if (state !== "ready" || typeof runtime?.arrival?.required !== "boolean") {
    return { ...base, title: "Arrival status unknown", detail: "Open World to check your Arrival Class. Readiness has not been confirmed." };
  }
  const arrival = runtime.arrival;
  if (arrival.assignment || !arrival.required) return null;
  return arrival.questionnaire
    ? { ...base, priority: true, title: "Complete Arrival Class", detail: "Review your questionnaire in World. No class permanently blocks economic activity." }
    : { ...base, priority: true, title: "Arrival questionnaire unavailable", detail: "This game requires an Arrival Class, but no questionnaire is published. Ask your teacher to check the configuration." };
}

export function dashboardResourceLabel(data, key, preview = false) {
  const status = data.resourceStatus?.[key];
  if (status?.state === "ready" || (!status && preview)) return "";
  if (status?.code === "CAPABILITY_UNAVAILABLE") return "Not supported";
  if (status?.state === "loading") return "Loading";
  if (!status || status.state === "unknown" || status.state === "empty") return "Unknown";
  return "Unavailable";
}
