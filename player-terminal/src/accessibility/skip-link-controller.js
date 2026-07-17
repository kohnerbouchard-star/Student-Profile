export function installSkipLinkController(mount) {
  if (!(mount instanceof HTMLElement)) return { destroy() {} };

  function handleClick(event) {
    const link = event.target.closest?.('a[href="#player-main-content"]');
    if (!link) return;
    const target = mount.querySelector("#player-main-content");
    if (!(target instanceof HTMLElement)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    target.focus({ preventScroll: false });
    target.scrollIntoView({ block: "start", inline: "nearest" });
  }

  mount.addEventListener("click", handleClick, true);
  return {
    destroy() {
      mount.removeEventListener("click", handleClick, true);
    }
  };
}
