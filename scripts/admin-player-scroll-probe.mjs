// Browser-only observation for the Add Player scroll smoke. No runtime hooks,
// focus writes, scroll repair, or DOM markers are installed by this probe.
export async function createPlayerScrollProbe(page) {
  const observation = await page.evaluateHandle(() => {
    const selectors = {
      modal: ".admin-terminal-modal.is-player-modal",
      root: "[data-admin-terminal-player-console]",
      pane: ".admin-terminal-player-main",
      input: "[data-admin-terminal-player-display-name]",
    };
    const ids = new WeakMap();
    let nextId = 1;
    const id = node => {
      if (!node) return null;
      if (!ids.has(node)) ids.set(node, nextId++);
      return ids.get(node);
    };
    const read = () => {
      const modals = document.querySelectorAll(selectors.modal);
      const modal = modals.length === 1 ? modals[0] : null;
      const roots = modal?.querySelectorAll(selectors.root) || [];
      const root = roots.length === 1 ? roots[0] : null;
      const panes = root?.querySelectorAll(selectors.pane) || [];
      const pane = panes.length === 1 ? panes[0] : null;
      const inputs = pane?.querySelectorAll(selectors.input) || [];
      const input = inputs.length === 1 ? inputs[0] : null;
      return { modal, root, pane, input, counts: {
        modal: modals.length, root: roots.length, pane: panes.length, input: inputs.length,
      } };
    };
    const keys = ["modal", "root", "pane", "input"];
    const valid = surface => keys.every(key => surface[key]?.isConnected) &&
      surface.root.dataset.controlsBound === "true" &&
      [surface.modal, surface.pane, surface.input].every(node => node.getClientRects().length > 0);
    const same = (left, right) => keys.every(key => left?.[key] === right?.[key]);
    const geometry = node => {
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return {
        id: id(node), connected: node.isConnected,
        top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
        width: rect.width, height: rect.height,
        clientHeight: node.clientHeight, scrollHeight: node.scrollHeight, scrollTop: node.scrollTop,
        overflowY: getComputedStyle(node).overflowY,
      };
    };
    return {
      candidate: null, readyCandidate: null, filler: null,
      poll() {
        const current = read();
        if (!valid(current)) { this.candidate = null; return false; }
        if (!same(this.candidate, current)) {
          const candidate = { ...current, frameCompleted: false };
          this.candidate = candidate;
          // Binding queues the runtime's initial focus before this observation.
          // A synchronous later poll must still see this exact surface focused.
          window.requestAnimationFrame(() => { candidate.frameCompleted = true; });
          return false;
        }
        if (!this.candidate.frameCompleted || document.activeElement !== current.input) return false;
        this.readyCandidate = this.candidate;
        return true;
      },
      pane() {
        const current = read();
        if (!valid(current) || !same(this.readyCandidate, current) ||
            !this.readyCandidate?.frameCompleted || document.activeElement !== current.input) {
          throw new Error("Add Player surface changed after readiness.");
        }
        return current.pane;
      },
      snapshot() {
        const current = read();
        const observed = this.readyCandidate || this.candidate;
        const pane = observed?.pane;
        const fillers = pane?.querySelectorAll("[data-admin-scroll-test-filler]") || [];
        if (!this.filler && fillers.length === 1) this.filler = fillers[0];
        return {
          counts: current.counts,
          current: Object.fromEntries(keys.map(key => [key, geometry(current[key])])),
          observed: Object.fromEntries(keys.map(key => [key, geometry(observed?.[key])])),
          sameNodes: Object.fromEntries(keys.map(key => [key, Boolean(observed?.[key]) && observed[key] === current[key]])),
          bound: current.root?.dataset.controlsBound === "true",
          frameCompleted: observed?.frameCompleted ?? false,
          focus: { id: id(document.activeElement), isCurrentInput: Boolean(current.input) && document.activeElement === current.input,
            isObservedInput: Boolean(observed?.input) && document.activeElement === observed.input },
          filler: { count: fillers.length, id: id(this.filler), connected: this.filler?.isConnected ?? false,
            retained: Boolean(this.filler) && fillers.length === 1 && fillers[0] === this.filler,
            parentIsObservedPane: Boolean(this.filler) && this.filler.parentElement === pane },
          windowScrollY: window.scrollY,
          documentScrollTop: document.scrollingElement?.scrollTop ?? null,
        };
      },
    };
  });
  return {
    observation,
    async waitUntilReady(timeoutMs = 5000) {
      // Playwright tests predicate truthiness before Promise resolution. Keep
      // this predicate synchronous, with the frame inside the same deadline.
      const ready = await page.waitForFunction(state => state.poll(), observation, { timeout: timeoutMs });
      await ready.dispose();
    },
    pane: () => observation.evaluateHandle(state => state.pane()),
    capture: () => observation.evaluate(state => state.snapshot()),
    dispose: () => observation.dispose(),
  };
}

// Share only the observer's readiness checks with the operational focus smoke.
// Revalidate the exact surface and natural focus before boundary positioning.
export async function waitForPlayerCreateReady(page) {
  const probe = await createPlayerScrollProbe(page);
  try {
    await probe.waitUntilReady();
    await probe.observation.evaluate(state => { state.pane(); });
  } finally {
    await probe.dispose();
  }
}
