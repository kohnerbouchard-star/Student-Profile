const PUBLIC_THREAD_ID = /^thr_[0-9a-f]{32}$/;
const UNREAD_THREAD = '[data-player-message-thread][data-player-message-unread="true"]';
const REPLY_CONTROL = "[data-player-message-send]";
const MESSAGE_SEND_FORM = 'form[data-endpoint="messageSend"]';
const COMMIT_EVENT = "econovaria:player-message-read-committed";
const COMMAND_TIMEOUT_MS = 60_000;
const COMMIT_POLL_MS = 50;

function boundedThreadId(value) {
  const threadId = String(value || "").trim().toLowerCase();
  return PUBLIC_THREAD_ID.test(threadId) ? threadId : "";
}

function publicThreadId(control) {
  return boundedThreadId(control?.dataset?.playerMessageThread);
}

function createCommandForm(mount, { endpointKey, commandName, threadId, fields = {} }) {
  const form = mount.ownerDocument.createElement("form");
  form.hidden = true;
  form.setAttribute("aria-hidden", "true");
  form.dataset.playerForm = commandName;
  form.dataset.endpoint = endpointKey;
  form.dataset.threadId = threadId;

  for (const [name, value] of Object.entries(fields)) {
    const input = mount.ownerDocument.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = String(value);
    form.append(input);
  }

  const submit = mount.ownerDocument.createElement("button");
  submit.type = "submit";
  submit.hidden = true;
  submit.tabIndex = -1;
  submit.setAttribute("aria-hidden", "true");

  form.append(submit);
  mount.append(form);
  return { form, submit };
}

export function installMessageIntentAdapter({ mount, drafts = null, runtime = globalThis }) {
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

  function submitCommand(command) {
    const { form, submit } = createCommandForm(mount, command);
    try {
      form.requestSubmit(submit);
    } finally {
      runtime.queueMicrotask(() => form.remove());
    }
  }

  function dispatchReplyIntent(event, target) {
    const control = target?.closest(REPLY_CONTROL);
    if (!(control instanceof HTMLButtonElement) || !mount.contains(control)) return false;
    if (control.disabled || control.getAttribute("aria-disabled") === "true") return true;
    const composer = control.closest(MESSAGE_SEND_FORM);
    if (!(composer instanceof HTMLFormElement)) return true;

    const threadId = boundedThreadId(composer.dataset.threadId);
    const visibleBody = String(composer.elements.namedItem("body")?.value || "").trim();
    const savedBody = typeof drafts?.value === "function" ? String(drafts.value(composer, "body") || "").trim() : "";
    const body = visibleBody || savedBody;
    if (!threadId || !body) return true;

    event.preventDefault();
    runtime.queueMicrotask(() => {
      if (destroyed) return;
      submitCommand({
        endpointKey: "messageSend",
        commandName: "message-send-command",
        threadId,
        fields: { body },
      });
    });
    return true;
  }

  function dispatchReadIntent(target) {
    const control = target?.closest(UNREAD_THREAD);
    if (!(control instanceof HTMLButtonElement) || !mount.contains(control)) return;
    if (control.disabled || control.getAttribute("aria-disabled") === "true") return;

    const threadId = publicThreadId(control);
    if (!threadId || pending.has(threadId)) return;

    const timeoutId = runtime.setTimeout(() => release(threadId), COMMAND_TIMEOUT_MS);
    pending.set(threadId, { timeoutId, pollId: 0 });
    control.setAttribute("aria-busy", "true");
    control.setAttribute("data-player-message-read-pending", "true");

    submitCommand({
      endpointKey: "messageRead",
      commandName: "message-read-command",
      threadId,
      fields: { threadId },
    });
    pollForCommit(threadId);
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
