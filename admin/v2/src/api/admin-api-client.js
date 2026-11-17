import { createRosterImportRequest } from "./player-roster-import.js";
import {
  ADMIN_OVERVIEW_RESOURCE_KEYS, ADMIN_MARKET_RESOURCE_KEYS, ADMIN_MARKET_DETAIL_RESOURCE_KEYS,
  DEFAULT_TIMEOUT_MS, STORE_CREATE_FIELDS, STORE_UPDATE_FIELDS, PLAYER_CREATE_FIELDS,
  PLAYER_PROFILE_SETTING_FIELDS, PLAYER_CREDENTIAL_FIELDS, AdminTransportDiagnostic, normalizeTimeout,
  requireGameToken, requireIdempotencyKey, storeCollectionPath, storeItemPath, playersCollectionPath,
  playerSettingsPath, playerCredentialPath, marketResourceSpecs, marketDetailResourceSpecs,
  overviewResourceSpecs, linkAbortSignal, serializeJsonBody, requestAdminJson, storeMutationBody,
  playerMutationBody, validateStoreRead, validateStoreMutation, validatePlayersRead,
  validatePlayerCreate, validatePlayerSettings, validatePlayerCredentials, MARKET_PANEL_VALIDATORS,
  MARKET_DETAIL_VALIDATORS, asSafeRejection, settlePanel,
} from "./admin-api-protocol.js";
export {
  ADMIN_API_BASE_PATH, ADMIN_OVERVIEW_RESOURCE_KEYS, ADMIN_MARKET_RESOURCE_KEYS,
  ADMIN_MARKET_DETAIL_RESOURCE_KEYS,
} from "./admin-api-protocol.js";
import { GAME_LIFECYCLE_ACTIONS, normalizeGameLifecycleResult } from "./game-lifecycle-model.js";


/**
 * Creates the Admin v2 API adapter. The configured fetch is expected
 * to be a scoped HttpOnly Admin BFF transport; this module never creates or
 * forwards an Authorization header and never calls the Staff API directly.
 */
export function createAdminApiClient({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("Admin API fetch is unavailable.");

  let activeRequestVersion = 0;
  let activeController = null;
  let activeStoreController = null;
  let activePlayersController = null;
  let activeMarketRequestVersion = 0;
  let activeMarketController = null;
  let activeMarketDetailRequestVersion = 0;
  let activeMarketDetailController = null;
  const inFlightMutations = new Map();

  async function readOverview({ gameId, signal, timeoutMs: requestTimeoutMs } = {}) {
    activeRequestVersion += 1;
    const requestVersion = activeRequestVersion;
    activeController?.abort();

    const batchController = new AbortController();
    activeController = batchController;
    const unlinkAbort = linkAbortSignal(signal, batchController);
    const specs = overviewResourceSpecs(gameId);
    const options = {
      signal: batchController.signal,
      timeoutMs: normalizeTimeout(requestTimeoutMs, normalizeTimeout(timeoutMs)),
    };

    try {
      const entries = await Promise.all(ADMIN_OVERVIEW_RESOURCE_KEYS.map(async (key) => [
        key,
        await settlePanel(fetchImpl, specs[key], options),
      ]));
      return Object.freeze({
        requestVersion,
        current: requestVersion === activeRequestVersion,
        panels: Object.freeze(Object.fromEntries(entries)),
      });
    } finally {
      unlinkAbort();
      if (activeController === batchController) activeController = null;
    }
  }

  function cancelOverviewRequest() {
    if (!activeController) return false;
    activeRequestVersion += 1;
    activeController.abort();
    activeController = null;
    return true;
  }

  function readStore({ gameId, signal, timeoutMs: requestTimeoutMs } = {}) {
    try {
      const path = storeCollectionPath(gameId, { includeReadProjection: true });
      activeStoreController?.abort();
      const storeController = new AbortController();
      activeStoreController = storeController;
      const unlinkAbort = linkAbortSignal(signal, storeController);
      const request = requestAdminJson(
        fetchImpl,
        path,
        {
          signal: storeController.signal,
          timeoutMs: normalizeTimeout(requestTimeoutMs, normalizeTimeout(timeoutMs)),
          validate: validateStoreRead,
        },
      );
      return request.finally(() => {
        unlinkAbort();
        if (activeStoreController === storeController) activeStoreController = null;
      });
    } catch (error) {
      return asSafeRejection(error);
    }
  }

  function cancelStoreRequest() {
    if (!activeStoreController) return false;
    activeStoreController.abort();
    activeStoreController = null;
    return true;
  }

  function readPlayers({ gameId, signal, timeoutMs: requestTimeoutMs } = {}) {
    try {
      const path = playersCollectionPath(gameId);
      activePlayersController?.abort();
      const playersController = new AbortController();
      activePlayersController = playersController;
      const unlinkAbort = linkAbortSignal(signal, playersController);
      const request = requestAdminJson(fetchImpl, path, {
        signal: playersController.signal,
        timeoutMs: normalizeTimeout(requestTimeoutMs, normalizeTimeout(timeoutMs)),
        validate: validatePlayersRead,
      });
      return request.finally(() => {
        unlinkAbort();
        if (activePlayersController === playersController) activePlayersController = null;
      });
    } catch (error) {
      return asSafeRejection(error);
    }
  }

  function cancelPlayersRequest() {
    if (!activePlayersController) return false;
    activePlayersController.abort();
    activePlayersController = null;
    return true;
  }

  async function readMarket({ gameId, signal, timeoutMs: requestTimeoutMs } = {}) {
    activeMarketRequestVersion += 1;
    const requestVersion = activeMarketRequestVersion;
    activeMarketController?.abort();

    const batchController = new AbortController();
    activeMarketController = batchController;
    const unlinkAbort = linkAbortSignal(signal, batchController);
    const specs = marketResourceSpecs(gameId);
    const requestTimeout = normalizeTimeout(requestTimeoutMs, normalizeTimeout(timeoutMs));

    try {
      const entries = await Promise.all(ADMIN_MARKET_RESOURCE_KEYS.map(async (key) => [
        key,
        await settlePanel(fetchImpl, specs[key], {
          signal: batchController.signal,
          timeoutMs: requestTimeout,
          validate: MARKET_PANEL_VALIDATORS[key],
        }),
      ]));
      return Object.freeze({
        requestVersion,
        current: requestVersion === activeMarketRequestVersion,
        panels: Object.freeze(Object.fromEntries(entries)),
      });
    } finally {
      unlinkAbort();
      if (activeMarketController === batchController) activeMarketController = null;
    }
  }

  function cancelMarketRequest() {
    if (!activeMarketController) return false;
    activeMarketRequestVersion += 1;
    activeMarketController.abort();
    activeMarketController = null;
    return true;
  }

  async function readMarketDetail({
    gameId,
    resourceId,
    signal,
    timeoutMs: requestTimeoutMs,
  } = {}) {
    activeMarketDetailRequestVersion += 1;
    const requestVersion = activeMarketDetailRequestVersion;
    activeMarketDetailController?.abort();

    const detailController = new AbortController();
    activeMarketDetailController = detailController;
    const unlinkAbort = linkAbortSignal(signal, detailController);
    const specs = marketDetailResourceSpecs(gameId, resourceId);
    const requestTimeout = normalizeTimeout(requestTimeoutMs, normalizeTimeout(timeoutMs));

    try {
      const entries = await Promise.all(ADMIN_MARKET_DETAIL_RESOURCE_KEYS.map(async (key) => [
        key,
        await settlePanel(fetchImpl, specs[key], {
          signal: detailController.signal,
          timeoutMs: requestTimeout,
          validate: MARKET_DETAIL_VALIDATORS[key],
        }),
      ]));
      return Object.freeze({
        requestVersion,
        current: requestVersion === activeMarketDetailRequestVersion,
        panels: Object.freeze(Object.fromEntries(entries)),
      });
    } finally {
      unlinkAbort();
      if (activeMarketDetailController === detailController) activeMarketDetailController = null;
    }
  }

  function cancelMarketDetailRequest() {
    if (!activeMarketDetailController) return false;
    activeMarketDetailRequestVersion += 1;
    activeMarketDetailController.abort();
    activeMarketDetailController = null;
    return true;
  }

  function storeMutation({
    method,
    path,
    body,
    idempotencyKey,
    signal,
    timeoutMs: requestTimeoutMs,
  }) {
    const key = requireIdempotencyKey(idempotencyKey);
    const fingerprint = serializeJsonBody({ method, path, body });
    const existing = inFlightMutations.get(key);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        return asSafeRejection(
          new AdminTransportDiagnostic({ status: 409, code: "CONFLICT" }),
        );
      }
      return existing.promise;
    }

    const promise = requestAdminJson(fetchImpl, path, {
      method,
      body,
      headers: {
        "Idempotency-Key": key,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      signal,
      timeoutMs: normalizeTimeout(requestTimeoutMs, normalizeTimeout(timeoutMs)),
      validate: validateStoreMutation,
    });
    const entry = { fingerprint, promise };
    inFlightMutations.set(key, entry);
    const clear = () => {
      if (inFlightMutations.get(key) === entry) inFlightMutations.delete(key);
    };
    promise.then(clear, clear);
    return promise;
  }

  function playerMutation({
    method,
    path,
    body,
    idempotencyKey,
    signal,
    timeoutMs: requestTimeoutMs,
    validate,
  }) {
    const key = requireIdempotencyKey(idempotencyKey);
    const fingerprint = serializeJsonBody({ method, path, body });
    const existing = inFlightMutations.get(key);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        return asSafeRejection(
          new AdminTransportDiagnostic({ status: 409, code: "CONFLICT" }),
        );
      }
      return existing.promise;
    }

    const promise = requestAdminJson(fetchImpl, path, {
      method,
      body,
      headers: {
        "Idempotency-Key": key,
        "Content-Type": "application/json",
      },
      signal,
      timeoutMs: normalizeTimeout(requestTimeoutMs, normalizeTimeout(timeoutMs)),
      validate,
    });
    const entry = { fingerprint, promise };
    inFlightMutations.set(key, entry);
    const clear = () => {
      if (inFlightMutations.get(key) === entry) inFlightMutations.delete(key);
    };
    promise.then(clear, clear);
    return promise;
  }

  function createStoreItem({
    gameId,
    item,
    input,
    idempotencyKey,
    signal,
    timeoutMs: requestTimeoutMs,
  } = {}) {
    try {
      return storeMutation({
        method: "POST",
        path: storeCollectionPath(gameId),
        body: storeMutationBody(item ?? input, STORE_CREATE_FIELDS),
        idempotencyKey,
        signal,
        timeoutMs: requestTimeoutMs,
      });
    } catch (error) {
      return asSafeRejection(error);
    }
  }

  function updateStoreItem({
    gameId,
    itemId,
    changes,
    input,
    idempotencyKey,
    signal,
    timeoutMs: requestTimeoutMs,
  } = {}) {
    try {
      return storeMutation({
        method: "PATCH",
        path: storeItemPath(gameId, itemId),
        body: storeMutationBody(changes ?? input, STORE_UPDATE_FIELDS),
        idempotencyKey,
        signal,
        timeoutMs: requestTimeoutMs,
      });
    } catch (error) {
      return asSafeRejection(error);
    }
  }

  function archiveStoreItem({
    gameId,
    itemId,
    idempotencyKey,
    signal,
    timeoutMs: requestTimeoutMs,
  } = {}) {
    try {
      return storeMutation({
        method: "DELETE",
        path: storeItemPath(gameId, itemId),
        body: undefined,
        idempotencyKey,
        signal,
        timeoutMs: requestTimeoutMs,
      });
    } catch (error) {
      return asSafeRejection(error);
    }
  }

  function createPlayer({
    gameId,
    player,
    input,
    idempotencyKey,
    signal,
    timeoutMs: requestTimeoutMs,
  } = {}) {
    try {
      return playerMutation({
        method: "POST",
        path: playersCollectionPath(gameId),
        body: playerMutationBody(player ?? input, PLAYER_CREATE_FIELDS),
        idempotencyKey,
        signal,
        timeoutMs: requestTimeoutMs,
        validate: validatePlayerCreate,
      });
    } catch (error) {
      return asSafeRejection(error);
    }
  }

  function updatePlayerSettings({
    gameId,
    playerId,
    settings,
    input,
    idempotencyKey,
    signal,
    timeoutMs: requestTimeoutMs,
  } = {}) {
    try {
      const normalized = playerMutationBody(settings ?? input, PLAYER_PROFILE_SETTING_FIELDS);
      return playerMutation({
        method: "PATCH",
        path: playerSettingsPath(gameId, playerId),
        body: { settings: normalized },
        idempotencyKey,
        signal,
        timeoutMs: requestTimeoutMs,
        validate: validatePlayerSettings,
      });
    } catch (error) {
      return asSafeRejection(error);
    }
  }

  function updatePlayerCredentials({
    gameId,
    playerId,
    credentials,
    input,
    idempotencyKey,
    signal,
    timeoutMs: requestTimeoutMs,
  } = {}) {
    try {
      return playerMutation({
        method: "POST",
        path: playerCredentialPath(gameId, playerId),
        body: playerMutationBody(credentials ?? input, PLAYER_CREDENTIAL_FIELDS),
        idempotencyKey,
        signal,
        timeoutMs: requestTimeoutMs,
        validate: validatePlayerCredentials,
      });
    } catch (error) {
      return asSafeRejection(error);
    }
  }

  function readGameLifecycle({ gameId, signal } = {}) {
    try {
      return requestAdminJson(fetchImpl, `/games/${requireGameToken(gameId)}/lifecycle`, {
        signal, timeoutMs,
        validate: (payload) => normalizeGameLifecycleResult(payload),
      });
    } catch (error) { return asSafeRejection(error); }
  }

  function transitionGameLifecycle({ gameId, action, expectedVersion, idempotencyKey, signal } = {}) {
    try {
      if (!Object.hasOwn(GAME_LIFECYCLE_ACTIONS, action) || !Number.isSafeInteger(expectedVersion)
        || expectedVersion < 1 || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(idempotencyKey || "")) {
        throw new AdminTransportDiagnostic({ status: 400, code: "INVALID_REQUEST" });
      }
      const suffix = action === "revoke_sessions" ? "sessions/revoke" : `lifecycle/${action}`;
      return playerMutation({
        method: "POST",
        path: `/games/${requireGameToken(gameId)}/${suffix}`,
        body: { idempotencyKey, expectedVersion },
        idempotencyKey, signal,
        validate: (payload) => normalizeGameLifecycleResult(payload, action),
      });
    } catch (error) { return asSafeRejection(error); }
  }

  return Object.freeze({
    readGameLifecycle,
    transitionGameLifecycle,
    readOverview,
    cancelOverviewRequest,
    readStore,
    cancelStoreRequest,
    readPlayers,
    cancelPlayersRequest,
    readMarket,
    cancelMarketRequest,
    readMarketDetail,
    cancelMarketDetailRequest,
    createStoreItem,
    updateStoreItem,
    archiveStoreItem,
    createPlayer,
    importPlayerRoster: createRosterImportRequest({ mutate: playerMutation, collectionPath: playersCollectionPath }),
    updatePlayerSettings,
    updatePlayerCredentials,
    getRequestVersion: () => activeRequestVersion,
    isCurrentRequestVersion: (version) => Number(version) === activeRequestVersion,
  });
}
