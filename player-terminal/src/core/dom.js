function replaceButtonContents(button, label, includeSpinner = false) {
  button.replaceChildren();
  if (includeSpinner) {
    const spinner = document.createElement("span");
    spinner.className = "player-terminal-button-spinner";
    spinner.setAttribute("aria-hidden", "true");
    button.append(spinner);
  }
  const text = document.createElement("span");
  text.textContent = String(label || "");
  button.append(text);
}

export function setButtonProcessing(button, label = "Processing") {
  if (!(button instanceof HTMLButtonElement)) return () => {};
  const previousNodes = [...button.childNodes].map((node) => node.cloneNode(true));
  const previousDisabled = button.disabled;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.classList.add("is-processing");
  replaceButtonContents(button, label, true);

  return (finalLabel = "") => {
    button.classList.remove("is-processing");
    button.removeAttribute("aria-busy");
    button.disabled = previousDisabled;
    if (finalLabel) replaceButtonContents(button, finalLabel);
    else button.replaceChildren(...previousNodes.map((node) => node.cloneNode(true)));
  };
}

export function focusFirstInteractive(root) {
  requestAnimationFrame(() => {
    root?.querySelector("button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])")?.focus();
  });
}
