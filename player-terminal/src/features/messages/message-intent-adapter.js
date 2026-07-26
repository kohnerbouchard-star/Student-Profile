const PUBLIC_THREAD_ID = /^thr_[0-9a-f]{32}$/;
const UNREAD_THREAD = '[data-player-message-thread][data-player-message-unread="true"]';
const REPLY_CONTROL = "[data-player-message-send]";
const MESSAGE_SEND_FORM = 'form[data-endpoint="messageSend"]';
const COMMIT_EVENT = "econovaria:player-message-read-committed";
const COMMAND_TIMEOUT_MS = 60_000;
const COMMIT_POLL_MS = 50;
const DIAGNOSTIC_DELAY_MS = 500;

function boundedThreadId(value) {
  const threadId = String(value || "").trim().toLowerCase();
  return PUBLIC_THREAD_ID.test(threadId) ? threadId : "";
}

function publicThreadId(control) {
  return boundedThreadId(control?.dataset?.playerMessageThread);
}

function createCommandForm(mount, { endpointKey, commandName, threadId, fields = {}, diagnosticId = "" }) {
  const form = mount.ownerDocument.createElement("form");
  form.hidden = true;
  form.setAttribute("aria-hidden", "true");
  form.dataset.playerForm = commandName;
  form.dataset.endpoint = endpointKey;
  form.dataset.threadId = threadId;
  if (diagnosticId) form.dataset.messageDiagnosticId = diagnosticId;

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
  const diagnostics = new Map();
  const diagnosticsEnabled = mount.id === "playerTerminal";
  let diagnosticSequence = 0;
  let destroyed = false;

  function completeDiagnostic(id) {
    const diagnostic = diagnostics.get(id);
    if (!diagnostic) return;
    runtime.clearTimeout(diagnostic.timerId);
    diagnostics.delete(id);
  }

  function beginDiagnostic(detail) {
    if (!diagnosticsEnabled) return "";
    const id = String(++diagnosticSequence);
    const diagnostic = {
      ...detail,
      submitObserved: false,
      apiDispatchObserved: false,
      timerId: 0,
    };
    diagnostic.timerId = runtime.setTimeout(() => {
      if (destroyed || !diagnostics.has(id)) return;
      console.error(
        `[Messaging command diagnostic] thread=${diagnostic.hasThreadId} visibleBody=${diagnostic.hasVisibleBody} savedBody=${diagnostic.hasSavedBody} body=${diagnostic.hasBody} submit=${diagnostic.submitObserved} api=${diagnostic.apiDispatchObserved}`,
      );
      diagnostics.delete(id);
    }, DIAGNOSTIC_DELAY_MS);
    diagnostics.set(id, diagnostic);
    return id;
  }

  function handleDiagnosticSubmit(event) {
    const form = event.target instanceof HTMLFormElement ? event.target : null;
    const id = form?.dataset?.messageDiagnosticId || "";
    const diagnostic = diagnostics.get(id);
    if (diagnostic) diagnostic.submitObserved = true;
  }

  function handleDiagnosticApiRequest(event) {
    if (event?.detail?.endpointKey !== "messageSend") return;
    const next = [...diagnostics.entries()].find(([, diagnostic]) => !diagnostic.apiDispatchObserved);
    if (!next) return;
    const [id, diagnostic] = next;
    diagnostic.apiDispatchObserved = true;
    completeDiagnostic(id);
  }

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
    const diagnosticId = beginDiagnostic({
      hasThreadId: Boolean(threadId),
      hasVisibleBody: Boolean(visibleBody),
      hasSavedBody: Boolean(savedBody),
      hasBody: Boolean(body),
    });
    if (!threadId || !body) return true;

    event.preventDefault();
    runtime.queueMicrotask(() => {
      if (destroyed) return;
      submitCommand({
        endpointKey: "messageSend",
        commandName: "message-send-command",
        threadId,
        fields: { body },
        diagnosticId,
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
  mount.addEventListener("submit", handleDiagnosticSubmit, true);
  mount.addEventListener("econovaria:player-api-request", handleDiagnosticApiRequest);

  return Object.freeze({
    destroy() {
      destroyed = true;
      mount.removeEventListener("click", handleClick, true);
      mount.removeEventListener("submit", handleDiagnosticSubmit, true);
      mount.removeEventListener("econovaria:player-api-request", handleDiagnosticApiRequest);
      for (const threadId of [...pending.keys()]) release(threadId);
      for (const id of [...diagnostics.keys()]) completeDiagnostic(id);
    },
  });
}
