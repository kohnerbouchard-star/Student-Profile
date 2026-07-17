export function setButtonProcessing(button, label = "Processing") {
  if (!(button instanceof HTMLButtonElement)) return () => {};
  const previousHtml = button.innerHTML;
  const previousDisabled = button.disabled;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.classList.add("is-processing");
  button.innerHTML = `<span class="player-terminal-button-spinner" aria-hidden="true"></span><span>${label}</span>`;

  return (finalLabel = "") => {
    button.classList.remove("is-processing");
    button.removeAttribute("aria-busy");
    button.disabled = previousDisabled;
    button.innerHTML = finalLabel || previousHtml;
  };
}

export function focusFirstInteractive(root) {
  requestAnimationFrame(() => {
    root?.querySelector("button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])")?.focus();
  });
}
