window.createSettingsPresentation = function createSettingsPresentation(ownerScope) {
  "use strict";

  const {
    rewriteSection, setText, concealAutomaticAttendancePolicyControls, ensureAttendanceExample, text,
    state, schedulePresentation,
  } = ownerScope;


  function placeInStableOrder(parent, nodes) {
    let cursor = parent.firstElementChild;
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue;
      if (node.parentElement !== parent || node !== cursor) parent.insertBefore(node, cursor);
      cursor = node.nextElementSibling;
    }
  }

  function putCardsInLinearOrder(page) {
    const grid = page.querySelector(".admin-terminal-settings-tuning-grid");
    const money = page.querySelector(".admin-terminal-settings-tuning-card.is-money");
    const attendance = page.querySelector("[data-admin-attendance-reward-settings]");
    const events = page.querySelector(".admin-terminal-settings-tuning-card.is-events");
    const safety = page.querySelector(".admin-terminal-settings-tuning-card.is-safety");
    if (!(grid instanceof HTMLElement) || !(money instanceof HTMLElement) ||
        !(attendance instanceof HTMLElement) || !(events instanceof HTMLElement) ||
        !(safety instanceof HTMLElement)) {
      return null;
    }

    rewriteSection(money, "Economy", "Prices, earnings, and taxation");
    rewriteSection(
      attendance,
      "Attendance rewards",
      "Base amounts using the global Income Modifier and each player's country currency",
    );
    rewriteSection(events, "Simulation events", "Frequency, severity, and direction");
    rewriteSection(safety, "Recovery and rollout", "Support strength and change pacing");

    setText(
      attendance.querySelector('[data-attendance-reward-field="presentRewardAmount"]')
        ?.closest("label")?.querySelector("small"),
      "Base amount awarded for an on-time attendance scan.",
    );
    setText(
      attendance.querySelector('[data-attendance-reward-field="lateRewardAmount"]')
        ?.closest("label")?.querySelector("small"),
      "Set this to 0.00 when late arrivals should not receive a reward.",
    );

    concealAutomaticAttendancePolicyControls(attendance);
    const formula = ensureAttendanceExample(grid, attendance, page);
    placeInStableOrder(grid, [money, attendance, formula, events, safety]);

    const group = page.querySelector("[data-settings-economy-group]");
    if (group instanceof HTMLElement && !group.contains(money) && !group.contains(attendance)) {
      group.remove();
    }

    return { grid, money, attendance, events, safety, formula };
  }

  function controlValue(control) {
    if (control instanceof HTMLSelectElement) {
      return text(control.selectedOptions[0]?.textContent || control.value);
    }
    if (control instanceof HTMLInputElement) {
      const numeric = Number(control.value);
      if (control.type === "number" && Number.isFinite(numeric)) return numeric.toFixed(2);
      return text(control.value);
    }
    return "";
  }

  function cardSummary(card) {
    if (!(card instanceof HTMLElement)) return [];
    return [...card.querySelectorAll(".admin-terminal-settings-field")]
      .map((field) => {
        if (field.closest(".admin-terminal-settings-change-tile")?.hidden) return null;
        const label = text(field.querySelector(":scope > span")?.textContent);
        const value = controlValue(field.querySelector("input, select"));
        return label && value ? `${label} ${value}` : null;
      })
      .filter(Boolean);
  }

  function ensureConfigurationSummary(page, cards) {
    const strip = page.querySelector(".admin-terminal-settings-control-strip");
    if (!(strip instanceof HTMLElement) || !cards) return null;

    let summary = strip.querySelector("[data-settings-config-summary]");
    if (!(summary instanceof HTMLElement)) {
      summary = document.createElement("section");
      summary.className = "admin-terminal-settings-config-summary";
      summary.dataset.settingsConfigSummary = "true";
      summary.setAttribute("role", "status");
      summary.setAttribute("aria-atomic", "true");
      summary.innerHTML = `
        <header>
          <div><span>Current configuration</span><strong>Review the active rules before editing</strong></div>
          <small>Preset values update immediately; they are not permanent until saved.</small>
        </header>
        <div class="admin-terminal-settings-summary-list">
          <div data-settings-summary="economy"><strong>Economy</strong><span>—</span></div>
          <div data-settings-summary="attendance"><strong>Attendance</strong><span>—</span></div>
          <div data-settings-summary="events"><strong>Events</strong><span>—</span></div>
          <div data-settings-summary="recovery"><strong>Recovery</strong><span>—</span></div>
        </div>`;
      strip.append(summary);
    }
    updateConfigurationSummary(summary, cards);
    return summary;
  }

  function updateConfigurationSummary(summary, cards) {
    if (!(summary instanceof HTMLElement) || !cards) return;
    const values = {
      economy: cardSummary(cards.money),
      attendance: cardSummary(cards.attendance),
      events: cardSummary(cards.events),
      recovery: cardSummary(cards.safety),
    };
    for (const [key, items] of Object.entries(values)) {
      setText(summary.querySelector(`[data-settings-summary="${key}"] > span`), items.join(" · ") || "—");
    }
  }

  function ensureSegmentedControl(select) {
    if (!(select instanceof HTMLSelectElement)) return;
    const options = [...select.options].filter((option) => !option.disabled && text(option.value));
    if (options.length < 2 || options.length > 4) return;

    const field = select.closest(".admin-terminal-settings-field");
    if (!(field instanceof HTMLElement)) return;
    let group = field.querySelector(":scope > [data-settings-segmented]");
    if (!(group instanceof HTMLElement)) {
      group = document.createElement("div");
      group.className = "admin-terminal-settings-segmented";
      group.dataset.settingsSegmented = "true";
      group.setAttribute("role", "radiogroup");
      group.setAttribute("aria-label", text(field.querySelector(":scope > span")?.textContent) || "Setting");
      group.style.setProperty("--settings-segment-count", String(options.length));
      select.classList.add("is-settings-native-select");
      select.tabIndex = -1;
      select.setAttribute("aria-hidden", "true");
      select.insertAdjacentElement("afterend", group);
    }

    const signature = options.map((option) => `${option.value}:${text(option.textContent)}`).join("|");
    if (group.dataset.optionSignature !== signature) {
      group.replaceChildren();
      for (const option of options) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.settingsSegmentValue = option.value;
        button.setAttribute("role", "radio");
        button.textContent = text(option.textContent);
        button.addEventListener("click", () => {
          if (select.value === option.value) return;
          select.value = option.value;
          select.dispatchEvent(new Event("input", { bubbles: true }));
          select.dispatchEvent(new Event("change", { bubbles: true }));
        });
        group.append(button);
      }
      group.dataset.optionSignature = signature;
    }

    for (const button of group.querySelectorAll("[data-settings-segment-value]")) {
      const active = button.dataset.settingsSegmentValue === select.value;
      button.classList.toggle("is-selected", active);
      button.setAttribute("aria-checked", String(active));
      button.tabIndex = active ? 0 : -1;
    }
  }

  function enhanceDiscreteControls(cards) {
    if (!cards) return;
    for (const select of cards.events.querySelectorAll("select")) ensureSegmentedControl(select);
    for (const select of cards.safety.querySelectorAll("select")) ensureSegmentedControl(select);
  }

  function ensureCustomDisclosure(page, cards) {
    const panel = page.querySelector(".admin-terminal-settings-main-panel");
    const header = panel?.querySelector(":scope > header");
    if (!(panel instanceof HTMLElement) || !(header instanceof HTMLElement) || !cards) return;

    const badge = header.querySelector(":scope > strong");
    if (badge instanceof HTMLElement) badge.hidden = true;

    let button = header.querySelector("[data-settings-custom-toggle]");
    if (!(button instanceof HTMLButtonElement)) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "admin-terminal-settings-custom-toggle";
      button.dataset.settingsCustomToggle = "true";
      button.addEventListener("click", () => {
        state.disclosureOpen = !page.classList.contains("is-custom-settings-open");
        applyDisclosureState(page, button, cards.grid);
        schedulePresentation();
        if (state.disclosureOpen) cards.grid.querySelector("input, select, button")?.focus({ preventScroll: true });
      });
      header.append(button);
    }

    applyDisclosureState(page, button, cards.grid);
  }

  function applyDisclosureState(page, button, grid) {
    page.dataset.settingsDisclosureInitialized = "true";
    page.classList.toggle("is-custom-settings-open", state.disclosureOpen);
    button.setAttribute("aria-expanded", String(state.disclosureOpen));
    button.setAttribute("aria-controls", "econovaria-custom-settings-grid");
    grid.id = "econovaria-custom-settings-grid";
    setText(button, state.disclosureOpen ? "Hide custom settings" : "Edit custom settings");
  }

  return {
    placeInStableOrder, putCardsInLinearOrder, controlValue, cardSummary, ensureConfigurationSummary,
    updateConfigurationSummary, ensureSegmentedControl, enhanceDiscreteControls, ensureCustomDisclosure,
    applyDisclosureState,
  };
};
