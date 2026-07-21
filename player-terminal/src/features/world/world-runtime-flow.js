import { PlayerApi } from "../../api/player-api.js";
import { isEndpointEnabled } from "../../api/capabilities.js";
import { normalizeApiError } from "../../api/errors.js";
import { renderWorldPage } from "../../pages/world-page.js";

const STALE_AFTER_MS = 60_000;

function isWorldRoute(state) {
  return state?.status === "ready" && state?.route === "world";
}

function statusNode(form) {
  return form?.querySelector("[data-world-form-status]") || null;
}

function setFormStatus(form, message, invalid = false) {
  const node = statusNode(form);
  if (!node) return;
  node.textContent = message;
  node.setAttribute("role", invalid ? "alert" : "status");
}

function setProcessing(form, processing, label = "Processing") {
  const button = form?.querySelector('button[type="submit"]');
  if (!button) return () => {};
  const original = button.textContent;
  button.disabled = processing;
  button.setAttribute("aria-busy", String(processing));
  if (processing) button.textContent = label;
  return (completedLabel = "") => {
    button.removeAttribute("aria-busy");
    button.disabled = false;
    button.textContent = completedLabel || original;
    if (completedLabel) setTimeout(() => { button.textContent = original; }, 1200);
  };
}

function selectedAnswers(form) {
  return [...form.querySelectorAll('input[type="radio"]:checked')].map((input) => ({
    questionId: input.dataset.questionId || "",
    optionId: input.value,
  }));
}

function selectedModes(form) {
  return [...form.querySelectorAll('input[name="allowedModes"]:checked')].map((input) => input.value);
}

function stateMessage(error) {
  const normalized = normalizeApiError(error);
  if (normalized.code === "OFFLINE" || normalized.code === "NETWORK_ERROR") {
    return "Connection is unavailable. The last committed World view remains visible.";
  }
  if (normalized.status === 401) return "Your player session expired.";
  if (normalized.status === 409) return "World state changed. Refresh and review the current conditions.";
  if (normalized.status === 429) return "World actions are temporarily rate limited. Retry after the displayed interval.";
  return normalized.message || "The World service could not complete the request.";
}

export function installWorldRuntimeFlow({ mount, terminal, config }) {
  if (!(mount instanceof HTMLElement)) throw new TypeError("World runtime requires the Player Terminal mount.");
  const api = new PlayerApi(config);
  let model = null;
  let quote = null;
  let state = "idle";
  let message = "";
  let updatedAt = 0;
  let destroyed = false;
  let renderScheduled = false;
  let requestVersion = 0;

  function currentCapabilities() {
    return terminal.getState()?.data?.capabilities || { routes: {}, actions: {} };
  }

  function pageHost() {
    return mount.querySelector(".player-terminal-page-host");
  }

  function render() {
    renderScheduled = false;
    if (destroyed || !isWorldRoute(terminal.getState())) return;
    const host = pageHost();
    if (!host) return;
    const offline = globalThis.navigator?.onLine === false;
    const stale = Boolean(updatedAt && Date.now() - updatedAt > STALE_AFTER_MS);
    host.innerHTML = renderWorldPage(model, {
      state: state === "loading" && !model ? "loading" : state === "unavailable" && !model ? "unavailable" : "ready",
      message,
      quote,
      offline,
      stale,
      capabilities: currentCapabilities(),
    });
  }

  function scheduleRender() {
    if (renderScheduled || destroyed) return;
    renderScheduled = true;
    requestAnimationFrame(render);
  }

  async function load({ force = false, preserveMessage = false } = {}) {
    if (destroyed || !isWorldRoute(terminal.getState())) return null;
    const version = ++requestVersion;
    api.setSession(config);
    state = "loading";
    if (!preserveMessage) message = "";
    scheduleRender();
    try {
      const next = await api.request("worldRuntime", { force });
      if (destroyed || version !== requestVersion) return null;
      model = next;
      state = "ready";
      updatedAt = Date.now();
      if (!preserveMessage) message = "World runtime refreshed.";
      scheduleRender();
      return next;
    } catch (error) {
      if (destroyed || version !== requestVersion) return null;
      const normalized = normalizeApiError(error);
      if (Number(normalized.status) === 401) {
        await terminal.refresh();
        return null;
      }
      state = model ? "ready" : "unavailable";
      message = stateMessage(normalized);
      scheduleRender();
      return null;
    }
  }

  async function committedMutation(endpointKey, payload, params, form, successMessage) {
    if (!isEndpointEnabled(currentCapabilities(), endpointKey)) {
      const detail = "This World action is not enabled for the current game.";
      setFormStatus(form, detail, true);
      message = detail;
      scheduleRender();
      return null;
    }
    api.setSession(config);
    const restore = setProcessing(form, true);
    setFormStatus(form, "Submitting a replay-safe World action.");
    try {
      const operation = await api.execute(endpointKey, payload, params);
      const result = operation.result || {};
      if (endpointKey === "travelQuote") {
        quote = result.quote || null;
        message = quote ? "Authoritative travel quote created. Review it before confirming." : "Quote completed without a usable result.";
        restore(quote ? "Quote ready" : "Completed");
        scheduleRender();
        return result;
      }
      if (endpointKey === "travelExecute") quote = null;
      restore("Committed");
      message = successMessage;
      const refreshed = await load({ force: true, preserveMessage: true });
      if (!refreshed) {
        state = "ready";
        message = `${successMessage} Refresh failed; the committed result will reconcile when connectivity returns.`;
        scheduleRender();
      }
      return result;
    } catch (error) {
      restore();
      const normalized = normalizeApiError(error);
      if (Number(normalized.status) === 401) {
        await terminal.refresh();
        return null;
      }
      const detail = stateMessage(normalized);
      setFormStatus(form, detail, true);
      message = detail;
      scheduleRender();
      return null;
    }
  }

  async function handleSubmit(event) {
    const form = event.target.closest?.("[data-world-form]");
    if (!form || !mount.contains(form)) return;
    event.preventDefault();
    if (!form.checkValidity()) {
      const invalid = form.querySelector(":invalid");
      setFormStatus(form, invalid?.validationMessage || "Complete the required World fields.", true);
      invalid?.focus();
      return;
    }
    const operation = form.dataset.worldForm;
    if (operation === "arrivalClass") {
      const answers = selectedAnswers(form);
      if (answers.length < 6) {
        setFormStatus(form, "Answer every Arrival Class question.", true);
        return;
      }
      await committedMutation("arrivalClass", { answers }, {}, form, "Arrival Class assignment committed.");
      return;
    }
    if (operation === "travelQuote") {
      const data = new FormData(form);
      await committedMutation("travelQuote", {
        toLocationId: data.get("toLocationId"),
        allowedModes: selectedModes(form),
      }, {}, form, "Travel quote created.");
      return;
    }
    if (operation === "travelExecute") {
      const data = new FormData(form);
      await committedMutation("travelExecute", { quoteId: data.get("quoteId") }, {}, form, "Travel departure committed.");
      return;
    }
    if (operation === "travelComplete") {
      const journeyId = form.dataset.journeyId || "";
      await committedMutation("travelComplete", { journeyId }, { journeyId }, form, "Travel arrival committed.");
      return;
    }
    if (operation === "residencyRequest") {
      const data = new FormData(form);
      await committedMutation("residencyRequest", {
        countryId: data.get("countryId"),
        expectedRevision: Number(data.get("expectedRevision")),
      }, {}, form, "Residency request committed for review.");
    }
  }

  function handleClick(event) {
    const action = event.target.closest?.("[data-world-action]");
    if (!action || !mount.contains(action)) return;
    if (action.dataset.worldAction === "retry" || action.dataset.worldAction === "refresh") {
      void load({ force: true });
    }
  }

  function handleConnectivity() {
    message = globalThis.navigator?.onLine === false
      ? "Offline. Cached World context remains available; mutations are disabled by the transport."
      : "Connection restored. Refresh to reconcile current World state.";
    scheduleRender();
  }

  const unsubscribe = terminal.subscribe((terminalState) => {
    if (!isWorldRoute(terminalState)) return;
    if (terminalState.data?.worldRuntime && !model) {
      model = terminalState.data.worldRuntime;
      state = "ready";
      updatedAt = Date.now();
    }
    scheduleRender();
    if (state === "idle") void load({ force: true });
  });
  mount.addEventListener("submit", handleSubmit);
  mount.addEventListener("click", handleClick);
  globalThis.addEventListener("online", handleConnectivity);
  globalThis.addEventListener("offline", handleConnectivity);
  const staleTimer = globalThis.setInterval(scheduleRender, 15_000);

  if (isWorldRoute(terminal.getState())) void load({ force: true });

  return Object.freeze({
    refresh: () => load({ force: true }),
    getState: () => Object.freeze({ model, quote, state, message, updatedAt }),
    destroy() {
      destroyed = true;
      requestVersion += 1;
      clearInterval(staleTimer);
      unsubscribe();
      mount.removeEventListener("submit", handleSubmit);
      mount.removeEventListener("click", handleClick);
      globalThis.removeEventListener("online", handleConnectivity);
      globalThis.removeEventListener("offline", handleConnectivity);
    },
  });
}
