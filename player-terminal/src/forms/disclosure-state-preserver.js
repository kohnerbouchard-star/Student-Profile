function disclosureKey(details) {
  if (!(details instanceof HTMLDetailsElement)) return "";
  const explicit = String(details.dataset.playerDisclosure || "").trim();
  if (explicit) return `disclosure:${explicit}`;
  const endpoint = String(details.querySelector("form[data-endpoint]")?.dataset.endpoint || "").trim();
  return endpoint ? `endpoint:${endpoint}` : "";
}

function detailsWithin(node) {
  if (!(node instanceof Element)) return [];
  const output = [];
  if (node instanceof HTMLDetailsElement) output.push(node);
  output.push(...node.querySelectorAll("details"));
  return output;
}

export function installDisclosureStatePreserver(mount) {
  if (!(mount instanceof HTMLElement)) throw new TypeError("Disclosure state preservation requires the Player terminal mount.");

  const states = new Map();

  function remember(details) {
    const key = disclosureKey(details);
    if (!key) return;
    states.set(key, details.open === true);
  }

  function restore(details) {
    const key = disclosureKey(details);
    if (!key) return;
    if (states.has(key)) details.open = states.get(key) === true;
    else states.set(key, details.open === true);
  }

  function handleToggle(event) {
    if (event.target instanceof HTMLDetailsElement && mount.contains(event.target)) remember(event.target);
  }

  mount.addEventListener("toggle", handleToggle, true);

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.removedNodes) {
        for (const details of detailsWithin(node)) remember(details);
      }
    }
    for (const record of records) {
      for (const node of record.addedNodes) {
        for (const details of detailsWithin(node)) restore(details);
      }
    }
  });
  observer.observe(mount, { childList: true, subtree: true });

  for (const details of mount.querySelectorAll("details")) restore(details);

  return {
    destroy() {
      observer.disconnect();
      mount.removeEventListener("toggle", handleToggle, true);
      states.clear();
    },
  };
}
