const PUBLIC_THREAD_ID = /^thr_[0-9a-f]{32}$/;
const UNREAD_THREAD = '[data-player-message-thread][data-player-message-unread="true"]';
const REPLY_CONTROL = "[data-player-message-send]";
const MESSAGE_SEND_FORM = 'form[data-endpoint="messageSend"]';
const COMMIT_EVENT = "econovaria:player-message-read-committed";
const COMMAND_TIMEOUT_MS = 60_000;
const COMMIT_POLL_MS = 50;

function publicThreadId(control) {
  const value = String(control?.dataset?.playerMessageThread || "").trim().toLowerCase();
  return PUBLIC_THREAD_ID.test(value) ? value : "";
}

function createReadCommandForm(mount, threadId) {
  const form = mount.ownerDocument.createElement("form");
  form.hidden = true;
  form.setAttribute("aria-hidden", "true");
  form.dataset.playerForm = "message-read-command";
  form.dataset.endpoint = "messageRead";
  form.dataset.threadId = threadId;

  const input = mount.ownerDocument.createElement("input");
  input.type = "hidden";
  input.name = "threadId";
  input.value = threadId;

  const submit = mount.ownerDocument.createElement("button");
  submit.type = "submit";
  submit.hidden = true;
  submit.tabIndex = -1;
  submit.setAttribute("aria-hidden", "true");

  form.append(input, submit);
  mount.append(form);
  return { form, submit };
}

export function installMessageIntentAdapter({ mount, runtime = globalThis }) {
  if (!(mount instanceof HTMLElement)) return Object.freeze({ destroy() {} });

  const pending = new Map();
  let destroyed = false;

  function release(threadId) {
    const state = pending.get(threadId);
    if (!state) return;
    pending.delete(threadId);
    runtime.clearTimeout(state.timeoutId);
    runtime.clearTimeout(state.pollId);
    const current = mount.querySelector(`[data-player-message-thread="${CSS.escape(threadId)}"]`);
    current?.removeAttribute("aria-busy");
    current?.removeAttribute("data-player-message-read-pending");
  }

  function pollForCommit(threadId) {
    if (destroyed || !pending.has(threadId)) return;
    const current = mount.querySelector(`[data-player-message-thread="${CSS.escape(threadId)}"]`);
    if (current && !current.matches(UNREAD_THREAD)) {
      mount.dispatchEvent(new CustomEvent(COMMIT_EVENT, {
        bubbles: true,
        detail: Object.freeze({ threadId, mode: "opened" }),
      }));
      release(threadId);
      return;
    }
    const state = pending.get(threadId);
    if (state) state.pollId = runtime.setTimeout(() => pollForCommit(threadId), COMMIT_POLL_MS);
  }

  function dispatchReplyIntent(event, target) {
    const control = target?.closest(REPLY_CONTROL);
    if (!(control instanceof HTMLButtonElement) || !mount.contains(control)) return false;
    if (control.disabled || control.getAttribute("aria-disabled") === "true") return true;
    const form = control.closest(MESSAGE_SEND_FORM);
    if (!(form instanceof HTMLFormElement)) return true;

    event.preventDefault();
    runtime.queueMicrotask(() => {
      if (!destroyed && form.isConnected && control.isConnected) form.requestSubmit(control);
    });
    return true;
  }

  function dispatchReadIntent(target) {
    const control = target?.closest(UNREAD_THREAD);
    if (!(control instanceof HTMLButtonElement) || !mount.contains(control)) return;
    if (control.disabled || control.getAttribute("aria-disabled") === "true") return;

    const threadId = publicThreadId(control);
    if (!threadId || pending.has(threadId)) return;

    const { form, submit } = createReadCommandForm(mount, threadId);
    const timeoutId = runtime.setTimeout(() => release(threadId), COMMAND_TIMEOUT_MS);
    pending.set(threadId, { timeoutId, pollId: 0 });
    control.setAttribute("aria-busy", "true");
    control.setAttribute("data-player-message-read-pending", "true");

    try {
      form.requestSubmit(submit);
      pollForCommit(threadId);
    } finally {
      runtime.queueMicrotask(() => form.remove());
    }
  }

  function handleClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (dispatchReplyIntent(event, target)) return;
    dispatchReadIntent(target);
  }

  mount.addEventListener("click", handleClick, true);

  return Object.freeze({
    destroy() {
      destroyed = true;
      mount.removeEventListener("click", handleClick, true);
      for (const threadId of [...pending.keys()]) release(threadId);
    },
  });
}
