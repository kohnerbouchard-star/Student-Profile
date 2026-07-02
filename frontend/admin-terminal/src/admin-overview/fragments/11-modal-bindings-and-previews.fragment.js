// Modal-specific bindings and live preview synchronization.
  function filterPlayerActionLogByDate(module, dateValue) {
    if (!module) return;
    const targetDate = String(dateValue || "").trim();
    const rows = Array.from(module.querySelectorAll("[data-log-date]"));
    let visibleCount = 0;
    rows.forEach((row) => {
      const shouldShow = !targetDate || row.dataset.logDate === targetDate;
      row.hidden = !shouldShow;
      if (shouldShow) visibleCount += 1;
    });
    const empty = module.querySelector("[data-player-log-empty]");
    if (empty) empty.hidden = visibleCount > 0;
  }

  document.addEventListener("input", (event) => {
    const input = event.target?.closest?.("[data-player-log-date-search]");
    if (!input) return;
    filterPlayerActionLogByDate(input.closest(".admin-terminal-player-v240-module"), input.value);
  });

  document.addEventListener("input", (event) => {
    const input = event.target?.closest?.("[data-admin-terminal-players-search]");
    if (!input) return;
    updatePlayersRosterSearch(input.value);
  });

  
  function bindSciIdAvatarInput() {
    if (window.Econovaria.features.adminOverviewTerminal.sciIdAvatarInputBound) return;
    window.Econovaria.features.adminOverviewTerminal.sciIdAvatarInputBound = true;

    const updatePortfolioCenterText = (visual, slice) => {
    const center = visual?.querySelector?.("[data-portfolio-center]");
    if (!center) return;
    const kicker = center.querySelector("small");
    const title = center.querySelector("strong");
    const percent = center.querySelector("span");
    if (!kicker || !title || !percent) return;
    visual?.querySelectorAll?.(".admin-terminal-player-v240-portfolio-slice.is-active").forEach((activeSlice) => {
      activeSlice.classList.remove("is-active");
    });
    if (slice) {
      slice.classList.add("is-active");
      kicker.textContent = "FOCUS";
      title.textContent = slice.dataset.category || "Portfolio";
      percent.textContent = `${slice.dataset.percent || "0"}%`;
      return;
    }
    kicker.textContent = center.dataset.defaultKicker || "TOP SECTOR";
    title.textContent = center.dataset.defaultTitle || "Portfolio";
    percent.textContent = center.dataset.defaultPercent || "0%";
  };

  document.addEventListener("pointerover", (event) => {
    const slice = event.target.closest?.(".admin-terminal-player-v240-portfolio-slice");
    if (!slice) return;
    const visual = slice.closest(".admin-terminal-player-v240-portfolio-visual");
    updatePortfolioCenterText(visual, slice);
  });

  document.addEventListener("pointerout", (event) => {
    const slice = event.target.closest?.(".admin-terminal-player-v240-portfolio-slice");
    if (!slice) return;
    const nextTarget = event.relatedTarget;
    const visual = slice.closest(".admin-terminal-player-v240-portfolio-visual");
    if (nextTarget && visual?.contains(nextTarget)) return;
    updatePortfolioCenterText(visual, null);
  });

  document.addEventListener("focusin", (event) => {
    const slice = event.target.closest?.(".admin-terminal-player-v240-portfolio-slice");
    if (!slice) return;
    const visual = slice.closest(".admin-terminal-player-v240-portfolio-visual");
    updatePortfolioCenterText(visual, slice);
  });

  document.addEventListener("focusout", (event) => {
    const slice = event.target.closest?.(".admin-terminal-player-v240-portfolio-slice");
    if (!slice) return;
    const visual = slice.closest(".admin-terminal-player-v240-portfolio-visual");
    const nextTarget = event.relatedTarget;
    if (nextTarget && visual?.contains(nextTarget)) return;
    updatePortfolioCenterText(visual, null);
  });

  const setPortfolioChartExpanded = (visual, expanded) => {
    if (!visual) return;
    if (visual.dataset.portfolioShrinkTimer) {
      window.clearTimeout(Number(visual.dataset.portfolioShrinkTimer));
      delete visual.dataset.portfolioShrinkTimer;
    }
    if (expanded) {
      visual.classList.add("is-expanded");
      return;
    }
    const timer = window.setTimeout(() => {
      visual.classList.remove("is-expanded");
      delete visual.dataset.portfolioShrinkTimer;
    }, 1000);
    visual.dataset.portfolioShrinkTimer = String(timer);
  };

  document.addEventListener("pointerenter", (event) => {
    const visual = event.target?.closest?.(".admin-terminal-player-v240-portfolio-visual");
    if (!visual) return;
    setPortfolioChartExpanded(visual, true);
  }, true);

  document.addEventListener("pointerleave", (event) => {
    const visual = event.target?.closest?.(".admin-terminal-player-v240-portfolio-visual");
    if (!visual) return;
    setPortfolioChartExpanded(visual, false);
  }, true);

  document.addEventListener("focusin", (event) => {
    const visual = event.target?.closest?.(".admin-terminal-player-v240-portfolio-visual");
    if (!visual) return;
    setPortfolioChartExpanded(visual, true);
  });

  document.addEventListener("focusout", (event) => {
    const visual = event.target?.closest?.(".admin-terminal-player-v240-portfolio-visual");
    if (!visual) return;
    const nextTarget = event.relatedTarget;
    if (nextTarget && visual.contains(nextTarget)) return;
    setPortfolioChartExpanded(visual, false);
  });

  document.addEventListener("change", (event) => {
      const input = event.target?.closest?.("[data-admin-terminal-avatar-input]");
      if (!input) return;

      const file = input.files?.[0];
      if (!file) return;

      if (!String(file.type || "").startsWith("image/")) {
        showAdminTerminalStatus("warn", "Please choose an image file.");
        return;
      }

      const frame = input.closest("[data-admin-terminal-avatar-frame]");
      const image = frame?.querySelector("[data-admin-terminal-avatar-image]");
      const letter = frame?.querySelector("span");
      if (!frame || !image) return;

      const reader = new FileReader();
      reader.addEventListener("load", () => {
        const dataUrl = String(reader.result || "");
        image.src = dataUrl;
        image.hidden = false;
        if (letter) letter.hidden = true;
        frame.classList.add("has-custom-avatar");

        if (input.matches("[data-admin-profile-avatar-input]")) {
          applyAdminProfileAvatar(dataUrl);
          showAdminTerminalStatus("ok", "Profile picture updated.");
        } else {
          showAdminTerminalStatus("ok", "Avatar preview updated.");
        }
      }, { once: true });
      reader.readAsDataURL(file);
    });
  }

  function getContractItemOptionsMarkup() {
    return `                      <option value="homework_pass">Homework Pass</option>
                      <option value="late_pass">Late Pass</option>
                      <option value="seat_swap">Seat Swap</option>
                      <option value="music_request">Class Music Request</option>
                      <option value="bonus_hint">Bonus Hint</option>
                      <option value="quiz_reroll">Quiz Reroll</option>
                      <option value="supply_pack">Supply Pack</option>
                      <option value="team_bonus">Team Bonus Token</option>
                      <option value="market_tip">Market Tip</option>
                      <option value="mystery_box">Mystery Box</option>`;
  }

  function getContractLocationSelections(root) {
    const checkboxes = Array.from(root?.querySelectorAll("[data-admin-terminal-contract-location]") || []);
    const selected = checkboxes.filter((input) => input.checked);

    if (!selected.length) {
      const allInput = checkboxes.find((input) => input.value === "all");
      if (allInput) allInput.checked = true;
      return [{ value: "all", label: "All countries" }];
    }

    if (selected.some((input) => input.value === "all")) {
      return [{ value: "all", label: "All countries" }];
    }

    return selected.map((input) => {
      const rawLabel = input.closest("label")?.textContent || input.value;
      return {
        value: input.value,
        label: rawLabel.trim()
      };
    });
  }

  function readContractLocationText(root) {
    const selections = getContractLocationSelections(root);
    if (selections.length === 1) return selections[0].label;
    return `${selections.length} countries`;
  }

  function updateContractLocationSummary(root) {
    const summary = root?.querySelector("[data-admin-terminal-location-summary]");
    if (!summary) return;
    summary.textContent = readContractLocationText(root);
  }

  function normalizeContractLocationSelection(root, changedInput) {
    if (!root) return;

    const checkboxes = Array.from(root.querySelectorAll("[data-admin-terminal-contract-location]"));
    const allInput = checkboxes.find((input) => input.value === "all");
    const countryInputs = checkboxes.filter((input) => input.value !== "all");

    if (changedInput?.value === "all" && changedInput.checked) {
      countryInputs.forEach((input) => { input.checked = false; });
    }

    if (changedInput?.value !== "all" && changedInput?.checked && allInput) {
      allInput.checked = false;
    }

    const hasCountry = countryInputs.some((input) => input.checked);
    if (!hasCountry && allInput && !allInput.checked) allInput.checked = true;

    updateContractLocationSummary(root);
  }

  function setRewardStageKind(kind) {
    const root = document.querySelector("[data-admin-terminal-contract-console]");
    if (!root) return;

    const nextKind = kind === "item" ? "item" : "cash";
    const stage = root.querySelector("[data-admin-terminal-reward-stage]");
    const cashPanel = root.querySelector("[data-admin-terminal-reward-stage-cash]");
    const itemPanel = root.querySelector("[data-admin-terminal-reward-stage-item]");
    const cashButton = root.querySelector('[data-admin-terminal-action="stage-cash-reward"]');
    const itemButton = root.querySelector('[data-admin-terminal-action="stage-item-reward"]');

    if (stage) stage.dataset.rewardKind = nextKind;

    if (cashPanel) {
      cashPanel.hidden = nextKind !== "cash";
      cashPanel.style.display = nextKind === "cash" ? "grid" : "none";
    }

    if (itemPanel) {
      itemPanel.hidden = nextKind !== "item";
      itemPanel.style.display = nextKind === "item" ? "grid" : "none";
    }

    if (cashButton) cashButton.setAttribute("aria-pressed", nextKind === "cash" ? "true" : "false");
    if (itemButton) itemButton.setAttribute("aria-pressed", nextKind === "item" ? "true" : "false");

    window.requestAnimationFrame(() => {
      const target = nextKind === "item"
        ? root.querySelector("[data-admin-terminal-stage-item]")
        : root.querySelector("[data-admin-terminal-stage-cash]");
      target?.focus?.();
    });
  }

  function formatCashReward(amount) {
    return `NRC ${Math.max(0, Number(amount || 0)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function formatItemReward(label, quantity = 1) {
    const safeQuantity = Math.max(1, Number(quantity || 1));
    return safeQuantity > 1 ? `${safeQuantity}× ${label}` : label;
  }

  function updateRewardChipLabel(chip) {
    if (!chip) return;

    const kind = chip.dataset.rewardKind === "item" ? "item" : "cash";
    let label;

    if (kind === "cash") {
      const total = Math.max(0, Number(chip.dataset.rewardTotal || chip.dataset.rewardValue || 0));
      chip.dataset.rewardTotal = String(total);
      chip.dataset.rewardValue = String(total);
      label = formatCashReward(total);
    } else {
      const itemName = chip.dataset.rewardItemName || chip.dataset.rewardLabel || "Item reward";
      const quantity = Math.max(1, Number(chip.dataset.rewardQuantity || 1));
      label = formatItemReward(itemName, quantity);
    }

    chip.dataset.rewardLabel = label;

    const labelNode = chip.querySelector("small");
    if (labelNode) labelNode.textContent = label;

    const removeButton = chip.querySelector("[data-admin-terminal-action='remove-contract-reward']");
    if (removeButton) removeButton.setAttribute("aria-label", `Remove ${label} reward`);
  }

  function createContractRewardChip(kind, label, value, quantity = 1) {
    const chip = document.createElement("div");
    const nextKind = kind === "item" ? "item" : "cash";
    const safeQuantity = Math.max(1, Number(quantity || 1));

    chip.className = "admin-terminal-contract-reward-chip";
    chip.dataset.adminTerminalContractRewardRow = "";
    chip.dataset.rewardKind = nextKind;

    if (nextKind === "cash") {
      const total = Math.max(0, Number(value || 0)) * safeQuantity;
      chip.dataset.rewardValue = String(total);
      chip.dataset.rewardTotal = String(total);
      chip.dataset.rewardQuantity = "1";
    } else {
      chip.dataset.rewardValue = String(value ?? "");
      chip.dataset.rewardItemName = label || "Item reward";
      chip.dataset.rewardQuantity = String(safeQuantity);
    }

    chip.innerHTML = `
      <small></small>
      <button type="button" aria-label="Remove reward" data-admin-terminal-action="remove-contract-reward">×</button>
    `;

    updateRewardChipLabel(chip);
    return chip;
  }

  function mergeContractRewardChip(newChip) {
    const root = document.querySelector("[data-admin-terminal-contract-console]");
    const list = root?.querySelector("[data-admin-terminal-contract-rewards-list]");
    if (!list || !newChip) return;

    const kind = newChip.dataset.rewardKind === "item" ? "item" : "cash";

    if (kind === "cash") {
      const existingCash = list.querySelector('[data-admin-terminal-contract-reward-row][data-reward-kind="cash"]');
      if (existingCash) {
        const currentTotal = Math.max(0, Number(existingCash.dataset.rewardTotal || existingCash.dataset.rewardValue || 0));
        const addedTotal = Math.max(0, Number(newChip.dataset.rewardTotal || newChip.dataset.rewardValue || 0));
        existingCash.dataset.rewardTotal = String(currentTotal + addedTotal);
        existingCash.dataset.rewardValue = String(currentTotal + addedTotal);
        updateRewardChipLabel(existingCash);
        return;
      }

      list.appendChild(newChip);
      updateRewardChipLabel(newChip);
      return;
    }

    const itemValue = newChip.dataset.rewardValue;
    const existingItem = Array.from(list.querySelectorAll('[data-admin-terminal-contract-reward-row][data-reward-kind="item"]'))
      .find((chip) => chip.dataset.rewardValue === itemValue);

    if (existingItem) {
      const currentQuantity = Math.max(1, Number(existingItem.dataset.rewardQuantity || 1));
      const addedQuantity = Math.max(1, Number(newChip.dataset.rewardQuantity || 1));
      existingItem.dataset.rewardQuantity = String(currentQuantity + addedQuantity);
      updateRewardChipLabel(existingItem);
      return;
    }

    list.appendChild(newChip);
    updateRewardChipLabel(newChip);
  }

  function addStagedContractReward() {
    const root = document.querySelector("[data-admin-terminal-contract-console]");
    if (!root) return;

    const stage = root.querySelector("[data-admin-terminal-reward-stage]");
    const kind = stage?.dataset.rewardKind === "item" ? "item" : "cash";
    let chip;

    if (kind === "item") {
      const itemSelect = root.querySelector("[data-admin-terminal-stage-item]");
      const quantityInput = root.querySelector("[data-admin-terminal-stage-item-quantity]");
      const label = itemSelect?.selectedOptions?.[0]?.textContent?.trim() || "Item reward";
      const value = itemSelect?.value || label;
      const quantity = Math.max(1, Number(quantityInput?.value || 1));
      chip = createContractRewardChip("item", label, value, quantity);
    } else {
      const cashInput = root.querySelector("[data-admin-terminal-stage-cash]");
      const amount = Math.max(0, Number(cashInput?.value || 0));
      chip = createContractRewardChip("cash", formatCashReward(amount), amount, 1);
    }

    mergeContractRewardChip(chip);
    updateContractPreview();
  }

  function readContractRewards(root) {
    const rows = Array.from(root?.querySelectorAll("[data-admin-terminal-contract-reward-row]") || []);
    rows.forEach(updateRewardChipLabel);
    return rows.map((row) => row.dataset.rewardLabel || row.querySelector("small")?.textContent?.trim()).filter(Boolean);
  }


  function readContractReward(root) {
    const rewards = readContractRewards(root);
    return rewards.length ? rewards.join(" + ") : "No reward";
  }

  function updateContractPostPanel() {
    const root = document.querySelector("[data-admin-terminal-contract-console]");
    if (!root) return;

    const postSetting = root.querySelector("[data-admin-terminal-contract-post-setting]")?.value || "now";
    const scheduledPanel = root.querySelector("[data-admin-terminal-scheduled-post-panel]");

    if (scheduledPanel) {
      scheduledPanel.hidden = postSetting !== "scheduled";
      scheduledPanel.style.display = postSetting === "scheduled" ? "grid" : "none";
    }
  }

  function formatContractDateTime(value) {
    if (!value) return "not set";
    return new Date(value).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function updateContractPreview() {
    const root = document.querySelector("[data-admin-terminal-contract-console]");
    if (!root) return;

    updateContractPostPanel();
    updateContractLocationSummary(root);

    const rewardRows = Array.from(root.querySelectorAll("[data-admin-terminal-contract-reward-row]"));
    const emptyState = root.querySelector("[data-admin-terminal-selected-rewards-empty]");
    if (emptyState) emptyState.hidden = rewardRows.length > 0;

    const title = root.querySelector("[data-admin-terminal-contract-title]")?.value?.trim() || "Market Analysis Brief";
    const objective = root.querySelector("[data-admin-terminal-contract-objective]")?.value?.trim() || "Objective pending";
    const evidence = root.querySelector("[data-admin-terminal-contract-evidence]")?.value?.trim() || "Submission requirement pending";
    const deadlineValue = root.querySelector("[data-admin-terminal-contract-deadline]")?.value;
    const qtyValue = root.querySelector("[data-admin-terminal-contract-quantity]")?.value?.trim() || "1";
    const quantityScope = root.querySelector("[data-admin-terminal-contract-quantity-scope]")?.value || "total";
    const postSetting = root.querySelector("[data-admin-terminal-contract-post-setting]")?.value || "now";
    const postAtValue = root.querySelector("[data-admin-terminal-contract-post-at]")?.value;
    const reward = readContractReward(root);
    const preview = root.querySelector("[data-admin-terminal-contract-preview]");
    const deadlineText = formatContractDateTime(deadlineValue);
    const locationText = readContractLocationText(root);
    const postText = postSetting === "scheduled"
      ? `Posts: ${formatContractDateTime(postAtValue)}`
      : postSetting === "draft"
        ? "Draft"
        : "Posts: now";
    const qtyScopeText = quantityScope === "per_location" ? "per selected country" : "total pool";

    if (preview) {
      const titleNode = preview.querySelector("strong");
      const metaNode = preview.querySelector("small");
      if (titleNode) titleNode.textContent = title;
      if (metaNode) metaNode.textContent = `${objective} · Submit: ${evidence} · Reward: ${reward} · Qty: ${qtyValue} ${qtyScopeText} · ${locationText} · Deadline: ${deadlineText} · ${postText}`;
    }
  }

  function bindContractModalControls(root) {
    const contractRoot = root?.querySelector?.("[data-admin-terminal-contract-console]");
    if (!contractRoot) return;

    root.querySelector(".admin-terminal-modal")?.classList.add("is-contract-modal");

    if (contractRoot.dataset.controlsBound === "true") return;
    contractRoot.dataset.controlsBound = "true";

    contractRoot.addEventListener("input", updateContractPreview, true);

    contractRoot.addEventListener("change", (event) => {
      const locationInput = event.target?.closest?.("[data-admin-terminal-contract-location]");
      if (locationInput) normalizeContractLocationSelection(contractRoot, locationInput);
      updateContractPreview();
    }, true);

    root.addEventListener("click", (event) => {
      const modalDismiss = isTerminalModalDismissClick(event);
      const locationToggle = event.target?.closest?.("[data-admin-terminal-location-toggle]");
      const locationField = event.target?.closest?.("[data-admin-terminal-location-field]");
      const action = event.target?.closest?.("[data-admin-terminal-action]");

      if (modalDismiss) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        closeTerminalModal();
        return;
      }

      if (locationToggle && contractRoot.contains(locationToggle)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();

        const menu = contractRoot.querySelector("[data-admin-terminal-location-menu]");
        const isOpen = !menu?.hidden;
        if (menu) menu.hidden = isOpen;
        locationToggle.setAttribute("aria-expanded", isOpen ? "false" : "true");
        return;
      }

      if (!locationField) {
        const menu = contractRoot.querySelector("[data-admin-terminal-location-menu]");
        const toggle = contractRoot.querySelector("[data-admin-terminal-location-toggle]");
        if (menu) menu.hidden = true;
        if (toggle) toggle.setAttribute("aria-expanded", "false");
      }

      if (!action || !contractRoot.contains(action)) return;

      const actionName = action.dataset.adminTerminalAction;

      if (actionName === "stage-cash-reward" || actionName === "stage-item-reward") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        setRewardStageKind(actionName === "stage-item-reward" ? "item" : "cash");
        return;
      }

      if (actionName === "confirm-staged-reward") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        addStagedContractReward();
        return;
      }

      if (actionName === "remove-contract-reward") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();

        const row = action.closest("[data-admin-terminal-contract-reward-row]");
        row?.remove();
        updateContractPreview();
        return;
      }

      if (actionName === "mock-preview-contract") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();

        updateContractPreview();
        openTerminalPreviewOverlay(renderContractPlayerListingPreview(readContractDraft(contractRoot)));
        return;
      }
    }, true);

    const form = contractRoot.querySelector("[data-admin-terminal-contract-form]");
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopPropagation();

      updateContractPreview();

      const title = contractRoot.querySelector("[data-admin-terminal-contract-title]")?.value?.trim();
      const postSetting = contractRoot.querySelector("[data-admin-terminal-contract-post-setting]")?.value || "now";
      const postAt = contractRoot.querySelector("[data-admin-terminal-contract-post-at]")?.value;
      const quantity = Number(contractRoot.querySelector("[data-admin-terminal-contract-quantity]")?.value || 0);
      const rewardRows = Array.from(contractRoot.querySelectorAll("[data-admin-terminal-contract-reward-row]"));

      if (!title) {
        contractRoot.querySelector("[data-admin-terminal-contract-title]")?.focus?.();
        showAdminTerminalStatus("warn", "Contract title is required.");
        return;
      }

      if (!Number.isFinite(quantity) || quantity < 1) {
        contractRoot.querySelector("[data-admin-terminal-contract-quantity]")?.focus?.();
        showAdminTerminalStatus("warn", "Quantity must be at least 1.");
        return;
      }

      if (!rewardRows.length) {
        showAdminTerminalStatus("warn", "At least one reward is required.");
        return;
      }

      if (postSetting === "scheduled" && !postAt) {
        contractRoot.querySelector("[data-admin-terminal-contract-post-at]")?.focus?.();
        showAdminTerminalStatus("warn", "Scheduled post time is required.");
        return;
      }

      showAdminTerminalStatus("ok", "Contract saved locally. Backend wiring pending.");
    });

    normalizeContractLocationSelection(contractRoot, null);
    setRewardStageKind("cash");
    updateContractPreview();

    window.requestAnimationFrame(() => {
      contractRoot.querySelector("[data-admin-terminal-contract-title]")?.focus?.();
    });
  }


  function readSelectedOptionText(select, fallback) {
    return select?.selectedOptions?.[0]?.textContent?.trim() || fallback;
  }

  function syncPlayerManualPanels(root) {
    if (!root) return;

    const playerIdMode = root.querySelector("[data-admin-terminal-player-id-mode]")?.value || "auto";
    const accessCodeMode = root.querySelector("[data-admin-terminal-player-access-code-mode]")?.value || "auto";
    const playerIdPanel = root.querySelector("[data-admin-terminal-player-id-manual-panel]");
    const accessCodePanel = root.querySelector("[data-admin-terminal-player-access-code-manual-panel]");

    if (playerIdPanel) {
      playerIdPanel.hidden = playerIdMode !== "manual";
      playerIdPanel.style.display = playerIdMode === "manual" ? "grid" : "none";
    }

    if (accessCodePanel) {
      accessCodePanel.hidden = accessCodeMode !== "manual";
      accessCodePanel.style.display = accessCodeMode === "manual" ? "grid" : "none";
    }
  }

  function updatePlayerPreview() {
    const root = document.querySelector("[data-admin-terminal-player-console]");
    if (!root) return;

    syncPlayerManualPanels(root);

    const displayName = root.querySelector("[data-admin-terminal-player-display-name]")?.value?.trim() || "New player";
    const rosterLabel = root.querySelector("[data-admin-terminal-player-roster-label]")?.value?.trim() || "optional";
    const statusSelect = root.querySelector("[data-admin-terminal-player-status]");
    const statusText = readSelectedOptionText(statusSelect, "Active");
    const playerIdMode = root.querySelector("[data-admin-terminal-player-id-mode]")?.value || "auto";
    const manualPlayerId = root.querySelector("[data-admin-terminal-player-manual-id]")?.value?.trim();
    const startingLocationSelect = root.querySelector("[data-admin-terminal-player-starting-location]");
    const startingLocation = readSelectedOptionText(startingLocationSelect, "Randomized");
    const accessCodeMode = root.querySelector("[data-admin-terminal-player-access-code-mode]")?.value || "auto";
    const manualAccessCode = root.querySelector("[data-admin-terminal-player-manual-access-code]")?.value?.trim();

    const previewName = root.querySelector("[data-admin-terminal-player-preview-name]");
    const summary = root.querySelector("[data-admin-terminal-player-summary]");
    const previewStatus = root.querySelector("[data-admin-terminal-player-preview-status]");
    const previewId = root.querySelector("[data-admin-terminal-player-preview-id]");
    const previewLocation = root.querySelector("[data-admin-terminal-player-preview-location]");
    const previewAccess = root.querySelector("[data-admin-terminal-player-preview-access]");
    const previewNote = root.querySelector("[data-admin-terminal-player-preview-note]");

    const playerIdText = playerIdMode === "manual"
      ? (manualPlayerId || "Manual ID required")
      : "Auto-generated";

    const accessText = accessCodeMode === "manual"
      ? (manualAccessCode || "Manual code required")
      : accessCodeMode === "none"
        ? "Create later"
        : "Generated after save";

    if (previewName) previewName.textContent = displayName;
    if (previewStatus) previewStatus.textContent = statusText;
    if (previewId) previewId.textContent = playerIdText;
    if (previewLocation) previewLocation.textContent = startingLocation;
    if (previewAccess) previewAccess.textContent = accessText;

    if (previewNote) {
      previewNote.textContent = accessCodeMode === "none"
        ? "The player will be created without an active login code. Generate one later from Player Access Codes."
        : playerIdMode === "manual" || accessCodeMode === "manual"
          ? "Manual values will override generated values for this player."
          : "Standard setup: generated Player ID, selected start location, and generated access code.";
    }

    if (summary) {
      const titleNode = summary.querySelector("strong");
      const metaNode = summary.querySelector("small");
      if (titleNode) titleNode.textContent = displayName;
      if (metaNode) {
        metaNode.textContent = `Roster: ${rosterLabel} · Status: ${statusText} · Player ID: ${playerIdText} · Start: ${startingLocation} · Access: ${accessText}`;
      }
    }

    if (typeof scheduleSciIdRankAlignment === "function") scheduleSciIdRankAlignment(root);
  }

  function bindPlayerModalControls(root) {
    const playerRoot = root?.querySelector?.("[data-admin-terminal-player-console]");
    if (!playerRoot) return;

    root.querySelector(".admin-terminal-modal")?.classList.add("is-player-modal");

    if (playerRoot.dataset.controlsBound === "true") return;
    playerRoot.dataset.controlsBound = "true";

    playerRoot.addEventListener("input", updatePlayerPreview, true);
    playerRoot.addEventListener("change", updatePlayerPreview, true);

    root.addEventListener("click", (event) => {
      const modalDismiss = isTerminalModalDismissClick(event);
      const action = event.target?.closest?.("[data-admin-terminal-action]");

      if (modalDismiss) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        closeTerminalModal();
        return;
      }

      if (!action || !playerRoot.contains(action)) return;

      if (action.dataset.adminTerminalAction === "preview-player-side-profile") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();

        updatePlayerPreview();
        openTerminalPreviewOverlay(renderPlayerSideProfilePreview(readPlayerDraft(playerRoot)));
      }
    }, true);

    const form = playerRoot.querySelector("[data-admin-terminal-player-form]");
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopPropagation();

      updatePlayerPreview();

      const displayName = playerRoot.querySelector("[data-admin-terminal-player-display-name]")?.value?.trim();
      const playerIdMode = playerRoot.querySelector("[data-admin-terminal-player-id-mode]")?.value || "auto";
      const manualPlayerId = playerRoot.querySelector("[data-admin-terminal-player-manual-id]")?.value?.trim();
      const accessCodeMode = playerRoot.querySelector("[data-admin-terminal-player-access-code-mode]")?.value || "auto";
      const manualAccessCode = playerRoot.querySelector("[data-admin-terminal-player-manual-access-code]")?.value?.trim();

      if (!displayName) {
        playerRoot.querySelector("[data-admin-terminal-player-display-name]")?.focus?.();
        showAdminTerminalStatus("warn", "Display name is required.");
        return;
      }

      if (playerIdMode === "manual" && !manualPlayerId) {
        playerRoot.querySelector("[data-admin-terminal-player-manual-id]")?.focus?.();
        showAdminTerminalStatus("warn", "Manual Player ID is required.");
        return;
      }

      if (accessCodeMode === "manual" && !manualAccessCode) {
        playerRoot.querySelector("[data-admin-terminal-player-manual-access-code]")?.focus?.();
        showAdminTerminalStatus("warn", "Manual access code is required.");
        return;
      }

      showAdminTerminalStatus("ok", "Player saved locally. Backend wiring pending.");
    });

    updatePlayerPreview();

    window.requestAnimationFrame(() => {
      playerRoot.querySelector("[data-admin-terminal-player-display-name]")?.focus?.();
    });
  }

function bindScannerModeHardSwitch() {
    if (window.Econovaria.features.adminOverviewTerminal.modeHardSwitchBound) return;
    window.Econovaria.features.adminOverviewTerminal.modeHardSwitchBound = true;

    const handleModeSelection = (event) => {
      const button = event.target?.closest?.("[data-admin-terminal-set-mode]");
      if (!button) return;

      const scanner = button.closest("[data-admin-terminal-scanner-console]");
      if (!scanner) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();

      setScannerMode(button.dataset.adminTerminalSetMode === "manual" ? "manual" : "auto");
    };

    document.addEventListener("pointerdown", handleModeSelection, true);
    document.addEventListener("mousedown", handleModeSelection, true);
    document.addEventListener("click", handleModeSelection, true);
  }

function bindTerminalScannerInputCapture() {
    if (window.Econovaria.features.adminOverviewTerminal.scannerInputCaptureBound) return;
    window.Econovaria.features.adminOverviewTerminal.scannerInputCaptureBound = true;

    document.addEventListener("input", (event) => {
      const input = event.target;
      if (input?.matches?.("[data-bank-calc-field]")) {
        updateAdminTerminalBankCalculator(input);
        return;
      }
      if (!input?.matches?.("[data-admin-terminal-auto-scan-input]")) return;
      scheduleAutoScannerCapture(input);
    });

    document.addEventListener("change", (event) => {
      const field = event.target;
      if (!field?.matches?.("[data-bank-calc-field]")) return;
      updateAdminTerminalBankCalculator(field);
    });

    document.addEventListener("focusin", (event) => {
      const consoleRoot = document.querySelector("[data-admin-terminal-scanner-console]");
      if (!consoleRoot || consoleRoot.dataset.scanMode !== "auto") return;
      const isModalControl = event.target?.closest?.("[data-admin-terminal-modal-close], [data-admin-terminal-modal-secondary], [data-admin-terminal-modal-primary], [data-admin-terminal-set-mode]");
      if (isModalControl) return;
      const autoInput = consoleRoot.querySelector("[data-admin-terminal-auto-scan-input]");
      if (event.target !== autoInput) window.requestAnimationFrame(() => autoInput?.focus?.());
    });
  }

  function bindTerminalClickableKeyboard() {
    if (window.Econovaria.features.adminOverviewTerminal.clickableKeyboardBound) return;
    window.Econovaria.features.adminOverviewTerminal.clickableKeyboardBound = true;

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const clickable = event.target?.closest?.(".admin-terminal-clickable-row, .admin-terminal-nav-item, .admin-terminal-side-code-compact");
      if (!clickable) return;

      event.preventDefault();
      clickable.click?.();
    });
  }

  function bindTerminalModalKeyboard() {
    if (window.Econovaria.features.adminOverviewTerminal.modalKeyboardBound) return;
    window.Econovaria.features.adminOverviewTerminal.modalKeyboardBound = true;

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeTerminalModal();
        return;
      }

      if (event.key === "Enter" && event.target?.matches?.("[data-admin-terminal-auto-scan-input], [data-admin-terminal-manual-scan-input]")) {
        event.preventDefault();
        handleMockScannerCapture("enter");
      }
    });
  }

  function syncInitialMenuStates() {
    document.querySelectorAll("[data-admin-terminal-shell]").forEach((shell) => {
      if (!shell.__adminTerminalCollapseInitialized) {
        shell.__adminTerminalCollapseInitialized = true;
        applyShellCollapsed(shell, true);
      }

      const menu = shell.querySelector(".admin-terminal-left-menu");
      if (!menu || menu.__adminTerminalHoverBound) return;

      menu.__adminTerminalHoverBound = true;
      menu.addEventListener("pointerenter", () => openMenuNow(shell));
      menu.addEventListener("pointerleave", () => scheduleMenuCollapse(shell, 1000));

      menu.addEventListener("focusin", () => openMenuNow(shell));

      menu.addEventListener("focusout", () => {
        if (!menu.contains(document.activeElement)) scheduleMenuCollapse(shell, 1000);
      });
    });
  }
