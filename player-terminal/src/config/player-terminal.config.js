const DEFAULT_CONFIG = Object.freeze({
  apiBaseUrl: "/api/player",
  environment: "development",
  allowPreviewMode: true,
  usePreviewData: false,
  simulatePreviewWrites: false,
  preserveProductSurface: true,
  requestTimeoutMs: 15000,
  writeCooldownMs: 900,
  developerDiagnostics: false,
  allowedImageHosts: [],
  capabilities: null,
  gameSessionId: "",
  playerSessionId: "",
  playerSessionToken: "",
  accessToken: "",
  adapter: null,
  apiCall: null,
  sessionProvider: null,
  sessionReadyEvent: "econovaria:player-session-ready",
  sessionRequiredEvent: "econovaria:player-session-required",
  sessionInvalidEvent: "econovaria:player-session-invalid",
  logoutRequestedEvent: "econovaria:player-logout-requested",
  sessionExitUrl: "",
  sessionExitDelayMs: 120,
  sessionExpirySkewMs: 250,
  sessionExpiryWatchIntervalMs: 1000,
  onSessionRequired: null,
  onSessionInvalid: null,
  onLogoutRequested: null
});

function inferredEnvironment(runtime, locationLike) {
  if (runtime.environment === "production") return "production";
  if (runtime.environment === "staging") return "staging";
  if (runtime.environment === "development") return "development";
  const hostname = String(locationLike?.hostname || "").toLowerCase();
  return !hostname || ["localhost", "127.0.0.1", "::1"].includes(hostname)
    ? "development"
    : "production";
}

function boundedInteger(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, Math.round(number))) : fallback;
}

export function buildPlayerTerminalConfig(runtime = {}, locationLike = globalThis.location) {
  const environment = inferredEnvironment(runtime, locationLike);
  const params = new URLSearchParams(locationLike?.search || "");
  const previewRequested = params.get("preview") === "1" || params.get("preview") === "true";
  const apiRequested = params.get("api") === "1" || params.get("api") === "true";
  const allowPreviewMode = environment === "development" && runtime.allowPreviewMode !== false;
  const defaultDevelopmentPreview = environment === "development" && runtime.usePreviewData !== false && !apiRequested;
  const usePreviewData = allowPreviewMode && !apiRequested && (runtime.usePreviewData === true || previewRequested || defaultDevelopmentPreview);

  return {
    ...DEFAULT_CONFIG,
    ...runtime,
    environment,
    allowPreviewMode,
    usePreviewData,
    simulatePreviewWrites: usePreviewData && runtime.simulatePreviewWrites === true,
    preserveProductSurface: runtime.preserveProductSurface !== false,
    developerDiagnostics: environment === "development" && runtime.developerDiagnostics === true,
    requestTimeoutMs: boundedInteger(runtime.requestTimeoutMs, DEFAULT_CONFIG.requestTimeoutMs, 1000, 60000),
    writeCooldownMs: boundedInteger(runtime.writeCooldownMs, DEFAULT_CONFIG.writeCooldownMs, 250, 10000),
    sessionExitDelayMs: boundedInteger(runtime.sessionExitDelayMs, DEFAULT_CONFIG.sessionExitDelayMs, 0, 2000),
    sessionExpirySkewMs: boundedInteger(runtime.sessionExpirySkewMs, DEFAULT_CONFIG.sessionExpirySkewMs, 0, 30000),
    sessionExpiryWatchIntervalMs: boundedInteger(
      runtime.sessionExpiryWatchIntervalMs,
      DEFAULT_CONFIG.sessionExpiryWatchIntervalMs,
      250,
      10000
    ),
    allowedImageHosts: Array.isArray(runtime.allowedImageHosts)
      ? runtime.allowedImageHosts.map((host) => String(host).trim().toLowerCase()).filter(Boolean).slice(0, 50)
      : []
  };
}

export function resolvePlayerTerminalConfig() {
  return buildPlayerTerminalConfig(globalThis.ECONOVARIA_PLAYER_TERMINAL_CONFIG || {}, globalThis.location);
}
