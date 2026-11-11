import { createGameLifecycleController } from "./GameLifecycleController.js";
import { GameLifecyclePanel } from "./GameLifecyclePanel.js";
import { normalizeOverviewReadModel } from "../../api/overview-read-model.js";
import {
  beginAdminDataLoad,
  createAdminDataState,
  rejectAdminDataLoad,
  resolveAdminDataLoad,
} from "../../core/data-state.js";
import { createAdminErrorEnvelope, normalizeAdminError } from "../../core/error-envelope.js";
import { OverviewNotifications } from "./OverviewNotifications.js";
import { OverviewRoute } from "./OverviewRoute.js";

/** Owns Overview loading, normalization, route rendering, and cancellation. */
export function createOverviewController({
  api,
  selectedGameId,
  hasPermission = () => false,
  onChange = () => {},
  onResolved = () => {},
} = {}) {
  if (!api?.readOverview) throw new TypeError("Overview API is unavailable.");
  let state = createAdminDataState();
  let destroyed = false;
  let lifecycleView = null;
  const lifecycle = createGameLifecycleController({
    api, gameId: selectedGameId, hasPermission,
    onChange: () => lifecycleView?.update(),
    onApplied: () => { void loadOverview(); },
  });

  function publish() {
    if (!destroyed) onChange(state);
  }

  function load() {
    lifecycleView?.deactivate();
    void lifecycle.load();
    return loadOverview();
  }

  async function loadOverview() {
    if (destroyed || !hasPermission("game.read")) return;
    const requestedVersion = api.getRequestVersion() + 1;
    state = beginAdminDataLoad(state, { requestVersion: requestedVersion });
    publish();

    let result;
    try {
      result = await api.readOverview({ gameId: selectedGameId });
    } catch (error) {
      state = rejectAdminDataLoad(state, normalizeAdminError(error), { requestVersion: requestedVersion });
      publish();
      return;
    }
    if (destroyed || !result.current) return;

    const dashboard = result.panels.dashboard;
    if (dashboard?.status !== "fulfilled") {
      const error = dashboard?.reason || createAdminErrorEnvelope({
        code: "REQUEST_FAILED",
        retryable: true,
      });
      state = rejectAdminDataLoad(state, error, { requestVersion: result.requestVersion });
      publish();
      return;
    }

    const model = normalizeOverviewReadModel(result);
    const data = Object.freeze({ model, panels: result.panels });
    state = resolveAdminDataLoad(state, data, {
      empty: model.isEmpty,
      requestVersion: result.requestVersion,
    });
    onResolved(data);
    publish();
  }

  return Object.freeze({
    getState: () => state,
    load,
    render({ onOpenLegacy } = {}) {
      if (!lifecycleView) lifecycleView = GameLifecyclePanel({ controller: lifecycle, hasPermission });
      lifecycleView.setGameName(state.data?.model?.game?.name);
      return OverviewRoute({
        lifecyclePanel: lifecycleView.element,
        state,
        hasPermission,
        onOpenLegacy,
        onRefresh: load,
      });
    },
    deactivate() { lifecycleView?.deactivate(); },
    renderNotifications() {
      return OverviewNotifications({ data: state.data, onRetry: load });
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      lifecycleView?.destroy();
      lifecycle.destroy();
      api.cancelOverviewRequest();
    },
  });
}
