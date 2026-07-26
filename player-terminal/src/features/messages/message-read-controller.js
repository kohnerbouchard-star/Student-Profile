const MESSAGE_READ_FORM = 'form[data-endpoint="messageRead"]';
const MESSAGE_THREAD_CONTROL = "[data-player-message-thread]";
const PUBLIC_THREAD_ID = /^thr_[0-9a-f]{32}$/;
const RESELECT_TIMEOUT_MS = 15_000;

let pendingThreadId = "";
let pendingForm = null;
let observer = null;
let timeoutId = 0;

function clearPendingSelection({ releaseForm = false } = {}) {
  if (releaseForm && pendingForm?.isConnected) {
    delete pendingForm.dataset.messageReadSubmitting;
    pendingForm.querySelector('button[type="submit"]')?.removeAttribute("aria-busy");
  }
  pendingThreadId = "";
  pendingForm = null;
  observer?.disconnect();
  observer = null;
  if (timeoutId) globalThis.clearTimeout(timeoutId);
  timeoutId = 0;
}

function visible(element) {
  if (!(element instanceof HTMLElement) || element.hidden) return false;
  const style = globalThis.getComputedStyle?.(element);
  const rect = element.getBoundingClientRect();
  return (!style || (style.display !== "none" && style.visibility !== "hidden")) && rect.width > 0 && rect.height > 0;
}

function selectCommittedThread() {
  if (!pendingThreadId) return false;
  const control = document.querySelector(
    `${MESSAGE_THREAD_CONTROL}[data-player-message-thread="${CSS.escape(pendingThreadId)}"]`,
  );
  if (!(control instanceof HTMLElement) || !visible(control)) return false;
  if (control.closest(MESSAGE_READ_FORM)) return false;
  const threadId = pendingThreadId;
  clearPendingSelection();
  control.dispatchEvent(new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    composed: true,
  }));
  document.dispatchEvent(new CustomEvent("econovaria:player-message-read-committed", {
    detail: Object.freeze({ threadId }),
  }));
  return true;
}

function watchForCommittedThread(threadId, form) {
  clearPendingSelection({ releaseForm: true });
  pendingThreadId = threadId;
  pendingForm = form;
  observer = new MutationObserver(() => {
    selectCommittedThread();
  });
  observer.observe(document.getElementById("playerTerminal") || document.body, {
    childList: true,
    subtree: true,
  });
  timeoutId = globalThis.setTimeout(() => {
    clearPendingSelection({ releaseForm: true });
  }, RESELECT_TIMEOUT_MS);
  queueMicrotask(selectCommittedThread);
}

function dispatchReadSubmission(form, control) {
  const SubmitEventConstructor = globalThis.SubmitEvent || Event;
  return form.dispatchEvent(new SubmitEventConstructor("submit", {
    bubbles: true,
    cancelable: true,
    composed: true,
    submitter: control,
  }));
}

function handleUnreadThreadClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  const control = target?.closest(MESSAGE_THREAD_CONTROL);
  const form = control?.closest(MESSAGE_READ_FORM);
  if (!(control instanceof HTMLButtonElement) || !(form instanceof HTMLFormElement)) return;

  const threadId = String(
    control.dataset.playerMessageThread ||
      form.elements.namedItem("threadId")?.value ||
      "",
  ).trim().toLowerCase();
  if (!PUBLIC_THREAD_ID.test(threadId)) return;
  if (form.dataset.messageReadSubmitting === "true") {
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  form.dataset.messageReadSubmitting = "true";
  control.setAttribute("aria-busy", "true");
  watchForCommittedThread(threadId, form);
  dispatchReadSubmission(form, control);
}

document.addEventListener("click", handleUnreadThreadClick, true);

export function destroyMessageReadController() {
  document.removeEventListener("click", handleUnreadThreadClick, true);
  clearPendingSelection({ releaseForm: true });
}
