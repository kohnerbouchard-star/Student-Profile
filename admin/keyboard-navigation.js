(function initEconovariaAdminKeyboardNavigation() {
  "use strict";

  const SECTION_SELECTOR = "[data-admin-section]";
  const ACTION_SELECTOR = "[data-admin-terminal-action]";
  const TAB_SELECTOR = '[role="tab"]';
  const ACTIVATION_KEYS = new Set(["Enter", " ", "Spacebar"]);
  const FORWARD_KEYS = new Set(["ArrowDown", "ArrowRight"]);
  const BACKWARD_KEYS = new Set(["ArrowUp", "ArrowLeft"]);

  function visible(element) {
    if (!(element instanceof HTMLElement) || element.hidden) return false;
    if (element.getAttribute("aria-hidden") === "true") return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }

  function enabled(element) {
    if (!(element instanceof HTMLElement) || !visible(element)) return false;
    if (element.getAttribute("aria-disabled") === "true") return false;
    return !("disabled" in element && element.disabled === true);
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
    if (action instanceof HTMLElement) activateNonNative(action, event);
  }

  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("pointerdown", markPointerModality, true);

  window.EconovariaAdminKeyboardNavigation = Object.freeze({
    sectionControls,
    tabControls,
    moveWithin,
  });
})();
