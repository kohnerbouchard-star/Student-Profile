function firstText(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function normalizePlayerSessionHandoff(input) {
  if (!input || typeof input !== "object") return null;
  const session = input.session && typeof input.session === "object" ? input.session : {};
  const playerSession = input.playerSession && typeof input.playerSession === "object" ? input.playerSession : {};

  const playerSessionToken = firstText(
    input.playerSessionToken,
    input.player_session_token,
    input.sessionToken,
    input.session_token,
    input.token,
    session.playerSessionToken,
    session.player_session_token,
    session.token,
    playerSession.playerSessionToken,
    playerSession.player_session_token,
    playerSession.token
  );

  if (!playerSessionToken) return null;

  return {
    playerSessionToken,
    accessToken: firstText(input.accessToken, input.access_token, session.accessToken, session.access_token)
  };
}

export function applyPlayerSessionHandoff(config, input) {
  const session = normalizePlayerSessionHandoff(input);
  if (!session) return false;
  config.playerSessionToken = session.playerSessionToken;
  // Never carry legacy browser-supplied UUID scope into a new authenticated session.
  config.gameSessionId = "";
  config.playerSessionId = "";
  if (session.accessToken) config.accessToken = session.accessToken;
  return true;
}

export async function resolveExistingPlayerSession(config) {
  const direct = normalizePlayerSessionHandoff(config);
  if (direct) return direct;
  if (typeof config.sessionProvider === "function") {
    try {
      const provided = normalizePlayerSessionHandoff(await config.sessionProvider());
      if (provided) return provided;
    } catch {
      // The host sign-in remains authoritative; a later session-ready event can retry.
    }
  }
  const globalSession = normalizePlayerSessionHandoff(
    globalThis.ECONOVARIA_PLAYER_SESSION ||
    globalThis.Econovaria?.playerSession ||
    globalThis.Econovaria?.state?.getCurrentSession?.()
  );
  return globalSession;
}

export function dispatchHostEvent(name, detail = {}) {
  if (typeof globalThis.dispatchEvent !== "function" || typeof globalThis.CustomEvent !== "function") return;
  globalThis.dispatchEvent(new CustomEvent(name, { detail }));
}
