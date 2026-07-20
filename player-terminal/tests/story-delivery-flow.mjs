import assert from "node:assert/strict";
import { resolvePlayerBackendRequest } from "../src/api/backend-routes.js";
import { normalizeWritePayload } from "../src/api/payload-normalizer.js";
import { validateStudentProfileCapabilityManifest } from "../src/integrations/student-profile-capability-manifest.js";

class FakeCustomEvent extends Event {
  constructor(type, options = {}) {
    super(type, options);
    this.detail = options.detail;
  }
}

class FakeElement extends EventTarget {
  constructor() {
    super();
    this.id = "";
    this.dataset = {};
    this.button = null;
    this.main = null;
  }
  closest(selector) {
    if (selector === "[data-player-story-action]") return this.button;
    if (selector === ".player-terminal-modal") return null;
    return null;
  }
  querySelector(selector) {
    return selector === "#player-main-content" ? this.main : null;
  }
}

globalThis.HTMLElement = FakeElement;
globalThis.CustomEvent = FakeCustomEvent;

const {
  installStoryDeliveryFlow,
  normalizeStoryDeliveryList,
} = await import("../src/features/notifications/story-delivery-flow.js");

const exactManifest = validateStudentProfileCapabilityManifest({
  schemaVersion: 1,
  manifestVersion: "2026-07-20.3",
  service: "classroom-api",
  capabilities: { routes: {}, actions: { storyDeliveryState: true } },
  endpoints: [
    { key: "storyDeliveries", operations: [{ method: "GET", pathTemplate: "/players/me/story-deliveries" }] },
    { key: "storyDeliveryState", operations: [{ method: "POST", pathTemplate: "/players/me/story-deliveries/:deliveryId/state" }] },
  ],
});
assert.equal(exactManifest.capabilities.actions.storyDeliveryState, true);

const DELIVERY_A = "ndl_00000000000000000000000000000001";
const DELIVERY_B = "ndl_00000000000000000000000000000002";
const NOTIFICATION_A = "ntf_00000000000000000000000000000001";
const NOTIFICATION_B = "ntf_00000000000000000000000000000002";
const NOW = "2026-07-20T03:00:00.000Z";

assert.deepEqual(
  resolvePlayerBackendRequest({
    endpointKey: "storyDeliveries", method: "GET", path: "/story-deliveries", payload: undefined, params: {}, session: {},
  }),
  { endpointKey: "storyDeliveries", method: "GET", path: "/players/me/story-deliveries", payload: undefined, provisional: { method: "GET", path: "/story-deliveries", payload: undefined } },
);
const exactStateRequest = resolvePlayerBackendRequest({
  endpointKey: "storyDeliveryState",
  method: "POST",
  path: `/story-deliveries/${DELIVERY_A}/state`,
  params: { deliveryId: DELIVERY_A },
  payload: normalizeWritePayload("storyDeliveryState", { action: "ACKNOWLEDGED", playerUuid: "must-drop" }),
  session: {},
});
assert.equal(exactStateRequest.path, `/players/me/story-deliveries/${DELIVERY_A}/state`);
assert.deepEqual(exactStateRequest.payload, { action: "acknowledged" });
assert.throws(() => resolvePlayerBackendRequest({
  endpointKey: "storyDeliveryState", method: "POST", path: "/story-deliveries/bad/state", params: { deliveryId: "bad" }, payload: { action: "seen" }, session: {},
}));

const normalized = normalizeStoryDeliveryList({
  items: [{
    deliveryId: DELIVERY_A,
    notificationId: NOTIFICATION_A,
    category: "../../admin",
    title: " Briefing ",
    summary: "Update",
    priority: "not-a-priority",
    displayMode: "modal_immediate",
    publishedAt: NOW,
    deliveredAt: NOW,
    seenAt: null,
    acknowledgedAt: null,
    requiresAcknowledgement: true,
    content: {
      videoAssetKey: "cutscene-1",
      posterAssetKey: "poster-1",
      tone: "briefing",
      act: 1,
      sequence: 2,
      rawPayload: { playerUuid: "00000000-0000-4000-8000-000000000021" },
    },
    playerUuid: "00000000-0000-4000-8000-000000000021",
  }],
});
assert.equal(normalized.length, 1);
assert.equal(normalized[0].category, "story");
assert.equal(normalized[0].priority, "normal");
assert.equal("playerUuid" in normalized[0], false);
assert.equal("rawPayload" in normalized[0].content, false);
assert.throws(() => normalizeStoryDeliveryList({ items: "not-an-array" }));
assert.equal(normalizeStoryDeliveryList({ items: [{ deliveryId: "bad" }] }).length, 0);

function item({ deliveryId, notificationId, required }) {
  return {
    deliveryId,
    notificationId,
    category: "story",
    title: required ? "Required briefing" : "Optional briefing",
    summary: "Conditions changed.",
    priority: "major",
    displayMode: "modal_on_next_login",
    publishedAt: NOW,
    deliveredAt: NOW,
    seenAt: null,
    acknowledgedAt: null,
    requiresAcknowledgement: required,
    content: { videoAssetKey: "cutscene-1", posterAssetKey: null, tone: "briefing", act: 1, sequence: 1 },
  };
}

function terminalHarness() {
  const subscribers = new Set();
  const state = {
    status: "ready",
    data: {
      capabilities: { actions: { storyDeliveryState: true } },
      session: { gameSessionId: "00000000-0000-4000-8000-000000000001" },
    },
    modal: null,
  };
  const opens = [];
  const toasts = [];
  return {
    state,
    opens,
    toasts,
    getState: () => state,
    subscribe(callback) { subscribers.add(callback); return () => subscribers.delete(callback); },
    openModal(modal, opener = null) { state.modal = modal; opens.push({ modal, opener }); },
    closeModal() { state.modal = null; },
    showToast(message, tone) { toasts.push({ message, tone }); },
  };
}

function runtimeHarness(activeElement) {
  const runtime = new EventTarget();
  runtime.CustomEvent = FakeCustomEvent;
  runtime.document = { activeElement };
  return runtime;
}

function waitFor(predicate, message) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (predicate()) { clearInterval(timer); resolve(); }
      else if (Date.now() - started > 1500) { clearInterval(timer); reject(new Error(message)); }
    }, 5);
  });
}

const mount = new FakeElement();
mount.main = new FakeElement();
mount.main.id = "player-main-content";
const terminal = terminalHarness();
const runtime = runtimeHarness(mount.main);
const writes = [];
const api = {
  setSession() {},
  async request() {
    return { items: [
      item({ deliveryId: DELIVERY_A, notificationId: NOTIFICATION_A, required: true }),
      item({ deliveryId: DELIVERY_B, notificationId: NOTIFICATION_B, required: false }),
    ] };
  },
  async execute(_key, payload, params) {
    writes.push({ action: payload.action, deliveryId: params.deliveryId });
    return { result: {
      ok: true,
      action: payload.action,
      delivery: {
        deliveryId: params.deliveryId,
        notificationId: params.deliveryId === DELIVERY_A ? NOTIFICATION_A : NOTIFICATION_B,
        deliveredAt: NOW,
        seenAt: NOW,
        dismissedAt: payload.action === "dismissed" ? NOW : null,
        acknowledgedAt: payload.action === "acknowledged" ? NOW : null,
        requiresAcknowledgement: params.deliveryId === DELIVERY_A,
      },
    } };
  },
};
const config = {
  usePreviewData: false,
  playerSessionToken: "session-token",
  playerSessionId: "session-public-id",
  gameSessionId: "00000000-0000-4000-8000-000000000001",
  sessionInvalidEvent: "test-session-invalid",
};
const controller = installStoryDeliveryFlow({ mount, terminal, config, api, runtime });
await waitFor(() => writes.some((entry) => entry.action === "seen" && entry.deliveryId === DELIVERY_A), "required delivery was not marked seen");
assert.equal(terminal.state.modal.delivery.deliveryId, DELIVERY_A);
assert.equal(terminal.opens[0].opener, mount.main);

mount.dispatchEvent(new FakeCustomEvent("econovaria:player-story-close-request", {
  detail: { deliveryId: DELIVERY_A, requiresAcknowledgement: true },
}));
assert.match(terminal.state.modal.error, /Acknowledge/);
assert.equal(writes.some((entry) => entry.action === "dismissed" && entry.deliveryId === DELIVERY_A), false);

mount.button = { dataset: { playerStoryAction: "acknowledged" } };
mount.dispatchEvent(new Event("click"));
await waitFor(() => writes.some((entry) => entry.action === "acknowledged" && entry.deliveryId === DELIVERY_A), "required delivery was not acknowledged");
await waitFor(() => writes.some((entry) => entry.action === "seen" && entry.deliveryId === DELIVERY_B), "optional delivery was not marked seen");
assert.equal(terminal.state.modal.delivery.deliveryId, DELIVERY_B);

mount.dispatchEvent(new FakeCustomEvent("econovaria:player-story-close-request", {
  detail: { deliveryId: DELIVERY_B, requiresAcknowledgement: false },
}));
await waitFor(() => writes.some((entry) => entry.action === "dismissed" && entry.deliveryId === DELIVERY_B), "optional delivery was not dismissed");
await waitFor(() => terminal.state.modal === null, "story modal did not close after committed dismissal");
controller.destroy();

const invalidMount = new FakeElement();
invalidMount.main = new FakeElement();
const invalidTerminal = terminalHarness();
const invalidRuntime = runtimeHarness(invalidMount.main);
let invalidDetail = null;
invalidRuntime.addEventListener("test-session-invalid", (event) => { invalidDetail = event.detail; });
installStoryDeliveryFlow({
  mount: invalidMount,
  terminal: invalidTerminal,
  config,
  runtime: invalidRuntime,
  api: {
    setSession() {},
    async request() { throw Object.assign(new Error("expired"), { status: 401, code: "player_session_expired" }); },
  },
});
await waitFor(() => invalidDetail !== null, "session expiry was not dispatched");
assert.equal(invalidDetail.code, "player_session_expired");
assert.equal(invalidTerminal.state.modal, null);

const source = await import("node:fs").then((fs) => fs.readFileSync(new URL("../src/features/notifications/story-delivery-flow.js", import.meta.url), "utf8"));
assert.doesNotMatch(source, /innerHTML\s*=\s*JSON\.stringify/);
assert.doesNotMatch(source, /\bplayerUuid\b|\bgameId\b/);
assert.match(source, /api\.execute\("storyDeliveryState"/);
assert.match(source, /normalizeCommittedState/);
console.log("story delivery flow checks passed");
