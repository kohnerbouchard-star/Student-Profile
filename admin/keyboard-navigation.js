(function initEconovariaAdminKeyboardNavigation() {
  "use strict";

  const SECTION_SELECTOR = "[data-admin-section]";
  const ACTION_SELECTOR = "[data-admin-terminal-action]";
  const TAB_SELECTOR = '[role="tab"]';
  const EXCLUDED_ANCESTOR_SELECTOR = [
    "[hidden]",
    "[inert]",
    '[aria-hidden="true"]',
    '[data-admin-stale="true"]',
    "[data-admin-shape-skeleton-route]",
    "[data-admin-shape-skeleton-stage]",
    "[data-admin-shape-surface-overlay]",
    ".admin-qol-page-skeleton",
    ".admin-shape-skeleton-stage",
    ".admin-shape-surface-overlay",
  ].join(", ");
  const ACTIVATION_KEYS = new Set(["Enter", " ", "Spacebar"]);
  const EXPLICIT_NATIVE_ACTIONS = new Set([
    "contract-submission-accept",
    "contract-submission-reject",
    "contract-submission-confirm-decision",
    "contract-submission-cancel-decision",
  ]);
  const FORWARD_KEYS = new Set(["ArrowDown", "ArrowRight"]);
  const BACKWARD_KEYS = new Set(["ArrowUp", "ArrowLeft"]);
  const FOCUS_IDENTITY_ATTRIBUTES = Object.freeze([
    "data-admin-section",
    "data-admin-terminal-action",
    "data-modal-action",
    "data-admin-player-drawer-close",
    "id",
    "name",
  ]);
  let lastFocusIdentity = null;
  let focusRestoreScheduled = false;

  function excluded(element) {
    if (!(element instanceof HTMLElement)) return true;
    return Boolean(element.closest(EXCLUDED_ANCESTOR_SELECTOR));
  }

  function visible(element) {
    if (!(element instanceof HTMLElement) || excluded(element)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }

  function enabled(element) {
    if (!(element instanceof HTMLElement) || !visible(element)) return false;
    if (element.getAttribute("aria-disabled") === "true") return false;
    return !("disabled" in element && element.disabled === true);
  }

  function focusIdentity(element) {
    if (!(element instanceof HTMLElement)) return null;
    for (const attribute of FOCUS_IDENTITY_ATTRIBUTES) {
      const value = element.getAttribute(attribute);
      if (value) return Object.freeze({ attribute, value });
    }
    return null;
  }

  function resolveFocusIdentity(identity) {
    if (!identity) return null;
    const selector = `[${identity.attribute}="${CSS.escape(identity.value)}"]`;
    return [...document.querySelectorAll(selector)].find(enabled) || null;
  }

  function rememberFocusIdentity(event) {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const identity = focusIdentity(target);
    if (identity) lastFocusIdentity = identity;
  }

  function restoreFocusAfterMount() {
    if (focusRestoreScheduled || !lastFocusIdentity) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body && active.isConnected && visible(active)) return;
    focusRestoreScheduled = true;
    requestAnimationFrame(() => {
      focusRestoreScheduled = false;
      const current = document.activeElement;
      if (current instanceof HTMLElement && current !== document.body && current.isConnected && visible(current)) return;
      resolveFocusIdentity(lastFocusIdentity)?.focus({ preventScroll: true });
    });
  }

  function nativeInteractive(element) {
    if (!(element instanceof HTMLElement)) return false;
    if (["BUTTON", "INPUT", "SELECT", "TEXTAREA", "SUMMARY"].includes(element.tagName)) return true;
    return element.tagName === "A" && element.hasAttribute("href");
  }

  function markKeyboardModality() {
    document.documentElement.setAttribute("data-admin-input-modality", "keyboard");
  }

  function markPointerModality() {
    document.documentElement.setAttribute("data-admin-input-modality", "pointer");
  }

  function focusAt(elements, index) {
    if (!elements.length) return null;
    const normalized = (index + elements.length) % elements.length;
    const target = elements[normalized] || null;
    target?.focus?.({ preventScroll: true });
    return target;
  }

  function sectionControls() {
    return [...document.querySelectorAll(SECTION_SELECTOR)].filter(enabled);
  }

  function tabControls(tab) {
    const tablist = tab.closest('[role="tablist"]');
    const scope = tablist || tab.parentElement;
    if (!(scope instanceof Element)) return [];
    return [...scope.querySelectorAll(TAB_SELECTOR)].filter(enabled);
  }

  function moveWithin(elements, current, key, activateOnMove = false) {
    const index = elements.indexOf(current);
    if (index < 0 || !elements.length) return false;

    let target = null;
    if (key === "Home") target = focusAt(elements, 0);
    else if (key === "End") target = focusAt(elements, elements.length - 1);
    else if (FORWARD_KEYS.has(key)) target = focusAt(elements, index + 1);
    else if (BACKWARD_KEYS.has(key)) target = focusAt(elements, index - 1);
    else return false;

    if (activateOnMove && target) target.click();
    return true;
  }

  function activateNonNative(control, event) {
    if (!ACTIVATION_KEYS.has(event.key) || nativeInteractive(control) || !enabled(control)) return false;
    event.preventDefault();
    event.stopPropagation();
    control.click();
    return true;
  }

  function activateAction(control, event) {
    if (!ACTIVATION_KEYS.has(event.key) || !enabled(control)) return false;
    const actionName = control.getAttribute("data-admin-terminal-action") || "";
    if (nativeInteractive(control) && !EXPLICIT_NATIVE_ACTIONS.has(actionName)) return false;
    event.preventDefault();
    event.stopPropagation();
    control.click();
    return true;
  }

  function onKeyDown(event) {
    if (event.defaultPrevented) return;
    markKeyboardModality();

    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const section = target.closest(SECTION_SELECTOR);
    if (section instanceof HTMLElement && enabled(section)) {
      if (moveWithin(sectionControls(), section, event.key, false)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (activateNonNative(section, event)) return;
    }

    const tab = target.closest(TAB_SELECTOR);
    if (tab instanceof HTMLElement && enabled(tab)) {
      if (moveWithin(tabControls(tab), tab, event.key, true)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (activateNonNative(tab, event)) return;
    }

    const action = target.closest(ACTION_SELECTOR);
    if (action instanceof HTMLElement) activateAction(action, event);
  }

  document.addEventListener("focusin", rememberFocusIdentity, true);
  document.addEventListener("econovaria:admin-route-mounted", restoreFocusAfterMount);
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("pointerdown", markPointerModality, true);

  window.EconovariaAdminKeyboardNavigation = Object.freeze({
    excluded,
    visible,
    enabled,
    sectionControls,
    tabControls,
    moveWithin,
  });
})();
