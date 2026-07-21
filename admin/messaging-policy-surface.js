import { createMessagingPolicyClient } from "./messaging-policy-client.js";

const MARKER = "data-admin-messaging-policy";
let mountedGameId = "";
let loading = false;

function text(value) { return String(value ?? "").trim(); }
function gameId() {
  const preview = document.getElementById("adminPreview");
  const values = [
    preview?.dataset?.gameId,
    document.documentElement.dataset.gameId,
    document.body.dataset.gameId,
    window.__ADMIN_ACTIVE_GAME_ID__,
    window.adminRuntime?.activeGame?.id,
    window.adminRuntime?.game?.id,
    window.__ADMIN_BOOTSTRAP__?.activeGame?.id,
    window.sessionStorage?.getItem?.("econovaria.admin.selected-game.v1"),
  ];
  return values.map(text).find(Boolean) || "";
}

function policyElement() {
  return document.querySelector(`[${MARKER}]`);
}

function renderState(element, policy, error = "") {
  const status = element.querySelector("[data-message-policy-status]");
  status.textContent = error || (policy.updatedAt
    ? `Policy updated ${new Date(policy.updatedAt).toLocaleString()}. Attachments remain disabled.`
    : "Default Messaging policy loaded. Attachments remain disabled.");
  status.dataset.tone = error ? "error" : "ready";
  element.querySelector("[name='playerThreadsEnabled']").checked = policy.playerThreadsEnabled;
  element.querySelector("[name='defaultRetentionDays']").value = String(policy.defaultRetentionDays);
  element.querySelector("[data-message-policy-max]").textContent = String(policy.maxParticipants);
}

async function load(element, client) {
  if (loading) return;
  loading = true;
  element.querySelector("button[type='submit']").disabled = true;
  try {
    renderState(element, await client.read());
  } catch (error) {
    renderState(element, {
      playerThreadsEnabled: false,
      defaultRetentionDays: 365,
      maxParticipants: 2,
      attachmentsEnabled: false,
      updatedAt: null,
    }, error?.message || "Messaging policy could not be loaded.");
  } finally {
    loading = false;
    element.querySelector("button[type='submit']").disabled = false;
  }
}

async function save(event, client) {
  event.preventDefault();
  if (loading) return;
  const form = event.currentTarget;
  const submit = form.querySelector("button[type='submit']");
  const status = form.querySelector("[data-message-policy-status]");
  loading = true;
  submit.disabled = true;
  submit.textContent = "Saving…";
  try {
    const policy = await client.update({
      playerThreadsEnabled: form.elements.playerThreadsEnabled.checked,
      defaultRetentionDays: Number(form.elements.defaultRetentionDays.value),
    });
    renderState(form.closest(`[${MARKER}]`), policy);
  } catch (error) {
    status.textContent = error?.message || "Messaging policy could not be saved.";
    status.dataset.tone = "error";
  } finally {
    loading = false;
    submit.disabled = false;
    submit.textContent = "Save policy";
  }
}

function mount() {
  const id = gameId();
  const panel = document.querySelector("#adminMessagingModerationRoot .admin-message-moderation-panel");
  if (!id || !panel) return false;
  if (policyElement() && mountedGameId === id) return true;
  policyElement()?.remove();
  mountedGameId = id;
  const client = createMessagingPolicyClient(id);
  const details = document.createElement("details");
  details.setAttribute(MARKER, "");
  details.className = "admin-message-policy";
  details.innerHTML = `<summary>Messaging policy</summary>
    <form data-message-policy-form>
      <label class="admin-message-check"><input type="checkbox" name="playerThreadsEnabled"> <span>Allow Players to start same-game threads</span></label>
      <label><span>Default retention days</span><input type="number" name="defaultRetentionDays" min="1" max="730" step="1" required></label>
      <p>Player-created threads support at most <strong data-message-policy-max>2</strong> participants. Attachments are disabled.</p>
      <p role="status" aria-live="polite" data-message-policy-status></p>
      <button type="submit" class="admin-message-primary">Save policy</button>
    </form>`;
  details.querySelector("form").addEventListener("submit", (event) => save(event, client));
  panel.querySelector(".admin-message-moderation-list")?.before(details);
  void load(details, client);
  return true;
}

function schedule() {
  for (const delay of [0, 80, 180, 360, 720]) setTimeout(mount, delay);
}

document.addEventListener("econovaria:admin-route-mounted", schedule);
document.addEventListener("click", (event) => {
  if (event.target.closest("[data-admin-section]")) schedule();
});
window.addEventListener("popstate", schedule);
window.addEventListener("hashchange", schedule);
schedule();
