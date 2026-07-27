const CSRF_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function firstText(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function normalizePlayerSessionHandoff(input) {
  if (!input || typeof input !== "object") return null;
  const session = input.session && typeof input.session === "object" ? input.session : {};
  const gameSession = input.gameSession && typeof input.gameSession === "object" ? input.gameSession : {};
  const authenticated = input.authenticated === true || session.authenticated === true;
  const csrfToken = firstText(input.csrfToken, input.csrf_token, session.csrfToken, session.csrf_token);

  if (!authenticated || !CSRF_PATTERN.test(csrfToken)) return null;

  return {
    authenticated: true,
    csrfToken,
    expiresAt: firstText(
      input.absoluteExpiresAt,
      input.sessionExpiresAt,
      input.expiresAt,
      session.absoluteExpiresAt,
      session.expiresAt
    ),
    gameSessionId: firstText(
      input.gameSessionId,
      input.game_session_id,
      gameSession.id,
      gameSession.gameSessionId,
      gameSession.game_session_id,
      session.gameSessionId,
      session.game_session_id
    )
  };
}

export function applyPlayerSessionHandoff(config, input) {
  const session = normalizePlayerSessionHandoff(input);
  if (!session) return false;
  config.authenticated = true;
  config.csrfToken = session.csrfToken;
  if (session.expiresAt) config.sessionExpiresAt = session.expiresAt;
  if (session.gameSessionId) config.gameSessionId = session.gameSessionId;
  delete config.playerSessionToken;
  delete config.accessToken;
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
  return normalizePlayerSessionHandoff(
    globalThis.ECONOVARIA_PLAYER_SESSION ||
    globalThis.Econovaria?.playerSession ||
    globalThis.Econovaria?.state?.getCurrentSession?.()
  );
}

export function dispatchHostEvent(name, detail = {}) {
  if (typeof globalThis.dispatchEvent !== "function" || typeof globalThis.CustomEvent !== "function") return;
  globalThis.dispatchEvent(new CustomEvent(name, { detail }));
}
