const DEFAULT_CONFIG = Object.freeze({
  apiBaseUrl: "/api/player",
  usePreviewData: true,
  simulatePreviewWrites: false,
  requestTimeoutMs: 15000,
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
  onSessionRequired: null,
  onSessionInvalid: null,
  onLogoutRequested: null
});

export function resolvePlayerTerminalConfig() {
  const runtime = globalThis.ECONOVARIA_PLAYER_TERMINAL_CONFIG || {};
  const params = new URLSearchParams(globalThis.location?.search || "");
  const previewRequested = params.get("preview") === "1" || params.get("preview") === "true";

  return {
    ...DEFAULT_CONFIG,
    ...runtime,
    usePreviewData: previewRequested || runtime.usePreviewData !== false,
    simulatePreviewWrites: runtime.simulatePreviewWrites === true
  };
}
