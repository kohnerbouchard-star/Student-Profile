import { isAdminErrorEnvelope, normalizeAdminError } from "../../core/error-envelope.js";
import { GAME_LIFECYCLE_ACTIONS } from "../../api/game-lifecycle-model.js";

/** One immutable game scope, one pending transition, server-owned actions and versions. */
export function createGameLifecycleController({ api, gameId, hasPermission = () => false, onChange = () => {}, onApplied = () => {} } = {}) {
  let state = Object.freeze({ status: "idle", lifecycle: null, error: null, intent: null, notice: "" });
  let destroyed = false;
  let generation = 0;
  let reviewedIntent = null;
  let readController = null;
  let mutationController = null;
  const safeError = (error) => isAdminErrorEnvelope(error) ? error : normalizeAdminError(error);
  const publish = (patch) => {
    if (destroyed) return;
    state = Object.freeze({ ...state, ...patch });
    onChange(state);
  };

  async function load() {
    if (destroyed || state.status === "saving" || !hasPermission("game.read") || !api?.readGameLifecycle) return false;
    reviewedIntent = null;
    const version = ++generation;
    readController?.abort();
    const controller = new AbortController();
    readController = controller;
    publish({ status: "loading", lifecycle: null, error: null, intent: null, notice: "" });
    try {
      const lifecycle = await api.readGameLifecycle({ gameId, signal: controller.signal });
      if (destroyed || generation !== version) return false;
      publish({ status: "ready", lifecycle });
      return true;
    } catch (error) {
      if (!destroyed && generation === version) publish({ status: "failed", error: safeError(error) });
      return false;
    } finally {
      if (readController === controller) readController = null;
    }
  }

  function prepare(action) {
    if (destroyed || !hasPermission("game.read") || !hasPermission("game.update")) return null;
    if (state.status === "uncertain") {
      reviewedIntent = state.intent?.action === action ? state.intent : null;
      return reviewedIntent;
    }
    if (state.status !== "ready" || !state.lifecycle?.allowedActions.includes(action)
      || !Object.hasOwn(GAME_LIFECYCLE_ACTIONS, action)) return null;
    reviewedIntent = Object.freeze({ action, expectedVersion: state.lifecycle.version,
      idempotencyKey: `admin.lifecycle.${action}.${crypto.randomUUID()}` });
    return reviewedIntent;
  }

  async function apply(intent) {
    if (destroyed || !intent || intent !== reviewedIntent || !hasPermission("game.read") || !hasPermission("game.update")) return false;
    const retry = state.status === "uncertain" && intent === state.intent;
    if (!retry && (state.status !== "ready" || intent.expectedVersion !== state.lifecycle?.version
      || !state.lifecycle?.allowedActions.includes(intent.action))) return false;
    if (!Object.hasOwn(GAME_LIFECYCLE_ACTIONS, intent.action)) return false;
    reviewedIntent = null;
    ++generation;
    readController?.abort();
    mutationController = new AbortController();
    publish({ status: "saving", intent, error: null, notice: "" });
    try {
      const result = await api.transitionGameLifecycle({ gameId, ...intent, signal: mutationController.signal });
      if (destroyed) return false;
      publish({ status: "ready", lifecycle: result.lifecycle, intent: null,
        notice: result.outcome === "replayed" ? "The previously requested change is confirmed." : `${GAME_LIFECYCLE_ACTIONS[intent.action].label} confirmed.` });
      onApplied(result);
      return true;
    } catch (error) {
      if (destroyed) return false;
      const normalized = safeError(error);
      const uncertain = normalized.retryable || ["INVALID_RESPONSE", "REQUEST_ABORTED"].includes(normalized.code);
      publish({ status: uncertain ? "uncertain" : "failed", error: normalized,
        lifecycle: null, intent: uncertain ? intent : null,
        notice: normalized.code === "CONFLICT" ? "The game changed. Refresh state and review the action again." : "" });
      return false;
    } finally { mutationController = null; }
  }

  return Object.freeze({ getState: () => state, load, prepare, apply,
    cancelReview() { reviewedIntent = null; },
    destroy() {
      destroyed = true; ++generation;
      readController?.abort(); mutationController?.abort();
    },
  });
}
