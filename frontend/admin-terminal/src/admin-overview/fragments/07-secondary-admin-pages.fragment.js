// Secondary admin pages: contracts, store, market, settings, and logs.
  function normalizeTerminalContractStatus(status) {
    const raw = String(status || "Active").trim() || "Active";
    const normalized = raw.toLowerCase();

    if (normalized.includes("draft")) return { label: "Draft", filter: "draft", tone: "is-muted" };
    if (normalized.includes("schedule") || normalized.includes("upcoming")) return { label: "Scheduled", filter: "scheduled", tone: "is-cyan" };
    if (normalized.includes("due") || normalized.includes("overdue")) return { label: normalized.includes("overdue") ? "Overdue" : "Due Soon", filter: "due", tone: "is-warn" };
    if (normalized.includes("submitted") || normalized.includes("pending") || normalized.includes("review")) return { label: "Under Review", filter: "review", tone: "is-purple" };
    if (normalized.includes("complete") || normalized.includes("approved") || normalized.includes("paid")) return { label: "Completed", filter: "completed", tone: "is-good" };
    if (normalized.includes("expire")) return { label: "Expired", filter: "expired", tone: "is-bad" };
    if (normalized.includes("cancel") || normalized.includes("archive")) return { label: "Cancelled", filter: "cancelled", tone: "is-muted" };

    return { label: "Active", filter: "active", tone: "is-active" };
  }

  function getTerminalContractRows(model) {
    const assignments = Array.isArray(model?.assignments) ? model.assignments : [];

    const fallback = [
      {
        title: "Market Reflection",
        meta: "Deadline Friday · All countries",
        reward: "15.00",
        status: "Active",
        submissions: "7 / 18",
        difficulty: "Standard",
        deadline: "Friday 16:00",
        audience: "All countries",
        objective: "Explain how the current market cycle changed one business decision.",
        instructions: "Review the current market update, identify one change that affected your company, and explain the business decision you would make in response.",
        successCriteria: "Response names the market change, connects it to a company decision, and uses at least one specific piece of evidence from the simulation.",
        teacherNote: "Check for clear cause-and-effect reasoning before approving payout.",
        payoutType: "Cash reward",
        evidence: "Short response + market screenshot",
        owner: "Admin",
        category: "Economy"
      },
      {
        title: "Supply Shock Response",
        meta: "Deadline Today · Northreach, Yrethia",
        reward: "20.00",
        status: "Due Soon",
        submissions: "4 / 18",
        difficulty: "Advanced",
        deadline: "Today 15:30",
        audience: "Northreach, Yrethia",
        objective: "Respond to a simulated resource constraint and justify the pricing decision.",
        instructions: "Use the supply shock notice to choose a price, quantity, or sourcing response for your company. Explain why your choice protects profit or customer demand.",
        successCriteria: "Submission includes a clear action, a reason connected to supply constraints, and a realistic tradeoff.",
        teacherNote: "Advanced task; reject vague answers that do not mention the shortage or price impact.",
        payoutType: "Cash + item",
        evidence: "Decision memo",
        owner: "Admin",
        category: "Operations"
      },
      {
        title: "Store Budget Task",
        meta: "Scheduled Monday · All countries",
        reward: "12.00",
        status: "Scheduled",
        submissions: "0 / 18",
        difficulty: "Standard",
        deadline: "Monday 09:00",
        audience: "All countries",
        objective: "Prepare a simple purchasing plan before the next store cycle opens.",
        instructions: "List what you plan to buy, why the item matters to your strategy, and how much cash you want to keep after purchasing.",
        successCriteria: "Budget includes at least one item, a reason for buying it, and a cash reserve decision.",
        teacherNote: "This is a planning task; do not require a purchase receipt yet.",
        payoutType: "Cash reward",
        evidence: "Budget note",
        owner: "Admin",
        category: "Store"
      },
      {
        title: "Country Risk Brief",
        meta: "Deadline Wednesday · One country each",
        reward: "25.00",
        status: "Under Review",
        submissions: "6 pending",
        difficulty: "Advanced",
        deadline: "Wednesday 17:00",
        audience: "One country each",
        objective: "Identify one political, currency, or logistics risk and state the likely player impact.",
        instructions: "Choose one country risk from the dashboard and explain how it could affect prices, stock, trade, or company decisions.",
        successCriteria: "Brief names the risk, explains the impact, and includes a plausible action the player should take.",
        teacherNote: "Review for specificity; generic country descriptions should be sent back for revision.",
        payoutType: "Cash reward",
        evidence: "Brief for review",
        owner: "Admin",
        category: "Country Risk"
      }
    ];

    const source = assignments.length ? assignments : fallback;

    return source.map((item, index) => {
      const base = fallback[index % fallback.length];
      const title = item.title || base.title;
      const meta = item.meta || base.meta;
      const reward = item.reward || base.reward;
      const status =
        item.status ||
        (index === 1 ? "Due Soon" : index === 2 ? "Scheduled" : index === 3 ? "Under Review" : "Active");
      const statusMeta = normalizeTerminalContractStatus(status);
      const submissions = item.submissions || base.submissions;
      const submissionMatch = String(submissions).match(/(\d+)\s*\/\s*(\d+)/);
      const pendingMatch = String(submissions).match(/(\d+)\s*pending/i);
      const submittedCount = submissionMatch ? Number(submissionMatch[1]) : pendingMatch ? Number(pendingMatch[1]) : 0;
      const totalCount = submissionMatch ? Number(submissionMatch[2]) : 18;
      const completionPercent = totalCount ? Math.min(100, Math.round((submittedCount / totalCount) * 100)) : 0;

      return {
        title,
        meta,
        reward,
        status: statusMeta.label,
        rawStatus: status,
        filterStatus: statusMeta.filter,
        tone: statusMeta.tone,
        submissions,
        submittedCount,
        totalCount,
        completionPercent,
        difficulty: item.difficulty || base.difficulty,
        locations: item.locations || item.audience || base.audience || (meta.includes("All") ? "All countries" : "Selected countries"),
        deadline: item.deadline || base.deadline || meta.split("·")[0].replace("Deadline", "").trim(),
        objective: item.objective || base.objective,
        instructions: item.instructions || base.instructions || item.detail || "Write the student-facing instructions for this contract.",
        successCriteria: item.successCriteria || item.acceptanceCriteria || base.successCriteria || "Acceptance criteria pending.",
        teacherNote: item.teacherNote || item.reviewNote || base.teacherNote || "No internal review note.",
        payoutType: item.payoutType || base.payoutType,
        evidence: item.evidence || base.evidence,
        owner: item.owner || base.owner,
        category: item.category || base.category,
        completion: item.completion || `${submittedCount} submitted`,
        index
      };
    });
  }

  function renderContractsPageHeader(model) {
    return `
      <header class="admin-terminal-top admin-terminal-page-top">
        <div>
          <span>Assignments / contracts</span>
          <h2>Contracts</h2>
          <p>Issue class contracts, monitor submissions, and control reward exposure.</p>
        </div>

        <div class="admin-terminal-top-actions">
          <button class="admin-terminal-bell" type="button" aria-label="Alerts" data-admin-terminal-bell>
            ${bellIcon()}
            ${model.notificationCount ? `<small>${escapeHtml(model.notificationCount)}</small>` : ""}
          </button>
          <button class="admin-terminal-user-button" type="button" aria-label="Open admin profile menu" aria-expanded="false" data-admin-terminal-user>
            <span class="admin-terminal-avatar">${escapeHtml(getAdminInitials(model.adminName))}</span>
            <i aria-hidden="true"></i>
          </button>
          ${renderNotifications(model)}
          ${renderAdminUserMenu(model)}
        </div>
      </header>`;
  }

  function renderContractStatusBadge(status, tone = "is-active") {
    return `<span class="admin-terminal-contract-status ${escapeHtml(tone)}">${escapeHtml(status)}</span>`;
  }

  function renderContractProgress(contract) {
    return `
      <div class="admin-terminal-contract-progress-v466" aria-label="Submission progress for ${escapeHtml(contract.title)}">
        <span><i style="--contract-progress:${escapeHtml(contract.completionPercent)}%"></i></span>
        <b>${escapeHtml(contract.completionPercent)}%</b>
      </div>`;
  }

  function renderContractLedgerRow(contract) {
    const reward = renderCurrencyAmount(contract.reward, "NRC");
    return `
      <details class="admin-terminal-contract-ledger-row-v466 ${escapeHtml(contract.tone)}" data-contract-row data-contract-filter="${escapeHtml(contract.filterStatus)}" data-contract-status="${escapeHtml(contract.status)}" data-contract-title="${escapeHtml(contract.title)}">
        <summary>
          <div class="admin-terminal-contract-ledger-title-v466">
            <span>${escapeHtml(contract.category)}</span>
            <strong>${escapeHtml(contract.title)}</strong>
            <small>${escapeHtml(contract.objective)}</small>
          </div>

          <div class="admin-terminal-contract-ledger-status-v466">
            ${renderContractStatusBadge(contract.status, contract.tone)}
          </div>

          <div class="admin-terminal-contract-ledger-reward-v466">
            <span>Reward</span>
            <strong>${reward}</strong>
          </div>

          <div class="admin-terminal-contract-ledger-submissions-v466">
            <span>Submissions</span>
            <strong>${escapeHtml(contract.submissions)}</strong>
            ${renderContractProgress(contract)}
          </div>

          <div class="admin-terminal-contract-ledger-deadline-v466">
            <span>Deadline</span>
            <strong>${escapeHtml(contract.deadline)}</strong>
          </div>

          <button
            type="button"
            class="admin-terminal-contract-ledger-open-v466"
            data-admin-terminal-action="open-contract-profile"
            data-contract-title="${escapeHtml(contract.title)}"
            data-contract-meta="${escapeHtml(contract.meta)}"
            data-contract-reward="${escapeHtml(contract.reward)}"
            data-contract-status="${escapeHtml(contract.status)}"
            data-contract-objective="${escapeHtml(contract.objective)}"
            data-contract-deadline="${escapeHtml(contract.deadline)}"
            data-contract-submissions="${escapeHtml(contract.submissions)}"
            data-contract-progress="${escapeHtml(contract.completionPercent)}"
            data-contract-locations="${escapeHtml(contract.locations)}"
            data-contract-payout="${escapeHtml(contract.payoutType)}"
            data-contract-evidence="${escapeHtml(contract.evidence)}"
            data-contract-instructions="${escapeHtml(contract.instructions)}"
            data-contract-success="${escapeHtml(contract.successCriteria)}"
            data-contract-review-note="${escapeHtml(contract.teacherNote)}"
            data-contract-owner="${escapeHtml(contract.owner)}"
            data-contract-category="${escapeHtml(contract.category)}"
            data-contract-difficulty="${escapeHtml(contract.difficulty)}"
          >View</button>
        </summary>

        <section class="admin-terminal-contract-ledger-detail-v466 admin-terminal-contract-ledger-detail-v494 admin-terminal-contract-ledger-detail-v495">
          <div class="admin-terminal-contract-writing-summary-v494 admin-terminal-contract-writing-summary-v495">
            <span>Instructions</span>
            <p>${escapeHtml(contract.instructions)}</p>
          </div>
          <div class="admin-terminal-contract-criteria-grid-v494 admin-terminal-contract-criteria-grid-v495">
            <article>
              <span>Submission requirement</span>
              <p>${escapeHtml(contract.evidence)}</p>
            </article>
            <article>
              <span>Audience</span>
              <p>${escapeHtml(contract.locations)}</p>
            </article>
          </div>
          <div class="admin-terminal-contract-ledger-detail-actions-v470">
            <button
              type="button"
              data-admin-terminal-action="review-contract-submissions"
              data-contract-title="${escapeHtml(contract.title)}"
              data-contract-meta="${escapeHtml(contract.meta)}"
              data-contract-reward="${escapeHtml(contract.reward)}"
              data-contract-status="${escapeHtml(contract.status)}"
              data-contract-objective="${escapeHtml(contract.objective)}"
              data-contract-deadline="${escapeHtml(contract.deadline)}"
              data-contract-submissions="${escapeHtml(contract.submissions)}"
              data-contract-progress="${escapeHtml(contract.completionPercent)}"
              data-contract-locations="${escapeHtml(contract.locations)}"
              data-contract-payout="${escapeHtml(contract.payoutType)}"
              data-contract-evidence="${escapeHtml(contract.evidence)}"
              data-contract-instructions="${escapeHtml(contract.instructions)}"
              data-contract-success="${escapeHtml(contract.successCriteria)}"
              data-contract-review-note="${escapeHtml(contract.teacherNote)}"
              data-contract-owner="${escapeHtml(contract.owner)}"
              data-contract-category="${escapeHtml(contract.category)}"
              data-contract-difficulty="${escapeHtml(contract.difficulty)}"
            >Review Submissions</button>
          </div>
        </section>
      </details>`;
  }

  function renderContractOverviewMetric(label, value, detail = "") {
    return `
      <article>
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
        ${detail ? `<small>${escapeHtml(detail)}</small>` : ""}
      </article>`;
  }

  function renderContractsPage(model) {
    const contracts = getTerminalContractRows(model);
    const active = contracts.filter((contract) => contract.filterStatus === "active");
    const dueSoon = contracts.filter((contract) => contract.filterStatus === "due");
    const submitted = contracts.filter((contract) => contract.filterStatus === "review");
    const scheduled = contracts.filter((contract) => contract.filterStatus === "scheduled");
    const rewardPressure = contracts.reduce((sum, contract) => sum + (Number.parseFloat(contract.reward) || 0), 0).toFixed(2);
    const submittedTotal = contracts.reduce((sum, contract) => sum + (Number(contract.submittedCount) || 0), 0);
    const totalSlots = contracts.reduce((sum, contract) => sum + (Number(contract.totalCount) || 0), 0);
    const reviewState = submitted.length ? `${submitted.length} waiting` : "Clear";
    const selected = contracts[0];
    const focusContract = dueSoon[0] || selected || null;

    return `
      <section class="admin-terminal-overview admin-terminal-contracts-page" aria-label="Admin contracts terminal" data-admin-terminal-page="Assignments">
        ${renderContractsPageHeader(model)}
        <div class="admin-terminal-contracts-layout-v466">
          <aside class="admin-terminal-contracts-overview-v466" aria-label="Contracts overview">
            <header>
              <span>Contract Overview</span>
              <strong>${escapeHtml(contracts.length)} records</strong>
              <small>${escapeHtml(active.length)} active · ${escapeHtml(dueSoon.length)} due soon · ${escapeHtml(reviewState)}</small>
            </header>

            <section class="admin-terminal-contracts-hero-v466">
              <span>Reward Exposure</span>
              <strong>${renderCurrencyAmount(rewardPressure, "NRC")}</strong>
              <small>Total listed payout across current contracts.</small>
            </section>

            <div class="admin-terminal-contracts-metrics-v466">
              ${renderContractOverviewMetric("Active", String(active.length), "live work")}
              ${renderContractOverviewMetric("Review", String(submitted.length), "submitted")}
              ${renderContractOverviewMetric("Scheduled", String(scheduled.length), "upcoming")}
              ${renderContractOverviewMetric("Progress", totalSlots ? `${Math.round((submittedTotal / totalSlots) * 100)}%` : "0%", `${submittedTotal}/${totalSlots} submissions`)}
            </div>

            <button
              class="admin-terminal-contracts-focus-v466 is-clickable"
              type="button"
              data-admin-terminal-action="focus-contract"
              data-contract-title="${escapeHtml(focusContract?.title || "")}"
              ${focusContract ? "" : "disabled"}
              aria-label="Jump to current focus contract"
            >
              <span>Current Focus</span>
              <strong>${escapeHtml(focusContract?.title || "No contract selected")}</strong>
              <small>${escapeHtml(focusContract?.deadline || "No deadline")}</small>
              <em>Open contract view</em>
            </button>

            <button class="admin-terminal-contracts-add-v466" type="button" data-admin-terminal-action="add-contract">
              <span>＋</span>
              Add Contract
            </button>
          </aside>

          <section class="admin-terminal-contracts-workspace-v466" aria-label="Contract workspace">
            <header class="admin-terminal-contracts-workspace-head-v466">
              <div>
                <span>Contract Ledger</span>
                <strong>Current class work</strong>
                <small>Filter active work, review queue, scheduled contracts, and due-soon items from one ledger.</small>
              </div>

              <div class="admin-terminal-contracts-filter-v466" aria-label="Contract filters" data-contract-filter-controls>
                <button type="button" class="active" aria-pressed="true" data-admin-terminal-action="filter-contracts" data-contract-filter="all">All ${escapeHtml(contracts.length)}</button>
                <button type="button" aria-pressed="false" data-admin-terminal-action="filter-contracts" data-contract-filter="active">Active ${escapeHtml(active.length)}</button>
                <button type="button" aria-pressed="false" data-admin-terminal-action="filter-contracts" data-contract-filter="due">Due ${escapeHtml(dueSoon.length)}</button>
                <button type="button" aria-pressed="false" data-admin-terminal-action="filter-contracts" data-contract-filter="review">Review ${escapeHtml(submitted.length)}</button>
                <button type="button" aria-pressed="false" data-admin-terminal-action="filter-contracts" data-contract-filter="scheduled">Scheduled ${escapeHtml(scheduled.length)}</button>
              </div>
            </header>

            <div class="admin-terminal-contract-ledger-v466" role="table" aria-label="Contracts ledger table">
              <div class="admin-terminal-contract-ledger-head-v466" role="row">
                <span>Contract</span>
                <span>Status</span>
                <span>Reward</span>
                <span>Submissions</span>
                <span>Deadline</span>
                <span>Action</span>
              </div>
              ${contracts.length ? contracts.map(renderContractLedgerRow).join("") : `<p class="admin-terminal-contract-empty-v466">No contracts available.</p>`}
              <p class="admin-terminal-contract-empty-v466 is-filter-empty" data-contract-filter-empty hidden>No contracts match this filter.</p>
            </div>
          </section>
        </div>
      </section>`;
  }


  function normalizeTerminalStoreStatus(status) {
    const raw = String(status || "Active").trim();
    const normalized = raw.toLowerCase();

    if (normalized.includes("low")) {
      return { label: "Low Stock", filter: "risk", tone: "is-warn" };
    }

    if (normalized.includes("sold") || normalized.includes("out")) {
      return { label: "Sold Out", filter: "risk", tone: "is-muted" };
    }

    if (normalized.includes("draft")) {
      return { label: "Draft", filter: "draft", tone: "is-muted" };
    }

    if (normalized.includes("pause") || normalized.includes("inactive") || normalized.includes("hidden")) {
      return { label: "Paused", filter: "risk", tone: "is-muted" };
    }

    if (normalized.includes("restrict") || normalized.includes("blocked") || normalized.includes("disabled")) {
      return { label: "Restricted", filter: "risk", tone: "is-bad" };
    }

    return { label: "Active", filter: "active", tone: "is-active" };
  }

  function normalizeTerminalStoreKind(item) {
    const raw = String(item?.kind || item?.category || item?.itemType || "Consumable").toLowerCase();

    if (raw.includes("material") || raw.includes("resource") || raw.includes("component") || raw.includes("alloy")) {
      return { key: "materials", label: "Material" };
    }

    if (raw.includes("equipment") || raw.includes("tool") || raw.includes("device") || raw.includes("gear")) {
      return { key: "equipment", label: "Equipment" };
    }

    if (raw.includes("consumable") || raw.includes("pass") || raw.includes("boost") || raw.includes("one-time") || raw.includes("supply")) {
      return { key: "consumables", label: "Consumable" };
    }

    return { key: "consumables", label: "Consumable" };
  }

  function normalizeTerminalStoreSource(item, index) {
    const raw = String(item?.sourceType || item?.origin || item?.catalogSource || item?.source || "").toLowerCase();
    const explicitlyCustom = item?.customItem === true || item?.teacherItem === true || raw.includes("custom") || raw.includes("teacher");
    const explicitlySystem = item?.systemItem === true || item?.lockedSystemItem === true || raw.includes("system") || raw.includes("seed");

    if (explicitlyCustom) {
      return { key: "custom", label: "Custom", badge: "Teacher item", editable: true, meta: "Teacher-created item. Safe to edit without changing the economic core." };
    }

    if (explicitlySystem || index < 9) {
      return { key: "system", label: "System", badge: "Seeded item", editable: false, meta: "System item. Visible in Store, but protected from teacher edits." };
    }

    return { key: "custom", label: "Custom", badge: "Teacher item", editable: true, meta: "Teacher-created item. Safe to edit without changing the economic core." };
  }

  function isTerminalStoreRiskItem(item, statusMeta) {
    const risk = String(item?.risk || "").toLowerCase();
    const stock = String(item?.stock || "").toLowerCase();
    return statusMeta.filter === "risk" || risk.includes("high") || risk.includes("restock") || risk.includes("pause") || risk.includes("restrict") || stock === "0";
  }

  const TERMINAL_STORE_COUNTRIES_V480 = Object.freeze([
    { code: "NORTHREACH", label: "Northreach", weight: 1.18, priceDrift: -3, restockDrift: "+12%", macroDriver: "Strong AS", restockDriver: "Logistics surplus" },
    { code: "YRETHIA", label: "Yrethia", weight: .92, priceDrift: 5, restockDrift: "-4%", macroDriver: "Demand pressure", restockDriver: "Stable supply" },
    { code: "SOLVEND", label: "Solvend", weight: 1.32, priceDrift: -6, restockDrift: "+18%", macroDriver: "Productive surplus", restockDriver: "High AS" },
    { code: "ELDORAN", label: "Eldoran", weight: .78, priceDrift: 9, restockDrift: "-12%", macroDriver: "Cost pressure", restockDriver: "Input tightness" },
    { code: "THALORIS", label: "Thaloris", weight: .66, priceDrift: 14, restockDrift: "-18%", macroDriver: "High inflation", restockDriver: "Supply constrained" },
    { code: "VALERION", label: "Valerion", weight: 1.08, priceDrift: 2, restockDrift: "+5%", macroDriver: "Balanced AD/AS", restockDriver: "Normal cycle" },
    { code: "SYNDALIS", label: "Syndalis", weight: .54, priceDrift: 22, restockDrift: "-28%", macroDriver: "Inflation shock", restockDriver: "Weak AS" },
    { code: "KAIVORA", label: "Kaivora", weight: 1.02, priceDrift: 4, restockDrift: "+2%", macroDriver: "Import stable", restockDriver: "Port access" },
    { code: "ORINTH", label: "Orinth", weight: .84, priceDrift: 11, restockDrift: "-10%", macroDriver: "Currency pressure", restockDriver: "Trade friction" },
    { code: "DRAVIK", label: "Dravik", weight: .70, priceDrift: 16, restockDrift: "-22%", macroDriver: "Trade restricted", restockDriver: "Import bottleneck" }
  ]);

  function normalizeTerminalStoreCountryCode(value) {
    return String(value || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_") || "NORTHREACH";
  }

  function numberFromTerminalStoreValue(value, fallback = 0) {
    if (value === "∞") return Number.POSITIVE_INFINITY;
    const numeric = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function formatTerminalStoreStockValue(value) {
    return value === Number.POSITIVE_INFINITY || value === "∞" ? "∞" : String(Math.max(0, Math.round(Number(value) || 0)));
  }

  function normalizeTerminalStorePricingMode(item, sourceMeta) {
    const raw = String(item?.pricingMode || item?.priceMode || "").toLowerCase();
    const economyLinked = sourceMeta?.key === "system" || raw.includes("economy") || raw.includes("macro") || raw.includes("dynamic") || item?.followEconomy === true;
    return economyLinked
      ? { key: "economy", label: "Variable by country", meta: "Backend-controlled pricing" }
      : { key: "fixed", label: "Fixed price", meta: "Teacher-set price" };
  }

  function parseTerminalStorePercent(value, fallback = 0) {
    const numeric = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function formatTerminalStorePriceRange(value, currency = "NRC") {
    const prices = Array.isArray(value) ? value.filter((entry) => Number.isFinite(entry)) : [];
    if (!prices.length) return `0 ${currency}`;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const formatPrice = (amount) => `${amount.toFixed(2)} ${currency}`;
    return Math.abs(max - min) < .01 ? formatPrice(min) : `${formatPrice(min)}–${formatPrice(max)}`;
  }

  function deriveTerminalStoreCountryStock(item, index, statusMeta, sourceMeta) {
    const supplied = Array.isArray(item?.countryStock) ? item.countryStock : Array.isArray(item?.stockByCountry) ? item.stockByCountry : null;
    const baseStock = numberFromTerminalStoreValue(item?.stock, Number.POSITIVE_INFINITY);
    const basePrice = numberFromTerminalStoreValue(item?.price, 0);
    const pricingMode = normalizeTerminalStorePricingMode(item, sourceMeta);
    const countryCount = TERMINAL_STORE_COUNTRIES_V480.length;

    if (supplied && supplied.length) {
      return TERMINAL_STORE_COUNTRIES_V480.map((country, countryIndex) => {
        const match = supplied.find((entry) => normalizeTerminalStoreCountryCode(entry?.code || entry?.country || entry?.location) === country.code) || {};
        const stock = match.stock === "∞" || match.stock === "Unlimited" ? Number.POSITIVE_INFINITY : numberFromTerminalStoreValue(match.stock, Math.max(0, Math.round((Number.isFinite(baseStock) ? baseStock : 30) / countryCount)));
        const available = stock;
        const macroModifier = parseTerminalStorePercent(match.priceModifier || match.modifier, country.priceDrift || 0);
        const appliedModifier = pricingMode.key === "economy" ? macroModifier : 0;
        const localPrice = numberFromTerminalStoreValue(match.price ?? match.localPrice, basePrice * (1 + appliedModifier / 100));
        const priceModifier = pricingMode.key === "economy" ? (appliedModifier > 0 ? `+${appliedModifier}%` : `${appliedModifier}%`) : "Fixed";
        const status = match.status || (available === 0 ? "Sold Out" : available <= 3 ? "Low Stock" : statusMeta.label);
        const restock = match.restock || item.restock || "Manual";
        const visibility = match.visibility || item.visibility || "All players";
        const macroDriver = match.macroDriver || match.priceReason || (pricingMode.key === "economy" ? country.macroDriver : "Teacher fixed");
        const restockDriver = match.restockDriver || match.restockReason || (pricingMode.key === "economy" ? country.restockDriver : "Manual rule");

        return {
          code: country.code,
          country: match.label || match.country || country.label,
          stock,
          available,
          priceModifier,
          price: localPrice.toFixed(2),
          priceNumber: localPrice,
          currency: match.currency || item.currency || "NRC",
          status,
          restock,
          visibility,
          macroDriver,
          restockDriver,
          pricingMode: pricingMode.label
        };
      });
    }

    if (!Number.isFinite(baseStock)) {
      return TERMINAL_STORE_COUNTRIES_V480.map((country) => {
        const appliedModifier = pricingMode.key === "economy" ? country.priceDrift || 0 : 0;
        const localPrice = basePrice * (1 + appliedModifier / 100);
        return {
          code: country.code,
          country: country.label,
          stock: Number.POSITIVE_INFINITY,
          available: Number.POSITIVE_INFINITY,
          priceModifier: pricingMode.key === "economy" ? (appliedModifier > 0 ? `+${appliedModifier}%` : `${appliedModifier}%`) : "Fixed",
          price: localPrice.toFixed(2),
          priceNumber: localPrice,
          currency: item.currency || "NRC",
          status: statusMeta.label,
          restock: item.restock || "Unlimited",
          visibility: item.visibility || "All players",
          macroDriver: pricingMode.key === "economy" ? country.macroDriver : "Teacher fixed",
          restockDriver: pricingMode.key === "economy" ? country.restockDriver : "Unlimited rule",
          pricingMode: pricingMode.label
        };
      });
    }

    const totalWeight = TERMINAL_STORE_COUNTRIES_V480.reduce((sum, country) => sum + country.weight, 0);
    let remaining = Math.max(0, Math.round(baseStock));
    return TERMINAL_STORE_COUNTRIES_V480.map((country, countryIndex) => {
      const last = countryIndex === countryCount - 1;
      const allocation = last ? remaining : Math.max(0, Math.round((baseStock * country.weight) / totalWeight));
      remaining -= allocation;
      const available = Math.max(0, allocation);
      const modifierNumber = pricingMode.key === "economy" ? country.priceDrift || 0 : 0;
      const localPrice = basePrice * (1 + modifierNumber / 100);
      const status = available === 0 ? "Sold Out" : available <= 3 ? "Low Stock" : statusMeta.label;
      return {
        code: country.code,
        country: country.label,
        stock: allocation,
        available,
        priceModifier: pricingMode.key === "economy" ? (modifierNumber > 0 ? `+${modifierNumber}%` : `${modifierNumber}%`) : "Fixed",
        price: localPrice.toFixed(2),
        priceNumber: localPrice,
        currency: item.currency || "NRC",
        status,
        restock: item.restock || "Manual",
        visibility: item.visibility || "All players",
        macroDriver: pricingMode.key === "economy" ? country.macroDriver : "Teacher fixed",
        restockDriver: pricingMode.key === "economy" ? country.restockDriver : "Manual rule",
        pricingMode: pricingMode.label
      };
    });
  }

  function summarizeTerminalStoreCountryStock(countryStock) {
    const countries = Array.isArray(countryStock) ? countryStock : [];
    const finite = countries.filter((entry) => Number.isFinite(entry.available));
    const unlimited = countries.some((entry) => entry.available === Number.POSITIVE_INFINITY);
    const total = unlimited ? "∞" : finite.reduce((sum, entry) => sum + Math.max(0, Number(entry.available) || 0), 0);
    const activeCountries = countries.filter((entry) => entry.available === Number.POSITIVE_INFINITY || Number(entry.available) > 0).length;
    const lowCountries = countries.filter((entry) => Number.isFinite(entry.available) && Number(entry.available) > 0 && Number(entry.available) <= 3).length;
    const soldOutCountries = countries.filter((entry) => Number.isFinite(entry.available) && Number(entry.available) <= 0).length;
    const stockMeta = unlimited ? "Unlimited by country" : `${activeCountries}/${countries.length} countries stocked`;
    const countryRisk = soldOutCountries ? `${soldOutCountries} sold out` : lowCountries ? `${lowCountries} low` : "balanced";
    const pricedCountries = countries.filter((entry) => Number.isFinite(entry.priceNumber));
    const priceCurrency = pricedCountries[0]?.currency || countries[0]?.currency || "NRC";
    const priceRangeText = formatTerminalStorePriceRange(pricedCountries.map((entry) => entry.priceNumber), priceCurrency);
    const priceVariance = pricedCountries.length ? Math.max(...pricedCountries.map((entry) => entry.priceNumber)) - Math.min(...pricedCountries.map((entry) => entry.priceNumber)) : 0;
    const economyLinked = countries.some((entry) => String(entry.priceModifier || "").toLowerCase() !== "fixed");

    return {
      totalStock: total,
      totalStockText: total === "∞" ? "∞" : String(total),
      activeCountries,
      lowCountries,
      soldOutCountries,
      countryRisk,
      stockMeta,
      priceRangeText,
      priceVariance,
      priceCurrency,
      economyLinked,
      hasCountryVariance: countries.length > 1
    };
  }

  function getTerminalStoreItems(model) {
    const source = Array.isArray(model?.storeItems) && model.storeItems.length
      ? model.storeItems
      : [
          { name: "Refined Alloy Bundle", kind: "Material", category: "Industrial Material", subcategory: "Crafting input", price: "12.00", currency: "NRC", stock: "64", status: "Active", restock: "Weekly", purchases: "18", pricingMode: "Economy-linked", risk: "Balanced", fulfillment: "Add to inventory", visibility: "All players", description: "Base material used for manufacturing and contract production tasks." },
          { name: "Energy Cell Pack", kind: "Material", category: "Power Material", subcategory: "Energy input", price: "9.00", currency: "NRC", stock: "42", status: "Active", restock: "Every 3 days", purchases: "24", pricingMode: "Economy-linked", risk: "Balanced", fulfillment: "Add to inventory", visibility: "All players", description: "Consumable production input for power-sensitive simulations." },
          { name: "Logistics Scanner", kind: "Equipment", category: "Operations Equipment", subcategory: "Reusable tool", price: "55.00", currency: "NRC", stock: "6", status: "Active", restock: "Manual", purchases: "5", pricingMode: "Economy-linked", risk: "High value", fulfillment: "Add equipment record", visibility: "Unlocked after first contract", description: "Reusable equipment that supports logistics and inspection contracts." },
          { name: "Market Lens", kind: "Equipment", category: "Analysis Equipment", subcategory: "Reusable tool", price: "70.00", currency: "NRC", stock: "3", status: "Low Stock", restock: "Manual", purchases: "7", pricingMode: "Economy-linked", risk: "Restock soon", fulfillment: "Add equipment record", visibility: "All players", description: "Premium analysis device used for market-readiness tasks." },
          { name: "Emergency Repair Kit", kind: "Consumable", category: "Consumable", subcategory: "One-time use", price: "18.00", currency: "NRC", stock: "25", status: "Active", restock: "Weekly", purchases: "16", pricingMode: "Economy-linked", risk: "Low risk", fulfillment: "Add to inventory", visibility: "All players", description: "One-time item for resolving equipment or production disruptions." },
          { name: "Priority Processing Token", kind: "Consumable", category: "Service Token", subcategory: "One-time use", price: "30.00", currency: "NRC", stock: "10", status: "Active", restock: "Weekly", purchases: "9", pricingMode: "Economy-linked", risk: "High impact", fulfillment: "Manual redemption", visibility: "Teacher approval", description: "Consumable token that lets a player request priority processing." },
          { name: "Field Permit", kind: "Consumable", category: "Access Pass", subcategory: "Contract unlock", price: "22.00", currency: "NRC", stock: "∞", status: "Active", restock: "Unlimited", purchases: "12", pricingMode: "Economy-linked", risk: "Balanced", fulfillment: "Unlock player action", visibility: "All players", description: "Purchaseable permit for participating in location-based tasks." },
          { name: "Advanced Fabricator", kind: "Equipment", category: "Manufacturing Equipment", subcategory: "Reusable machine", price: "120.00", currency: "NRC", stock: "1", status: "Restricted", restock: "Admin only", purchases: "1", pricingMode: "Economy-linked", risk: "Restricted high value", fulfillment: "Admin approval required", visibility: "Admin release", description: "High-value equipment for advanced production scenarios." },
          { name: "Data Chip", kind: "Material", category: "Digital Material", subcategory: "Research input", price: "15.00", currency: "NRC", stock: "0", status: "Sold Out", restock: "Next class", purchases: "30", pricingMode: "Economy-linked", risk: "Restock soon", fulfillment: "Add to inventory", visibility: "All players", description: "Research component used in information-market contracts.", systemItem: true },
          { name: "Teacher Bonus Coupon", kind: "Consumable", category: "Classroom Custom", subcategory: "Teacher reward", price: "8.00", currency: "Steam Bucks", stock: "∞", status: "Active", restock: "Unlimited", purchases: "4", pricingMode: "Fixed price", risk: "Teacher controlled", fulfillment: "Manual redemption", visibility: "Admin release only", description: "Custom classroom reward created by the teacher. Does not affect system economy logic.", customItem: true },
          { name: "Workshop Access Pass", kind: "Consumable", category: "Classroom Custom", subcategory: "Access pass", price: "12.00", currency: "Steam Bucks", stock: "18", status: "Active", restock: "Manual", purchases: "6", pricingMode: "Fixed price", risk: "Teacher controlled", fulfillment: "Unlock player action", visibility: "Selected locations", description: "Custom access item for teacher-run events, side tasks, or classroom activities.", customItem: true }
        ];

    return source.map((item, index) => {
      const status = item.status || (index === 3 ? "Low Stock" : index === 7 ? "Restricted" : "Active");
      const statusMeta = normalizeTerminalStoreStatus(status);
      const kindMeta = normalizeTerminalStoreKind(item);
      const sourceMeta = normalizeTerminalStoreSource(item, index);
      const priceNumber = Number(String(item.price || "0").replace(/[^0-9.-]/g, "")) || 0;
      const stockText = String(item.stock ?? "∞");
      const pricingMode = normalizeTerminalStorePricingMode(item, sourceMeta);
      const countryStock = deriveTerminalStoreCountryStock(item, index, statusMeta, sourceMeta);
      const countryStockSummary = summarizeTerminalStoreCountryStock(countryStock);
      const stockNumber = countryStockSummary.totalStock === "∞" ? Number.POSITIVE_INFINITY : Number(countryStockSummary.totalStock);
      const stockLevel = Number.isFinite(stockNumber)
        ? stockNumber <= 0 ? "soldout" : stockNumber <= 5 || countryStockSummary.lowCountries > 0 ? "low" : "stocked"
        : "unlimited";
      const riskFilter = isTerminalStoreRiskItem(item, statusMeta) || countryStockSummary.lowCountries > 0 || countryStockSummary.soldOutCountries > 0 ? "risk" : "clear";

      return {
        name: item.name || `Store Item ${index + 1}`,
        kind: kindMeta.label,
        kindKey: kindMeta.key,
        sourceKey: sourceMeta.key,
        sourceLabel: sourceMeta.label,
        sourceBadge: sourceMeta.badge,
        sourceMeta: sourceMeta.meta,
        editable: sourceMeta.editable,
        category: item.category || kindMeta.label,
        subcategory: item.subcategory || item.itemType || "Purchasable item",
        price: item.price || "0.00",
        priceNumber,
        priceRange: countryStockSummary.priceRangeText || `${item.price || "0.00"} ${item.currency || "NRC"}`,
        pricingMode: pricingMode.label,
        pricingModeKey: pricingMode.key,
        pricingModeMeta: pricingMode.meta,
        currency: item.currency || "NRC",
        stock: countryStockSummary.totalStockText,
        baseStock: stockText,
        stockLevel,
        countryStock,
        countryStockSummary,
        status: statusMeta.label,
        rawStatus: status,
        filterStatus: statusMeta.filter,
        riskFilter,
        tone: statusMeta.tone,
        restock: item.restock || "Manual",
        purchases: item.purchases || "0",
        fulfillment: item.fulfillment || "Add to inventory",
        visibility: item.visibility || "All players",
        description: item.description || "Purchasable store item.",
        index
      };
    });
  }

  function renderStorePageHeader(model) {
    return `
      <header class="admin-terminal-top admin-terminal-page-top">
        <div>
          <span>Purchasable catalog</span>
          <h2>Store</h2>
          <p>Build and manage materials, equipment, consumables, country stock, prices, and player-facing availability.</p>
        </div>

        <div class="admin-terminal-top-actions">
          <button class="admin-terminal-bell" type="button" aria-label="Alerts" data-admin-terminal-bell>
            ${bellIcon()}
            ${model.notificationCount ? `<small>${escapeHtml(model.notificationCount)}</small>` : ""}
          </button>
          <button class="admin-terminal-user-button" type="button" aria-label="Open admin profile menu" aria-expanded="false" data-admin-terminal-user>
            <span class="admin-terminal-avatar">${escapeHtml(getAdminInitials(model.adminName))}</span>
            <i aria-hidden="true"></i>
          </button>
          ${renderNotifications(model)}
          ${renderAdminUserMenu(model)}
        </div>
      </header>`;
  }

  function renderStoreStatusBadge(status, tone = "is-active") {
    return `<span class="admin-terminal-store-status ${escapeHtml(tone)}">${escapeHtml(status)}</span>`;
  }

  function renderStoreTypeChip(item) {
    return `<span class="admin-terminal-store-type-v479 is-${escapeHtml(item.kindKey)}">${escapeHtml(item.kind)}</span>`;
  }

  function renderStoreMetric(label, value, meta, tone = "cyan") {
    return `
      <article class="admin-terminal-store-metric is-${escapeHtml(tone)}">
        <small>${escapeHtml(label)}</small>
        <strong>${escapeHtml(value)}</strong>
        <span>${escapeHtml(meta)}</span>
      </article>`;
  }

  function renderStoreCountryStockTable(item) {
    const countries = Array.isArray(item.countryStock) ? item.countryStock : [];
    return `
      <section class="admin-terminal-store-country-stock-v480" aria-label="Country stock for ${escapeHtml(item.name)}">
        <header>
          <span>Country stock</span>
          <strong>${escapeHtml(item.countryStockSummary.stockMeta)}</strong>
          <small>Store stock controls purchasable inventory only.</small>
        </header>
        <div class="admin-terminal-store-country-stock-head-v480" role="row">
          <span>Country</span>
          <span>Available</span>
          <span>Local Price</span>
          <span>Restock</span>
          <span>Status</span>
        </div>
        ${countries.map((country) => {
          const availableText = formatTerminalStoreStockValue(country.available);
          const statusTone = String(country.status || "").toLowerCase().includes("sold") ? "is-muted" : String(country.status || "").toLowerCase().includes("low") ? "is-warn" : "is-active";
          return `
            <article class="admin-terminal-store-country-stock-row-v480 ${escapeHtml(statusTone)}" role="row">
              <span><b>${escapeHtml(country.country)}</b><small>${escapeHtml(country.code)}</small></span>
              <span><b>${escapeHtml(availableText)}</b><small>purchasable stock</small></span>
              <span><b>${renderCurrencyAmount(country.price, country.currency)}</b></span>
              <span><b>${escapeHtml(country.restock)}</b><small>Next cycle</small></span>
              <span>${renderStoreStatusBadge(country.status, statusTone)}</span>
            </article>`;
        }).join("")}
      </section>`;
  }

  function normalizeStoreEditSelect(value, field = "") {
    const text = String(value || "").toLowerCase();


    if (field === "restock") {
      if (text.includes("daily")) return "Daily restock";
      if (text.includes("weekly")) return "Weekly restock";
      if (text.includes("class")) return "Per class cycle";
      if (text.includes("never")) return "Never restock";
      return "Manual restock";
    }

    return String(value || "");
  }

  function renderStoreCatalogRow(item) {
    const stockMeta = item.countryStockSummary?.stockMeta || (item.stockLevel === "unlimited" ? "Unlimited" : item.stockLevel === "soldout" ? "Sold out" : item.stockLevel === "low" ? "Low stock" : "Stocked");
    const actionLabel = item.editable ? "Edit" : "Locked";
    const editStockMode = item.baseStock === "∞" ? "Unlimited" : "Limited";
    const editStockQuantity = item.baseStock === "∞" ? "" : String(item.baseStock || "").replace(/[^0-9]/g, "");
    const editRestock = normalizeStoreEditSelect(item.restock, "restock");

    return `
      <details class="admin-terminal-store-row-v479 ${escapeHtml(item.tone)} is-${escapeHtml(item.sourceKey)}-item" data-store-item data-store-status="${escapeHtml(item.filterStatus)}" data-store-risk="${escapeHtml(item.riskFilter)}" data-store-kind="${escapeHtml(item.kindKey)}" data-store-source="${escapeHtml(item.sourceKey)}">
        <summary>
          <span class="admin-terminal-store-row-item-v479">
            <i aria-hidden="true">${escapeHtml(item.kind.slice(0, 1))}</i>
            <span>
              <small>${escapeHtml(item.sourceLabel)}</small>
              <strong>${escapeHtml(item.name)}</strong>
            </span>
          </span>

          <span class="admin-terminal-store-row-type-v479">
            ${renderStoreTypeChip(item)}
            <small>${escapeHtml(item.subcategory)}</small>
          </span>

          <span class="admin-terminal-store-row-price-v479 is-v489">
            <small>Price Range</small>
            <strong>${escapeHtml(item.priceRange)}</strong>
          </span>

          <span class="admin-terminal-store-row-stock-v479 is-${escapeHtml(item.stockLevel)}">
            <small>${escapeHtml(stockMeta)}</small>
            <strong>${escapeHtml(item.stock)}</strong>
          </span>

          <span class="admin-terminal-store-row-status-v479">
            <b class="admin-terminal-store-origin-v481 is-${escapeHtml(item.sourceKey)}">${escapeHtml(item.sourceBadge)}</b>
            ${renderStoreStatusBadge(item.status, item.tone)}
          </span>

          <span class="admin-terminal-store-row-actions-v479">
            ${item.editable
              ? `<button type="button"
                  data-admin-terminal-action="edit-store-item"
                  data-store-edit-name="${escapeHtml(item.name)}"
                  data-store-edit-description="${escapeHtml(item.description)}"
                  data-store-edit-category="${escapeHtml(item.kind)}"
                  data-store-edit-type="${escapeHtml(item.subcategory)}"
                  data-store-edit-status="${escapeHtml(item.status)}"
                  data-store-edit-price="${escapeHtml(item.price)}"
                  data-store-edit-currency="${escapeHtml(item.currency)}"
                  data-store-edit-pricing-mode="${escapeHtml(item.pricingMode)}"
                  data-store-edit-stock-mode="${escapeHtml(editStockMode)}"
                  data-store-edit-stock-quantity="${escapeHtml(editStockQuantity)}"
                  data-store-edit-restock="${escapeHtml(editRestock)}"
                  data-store-edit-visibility="${escapeHtml(item.visibility)}"
                  data-store-edit-fulfillment="${escapeHtml(item.fulfillment)}"
                  data-store-edit-usage="Player redeems manually">${escapeHtml(actionLabel)}</button>`
              : `<button type="button" class="is-locked" disabled aria-disabled="true">${escapeHtml(actionLabel)}</button>`}
          </span>
        </summary>

        <section class="admin-terminal-store-row-detail-v479 is-clean-v491">
          <article class="admin-terminal-store-description-v491"><small>Description</small><p>${escapeHtml(item.description)}</p></article>
          <article><small>Restock</small><strong>${escapeHtml(item.restock)}</strong></article>
          <article><small>Visibility</small><strong>${escapeHtml(item.visibility)}</strong></article>
          <article><small>Fulfillment</small><strong>${escapeHtml(item.fulfillment)}</strong></article>
        </section>
        ${renderStoreCountryStockTable(item)}
      </details>`;
  }

  function renderStorePage(model) {
    const items = getTerminalStoreItems(model);
    const activeCount = items.filter((item) => item.status === "Active").length;
    const materialCount = items.filter((item) => item.kindKey === "materials").length;
    const equipmentCount = items.filter((item) => item.kindKey === "equipment").length;
    const consumableCount = items.filter((item) => item.kindKey === "consumables").length;
    const riskCount = items.filter((item) => item.riskFilter === "risk").length;
    const systemCount = items.filter((item) => item.sourceKey === "system").length;
    const customCount = items.filter((item) => item.sourceKey === "custom").length;
    const lowStockCount = items.filter((item) => item.stockLevel === "low" || item.stockLevel === "soldout").length;
    const countryStockedCount = items.reduce((total, item) => total + (item.countryStockSummary?.activeCountries || 0), 0);
    const countryLowCount = items.reduce((total, item) => total + (item.countryStockSummary?.lowCountries || 0) + (item.countryStockSummary?.soldOutCountries || 0), 0);
    const listedValue = items.reduce((total, item) => total + item.priceNumber, 0);

    return `
      <section class="admin-terminal-overview admin-terminal-store-page" aria-label="Admin store terminal" data-admin-terminal-page="Store">
        ${renderStorePageHeader(model)}

        <div class="admin-terminal-store-manager-v479">
          <aside class="admin-terminal-store-overview-v479" aria-label="Store catalog overview">
            <header>
              <span>Catalog</span>
              <strong>${escapeHtml(items.length)} items</strong>
              <small>${escapeHtml(systemCount)} system locked · ${escapeHtml(customCount)} custom editable</small>
            </header>

            <button class="admin-terminal-store-add-v479" type="button" data-admin-terminal-action="add-store-item">
              <span>＋</span>
              Add Custom Item
            </button>

            <section class="admin-terminal-store-metrics-v479 is-slim-v482">
              ${renderStoreMetric("System", systemCount, "locked", "cyan")}
              ${renderStoreMetric("Custom", customCount, "editable", "active")}
              ${renderStoreMetric("Review", riskCount, "needs check", riskCount ? "warn" : "active")}
            </section>

            <section class="admin-terminal-store-rules-v479 is-slim-v482">
              <span>Store rule</span>
              <p>System items are seeded and protected. Teachers only add or edit custom items.</p>
            </section>
          </aside>

          <section class="admin-terminal-store-catalog-v479" aria-label="Store catalog manager">
            <header>
              <div>
                <span>Purchasable Catalog</span>
                <h3>Store items</h3>
                <small>Open a row for country stock, local prices, restock, and item details.</small>
              </div>
              <div class="admin-terminal-store-tabs-v479 is-slim-v482" data-store-filter-controls>
                <button type="button" class="active" aria-pressed="true" data-admin-terminal-action="filter-store" data-store-filter="all">All ${escapeHtml(items.length)}</button>
                <button type="button" aria-pressed="false" data-admin-terminal-action="filter-store" data-store-filter="system">System ${escapeHtml(systemCount)}</button>
                <button type="button" aria-pressed="false" data-admin-terminal-action="filter-store" data-store-filter="custom">Custom ${escapeHtml(customCount)}</button>
                <button type="button" aria-pressed="false" data-admin-terminal-action="filter-store" data-store-filter="materials">Materials ${escapeHtml(materialCount)}</button>
                <button type="button" aria-pressed="false" data-admin-terminal-action="filter-store" data-store-filter="equipment">Equipment ${escapeHtml(equipmentCount)}</button>
                <button type="button" aria-pressed="false" data-admin-terminal-action="filter-store" data-store-filter="consumables">Consumables ${escapeHtml(consumableCount)}</button>
                <button type="button" aria-pressed="false" data-admin-terminal-action="filter-store" data-store-filter="risk">Review ${escapeHtml(riskCount)}</button>
              </div>
            </header>

            <div class="admin-terminal-store-ledger-v479" data-store-filter-scope>
              <div class="admin-terminal-store-ledger-head-v479" role="row">
                <span>Item</span>
                <span>Class</span>
                <span>Price</span>
                <span>Stock</span>
                <span>Status</span>
                <span>Action</span>
              </div>
              ${items.map(renderStoreCatalogRow).join("")}
              <p class="admin-terminal-store-empty-v479" data-store-filter-empty hidden>No store items match this filter.</p>
            </div>
          </section>
        </div>
      </section>`;
  }


  function formatMarketplaceFinancialValue(value) {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "number") {
      if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}B`;
      return `${value.toFixed(1)}M`;
    }
    return String(value);
  }

  function sanitizeMarketplaceId(value) {
    return String(value || "market-security").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "market-security";
  }

  function buildMarketplaceFinancialRows(rows, fallbackRows) {
    if (Array.isArray(rows) && rows.length) {
      return rows.map((row) => ({
        label: row.label || row.name || "Metric",
        value: formatMarketplaceFinancialValue(row.value ?? row.amount ?? row.metric),
        meta: row.meta || row.period || row.note || ""
      }));
    }
    return fallbackRows;
  }

  function buildMarketplaceFinancials(asset, priceNumber, type) {
    const financials = asset.financials || {};
    const isCompany = String(type || "").toLowerCase() === "stock";
    const scale = Math.max(1, Number(priceNumber) || 1);
    const revenue = scale * (isCompany ? 48 : 18);
    const grossProfit = revenue * 0.42;
    const operatingIncome = revenue * 0.18;
    const netIncome = revenue * 0.12;
    const cash = revenue * 0.21;
    const debt = revenue * 0.34;
    const assets = revenue * 1.18;
    const equity = assets - debt;
    const freeCashFlow = netIncome * 0.82;
    const sharesOut = Math.max(18, scale * 1.9);
    const title = isCompany ? "Company financials" : "Instrument financials";
    const formatSeriesValue = (value) => `${value.toFixed(1)}M`;
    const annualPeriods = ["2022", "2023", "2024", "2025"];
    const quarterlyPeriods = ["Jun 2025", "Sep 2025", "Dec 2025", "Mar 2026"];
    const annualRevenue = [revenue * 0.72, revenue * 0.84, revenue * 0.93, revenue];
    const annualNetIncome = [netIncome * 0.68, netIncome * 0.79, netIncome * 0.91, netIncome];
    const annualAssets = [assets * 0.80, assets * 0.91, assets * 1.02, assets * 1.08];
    const annualDebt = [debt * 0.82, debt * 0.94, debt, debt * 1.04];
    const annualOperatingCF = [freeCashFlow * 0.92, freeCashFlow * 1.04, freeCashFlow * 1.12, freeCashFlow * 1.22];
    const annualFreeCF = [freeCashFlow * 0.58, freeCashFlow * 0.67, freeCashFlow * 0.79, freeCashFlow];
    const quarterlyRevenue = [revenue * 0.23, revenue * 0.25, revenue * 0.28, revenue * 0.24];
    const quarterlyNetIncome = [netIncome * 0.20, netIncome * 0.23, netIncome * 0.30, netIncome * 0.27];
    const quarterlyAssets = [assets * 0.97, assets, assets * 1.03, assets * 1.06];
    const quarterlyDebt = [debt * 0.96, debt * 0.99, debt * 1.02, debt * 1.04];
    const quarterlyOperatingCF = [freeCashFlow * 0.24, freeCashFlow * 0.28, freeCashFlow * 0.32, freeCashFlow * 0.29];
    const quarterlyFreeCF = [freeCashFlow * 0.16, freeCashFlow * 0.19, freeCashFlow * 0.23, freeCashFlow * 0.20];
    const statementRows = {
      income: {
        annual: [
          { label: "Revenue", values: annualRevenue.map(formatSeriesValue) },
          { label: "Gross profit", values: annualRevenue.map((value) => formatSeriesValue(value * 0.42)) },
          { label: "Operating income", values: annualRevenue.map((value) => formatSeriesValue(value * 0.18)) },
          { label: "Net income", values: annualNetIncome.map(formatSeriesValue) },
          { label: "EPS", values: annualNetIncome.map((value) => `${Math.max(0.12, value / sharesOut).toFixed(2)}`) },
          { label: "EBITDA", values: annualRevenue.map((value) => formatSeriesValue(value * 0.22)) }
        ],
        quarterly: [
          { label: "Revenue", values: quarterlyRevenue.map(formatSeriesValue) },
          { label: "Gross profit", values: quarterlyRevenue.map((value) => formatSeriesValue(value * 0.42)) },
          { label: "Operating income", values: quarterlyRevenue.map((value) => formatSeriesValue(value * 0.18)) },
          { label: "Net income", values: quarterlyNetIncome.map(formatSeriesValue) },
          { label: "EPS", values: quarterlyNetIncome.map((value) => `${Math.max(0.03, value / sharesOut).toFixed(2)}`) },
          { label: "EBITDA", values: quarterlyRevenue.map((value) => formatSeriesValue(value * 0.22)) }
        ]
      },
      balance: {
        annual: [
          { label: "Cash", values: annualAssets.map((value) => formatSeriesValue(value * 0.18)) },
          { label: "Total assets", values: annualAssets.map(formatSeriesValue) },
          { label: "Total debt", values: annualDebt.map(formatSeriesValue) },
          { label: "Equity", values: annualAssets.map((value, index) => formatSeriesValue(value - annualDebt[index])) },
          { label: "Working capital", values: annualAssets.map((value) => formatSeriesValue(value * 0.14)) },
          { label: "Shares outstanding", values: annualPeriods.map(() => `${sharesOut.toFixed(1)}M`) }
        ],
        quarterly: [
          { label: "Cash", values: quarterlyAssets.map((value) => formatSeriesValue(value * 0.18)) },
          { label: "Total assets", values: quarterlyAssets.map(formatSeriesValue) },
          { label: "Total debt", values: quarterlyDebt.map(formatSeriesValue) },
          { label: "Equity", values: quarterlyAssets.map((value, index) => formatSeriesValue(value - quarterlyDebt[index])) },
          { label: "Working capital", values: quarterlyAssets.map((value) => formatSeriesValue(value * 0.14)) },
          { label: "Shares outstanding", values: quarterlyPeriods.map(() => `${sharesOut.toFixed(1)}M`) }
        ]
      },
      cashflow: {
        annual: [
          { label: "Operating cash flow", values: annualOperatingCF.map(formatSeriesValue) },
          { label: "Capital expenditure", values: annualOperatingCF.map((value) => formatSeriesValue(-Math.abs(value * 0.28))) },
          { label: "Free cash flow", values: annualFreeCF.map(formatSeriesValue) },
          { label: "Financing flow", values: annualFreeCF.map((value) => formatSeriesValue(-Math.abs(value * 0.22))) },
          { label: "Cash change", values: annualFreeCF.map((value) => formatSeriesValue(value * 0.38)) },
          { label: "FCF margin", values: annualFreeCF.map((value, index) => `${Math.max(2, (value / annualRevenue[index]) * 100).toFixed(1)}%`) }
        ],
        quarterly: [
          { label: "Operating cash flow", values: quarterlyOperatingCF.map(formatSeriesValue) },
          { label: "Capital expenditure", values: quarterlyOperatingCF.map((value) => formatSeriesValue(-Math.abs(value * 0.28))) },
          { label: "Free cash flow", values: quarterlyFreeCF.map(formatSeriesValue) },
          { label: "Financing flow", values: quarterlyFreeCF.map((value) => formatSeriesValue(-Math.abs(value * 0.22))) },
          { label: "Cash change", values: quarterlyFreeCF.map((value) => formatSeriesValue(value * 0.38)) },
          { label: "FCF margin", values: quarterlyFreeCF.map((value, index) => `${Math.max(2, (value / quarterlyRevenue[index]) * 100).toFixed(1)}%`) }
        ]
      }
    };
    return {
      title,
      period: financials.period || asset.financialPeriod || "TTM / latest cycle",
      currency: asset.currency || "NRC",
      overview: buildMarketplaceFinancialRows(financials.overview, [
        { label: "Revenue", value: `${revenue.toFixed(1)}M`, meta: "TTM" },
        { label: "Gross Profit", value: `${grossProfit.toFixed(1)}M`, meta: "42% margin" },
        { label: "Operating Income", value: `${operatingIncome.toFixed(1)}M`, meta: "Core earnings" },
        { label: "Net Income", value: `${netIncome.toFixed(1)}M`, meta: "After tax" },
        { label: "EPS", value: `${Math.max(0.12, scale / 88).toFixed(2)}`, meta: "per share" },
        { label: "Shares Out", value: `${sharesOut.toFixed(1)}M`, meta: "float" }
      ]),
      income: buildMarketplaceFinancialRows(financials.income, [
        { label: "Revenue", value: `${revenue.toFixed(1)}M`, meta: "sales" },
        { label: "Cost of Revenue", value: `${(revenue - grossProfit).toFixed(1)}M`, meta: "COGS" },
        { label: "Gross Profit", value: `${grossProfit.toFixed(1)}M`, meta: "after COGS" },
        { label: "Operating Expense", value: `${(grossProfit - operatingIncome).toFixed(1)}M`, meta: "OPEX" },
        { label: "Operating Income", value: `${operatingIncome.toFixed(1)}M`, meta: "EBIT" },
        { label: "Net Income", value: `${netIncome.toFixed(1)}M`, meta: "bottom line" }
      ]),
      balance: buildMarketplaceFinancialRows(financials.balance, [
        { label: "Cash", value: `${cash.toFixed(1)}M`, meta: "liquidity" },
        { label: "Total Assets", value: `${assets.toFixed(1)}M`, meta: "asset base" },
        { label: "Total Debt", value: `${debt.toFixed(1)}M`, meta: "borrowings" },
        { label: "Equity", value: `${equity.toFixed(1)}M`, meta: "book value" },
        { label: "Working Capital", value: `${(cash * 0.64).toFixed(1)}M`, meta: "near term" },
        { label: "Debt / Equity", value: `${Math.max(0.05, debt / Math.max(equity, 1)).toFixed(2)}x`, meta: "leverage" }
      ]),
      cashflow: buildMarketplaceFinancialRows(financials.cashflow, [
        { label: "Operating Cash Flow", value: `${(netIncome * 1.14).toFixed(1)}M`, meta: "operations" },
        { label: "Capital Expenditure", value: `${(-Math.abs(netIncome * 0.32)).toFixed(1)}M`, meta: "investment" },
        { label: "Free Cash Flow", value: `${freeCashFlow.toFixed(1)}M`, meta: "after capex" },
        { label: "Financing Flow", value: `${(-Math.abs(netIncome * 0.18)).toFixed(1)}M`, meta: "debt/equity" },
        { label: "Cash Change", value: `${(freeCashFlow * 0.42).toFixed(1)}M`, meta: "period" },
        { label: "FCF Margin", value: `${Math.max(2, (freeCashFlow / revenue) * 100).toFixed(1)}%`, meta: "quality" }
      ]),
      ratios: buildMarketplaceFinancialRows(financials.ratios, [
        { label: "P/E", value: asset.pe || asset.ratio || `${Math.max(8, 10 + scale / 16).toFixed(1)}`, meta: "valuation" },
        { label: "Net Margin", value: `${((netIncome / revenue) * 100).toFixed(1)}%`, meta: "profitability" },
        { label: "ROE", value: `${Math.max(4, (netIncome / Math.max(equity, 1)) * 100).toFixed(1)}%`, meta: "return" },
        { label: "Current Ratio", value: `${Math.max(0.8, 1.05 + scale / 240).toFixed(2)}x`, meta: "liquidity" },
        { label: "Dividend Yield", value: asset.yield || asset.dividendYield || "0.0%", meta: "income" },
        { label: "Beta", value: asset.beta || asset.volatility || "—", meta: "volatility" }
      ]),
      statements: {
        annualPeriods,
        quarterlyPeriods,
        income: {
          chartTitle: "Income statement",
          annualSeries: annualPeriods.map((label, index) => ({ label, primary: annualRevenue[index], secondary: annualNetIncome[index] })),
          quarterlySeries: quarterlyPeriods.map((label, index) => ({ label, primary: quarterlyRevenue[index], secondary: quarterlyNetIncome[index] })),
          annualRows: statementRows.income.annual,
          quarterlyRows: statementRows.income.quarterly,
          primaryLabel: "Revenue",
          secondaryLabel: "Net income"
        },
        balance: {
          chartTitle: "Balance sheet",
          annualSeries: annualPeriods.map((label, index) => ({ label, primary: annualAssets[index], secondary: annualDebt[index] })),
          quarterlySeries: quarterlyPeriods.map((label, index) => ({ label, primary: quarterlyAssets[index], secondary: quarterlyDebt[index] })),
          annualRows: statementRows.balance.annual,
          quarterlyRows: statementRows.balance.quarterly,
          primaryLabel: "Assets",
          secondaryLabel: "Debt"
        },
        cashflow: {
          chartTitle: "Cash flow",
          annualSeries: annualPeriods.map((label, index) => ({ label, primary: annualOperatingCF[index], secondary: annualFreeCF[index] })),
          quarterlySeries: quarterlyPeriods.map((label, index) => ({ label, primary: quarterlyOperatingCF[index], secondary: quarterlyFreeCF[index] })),
          annualRows: statementRows.cashflow.annual,
          quarterlyRows: statementRows.cashflow.quarterly,
          primaryLabel: "Operating CF",
          secondaryLabel: "Free cash flow"
        }
      }
    };
  }
  function buildMarketplaceCandles(asset, priceNumber, changeNumber) {
    const raw = Array.isArray(asset.candles) && asset.candles.length
      ? asset.candles
      : Array.isArray(asset.ohlc) && asset.ohlc.length
        ? asset.ohlc
        : [];
    if (raw.length) {
      return raw.map((candle, index) => ({
        label: candle.label || candle.time || candle.date || `T-${raw.length - index}`,
        open: Number(candle.open ?? candle.o ?? priceNumber) || priceNumber,
        high: Number(candle.high ?? candle.h ?? priceNumber) || priceNumber,
        low: Number(candle.low ?? candle.l ?? priceNumber) || priceNumber,
        close: Number(candle.close ?? candle.c ?? priceNumber) || priceNumber,
        volume: Number(candle.volume ?? candle.v ?? 80) || 80
      }));
    }

    const history = Array.isArray(asset.history) && asset.history.length ? asset.history : [0.52,0.54,0.57,0.55,0.59,0.62,0.60,0.64,0.67,0.66,0.70,0.72];
    const base = Math.max(0.01, Number(priceNumber) || 1);
    const targetCandles = 56;
    const sampleAt = (position) => {
      const scaled = position * Math.max(history.length - 1, 1);
      const left = Math.floor(scaled);
      const right = Math.min(history.length - 1, left + 1);
      const weight = scaled - left;
      const leftValue = Number(history[left]) || 0.5;
      const rightValue = Number(history[right]) || leftValue;
      return leftValue + (rightValue - leftValue) * weight;
    };
    let priorClose = base * (0.91 + Math.max(-8, Math.min(8, -changeNumber)) / 100);
    return Array.from({ length: targetCandles }, (_, index) => {
      const progress = index / Math.max(targetCandles - 1, 1);
      const normalized = Math.max(0.12, Math.min(0.98, sampleAt(progress)));
      const rhythm = Math.sin(index * 0.82) * 0.007 + Math.cos(index * 0.37) * 0.004;
      const drift = (normalized - 0.5) * 0.19 + (changeNumber / 100) * progress + rhythm;
      const close = Math.max(0.01, base * (0.96 + drift));
      const open = priorClose;
      const spread = Math.max(base * 0.006, Math.abs(close - open) * 0.54 + base * (0.004 + (index % 6) * 0.0012));
      const high = Math.max(open, close) + spread;
      const low = Math.max(0.01, Math.min(open, close) - spread * 0.86);
      const volume = Math.round(54 + normalized * 138 + (index % 7) * 8 + Math.abs(close - open) / base * 720);
      priorClose = close;
      return { label: `D${index + 1}`, open, high, low, close, volume };
    });
  }


  function normalizeMarketplaceSecurity(asset, index) {
    const priceNumber = Number(String(asset.price ?? asset.lastPrice ?? asset.premium ?? 0).replace(/[^0-9.-]/g, "")) || 0;
    const change = asset.change || asset.changePct || asset.delta || (index % 3 === 0 ? "+1.2%" : index % 3 === 1 ? "-0.6%" : "+0.0%");
    const changeNumber = Number(String(change).replace(/[^0-9.-]/g, "")) || 0;
    const type = asset.type || asset.assetType || "Stock";
    const symbol = asset.symbol || asset.ticker || `SEC${index + 1}`;
    const history = Array.isArray(asset.history) && asset.history.length
      ? asset.history
      : [0.62, 0.74, 0.68, 0.79, 0.71, 0.84, 0.81, 0.90, 0.86, 0.94, 0.91, Math.max(0.28, Math.min(0.98, 0.72 + changeNumber / 18))];

    return {
      id: asset.id || symbol,
      symbol,
      name: asset.name || asset.company || `${symbol} Holdings`,
      type,
      sector: asset.sector || "Diversified",
      country: asset.country || asset.location || "Northreach",
      exchange: asset.exchange || "NOVX",
      currency: asset.currency || "NRC",
      price: priceNumber.toFixed(2),
      priceNumber,
      change,
      changeNumber,
      tone: changeNumber > 0 ? "is-up" : changeNumber < 0 ? "is-down" : "is-flat",
      volume: asset.volume || asset.turnover || "—",
      marketCap: asset.marketCap || asset.size || "—",
      pe: asset.pe || asset.ratio || "—",
      yieldValue: asset.yield || asset.coupon || asset.dividendYield || "—",
      beta: asset.beta || asset.volatility || "—",
      dayRange: asset.dayRange || `${Math.max(priceNumber * 0.96, 0).toFixed(2)}–${(priceNumber * 1.04).toFixed(2)}`,
      risk: asset.risk || asset.rating || "Moderate",
      description: asset.description || "Simulation security used for student trading, portfolio construction, and market literacy decisions.",
      thesis: asset.thesis || asset.profile || "Price movement is driven by country conditions, sector demand, company fundamentals, and current market events.",
      holdings: asset.holdings || asset.components || "—",
      maturity: asset.maturity || "—",
      coupon: asset.coupon || "—",
      expenseRatio: asset.expenseRatio || "—",
      contract: asset.contract || "—",
      optionChain: Array.isArray(asset.optionChain) ? asset.optionChain : [],
      financials: buildMarketplaceFinancials(asset, priceNumber, type),
      candles: buildMarketplaceCandles(asset, priceNumber, changeNumber),
      rangeCandles: asset.rangeCandles || asset.candleRanges || asset.chartData || {},
      history,
      tradable: asset.tradable !== false,
      shortable: asset.shortable !== false && !String(type).toLowerCase().includes("bond"),
      options: asset.options !== false && ["Stock", "ETF", "Index"].includes(type),
      index
    };
  }

  function getTerminalMarketplaceSecurities(model) {
    const fallback = [
      { symbol: "FROST", name: "Frostline Energy & Logistics", type: "Stock", sector: "Energy", country: "Northreach", exchange: "NRX", price: 128.20, change: "+2.4%", volume: "1.24M", marketCap: "9.8B", pe: "18.6", yield: "1.1%", beta: "1.18", risk: "Cyclical", description: "Cold-region energy producer with heavy exposure to shipping routes, fuel demand, and infrastructure reliability.", thesis: "Benefits when Northreach logistics improve; vulnerable to fuel oversupply and export delays.", history: [0.55,0.57,0.61,0.60,0.66,0.70,0.69,0.72,0.78,0.76,0.82,0.88], optionChain: [{ type: "Call", strike: "130", expiry: "W2", premium: "4.20" }, { type: "Put", strike: "125", expiry: "W2", premium: "3.10" }] },
      { symbol: "SABLE", name: "Sable Port Finance", type: "Stock", sector: "Finance", country: "Thaloris", exchange: "TPX", price: 74.10, change: "+0.8%", volume: "820K", marketCap: "4.1B", pe: "14.2", yield: "2.8%", beta: "0.92", risk: "Rate sensitive", description: "Port-finance lender tied to trade volume, credit conditions, and logistics activity.", thesis: "Moves with trade confidence and interest-rate pressure.", history: [0.44,0.48,0.46,0.51,0.55,0.54,0.58,0.57,0.61,0.64,0.63,0.67] },
      { symbol: "DUSK", name: "Duskline Repair Yards", type: "Stock", sector: "Industrials", country: "Syndalis", exchange: "SDX", price: 31.42, change: "-1.9%", volume: "1.01M", marketCap: "1.2B", pe: "22.1", yield: "0.0%", beta: "1.46", risk: "High volatility", description: "Repair-yard operator exposed to port inspections, informal logistics, and commodity shipment interruptions.", thesis: "Rises when maintenance backlogs build; falls when inspection or sanctions risk slows traffic.", history: [0.66,0.63,0.61,0.58,0.60,0.56,0.52,0.49,0.50,0.46,0.44,0.42], optionChain: [{ type: "Call", strike: "35", expiry: "W1", premium: "1.20" }, { type: "Put", strike: "30", expiry: "W1", premium: "1.75" }] },
      { symbol: "SOLV", name: "Solvend Aerotech", type: "Stock", sector: "Technology", country: "Yrethia", exchange: "YTX", price: 212.88, change: "+4.1%", volume: "1.89M", marketCap: "18.6B", pe: "41.7", yield: "0.0%", beta: "1.62", risk: "Growth", description: "AI and aerospace contractor driven by defense contracts, research grants, and technology sentiment.", thesis: "Strong upside during innovation cycles; sensitive to funding cuts and failed launches.", history: [0.50,0.54,0.57,0.55,0.63,0.66,0.69,0.75,0.78,0.84,0.88,0.96] },
      { symbol: "ELDR", name: "Eldoran Grain Transport", type: "Stock", sector: "Agriculture", country: "Eldora", exchange: "EGX", price: 96.33, change: "-0.4%", volume: "690K", marketCap: "6.3B", pe: "16.9", yield: "1.9%", beta: "0.81", risk: "Weather", description: "Agriculture transport company affected by crop output, fuel prices, and rural infrastructure.", thesis: "Defensive revenue base, but margin pressure rises when harvest or transport conditions weaken.", history: [0.60,0.61,0.63,0.62,0.61,0.64,0.62,0.61,0.59,0.58,0.57,0.56] },
      { symbol: "NVRX", name: "Novaria Composite Index", type: "Index", sector: "Broad Market", country: "All Countries", exchange: "NOVX", price: 4232.55, change: "+0.7%", volume: "Index", marketCap: "Composite", pe: "19.4", yield: "1.5%", beta: "1.00", risk: "Market", description: "Broad simulation index tracking large-cap stocks across the game economy.", thesis: "Useful for comparing individual holdings against the total market.", history: [0.52,0.55,0.57,0.56,0.60,0.62,0.65,0.66,0.68,0.70,0.72,0.74] },
      { symbol: "N10Y", name: "Northreach 10Y Government Bond", type: "Bond", sector: "Sovereign Debt", country: "Northreach", exchange: "Debt Desk", price: 98.60, change: "-0.2%", volume: "540K", marketCap: "Sovereign", coupon: "4.2%", maturity: "10Y", yield: "4.38%", beta: "0.22", risk: "Interest-rate", description: "Benchmark government bond used to teach yield, price sensitivity, and safe-asset behavior.", thesis: "Bond price falls when rates rise and generally stabilizes during equity stress.", history: [0.72,0.71,0.70,0.68,0.67,0.66,0.65,0.66,0.64,0.63,0.62,0.61], shortable: false, options: false },
      { symbol: "SYN5", name: "Syndalis 5Y Recovery Bond", type: "Bond", sector: "Sovereign Debt", country: "Syndalis", exchange: "Debt Desk", price: 89.45, change: "+1.1%", volume: "310K", marketCap: "Sovereign", coupon: "7.5%", maturity: "5Y", yield: "9.12%", beta: "0.48", risk: "Credit", description: "Higher-yield government bond exposed to country risk and recovery expectations.", thesis: "Rewards risk appetite; sells off quickly when stability weakens.", history: [0.44,0.43,0.46,0.45,0.48,0.49,0.51,0.53,0.52,0.55,0.57,0.60], shortable: false, options: false },
      { symbol: "FOOD", name: "Food Staples ETF", type: "ETF", sector: "Consumer Staples", country: "All Countries", exchange: "NOVX", price: 52.74, change: "+0.3%", volume: "1.12M", marketCap: "ETF", pe: "15.8", expenseRatio: "0.18%", yield: "2.1%", beta: "0.64", risk: "Defensive", holdings: "ELDR, farm logistics, cold-chain operators", description: "Basket of food, agriculture, and staple logistics securities.", thesis: "Lower volatility than single stocks; reacts to food inflation and harvest quality.", history: [0.56,0.57,0.58,0.57,0.59,0.60,0.61,0.61,0.62,0.63,0.63,0.64] },
      { symbol: "TECH", name: "Advanced Systems ETF", type: "ETF", sector: "Technology", country: "All Countries", exchange: "NOVX", price: 118.05, change: "+2.2%", volume: "980K", marketCap: "ETF", pe: "32.4", expenseRatio: "0.24%", yield: "0.2%", beta: "1.34", risk: "Growth", holdings: "SOLV, automation suppliers, compute infrastructure", description: "Technology-sector basket for students who want sector exposure without single-company concentration.", thesis: "Tracks innovation confidence and credit availability.", history: [0.47,0.49,0.51,0.54,0.53,0.57,0.61,0.63,0.67,0.70,0.74,0.79] },
      { symbol: "OIL", name: "Crude Fuel Contract", type: "Commodity", sector: "Energy", country: "Global", exchange: "Commodities", price: 83.20, change: "+1.7%", volume: "2.4M", marketCap: "Futures", contract: "Front month", beta: "1.21", risk: "Supply shock", description: "Energy commodity used to show input-cost shocks across transportation, manufacturing, and consumer prices.", thesis: "Rises when supply tightens or demand accelerates; pressures transport-heavy businesses.", history: [0.51,0.54,0.53,0.56,0.60,0.58,0.62,0.65,0.66,0.70,0.71,0.75] },
      { symbol: "WHT", name: "Wheat Basket", type: "Commodity", sector: "Agriculture", country: "Eldora", exchange: "Commodities", price: 22.15, change: "-0.9%", volume: "1.6M", marketCap: "Spot basket", contract: "Cash", beta: "0.77", risk: "Weather", description: "Food commodity used to connect harvest conditions, staples pricing, and consumer sentiment.", thesis: "Moves with weather, logistics, and food security concerns.", history: [0.63,0.60,0.62,0.59,0.57,0.56,0.55,0.53,0.54,0.52,0.51,0.50] },
      { symbol: "SOLV-C230", name: "SOLV 230 Call", type: "Option", sector: "Technology", country: "Yrethia", exchange: "Options", price: 6.80, change: "+8.2%", volume: "410K", marketCap: "Derivative", contract: "Call · Strike 230 · W2", beta: "High", risk: "Leveraged", description: "Call option contract giving upside exposure to Solvend Aerotech above the strike price before expiry.", thesis: "Useful for teaching premium, strike, expiry, leverage, and time decay.", history: [0.32,0.35,0.34,0.42,0.44,0.48,0.52,0.57,0.61,0.66,0.72,0.81] },
      { symbol: "FROST-P120", name: "FROST 120 Put", type: "Option", sector: "Energy", country: "Northreach", exchange: "Options", price: 3.40, change: "-4.6%", volume: "280K", marketCap: "Derivative", contract: "Put · Strike 120 · W2", beta: "High", risk: "Leveraged", description: "Put option contract giving downside protection or bearish exposure to Frostline Energy.", thesis: "Good for demonstrating hedging and speculative downside exposure.", history: [0.70,0.68,0.64,0.66,0.60,0.58,0.55,0.51,0.48,0.45,0.42,0.39] }
    ];

    const source = Array.isArray(model?.marketplaceSecurities) && model.marketplaceSecurities.length
      ? model.marketplaceSecurities
      : Array.isArray(model?.marketTickers) && model.marketTickers.length
        ? model.marketTickers
        : Array.isArray(model?.stocks) && model.stocks.length
          ? model.stocks
          : fallback;

    return source.map(normalizeMarketplaceSecurity);
  }

  function getUniqueMarketplaceValues(securities, key) {
    return Array.from(new Set(securities.map((asset) => asset[key]).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)));
  }

  function renderMarketplaceSelectOptions(values) {
    return values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  }

  function renderMarketplaceIcon(name) {
    const icons = {
      candle: '<path d="M7 4v16M17 3v18"></path><rect x="5" y="8" width="4" height="8" rx="1"></rect><rect x="15" y="7" width="4" height="10" rx="1"></rect>',
      line: '<path d="M3.5 16.5l4.5-5 4 3 7.5-8"></path><path d="M3.5 20.5h17"></path>',
      area: '<path d="M3.5 17l4.5-5 4 3 7.5-8"></path><path d="M3.5 20h17"></path><path d="M4 17l4-4 4 3 7-8v12H4z" class="is-soft-fill"></path>',
      bar: '<path d="M4 20.5h16"></path><path d="M7 20V9M12 20V4M17 20v-7"></path>',
      compare: '<path d="M4 7h9"></path><path d="M10 3.5L13.5 7 10 10.5"></path><path d="M20 17h-9"></path><path d="M14 13.5L10.5 17 14 20.5"></path>',
      indicator: '<path d="M4 18l4-8 4 5 4-9 4 12"></path><path d="M4 21h16"></path>',
      none: '<path d="M6 6l12 12M18 6L6 18"></path>',
      ma: '<path d="M4 16c3-6 5-6 8 0s5 6 8 0"></path><path d="M4 20h16"></path>',
      vwap: '<path d="M4 7h16M4 12h16M4 17h16"></path><path d="M8 4v16M16 4v16"></path>'
    };
    const body = icons[name] || icons.candle;
    return `<span class="admin-terminal-marketplace-icon-cell" aria-hidden="true"><svg class="admin-terminal-marketplace-ui-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" focusable="false" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg></span>`;
  }

  function renderMarketplaceChartMarkers(candles, security, layout, xFor, yFor, showAdminMarkers = false) {
    if (showAdminMarkers !== true) return "";
    const events = Array.isArray(security.chartEvents) && security.chartEvents.length
      ? security.chartEvents
      : Array.isArray(security.events) && security.events.length
        ? security.events
        : [
          { index: Math.max(1, candles.length - 8), label: "Economy", tone: "event" },
          { index: Math.max(2, candles.length - 4), label: "Trade", tone: "trade" }
        ];
    const markerMax = candles.length - 1;
    return events.slice(0, 4).map((event) => {
      const index = Math.max(0, Math.min(markerMax, Number(event.index ?? event.candleIndex ?? markerMax) || 0));
      const candle = candles[index];
      const x = xFor(index);
      const y = Math.max(layout.top + 12, yFor(candle.high) - 10);
      const tone = event.tone === "trade" ? "is-trade" : "is-event";
      const label = event.label || (tone === "is-trade" ? "Trade" : "Event");
      const iconPath = tone === "is-trade"
        ? `<path class="admin-terminal-marketplace-marker-icon" d="M ${(x - 5).toFixed(1)} ${(y + 1).toFixed(1)} L ${x.toFixed(1)} ${(y - 6).toFixed(1)} L ${(x + 5).toFixed(1)} ${(y + 1).toFixed(1)} L ${x.toFixed(1)} ${(y + 6).toFixed(1)} Z"></path>`
        : `<circle class="admin-terminal-marketplace-marker-icon" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5.2"></circle><path class="admin-terminal-marketplace-marker-glyph" d="M ${(x - 3).toFixed(1)} ${y.toFixed(1)} H ${(x + 3).toFixed(1)} M ${x.toFixed(1)} ${(y - 3).toFixed(1)} V ${(y + 3).toFixed(1)}"></path>`;
      return `<g class="admin-terminal-marketplace-marker ${tone}" data-marketplace-chart-marker data-marketplace-admin-only="true" aria-label="Admin-only ${escapeHtml(label)} chart marker">${iconPath}<text x="${x.toFixed(1)}" y="${(y - 10).toFixed(1)}" text-anchor="middle">${escapeHtml(label)}</text></g>`;
    }).join("");
  }

  const MARKETPLACE_CHART_RANGES = ["1D", "5D", "1M", "6M", "YTD", "1Y", "5Y", "MAX"];
  const MARKETPLACE_CHART_ANCHOR_DATE = new Date(Date.UTC(2026, 6, 2, 16, 0, 0));
  const MARKETPLACE_CHART_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function getMarketplaceRangeConfig(range = "1M") {
    const normalized = String(range || "1M").toUpperCase();
    const configs = {
      "1D": { range: "1D", label: "1D intraday", axisMode: "time", count: 78, daysBack: 0, noise: 0.020, driftScale: 0.42, volumeScale: 0.90 },
      "5D": { range: "5D", label: "5D hourly", axisMode: "dayHours", count: 60, daysBack: 4, noise: 0.032, driftScale: 0.54, volumeScale: 1.00 },
      "1M": { range: "1M", label: "1M daily", axisMode: "days", count: 64, daysBack: 29, noise: 0.052, driftScale: 0.72, volumeScale: 1.12 },
      "6M": { range: "6M", label: "6M monthly", axisMode: "months", count: 72, monthsBack: 5, noise: 0.092, driftScale: 1.06, volumeScale: 1.24 },
      "YTD": { range: "YTD", label: "YTD monthly", axisMode: "months", count: 72, ytd: true, noise: 0.082, driftScale: 0.96, volumeScale: 1.20 },
      "1Y": { range: "1Y", label: "1Y monthly", axisMode: "months", count: 80, monthsBack: 11, noise: 0.115, driftScale: 1.22, volumeScale: 1.30 },
      "5Y": { range: "5Y", label: "5Y annual", axisMode: "years", count: 72, yearsBack: 4, noise: 0.215, driftScale: 1.58, volumeScale: 1.42 },
      "MAX": { range: "MAX", label: "MAX annual", axisMode: "years", count: 84, yearsBack: 8, noise: 0.315, driftScale: 1.92, volumeScale: 1.56 }
    };
    return configs[normalized] || configs["1M"];
  }

  function shiftMarketplaceDate(date, amount, unit) {
    const shifted = new Date(date.getTime());
    if (unit === "days") shifted.setUTCDate(shifted.getUTCDate() + amount);
    if (unit === "months") shifted.setUTCMonth(shifted.getUTCMonth() + amount);
    if (unit === "years") shifted.setUTCFullYear(shifted.getUTCFullYear() + amount);
    return shifted;
  }

  function getMarketplaceLabelDate(config, index, count) {
    const progress = count <= 1 ? 1 : index / (count - 1);
    if (config.axisMode === "dayHours") {
      const daysBack = Number(config.daysBack ?? 4);
      const tradingDays = Math.max(1, daysBack + 1);
      const samplesPerDay = Math.max(1, count / tradingDays);
      const dayOffset = Math.min(daysBack, Math.floor(index / samplesPerDay));
      const dayStartIndex = dayOffset * samplesPerDay;
      const withinDaySpan = Math.max(1, samplesPerDay - 1);
      const withinDayProgress = Math.max(0, Math.min(1, (index - dayStartIndex) / withinDaySpan));
      const tradingStartMinutes = 9 * 60 + 30;
      const tradingMinutes = 390;
      const minutes = Math.round((tradingStartMinutes + withinDayProgress * tradingMinutes) / 30) * 30;
      const dated = shiftMarketplaceDate(MARKETPLACE_CHART_ANCHOR_DATE, -(daysBack - dayOffset), "days");
      dated.setUTCHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
      return dated;
    }
    if (config.axisMode === "days") {
      const daysBack = Number(config.daysBack ?? 29);
      return shiftMarketplaceDate(MARKETPLACE_CHART_ANCHOR_DATE, -Math.round(daysBack * (1 - progress)), "days");
    }
    if (config.axisMode === "months") {
      if (config.ytd) {
        const anchorMonth = MARKETPLACE_CHART_ANCHOR_DATE.getUTCMonth();
        const monthIndex = Math.min(anchorMonth, Math.round(anchorMonth * progress));
        return new Date(Date.UTC(MARKETPLACE_CHART_ANCHOR_DATE.getUTCFullYear(), monthIndex, 1));
      }
      const monthsBack = Number(config.monthsBack ?? 11);
      return shiftMarketplaceDate(MARKETPLACE_CHART_ANCHOR_DATE, -Math.round(monthsBack * (1 - progress)), "months");
    }
    if (config.axisMode === "years") {
      const yearsBack = Number(config.yearsBack ?? 8);
      return shiftMarketplaceDate(MARKETPLACE_CHART_ANCHOR_DATE, -Math.round(yearsBack * (1 - progress)), "years");
    }
    return MARKETPLACE_CHART_ANCHOR_DATE;
  }

  function formatMarketplaceDateLabel(date, mode) {
    const month = MARKETPLACE_CHART_MONTHS[date.getUTCMonth()] || "Jan";
    const day = date.getUTCDate();
    const year = date.getUTCFullYear();
    if (mode === "day") return `${month} ${day}`;
    if (mode === "dayTime") {
      const hours = String(date.getUTCHours()).padStart(2, "0");
      const minutes = String(date.getUTCMinutes()).padStart(2, "0");
      return `${month} ${day} · ${hours}:${minutes}`;
    }
    if (mode === "monthYear") return `${month} ${year}`;
    return `${month} ${day}`;
  }

  function isPlaceholderMarketplaceDateLabel(value) {
    return /^(?:D\d+|Day\s+\d+)$/i.test(String(value || "").trim());
  }

  function formatMarketplaceAxisLabel(range, index, count) {
    const config = getMarketplaceRangeConfig(range);
    const progress = count <= 1 ? 0 : index / (count - 1);
    if (config.axisMode === "time") {
      const startMinutes = 9 * 60 + 30;
      const totalMinutes = 390;
      const minutes = Math.round((startMinutes + progress * totalMinutes) / 5) * 5;
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
    }
    if (config.axisMode === "dayHours") {
      return formatMarketplaceDateLabel(getMarketplaceLabelDate(config, index, count), "dayTime");
    }
    if (config.axisMode === "days") {
      return formatMarketplaceDateLabel(getMarketplaceLabelDate(config, index, count), "day");
    }
    if (config.axisMode === "months" || config.axisMode === "years") {
      return formatMarketplaceDateLabel(getMarketplaceLabelDate(config, index, count), "monthYear");
    }
    return formatMarketplaceDateLabel(getMarketplaceLabelDate(config, index, count), "monthYear");
  }

  function normalizeMarketplaceRawCandles(raw, priceNumber, range) {
    const config = getMarketplaceRangeConfig(range);
    return raw.map((candle, index) => {
      const suppliedLabel = candle.label || candle.time || candle.date || "";
      const label = suppliedLabel && !isPlaceholderMarketplaceDateLabel(suppliedLabel)
        ? suppliedLabel
        : formatMarketplaceAxisLabel(config.range, index, raw.length);
      return {
        label,
        open: Number(candle.open ?? candle.o ?? priceNumber) || priceNumber,
        high: Number(candle.high ?? candle.h ?? priceNumber) || priceNumber,
        low: Number(candle.low ?? candle.l ?? priceNumber) || priceNumber,
        close: Number(candle.close ?? candle.c ?? priceNumber) || priceNumber,
        volume: Number(candle.volume ?? candle.v ?? 80) || 80
      };
    });
  }

  function getMarketplacePreviousClose(security, candles, config, fallbackLast = null) {
    const last = fallbackLast || candles?.[candles.length - 1] || { close: Number(security?.priceNumber ?? security?.price) || 1 };
    const explicitPreviousClose = Number(security?.previousClose ?? security?.prevClose ?? security?.previousDayClose ?? security?.priorClose);
    if (Number.isFinite(explicitPreviousClose) && explicitPreviousClose > 0) return explicitPreviousClose;
    const changeNumber = Number(security?.changeNumber);
    if (config?.range === "1D" && Number.isFinite(changeNumber) && changeNumber > -99.9) {
      const derived = last.close / (1 + changeNumber / 100);
      if (Number.isFinite(derived) && derived > 0) return derived;
    }
    const first = candles?.[0];
    const fallback = Number(first?.open ?? first?.close ?? last?.close ?? security?.priceNumber ?? security?.price);
    return Number.isFinite(fallback) && fallback > 0 ? fallback : 1;
  }

  function buildMarketplaceRangeCandles(security, range = "1M") {
    const config = getMarketplaceRangeConfig(range);
    const rangeCandles = security?.rangeCandles || security?.candleRanges || security?.chartData || {};
    const supplied = rangeCandles[config.range] || rangeCandles[config.range.toLowerCase()] || rangeCandles[config.range.replace(/[^a-z0-9]/gi, "").toLowerCase()];
    const priceNumber = Number(security?.priceNumber ?? security?.price) || 1;
    if (Array.isArray(supplied) && supplied.length) return normalizeMarketplaceRawCandles(supplied, priceNumber, config.range);

    const history = Array.isArray(security?.history) && security.history.length
      ? security.history
      : [0.52, 0.54, 0.57, 0.55, 0.59, 0.62, 0.60, 0.64, 0.67, 0.66, 0.70, 0.72];
    const base = Math.max(0.01, priceNumber);
    const changeNumber = Number(security?.changeNumber || 0);
    const count = config.count;
    const sampleAt = (position) => {
      const scaled = position * Math.max(history.length - 1, 1);
      const left = Math.floor(scaled);
      const right = Math.min(history.length - 1, left + 1);
      const weight = scaled - left;
      const leftValue = Number(history[left]) || 0.5;
      const rightValue = Number(history[right]) || leftValue;
      return leftValue + (rightValue - leftValue) * weight;
    };

    const rangeBackshift = {
      "1D": 0.995,
      "5D": 0.985,
      "1M": 0.960,
      "6M": 0.910,
      "YTD": 0.925,
      "1Y": 0.880,
      "5Y": 0.620,
      "MAX": 0.540
    }[config.range] || 0.96;

    let priorClose = Math.max(0.01, base * (rangeBackshift + Math.max(-12, Math.min(12, -changeNumber)) / 220));
    return Array.from({ length: count }, (_, index) => {
      const progress = index / Math.max(count - 1, 1);
      const normalized = Math.max(0.12, Math.min(0.98, sampleAt(progress)));
      const seasonal = Math.sin(index * (config.axisMode === "time" ? 0.42 : 0.18)) * config.noise;
      const cycle = Math.cos(index * (config.axisMode === "years" ? 0.34 : 0.27)) * config.noise * 0.42;
      const longDrift = ((normalized - 0.5) * 0.18 + (changeNumber / 100) * progress) * config.driftScale;
      const close = Math.max(0.01, base * (rangeBackshift + longDrift + seasonal + cycle + progress * (1 - rangeBackshift)));
      const open = priorClose;
      const spread = Math.max(base * 0.0026, Math.abs(close - open) * 0.48 + base * (0.002 + (index % 5) * 0.0008) * config.driftScale);
      const high = Math.max(open, close) + spread;
      const low = Math.max(0.01, Math.min(open, close) - spread * 0.84);
      const volume = Math.round((42 + normalized * 126 + (index % 8) * 7 + Math.abs(close - open) / base * 720) * config.volumeScale);
      priorClose = close;
      return {
        label: formatMarketplaceAxisLabel(config.range, index, count),
        open,
        high,
        low,
        close,
        volume
      };
    });
  }

  function renderMarketplaceChartFrame(security, range = "1M", active = false, compareCandidates = [], options = {}) {
    const config = getMarketplaceRangeConfig(range);
    const candles = buildMarketplaceRangeCandles(security, config.range);
    if (!candles.length) return "";
    const width = 1040;
    const height = 390;
    const layout = {
      left: 48,
      right: 64,
      top: 18,
      chartHeight: 264,
      axisGap: 12,
      volumeTop: 300,
      volumeHeight: 48,
      bottomAxis: 374
    };
    const plotWidth = width - layout.left - layout.right;
    const last = candles[candles.length - 1];
    const previous = candles[candles.length - 2] || last;
    const first = candles[0] || previous;
    const isDailyRange = config.range === "1D";
    const previousClose = getMarketplacePreviousClose(security, candles, config, last);
    const minLow = Math.min(...candles.map((candle) => candle.low), isDailyRange ? previousClose : Number.POSITIVE_INFINITY);
    const maxHigh = Math.max(...candles.map((candle) => candle.high), isDailyRange ? previousClose : Number.NEGATIVE_INFINITY);
    const maxVolume = Math.max(...candles.map((candle) => candle.volume), 1);
    const rangeValue = Math.max(0.01, maxHigh - minLow);
    const paddedMin = Math.max(0.01, minLow - rangeValue * 0.10);
    const paddedMax = maxHigh + rangeValue * 0.10;
    const paddedRange = Math.max(0.01, paddedMax - paddedMin);
    const step = plotWidth / candles.length;
    const candleWidth = Math.max(2.3, Math.min(9.8, step * 0.44));
    const yFor = (value) => layout.top + ((paddedMax - value) / paddedRange) * layout.chartHeight;
    const xFor = (index) => layout.left + index * step + step / 2;
    const gridValues = Array.from({ length: 7 }, (_, index) => paddedMax - paddedRange * (index / 6));
    const changeReference = isDailyRange ? previousClose : previous.close;
    const rangeReference = isDailyRange ? previousClose : first.close;
    const lastTone = last.close >= changeReference ? "is-up" : "is-down";
    const trendTone = last.close >= rangeReference ? "is-up" : "is-down";
    const lastX = xFor(candles.length - 1);
    const lastY = yFor(last.close);
    const previousCloseY = yFor(previousClose);
    const changeAmount = last.close - changeReference;
    const changePercent = changeReference ? (changeAmount / changeReference) * 100 : 0;
    const totalChange = rangeReference ? ((last.close - rangeReference) / rangeReference) * 100 : 0;
    const formatAxisPrice = (value) => {
      if (!Number.isFinite(value)) return "—";
      if (value >= 1000) return value.toFixed(0);
      if (value >= 100) return value.toFixed(1);
      return value.toFixed(2);
    };
    const formatVolume = (value) => {
      if (!Number.isFinite(value)) return "—";
      if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
      if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
      return String(Math.round(value));
    };
    const pathFromPoints = (points) => points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
    const buildClosePoints = (transform = (candle) => candle.close) => candles.map((candle, index) => ({ x: xFor(index), y: yFor(Math.max(0.01, transform(candle, index))) }));
    const buildAveragePoints = (period) => candles.map((candle, index) => {
      const slice = candles.slice(Math.max(0, index - period + 1), index + 1);
      const average = slice.reduce((sum, item) => sum + item.close, 0) / Math.max(slice.length, 1);
      return { x: xFor(index), y: yFor(average) };
    });
    const vwapPoints = (() => {
      let valueVolume = 0;
      let volume = 0;
      return candles.map((candle) => {
        valueVolume += candle.close * candle.volume;
        volume += candle.volume;
        return { x: xFor(candles.indexOf(candle)), y: yFor(valueVolume / Math.max(volume, 1)) };
      });
    })();

    const priceGrid = gridValues.map((value) => {
      const y = yFor(value);
      return `<g><line class="admin-terminal-marketplace-chart-grid" x1="${layout.left}" y1="${y.toFixed(1)}" x2="${(width - layout.right).toFixed(1)}" y2="${y.toFixed(1)}"></line><text class="admin-terminal-marketplace-chart-axis-label" text-anchor="start" x="${(width - layout.right + layout.axisGap).toFixed(1)}" y="${(y + 4).toFixed(1)}">${formatAxisPrice(value)}</text></g>`;
    }).join("");

    const verticalTicksByRange = {
      "1D": [0, 0.25, 0.50, 0.75, 1],
      "5D": [0, 0.20, 0.40, 0.60, 0.80, 1],
      "1M": [0, 0.25, 0.50, 0.75, 1],
      "6M": [0, 0.20, 0.40, 0.60, 0.80, 1],
      "YTD": [0, 0.20, 0.40, 0.60, 0.80, 1],
      "1Y": [0, 0.25, 0.50, 0.75, 1],
      "5Y": [0, 0.25, 0.50, 0.75, 1],
      "MAX": [0, 0.20, 0.40, 0.60, 0.80, 1]
    }[config.range] || [0, 0.33, 0.66, 1];
    const verticalGrid = verticalTicksByRange.map((ratio) => {
      const x = layout.left + plotWidth * ratio;
      return `<line class="admin-terminal-marketplace-chart-grid is-vertical" x1="${x.toFixed(1)}" y1="${layout.top}" x2="${x.toFixed(1)}" y2="${(layout.volumeTop + layout.volumeHeight).toFixed(1)}"></line>`;
    }).join("");

    const closeLinePoints = pathFromPoints(buildClosePoints());
    const areaPoints = `${layout.left},${(layout.volumeTop - 6).toFixed(1)} ${closeLinePoints} ${(width - layout.right).toFixed(1)},${(layout.volumeTop - 6).toFixed(1)}`;
    const compareLineNodes = (Array.isArray(compareCandidates) ? compareCandidates : []).slice(0, 10).map((candidate, candidateIndex) => {
      const candidateCandles = buildMarketplaceRangeCandles(candidate, config.range);
      if (!candidateCandles.length) return "";
      const selectedBase = Math.max(0.01, candles[0]?.close || last.close || 1);
      const candidateBase = Math.max(0.01, candidateCandles[0]?.close || Number(candidate.priceNumber) || 1);
      const points = pathFromPoints(candles.map((_, index) => {
        const candidateCandle = candidateCandles[Math.min(candidateCandles.length - 1, index)] || candidateCandles[candidateCandles.length - 1];
        const normalizedClose = selectedBase * ((candidateCandle?.close || candidateBase) / candidateBase);
        return { x: xFor(index), y: yFor(Math.max(0.01, normalizedClose)) };
      }));
      const toneClass = `is-compare-${(candidateIndex % 4) + 1}`;
      return `<polyline class="admin-terminal-marketplace-compare-line ${toneClass}" data-marketplace-compare-line="${escapeHtml(candidate.symbol)}" data-marketplace-compare-symbol="${escapeHtml(candidate.symbol)}" data-marketplace-compare-name="${escapeHtml(candidate.name)}" points="${points}"></polyline>`;
    }).join("");
    const ma20Points = pathFromPoints(buildAveragePoints(Math.min(20, candles.length)));
    const ma50Points = pathFromPoints(buildAveragePoints(Math.min(50, candles.length)));
    const vwapLinePoints = pathFromPoints(vwapPoints);

    const candleNodes = candles.map((candle, index) => {
      const x = xFor(index);
      const yOpen = yFor(candle.open);
      const yClose = yFor(candle.close);
      const yHigh = yFor(candle.high);
      const yLow = yFor(candle.low);
      const bodyY = Math.min(yOpen, yClose);
      const bodyHeight = Math.max(2.4, Math.abs(yClose - yOpen));
      const volumeHeightPx = Math.max(2.4, (candle.volume / maxVolume) * layout.volumeHeight);
      const tone = candle.close >= candle.open ? "is-up" : "is-down";
      return `<g class="admin-terminal-marketplace-candle ${tone}"><line x1="${x.toFixed(1)}" y1="${yHigh.toFixed(1)}" x2="${x.toFixed(1)}" y2="${yLow.toFixed(1)}"></line><rect x="${(x - candleWidth / 2).toFixed(1)}" y="${bodyY.toFixed(1)}" width="${candleWidth.toFixed(1)}" height="${bodyHeight.toFixed(1)}" rx="1.1"></rect><rect class="admin-terminal-marketplace-volume" x="${(x - candleWidth / 2).toFixed(1)}" y="${(layout.volumeTop + layout.volumeHeight - volumeHeightPx).toFixed(1)}" width="${candleWidth.toFixed(1)}" height="${volumeHeightPx.toFixed(1)}" rx="1.1"></rect></g>`;
    }).join("");

    const barNodes = candles.map((candle, index) => {
      const x = xFor(index);
      const yOpen = yFor(candle.open);
      const yClose = yFor(candle.close);
      const yHigh = yFor(candle.high);
      const yLow = yFor(candle.low);
      const volumeHeightPx = Math.max(2.4, (candle.volume / maxVolume) * layout.volumeHeight);
      const tone = candle.close >= candle.open ? "is-up" : "is-down";
      return `<g class="admin-terminal-marketplace-bar ${tone}"><line class="is-range" x1="${x.toFixed(1)}" y1="${yHigh.toFixed(1)}" x2="${x.toFixed(1)}" y2="${yLow.toFixed(1)}"></line><line class="is-open" x1="${(x - candleWidth * 0.66).toFixed(1)}" y1="${yOpen.toFixed(1)}" x2="${x.toFixed(1)}" y2="${yOpen.toFixed(1)}"></line><line class="is-close" x1="${x.toFixed(1)}" y1="${yClose.toFixed(1)}" x2="${(x + candleWidth * 0.66).toFixed(1)}" y2="${yClose.toFixed(1)}"></line><rect class="admin-terminal-marketplace-volume" x="${(x - candleWidth / 2).toFixed(1)}" y="${(layout.volumeTop + layout.volumeHeight - volumeHeightPx).toFixed(1)}" width="${candleWidth.toFixed(1)}" height="${volumeHeightPx.toFixed(1)}" rx="1.1"></rect></g>`;
    }).join("");

    const hitNodes = candles.map((candle, index) => {
      const x = xFor(index);
      const prior = candles[Math.max(0, index - 1)] || candle;
      const pointReference = isDailyRange ? previousClose : prior.close;
      const pointChangePercent = pointReference ? ((candle.close - pointReference) / pointReference) * 100 : 0;
      const pointChangeLabel = `${pointChangePercent >= 0 ? "+" : ""}${pointChangePercent.toFixed(2)}%`;
      return `<rect class="admin-terminal-marketplace-candle-hit" data-marketplace-candle-hit data-chart-time="${escapeHtml(candle.label)}" data-chart-x="${x.toFixed(1)}" data-chart-open="${formatAxisPrice(candle.open)}" data-chart-high="${formatAxisPrice(candle.high)}" data-chart-low="${formatAxisPrice(candle.low)}" data-chart-close="${formatAxisPrice(candle.close)}" data-chart-price="${formatAxisPrice(candle.close)}" data-chart-change="${escapeHtml(pointChangeLabel)}" data-chart-volume="${formatVolume(candle.volume)}" x="${(x - step / 2).toFixed(1)}" y="${layout.top}" width="${step.toFixed(1)}" height="${(layout.volumeTop + layout.volumeHeight - layout.top).toFixed(1)}"></rect>`;
    }).join("");

    const ghostStart = Math.max(0, candles.length - 10);
    const ghostTrail = candles.slice(ghostStart).map((candle, offset) => `${xFor(ghostStart + offset).toFixed(1)},${yFor(candle.close).toFixed(1)}`).join(" ");
    const timeTickIndexes = verticalTicksByRange.map((ratio) => Math.max(0, Math.min(candles.length - 1, Math.round((candles.length - 1) * ratio))));
    const timeLabels = Array.from(new Set(timeTickIndexes)).map((index, position, all) => {
      const candle = candles[index];
      const x = xFor(index);
      const anchor = position === 0 ? "start" : position === all.length - 1 ? "end" : "middle";
      return `<text class="admin-terminal-marketplace-chart-time" text-anchor="${anchor}" x="${x.toFixed(1)}" y="${layout.bottomAxis}">${escapeHtml(candle.label)}</text>`;
    }).join("");
    const markers = "";
    const gradientId = `marketplace-chart-area-${sanitizeMarketplaceId(security.symbol)}-${config.range.toLowerCase()}`;
    const summaryPrice = formatAxisPrice(last.close);
    const summaryChange = `${changeAmount >= 0 ? "+" : ""}${formatAxisPrice(changeAmount)} · ${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(2)}%`;
    const summaryRange = isDailyRange ? `${totalChange >= 0 ? "+" : ""}${totalChange.toFixed(2)}% prev close` : `${totalChange >= 0 ? "+" : ""}${totalChange.toFixed(2)}% range`;
    const previousCloseLabel = `Prev. close $${formatAxisPrice(previousClose)}`;
    const previousClosePillWidth = Math.max(92, previousCloseLabel.length * 5.4 + 18);
    const previousClosePillX = width - layout.right - previousClosePillWidth - 8;
    const previousClosePillY = Math.max(layout.top + 8, Math.min(layout.volumeTop - 30, previousCloseY - 14));
    const previousCloseTextY = previousClosePillY + 17;
    const previousCloseGuide = isDailyRange ? `
          <line class="admin-terminal-marketplace-prev-close-line" x1="${layout.left}" y1="${previousCloseY.toFixed(1)}" x2="${(width - layout.right).toFixed(1)}" y2="${previousCloseY.toFixed(1)}"></line>
          <g class="admin-terminal-marketplace-prev-close-pill" aria-label="Previous close ${formatAxisPrice(previousClose)}">
            <rect class="admin-terminal-marketplace-prev-close-label-bg" x="${previousClosePillX.toFixed(1)}" y="${previousClosePillY.toFixed(1)}" width="${previousClosePillWidth.toFixed(1)}" height="24" rx="12"></rect>
            <text class="admin-terminal-marketplace-prev-close-label" x="${(previousClosePillX + 10).toFixed(1)}" y="${previousCloseTextY.toFixed(1)}"><tspan>Prev. close </tspan><tspan class="admin-terminal-marketplace-prev-close-value">$${formatAxisPrice(previousClose)}</tspan></text>
          </g>` : "";

    return `
      <div class="admin-terminal-marketplace-chart-frame" data-marketplace-chart-frame="${escapeHtml(config.range)}" data-marketplace-axis-mode="${escapeHtml(config.axisMode)}" data-marketplace-chart-window-label="${escapeHtml(config.label)}" data-marketplace-range-live-price="${escapeHtml(summaryPrice)}" data-marketplace-range-live-change="${escapeHtml(summaryChange)}" data-marketplace-range-live-tone="${lastTone}" data-marketplace-range-total-change="${escapeHtml(summaryRange)}" data-marketplace-range-total-tone="${trendTone}" ${active ? "" : "hidden"}>
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(security.symbol)} ${escapeHtml(config.label)} market chart">
          <defs>
            <linearGradient id="${escapeHtml(gradientId)}" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stop-color="rgba(101,245,169,.22)"></stop>
              <stop offset="58%" stop-color="rgba(101,245,169,.07)"></stop>
              <stop offset="100%" stop-color="rgba(101,245,169,0)"></stop>
            </linearGradient>
          </defs>
          <rect class="admin-terminal-marketplace-chart-bg" x="0" y="0" width="${width}" height="${height}"></rect>
          ${verticalGrid}
          ${priceGrid}
          <polygon class="admin-terminal-marketplace-area-fill ${trendTone}" points="${areaPoints}"></polygon>
          <polyline class="admin-terminal-marketplace-close-line ${trendTone}" points="${closeLinePoints}"></polyline>
          ${compareLineNodes}
          <polyline class="admin-terminal-marketplace-indicator-line is-ma20" data-marketplace-indicator-line="ma20" points="${ma20Points}"></polyline>
          <polyline class="admin-terminal-marketplace-indicator-line is-ma50" data-marketplace-indicator-line="ma50" points="${ma50Points}"></polyline>
          <polyline class="admin-terminal-marketplace-indicator-line is-vwap" data-marketplace-indicator-line="vwap" points="${vwapLinePoints}"></polyline>
          <g class="admin-terminal-marketplace-bars-layer">${barNodes}</g>
          <g class="admin-terminal-marketplace-candles-layer">${candleNodes}</g>
          ${previousCloseGuide}
          <line class="admin-terminal-marketplace-crosshair is-vertical admin-terminal-marketplace-hover-guide" data-marketplace-hover-guide visibility="hidden" x1="${lastX.toFixed(1)}" y1="${layout.top}" x2="${lastX.toFixed(1)}" y2="${(layout.volumeTop + layout.volumeHeight).toFixed(1)}"></line>
          <polyline class="admin-terminal-marketplace-ghost-trail" points="${ghostTrail}"></polyline>
          ${markers}
          <g class="admin-terminal-marketplace-end-dot ${lastTone}" aria-label="Current price ${formatAxisPrice(last.close)}">
            <circle class="admin-terminal-marketplace-end-dot-ring" cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="5.4"></circle>
            <circle class="admin-terminal-marketplace-end-dot-core" cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="2.6"></circle>
          </g>
          <g class="admin-terminal-marketplace-price-tag is-hidden" aria-hidden="true">
            <rect x="-999" y="-999" width="0" height="0"></rect>
            <text class="admin-terminal-marketplace-price-tag-text" x="-999" y="-999" data-marketplace-price-tag>${formatAxisPrice(last.close)}</text>
          </g>
          <line class="admin-terminal-marketplace-volume-base" x1="${layout.left}" y1="${(layout.volumeTop + layout.volumeHeight).toFixed(1)}" x2="${(width - layout.right).toFixed(1)}" y2="${(layout.volumeTop + layout.volumeHeight).toFixed(1)}"></line>
          <text class="admin-terminal-marketplace-chart-footer" x="${layout.left}" y="${(layout.volumeTop - 8).toFixed(1)}">Vol</text>
          <text class="admin-terminal-marketplace-chart-footer" text-anchor="end" x="${(width - layout.right).toFixed(1)}" y="${(layout.volumeTop - 8).toFixed(1)}">${escapeHtml(security.volume)}</text>
          ${timeLabels}
          <g class="admin-terminal-marketplace-hit-layer">${hitNodes}</g>
        </svg>
        <div class="admin-terminal-marketplace-chart-tooltip" data-marketplace-chart-tooltip hidden>
          <span>${escapeHtml(last.label)}</span>
          <b>O ${formatAxisPrice(last.open)} · H ${formatAxisPrice(last.high)} · L ${formatAxisPrice(last.low)} · C ${formatAxisPrice(last.close)}</b>
          <small>Vol ${formatVolume(last.volume)}</small>
        </div>
      </div>`;
  }

  function renderMarketplaceCandlestickChart(security, securities = [], options = {}) {
    const activeRange = "1M";
    const activeConfig = getMarketplaceRangeConfig(activeRange);
    const compareStocks = (Array.isArray(securities) ? securities : []).filter((candidate) => candidate && candidate.symbol !== security.symbol && String(candidate.type || "").toLowerCase() === "stock");
    const compareCandidates = (compareStocks.length ? compareStocks : (Array.isArray(securities) ? securities : []).filter((candidate) => candidate && candidate.symbol !== security.symbol)).slice(0, 10);
    const frames = MARKETPLACE_CHART_RANGES.map((range) => renderMarketplaceChartFrame(security, range, range === activeRange, compareCandidates, options)).join("");
    const activeCandles = buildMarketplaceRangeCandles(security, activeRange);
    const last = activeCandles[activeCandles.length - 1];
    const previous = activeCandles[activeCandles.length - 2] || last;
    const first = activeCandles[0] || previous;
    const changeAmount = last.close - previous.close;
    const changePercent = previous.close ? (changeAmount / previous.close) * 100 : 0;
    const totalChange = first.close ? ((last.close - first.close) / first.close) * 100 : 0;
    const lastTone = last.close >= previous.close ? "is-up" : "is-down";
    const trendTone = last.close >= first.close ? "is-up" : "is-down";
    const formatAxisPrice = (value) => {
      if (!Number.isFinite(value)) return "—";
      if (value >= 1000) return value.toFixed(0);
      if (value >= 100) return value.toFixed(1);
      return value.toFixed(2);
    };

    return `
      <section class="admin-terminal-marketplace-chart is-finance-reference is-realtime-ready" aria-label="Full-width OHLC price chart with volume" data-marketplace-chart-root data-marketplace-chart-style="candle" data-marketplace-compare="none" data-marketplace-indicator="none" data-marketplace-timeframe="${escapeHtml(activeRange)}" data-marketplace-chart-symbol="${escapeHtml(security.symbol)}" data-marketplace-chart-price="${escapeHtml(security.price)}" data-marketplace-chart-currency="${escapeHtml(security.currency)}" data-marketplace-admin-events="false">
        <header class="admin-terminal-marketplace-chart-tools" aria-label="Chart controls">
          <div class="admin-terminal-marketplace-chart-mode">
            <div class="admin-terminal-marketplace-chart-control" data-marketplace-chart-control>
              <button type="button" data-admin-terminal-action="marketplace-toggle-chart-menu" data-marketplace-chart-menu-toggle="style" aria-expanded="false" aria-label="Chart type">${renderMarketplaceIcon("candle")}<b data-marketplace-chart-type-label>Candle</b><i aria-hidden="true"></i></button>
              <div class="admin-terminal-marketplace-chart-dropdown" data-marketplace-chart-menu="style" hidden>
                ${[
                  ["line", "Line", "line"],
                  ["area", "Area", "area"],
                  ["candle", "Candle", "candle"],
                  ["bar", "Bar", "bar"]
                ].map(([style, label, icon]) => `<button type="button" data-admin-terminal-action="marketplace-set-chart-style" data-marketplace-chart-style="${style}" aria-pressed="${style === "candle" ? "true" : "false"}">${renderMarketplaceIcon(icon)}${label}</button>`).join("")}
              </div>
            </div>
            <div class="admin-terminal-marketplace-chart-control" data-marketplace-chart-control>
              <button type="button" data-admin-terminal-action="marketplace-toggle-chart-menu" data-marketplace-chart-menu-toggle="compare" aria-expanded="false" aria-label="Compare securities">${renderMarketplaceIcon("compare")}<b data-marketplace-compare-label>Compare</b><i aria-hidden="true"></i></button>
              <div class="admin-terminal-marketplace-chart-dropdown is-compare-picker" data-marketplace-chart-menu="compare" hidden>
                <button type="button" data-admin-terminal-action="marketplace-set-chart-compare" data-marketplace-chart-compare="none" aria-pressed="true">${renderMarketplaceIcon("none")}<strong>No comparison</strong><small>Primary security only</small></button>
                ${compareCandidates.length ? compareCandidates.map((candidate) => `<button type="button" data-admin-terminal-action="marketplace-set-chart-compare" data-marketplace-chart-compare="${escapeHtml(candidate.symbol)}" data-marketplace-chart-compare-label="${escapeHtml(candidate.symbol)}" aria-pressed="false"><span>${escapeHtml(candidate.symbol)}</span><strong>${escapeHtml(candidate.name)}</strong><small>${escapeHtml(candidate.type)} · ${escapeHtml(candidate.sector)} · ${escapeHtml(candidate.country)}</small></button>`).join("") : `<button type="button" disabled><span>—</span><strong>No other stocks available</strong><small>Add more marketplace securities to compare.</small></button>`}
              </div>
            </div>
            <div class="admin-terminal-marketplace-chart-control" data-marketplace-chart-control>
              <button type="button" data-admin-terminal-action="marketplace-toggle-chart-menu" data-marketplace-chart-menu-toggle="indicator" aria-expanded="false" aria-label="Indicators">${renderMarketplaceIcon("indicator")}<b data-marketplace-indicator-label>Indicators</b><i aria-hidden="true"></i></button>
              <div class="admin-terminal-marketplace-chart-dropdown" data-marketplace-chart-menu="indicator" hidden>
                ${[
                  ["none", "No indicator", "none"],
                  ["ma20", "Moving average 20", "ma"],
                  ["ma50", "Moving average 50", "ma"],
                  ["vwap", "VWAP", "vwap"]
                ].map(([indicator, label, icon]) => `<button type="button" data-admin-terminal-action="marketplace-set-chart-indicator" data-marketplace-chart-indicator="${indicator}" aria-pressed="${indicator === "none" ? "true" : "false"}">${renderMarketplaceIcon(icon)}${label}</button>`).join("")}
              </div>
            </div>
          </div>
          <div class="admin-terminal-marketplace-chart-feed" aria-label="Live market feed status">
            <span class="admin-terminal-marketplace-feed-pill" data-marketplace-feed-status>
              <i aria-hidden="true"></i>
              <b>Live</b>
            </span>
            <span class="admin-terminal-marketplace-feed-divider" aria-hidden="true"></span>
            <span class="admin-terminal-marketplace-feed-time">
              <em>Last tick</em>
              <time data-marketplace-last-tick>Standby</time>
            </span>
          </div>
        </header>
        <div class="admin-terminal-marketplace-chart-canvas" data-marketplace-chart-canvas>
          ${frames}
        </div>
        <nav class="admin-terminal-marketplace-chart-ranges" aria-label="Chart range">
          ${MARKETPLACE_CHART_RANGES.map((range) => `<button type="button" data-admin-terminal-action="marketplace-set-timeframe" data-marketplace-timeframe="${range}" aria-pressed="${range === activeRange ? "true" : "false"}">${range}</button>`).join("")}
          <span data-marketplace-chart-window>${escapeHtml(activeConfig.label)}</span>
          <strong data-marketplace-live-price>${formatAxisPrice(last.close)} ${escapeHtml(security.currency)}</strong>
          <small class="${lastTone}" data-marketplace-live-change>${changeAmount >= 0 ? "+" : ""}${formatAxisPrice(changeAmount)} · ${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(2)}%</small>
          <em class="${trendTone}" data-marketplace-range-change>${totalChange >= 0 ? "+" : ""}${totalChange.toFixed(2)}% range</em>
        </nav>
      </section>`;
  }

  function renderMarketplaceFinancialPanel(rows) {
    return `<div class="admin-terminal-marketplace-financial-table is-simple-grid is-ratios-grid">
      ${rows.map((row) => `
        <article>
          <span>${escapeHtml(row.label)}</span>
          <strong>${escapeHtml(row.value)}</strong>
          ${row.meta ? `<small>${escapeHtml(row.meta)}</small>` : ""}
        </article>`).join("")}
    </div>`;
  }
  function renderMarketplaceFinancialOverview(rows) {
    return `<div class="admin-terminal-marketplace-financial-overview-grid">
      ${rows.map((row) => `
        <article>
          <span>${escapeHtml(row.label)}</span>
          <strong>${escapeHtml(row.value)}</strong>
          ${row.meta ? `<small>${escapeHtml(row.meta)}</small>` : ""}
        </article>`).join("")}
    </div>`;
  }
  function renderMarketplaceFinancialChart(statement, mode, currency) {
    const series = mode === "annual" ? statement.annualSeries : statement.quarterlySeries;
    const maxValue = Math.max(1, ...series.flatMap((point) => [Math.abs(point.primary || 0), Math.abs(point.secondary || 0)]));
    const bars = series.map((point) => {
      const primaryHeight = Math.max(8, (Math.abs(point.primary || 0) / maxValue) * 118);
      const secondaryHeight = Math.max(6, (Math.abs(point.secondary || 0) / maxValue) * 84);
      return `<div class="admin-terminal-marketplace-statement-bar-group">
        <div class="admin-terminal-marketplace-statement-bars">
          <i class="is-primary" style="height:${primaryHeight.toFixed(1)}px"></i>
          <i class="is-secondary" style="height:${secondaryHeight.toFixed(1)}px"></i>
        </div>
        <span>${escapeHtml(point.label)}</span>
      </div>`;
    }).join("");
    return `<section class="admin-terminal-marketplace-statement-card">
      <header>
        <div>
          <strong>${escapeHtml(statement.chartTitle)}</strong>
          <small>${escapeHtml(statement.primaryLabel)} vs ${escapeHtml(statement.secondaryLabel)}</small>
        </div>
        <div class="admin-terminal-marketplace-statement-legend">
          <span><i class="is-primary"></i>${escapeHtml(statement.primaryLabel)}</span>
          <span><i class="is-secondary"></i>${escapeHtml(statement.secondaryLabel)}</span>
          <em>${escapeHtml(mode === "annual" ? "Annual" : "Quarterly")} · ${escapeHtml(currency)}</em>
        </div>
      </header>
      <div class="admin-terminal-marketplace-statement-chart">
        <div class="admin-terminal-marketplace-statement-bars-row">${bars}</div>
      </div>
    </section>`;
  }
  function renderMarketplaceFinancialStatementTable(periods, rows, currency) {
    return `<div class="admin-terminal-marketplace-statement-table-wrap">
      <table class="admin-terminal-marketplace-statement-table">
        <thead>
          <tr>
            <th>All values in ${escapeHtml(currency)}</th>
            ${periods.map((period) => `<th>${escapeHtml(period)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `<tr><th scope="row">${escapeHtml(row.label)}</th>${row.values.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>
    </div>`;
  }
  function renderMarketplaceFinancialStatementSection(sectionKey, statement, mode, currency) {
    const periods = mode === "annual" ? statement.annualSeries.map((point) => point.label) : statement.quarterlySeries.map((point) => point.label);
    const rows = mode === "annual" ? statement.annualRows : statement.quarterlyRows;
    return `<div class="admin-terminal-marketplace-statement-section" data-statement-section="${escapeHtml(sectionKey)}" data-statement-mode="${escapeHtml(mode)}">
      ${renderMarketplaceFinancialChart(statement, mode, currency)}
      ${renderMarketplaceFinancialStatementTable(periods, rows, currency)}
    </div>`;
  }
  function renderMarketplaceFinancialsDrawer(security) {
    const id = sanitizeMarketplaceId(security.symbol);
    const group = `marketplace-financial-${id}`;
    const modeGroup = `${group}-mode`;
    const tabs = [
      { key: "overview", label: "Overview" },
      { key: "income", label: "Income statement" },
      { key: "balance", label: "Balance sheet" },
      { key: "cashflow", label: "Cash flow" },
      { key: "ratios", label: "Ratios" }
    ];
    return `
      <details class="admin-terminal-marketplace-financials is-v510-financials is-v515-financials" open>
        <summary>
          <span>Financial statements</span>
          <strong>${escapeHtml(security.financials.title)}</strong>
          <small>${escapeHtml(security.financials.period)} · structured for quick review</small>
        </summary>
        <div class="admin-terminal-marketplace-financial-shell">
          ${tabs.map((tab, index) => `<input type="radio" name="${escapeHtml(group)}" id="${escapeHtml(group)}-${escapeHtml(tab.key)}" data-financial-tab="${escapeHtml(tab.key)}" ${index === 0 ? "checked" : ""}>`).join("")}
          <input type="radio" name="${escapeHtml(modeGroup)}" id="${escapeHtml(modeGroup)}-annual" data-financial-mode="annual" checked>
          <input type="radio" name="${escapeHtml(modeGroup)}" id="${escapeHtml(modeGroup)}-quarterly" data-financial-mode="quarterly">
          <div class="admin-terminal-marketplace-financial-topnav" role="tablist" aria-label="Financial section tabs">
            ${tabs.map((tab) => `<label for="${escapeHtml(group)}-${escapeHtml(tab.key)}" data-financial-label="${escapeHtml(tab.key)}">${escapeHtml(tab.label)}</label>`).join("")}
          </div>
          <div class="admin-terminal-marketplace-financial-topbar">
            <div>
              <b>${escapeHtml(security.name)}</b>
              <small>${escapeHtml(security.symbol)} · ${escapeHtml(security.exchange)} · ${escapeHtml(security.financials.currency)}</small>
            </div>
            <div class="admin-terminal-marketplace-financial-mode-toggle" aria-label="Financial period mode">
              <label for="${escapeHtml(modeGroup)}-annual">Annual</label>
              <label for="${escapeHtml(modeGroup)}-quarterly">Quarterly</label>
            </div>
          </div>
          <div class="admin-terminal-marketplace-financial-panels">
            <section data-financial-panel="overview">
              <div class="admin-terminal-marketplace-financial-story">
                <p>${escapeHtml(security.name)} financial overview consolidates the latest operating performance, balance sheet strength, and cash generation into a cleaner review workspace.</p>
              </div>
              ${renderMarketplaceFinancialOverview(security.financials.overview)}
            </section>
            <section data-financial-panel="income">
              ${renderMarketplaceFinancialStatementSection("income", security.financials.statements.income, "annual", security.financials.currency)}
              ${renderMarketplaceFinancialStatementSection("income", security.financials.statements.income, "quarterly", security.financials.currency)}
            </section>
            <section data-financial-panel="balance">
              ${renderMarketplaceFinancialStatementSection("balance", security.financials.statements.balance, "annual", security.financials.currency)}
              ${renderMarketplaceFinancialStatementSection("balance", security.financials.statements.balance, "quarterly", security.financials.currency)}
            </section>
            <section data-financial-panel="cashflow">
              ${renderMarketplaceFinancialStatementSection("cashflow", security.financials.statements.cashflow, "annual", security.financials.currency)}
              ${renderMarketplaceFinancialStatementSection("cashflow", security.financials.statements.cashflow, "quarterly", security.financials.currency)}
            </section>
            <section data-financial-panel="ratios">
              ${renderMarketplaceFinancialPanel(security.financials.ratios)}
            </section>
          </div>
        </div>
      </details>`;
  }
  function renderMarketplaceSecurityRow(security) {
    return `
      <article class="admin-terminal-marketplace-security ${escapeHtml(security.tone)}" data-market-security-row data-market-symbol="${escapeHtml(security.symbol)}" data-market-name="${escapeHtml(security.name)}" data-market-type="${escapeHtml(security.type)}" data-market-location="${escapeHtml(security.country)}" data-market-sector="${escapeHtml(security.sector)}" data-market-price="${escapeHtml(security.price)}" data-market-change="${escapeHtml(security.changeNumber)}" data-market-currency="${escapeHtml(security.currency)}" data-market-options="${escapeHtml(JSON.stringify(security.optionChain || []))}">
        <button type="button" data-admin-terminal-action="select-market-security" data-market-symbol="${escapeHtml(security.symbol)}" aria-label="Open ${escapeHtml(security.symbol)} profile">
          <span>${escapeHtml(security.symbol)}</span>
          <strong>${escapeHtml(security.name)}</strong>
          <small>${escapeHtml(security.type)} · ${escapeHtml(security.sector)} · ${escapeHtml(security.country)}</small>
        </button>
        <div>
          <strong>${renderCurrencyAmount(security.price, security.currency)}</strong>
          <em>${escapeHtml(security.change)}</em>
        </div>
      </article>`;
  }

  function renderMarketplaceTicketInstrumentOptions(security) {
    const optionTypes = new Set((security.optionChain || []).map((option) => String(option.type || "").toLowerCase()));
    return [
      `<option value="Stock">Stock</option>`,
      optionTypes.has("call") ? `<option value="Call Option">Call option</option>` : "",
      optionTypes.has("put") ? `<option value="Put Option">Put option</option>` : ""
    ].filter(Boolean).join("");
  }

  function renderMarketplaceTicketContractOptions(security) {
    const contracts = Array.isArray(security.optionChain) ? security.optionChain : [];
    if (!contracts.length) return `<option value="">No option contracts listed</option>`;
    return contracts.map((option) => {
      const value = [option.type, option.strike, option.expiry, option.premium].map((part) => String(part || "").replace(/\|/g, "/")).join("|");
      return `<option value="${escapeHtml(value)}" data-option-symbol="${escapeHtml(security.symbol)}" data-option-type="${escapeHtml(option.type)}" data-option-strike="${escapeHtml(option.strike)}" data-option-expiry="${escapeHtml(option.expiry)}" data-option-premium="${escapeHtml(option.premium)}">${escapeHtml(option.type)} ${escapeHtml(option.strike)} · ${escapeHtml(option.expiry)} · ${renderCurrencyAmount(option.premium, security.currency)}</option>`;
    }).join("");
  }

  function renderMarketplaceHiddenOptionLoader(security) {
    const option = Array.isArray(security.optionChain) ? security.optionChain[0] : null;
    if (!option) return "";
    return `<button type="button" hidden data-admin-terminal-action="marketplace-load-option" data-option-symbol="${escapeHtml(security.symbol)}" data-option-type="${escapeHtml(option.type)}" data-option-strike="${escapeHtml(option.strike)}" data-option-expiry="${escapeHtml(option.expiry)}" data-option-premium="${escapeHtml(option.premium)}" aria-hidden="true"></button>`;
  }

  function renderMarketplaceProfile(security, securities = [], options = {}) {
    const optionAvailability = security.optionChain.length ? `${security.optionChain.length} contracts` : "None";

    return `
      <header>
        <span>${escapeHtml(security.type)} Profile</span>
        <strong>${escapeHtml(security.symbol)}</strong>
        <small>${escapeHtml(security.name)} · ${escapeHtml(security.exchange)}</small>
      </header>

      <section class="admin-terminal-marketplace-quote ${escapeHtml(security.tone)} is-finance-layout" data-marketplace-quote-card data-marketplace-quote-symbol="${escapeHtml(security.symbol)}">
        <div class="admin-terminal-marketplace-price-summary">
          <div>
            <small>Last Price</small>
            <strong data-marketplace-live-price>${renderCurrencyAmount(security.price, security.currency)}</strong>
            <span class="${escapeHtml(security.tone)}" data-marketplace-live-change>${escapeHtml(security.change)}</span>
          </div>
          <div>
            <small>Venue</small>
            <strong>${escapeHtml(security.exchange)}</strong>
            <span>${escapeHtml(security.currency)} · ${escapeHtml(security.type)}</span>
          </div>
          <div>
            <small>Session</small>
            <strong>Live</strong>
            <span>Realtime preview</span>
          </div>
        </div>
        ${renderMarketplaceCandlestickChart(security, securities, options)}
      </section>

      <section class="admin-terminal-marketplace-profile-grid">
        <article><small>Location</small><strong>${escapeHtml(security.country)}</strong></article>
        <article><small>Sector</small><strong>${escapeHtml(security.sector)}</strong></article>
        <article><small>Volume</small><strong>${escapeHtml(security.volume)}</strong></article>
        <article><small>Day Range</small><strong>${escapeHtml(security.dayRange)}</strong></article>
        <article><small>Market Cap / Size</small><strong>${escapeHtml(security.marketCap)}</strong></article>
        <article><small>P/E or Ratio</small><strong>${escapeHtml(security.pe)}</strong></article>
        <article><small>Yield / Coupon</small><strong>${escapeHtml(security.yieldValue)}</strong></article>
        <article><small>Beta / Volatility</small><strong>${escapeHtml(security.beta)}</strong></article>
        <article><small>Options</small><strong>${escapeHtml(optionAvailability)}</strong></article>
      </section>

      <section class="admin-terminal-marketplace-description">
        <span>Description</span>
        <p>${escapeHtml(security.description)}</p>
        <span>Market read</span>
        <p>${escapeHtml(security.thesis)}</p>
      </section>

      ${renderMarketplaceFinancialsDrawer(security)}`;
  }

  function renderMarketplaceOrderTicket(selected) {
    return `
      <section class="admin-terminal-marketplace-ticket" aria-label="Order ticket">
        <header>
          <span>Order Ticket</span>
          <strong data-marketplace-ticket-symbol>${escapeHtml(selected.symbol)}</strong>
          <small data-marketplace-ticket-name>${escapeHtml(selected.name)}</small>
        </header>

        <div class="admin-terminal-marketplace-ticket-grid">
          <label>
            <span>Instrument</span>
            <select data-marketplace-instrument>
              ${renderMarketplaceTicketInstrumentOptions(selected)}
            </select>
          </label>
          <label>
            <span>Side</span>
            <select data-marketplace-order-side>
              <option>Buy</option>
              <option>Sell</option>
              <option>Short Sell</option>
              <option>Cover Short</option>
            </select>
          </label>
          <label>
            <span>Order Type</span>
            <select data-marketplace-order-type>
              <option>Market</option>
              <option>Limit</option>
              <option>Stop Loss</option>
              <option>Stop Limit</option>
            </select>
          </label>
          <label class="admin-terminal-marketplace-contract-field" data-marketplace-contract-field hidden>
            <span>Contract</span>
            <select data-marketplace-option-contract ${selected.optionChain.length ? "" : "disabled"}>
              ${renderMarketplaceTicketContractOptions(selected)}
            </select>
          </label>
          <label>
            <span>Quantity</span>
            <input type="number" min="1" step="1" value="1" data-marketplace-order-qty>
          </label>
          <label>
            <span>Limit Price</span>
            <input type="number" min="0" step="0.01" value="${escapeHtml(selected.price)}" data-marketplace-order-limit>
          </label>
          <label>
            <span>Stop Price</span>
            <input type="number" min="0" step="0.01" placeholder="optional" data-marketplace-order-stop>
          </label>
          <label>
            <span>Time in Force</span>
            <select data-marketplace-order-tif>
              <option>Day</option>
              <option>Good Till Cancelled</option>
              <option>Immediate or Cancel</option>
            </select>
          </label>
        </div>

        <div class="admin-terminal-marketplace-option-loadout" data-marketplace-option-loadout hidden>
          <span data-marketplace-option-summary>Stock order selected</span>
        </div>
        <div hidden data-marketplace-hidden-option-loader>${renderMarketplaceHiddenOptionLoader(selected)}</div>

        <section class="admin-terminal-marketplace-order-preview" data-marketplace-order-preview>
          Select quantity and preview the order before submitting.
        </section>

        <div class="admin-terminal-marketplace-ticket-actions">
          <button type="button" data-admin-terminal-action="marketplace-preview-order">Preview</button>
          <button type="button" data-admin-terminal-action="marketplace-place-order" disabled title="Marketplace execution is preview-only until backend stock order wiring is connected.">Preview Only</button>
        </div>
      </section>`;
  }

  function renderMarketplaceRecentOrders(securities) {
    const sample = securities.slice(0, 5).map((security, index) => ({
      time: ["09:02", "09:09", "09:16", "09:22", "09:31"][index],
      side: ["Buy", "Sell", "Short Sell", "Buy", "Stop Loss"][index],
      qty: ["3", "1", "2", "1", "5"][index],
      symbol: security.symbol,
      price: security.price,
      currency: security.currency
    }));

    return `
      <section class="admin-terminal-marketplace-orders" aria-label="Recent marketplace orders">
        <header>
          <span>Order Flow</span>
          <strong>Recent activity</strong>
        </header>
        <div data-marketplace-orders>
          ${sample.map((order) => `
            <article>
              <span>${escapeHtml(order.time)}</span>
              <strong>${escapeHtml(order.side)} ${escapeHtml(order.qty)} ${escapeHtml(order.symbol)}</strong>
              <small>${renderCurrencyAmount(order.price, order.currency)}</small>
            </article>`).join("")}
        </div>
      </section>`;
  }

  function renderMarketPageHeader(model) {
    return `
      <header class="admin-terminal-top admin-terminal-page-top">
        <div>
          <span>Trading terminal / marketplace</span>
          <h2>Marketplace</h2>
          <p>Search securities, inspect profiles, and stage buy, sell, short, stop-loss, options, bond, ETF, index, and commodity orders.</p>
        </div>

        <div class="admin-terminal-top-actions">
          <button class="admin-terminal-bell" type="button" aria-label="Alerts" data-admin-terminal-bell>
            ${bellIcon()}
            ${model.notificationCount ? `<small>${escapeHtml(model.notificationCount)}</small>` : ""}
          </button>
          <button class="admin-terminal-user-button" type="button" aria-label="Open admin profile menu" aria-expanded="false" data-admin-terminal-user>
            <span class="admin-terminal-avatar">${escapeHtml(getAdminInitials(model.adminName))}</span>
            <i aria-hidden="true"></i>
          </button>
          ${renderNotifications(model)}
          ${renderAdminUserMenu(model)}
        </div>
      </header>`;
  }

  function renderMarketMetric(label, value, meta, tone = "cyan") {
    return `
      <article class="admin-terminal-market-metric is-${escapeHtml(tone)}">
        <small>${escapeHtml(label)}</small>
        <strong>${escapeHtml(value)}</strong>
        <span>${escapeHtml(meta)}</span>
      </article>`;
  }

  function renderMarketPage(model) {
    const securities = getTerminalMarketplaceSecurities(model);
    const selected = securities[0];
    const typeOptions = getUniqueMarketplaceValues(securities, "type");
    const countryOptions = getUniqueMarketplaceValues(securities, "country");
    const sectorOptions = getUniqueMarketplaceValues(securities, "sector");

    return `
      <section class="admin-terminal-overview admin-terminal-market-page is-marketplace-v502 is-marketplace-v503 is-marketplace-v504 is-marketplace-v505 is-marketplace-v506 is-marketplace-v507 is-marketplace-v508 is-marketplace-v509 is-marketplace-v510 is-marketplace-v511 is-marketplace-v512 is-marketplace-v513 is-marketplace-v514 is-marketplace-v515 is-marketplace-v516 is-marketplace-v517 is-marketplace-v518 is-marketplace-v519 is-marketplace-v520 is-marketplace-v521 is-marketplace-v523 is-marketplace-v524 is-marketplace-v525 is-marketplace-v526 is-marketplace-v527 is-marketplace-v529" aria-label="Admin marketplace terminal" data-admin-terminal-page="Market">
        ${renderMarketPageHeader(model)}

        <section class="admin-terminal-marketplace-toolbar" aria-label="Marketplace search and filters">
          <label class="admin-terminal-marketplace-toolbar-search">
            <span>Search</span>
            <input type="search" placeholder="Search ticker, company, sector, country" data-marketplace-search>
          </label>
          <div class="admin-terminal-marketplace-toolbar-filters">
            <label>
              <span>Asset</span>
              <select aria-label="Asset class" data-marketplace-filter="type"><option value="all">All assets</option>${renderMarketplaceSelectOptions(typeOptions)}</select>
            </label>
            <label>
              <span>Location</span>
              <select aria-label="Location" data-marketplace-filter="location"><option value="all">All locations</option>${renderMarketplaceSelectOptions(countryOptions)}</select>
            </label>
            <label>
              <span>Sector</span>
              <select aria-label="Sector" data-marketplace-filter="sector"><option value="all">All sectors</option>${renderMarketplaceSelectOptions(sectorOptions)}</select>
            </label>
            <label>
              <span>Price</span>
              <select aria-label="Price band" data-marketplace-filter="price">
                <option value="all">All prices</option>
                <option value="under-50">Under 50</option>
                <option value="50-100">50–100</option>
                <option value="100-250">100–250</option>
                <option value="over-250">Over 250</option>
              </select>
            </label>
            <label>
              <span>Sort</span>
              <select aria-label="Sort securities" data-marketplace-sort>
                <option value="symbol">Ticker</option>
                <option value="price-asc">Price ↑</option>
                <option value="price-desc">Price ↓</option>
                <option value="change-desc">Top movers</option>
                <option value="change-asc">Worst movers</option>
              </select>
            </label>
          </div>
          <button class="admin-terminal-marketplace-toolbar-clear" type="button" data-admin-terminal-action="marketplace-clear-filters" aria-label="Clear Marketplace filters">
            Clear
          </button>
        </section>

        <div class="admin-terminal-marketplace-layout">
          <section class="admin-terminal-marketplace-list" aria-label="Searchable securities list">
            <header>
              <div>
                <span>Securities</span>
                <h3>Market list</h3>
                <small><b data-marketplace-visible-count>${escapeHtml(securities.length)}</b> shown</small>
              </div>
            </header>

            <div class="admin-terminal-marketplace-list-head" role="row">
              <span>Security</span>
              <span>Price</span>
            </div>
            <div class="admin-terminal-marketplace-security-list" data-marketplace-list>
              ${securities.map(renderMarketplaceSecurityRow).join("")}
            </div>
            <p class="admin-terminal-marketplace-empty" data-marketplace-empty hidden>No securities match this search.</p>
          </section>

          <div class="admin-terminal-marketplace-workspace" aria-label="Selected security workspace">
            <aside class="admin-terminal-marketplace-profile" aria-label="Selected security profile" data-marketplace-profile>
              ${renderMarketplaceProfile(selected, securities, { showAdminEventMarkers: true })}
            </aside>

            <aside class="admin-terminal-marketplace-side" aria-label="Trading controls">
              ${renderMarketplaceOrderTicket(selected)}
              ${renderMarketplaceRecentOrders(securities)}
            </aside>
          </div>
        </div>

        <div hidden data-marketplace-profile-templates>
          ${securities.map((security) => `<template data-marketplace-profile-template="${escapeHtml(security.symbol)}">${renderMarketplaceProfile(security, securities, { showAdminEventMarkers: true })}</template>`).join("")}
        </div>
      </section>`;
  }


  function renderSettingsPageHeader(model) {
    return `
      <header class="admin-terminal-top admin-terminal-page-top">
        <div>
          <span>Simulation / game configuration</span>
          <h2>Settings</h2>
          <p>Difficulty configuration will be added after the game difficulty model is finalized.</p>
        </div>

        <div class="admin-terminal-top-actions">
          <button class="admin-terminal-bell" type="button" aria-label="Alerts" data-admin-terminal-bell>
            ${bellIcon()}
            ${model.notificationCount ? `<small>${escapeHtml(model.notificationCount)}</small>` : ""}
          </button>
          <button class="admin-terminal-user-button" type="button" aria-label="Open admin profile menu" aria-expanded="false" data-admin-terminal-user>
            <span class="admin-terminal-avatar">${escapeHtml(getAdminInitials(model.adminName))}</span>
            <i aria-hidden="true"></i>
          </button>
          ${renderNotifications(model)}
          ${renderAdminUserMenu(model)}
        </div>
      </header>`;
  }

  function renderSettingsPage(model) {
    return `
      <section class="admin-terminal-overview admin-terminal-settings-page" aria-label="Admin settings terminal" data-admin-terminal-page="Settings">
        ${renderSettingsPageHeader(model)}

        <section class="admin-terminal-settings-detail" aria-label="Settings paused">
          <header>
            <span>Paused</span>
            <strong>Settings paused</strong>
            <small>Difficulty configuration will be added after the game difficulty model is finalized.</small>
          </header>

          <section class="admin-terminal-settings-detail-card is-warn">
            <span>Backend wiring status</span>
            <p>Settings controls are intentionally disabled for this pass. No game-settings mutations are wired from the admin terminal.</p>
          </section>
        </section>
      </section>`;
  }


  function getTerminalLogRows(model) {
    const source = Array.isArray(model?.auditLogs) && model.auditLogs.length
      ? model.auditLogs
      : Array.isArray(model?.logs) && model.logs.length
        ? model.logs
        : [
            { time: "07:58", type: "Security", actor: "System", target: "Admin console", summary: "Staff session authenticated through domain login.", source: "Google SSO", before: "Signed out", after: "Signed in", severity: "Low", impact: "Access", eventId: "LOG-2407-001" },
            { time: "08:01", type: "Attendance", actor: "System", target: "Mina Park", summary: "Checked in on time and received attendance reward.", source: "Scanner", before: "Offline", after: "Present · +10.00", severity: "Low", impact: "Cash +10.00", eventId: "LOG-2407-002" },
            { time: "08:14", type: "Attendance", actor: "System", target: "Alex Kim", summary: "Marked late and received reduced attendance reward.", source: "Scanner", before: "Offline", after: "Late · +4.00", severity: "Medium", impact: "Cash +4.00", eventId: "LOG-2407-003" },
            { time: "08:20", type: "Store", actor: "Mina Park", target: "Homework Pass", summary: "Purchased store item and inventory record was created.", source: "Student purchase", before: "Cash 68.00", after: "Cash 43.00 · Item +1", severity: "Low", impact: "Cash -25.00", eventId: "LOG-2407-004" },
            { time: "08:26", type: "Inventory", actor: "System", target: "Energy Cell Pack", summary: "Reward item added to player inventory after contract completion.", source: "Contract reward", before: "Qty 0", after: "Qty 3", severity: "Low", impact: "Inventory +3", eventId: "LOG-2407-005" },
            { time: "08:31", type: "Contracts", actor: model.adminName || "Admin", target: "Market Reflection", summary: "Created contract for all countries with cash and item reward rules.", source: "Admin action", before: "Draft", after: "Active", severity: "Medium", impact: "New active contract", eventId: "LOG-2407-006" },
            { time: "08:38", type: "Finance", actor: model.adminName || "Admin", target: "Daniel Lee", summary: "Manual ledger adjustment applied after dispute review.", source: "Admin adjustment", before: "Cash 112.00", after: "Cash 127.00", severity: "Medium", impact: "Cash +15.00", eventId: "LOG-2407-007" },
            { time: "08:44", type: "Market", actor: "System", target: "FROST", summary: "Applied price movement from shipping-delay market event.", source: "Market event", before: "125.19", after: "128.20", severity: "Low", impact: "+2.4% asset price", eventId: "LOG-2407-008" },
            { time: "08:49", type: "Liabilities", actor: "System", target: "Yrethia Equipment Loan", summary: "Weekly minimum payment posted and remaining balance recalculated.", source: "Loan schedule", before: "Due 43.20", after: "Paid 43.20 · Current", severity: "Low", impact: "Debt -43.20", eventId: "LOG-2407-009" },
            { time: "08:52", type: "Settings", actor: model.adminName || "Admin", target: "Difficulty", summary: "Reviewed Standard difficulty preset without applying changes.", source: "Admin view", before: "Standard", after: "Standard", severity: "Low", impact: "No change", eventId: "LOG-2407-010" },
            { time: "09:03", type: "Contracts", actor: "Yuna Choi", target: "Supply Chain Memo", summary: "Submitted contract evidence for review.", source: "Student submission", before: "Assigned", after: "Submitted", severity: "Low", impact: "Review needed", eventId: "LOG-2407-011" },
            { time: "09:12", type: "Liabilities", actor: "System", target: "Syndalis Short-Term Credit", summary: "Loan crossed attention threshold because weekly payment was missed.", source: "Loan schedule", before: "Current", after: "Attention · late fee pending", severity: "High", impact: "Late risk", eventId: "LOG-2407-012" }
          ];

    return source.map((row, index) => {
      const type = row.type || row.category || "System";
      const normalized = String(type).toLowerCase();
      const severity = row.severity || row.priority || (normalized.includes("liabil") ? "Medium" : "Low");
      const normalizedSeverity = String(severity).toLowerCase();
      const tone =
        normalized.includes("attendance") ? "is-attendance" :
        normalized.includes("store") ? "is-store" :
        normalized.includes("inventory") ? "is-inventory" :
        normalized.includes("contract") || normalized.includes("assignment") ? "is-contracts" :
        normalized.includes("market") || normalized.includes("stock") ? "is-market" :
        normalized.includes("liabil") || normalized.includes("loan") || normalized.includes("debt") ? "is-liabilities" :
        normalized.includes("finance") || normalized.includes("ledger") || normalized.includes("cash") ? "is-finance" :
        normalized.includes("security") || normalized.includes("access") ? "is-security" :
        normalized.includes("setting") ? "is-settings" :
        "is-system";
      const severityTone =
        normalizedSeverity.includes("high") || normalizedSeverity.includes("critical") ? "is-high" :
        normalizedSeverity.includes("medium") || normalizedSeverity.includes("warn") ? "is-medium" :
        "is-low";

      return {
        time: row.time || row.timestamp || ["08:01", "08:14", "08:20", "08:31", "08:44", "08:52"][index % 6],
        type,
        actor: row.actor || row.user || "System",
        target: row.target || row.record || "Simulation",
        summary: row.summary || row.description || "System event recorded.",
        source: row.source || "System",
        before: row.before || "—",
        after: row.after || "—",
        severity,
        severityTone,
        impact: row.impact || row.effect || row.delta || "Recorded",
        eventId: row.eventId || row.id || `LOG-${String(index + 1).padStart(4, "0")}`,
        tone,
        index
      };
    });
  }

  function getLogCategoryLabel(log) {
    const type = String(log?.type || "System");
    return type.length > 18 ? `${type.slice(0, 18)}…` : type;
  }

  function isHighImpactLog(log) {
    const text = `${log?.severity || ""} ${log?.impact || ""} ${log?.summary || ""}`.toLowerCase();
    return text.includes("high") || text.includes("late") || text.includes("manual") || text.includes("adjust") || text.includes("risk");
  }

  function renderLogsPageHeader(model) {
    return `
      <header class="admin-terminal-top admin-terminal-page-top">
        <div>
          <span>Audit trail / system activity</span>
          <h2>Logs</h2>
          <p>Review what changed, who did it, when it happened, and what record was affected.</p>
        </div>

        <div class="admin-terminal-top-actions">
          <button class="admin-terminal-bell" type="button" aria-label="Alerts" data-admin-terminal-bell>
            ${bellIcon()}
            ${model.notificationCount ? `<small>${escapeHtml(model.notificationCount)}</small>` : ""}
          </button>
          <button class="admin-terminal-user-button" type="button" aria-label="Open admin profile menu" aria-expanded="false" data-admin-terminal-user>
            <span class="admin-terminal-avatar">${escapeHtml(getAdminInitials(model.adminName))}</span>
            <i aria-hidden="true"></i>
          </button>
          ${renderNotifications(model)}
          ${renderAdminUserMenu(model)}
        </div>
      </header>`;
  }

  function renderLogsMetric(label, value, meta, tone = "cyan") {
    return `
      <article class="admin-terminal-logs-metric is-${escapeHtml(tone)}">
        <small>${escapeHtml(label)}</small>
        <strong>${escapeHtml(value)}</strong>
        <span>${escapeHtml(meta)}</span>
      </article>`;
  }

  function renderLogTimelineRow(log) {
    return `
      <article class="admin-terminal-log-row ${escapeHtml(log.tone)} ${escapeHtml(log.severityTone)}">
        <button
          type="button"
          data-admin-terminal-action="open-log-detail"
          data-log-type="${escapeHtml(log.type)}"
          data-log-target="${escapeHtml(log.target)}"
        >
          <span class="admin-terminal-log-time">${escapeHtml(log.time)}</span>
          <span class="admin-terminal-log-dot" aria-hidden="true"></span>
          <span class="admin-terminal-log-main">
            <strong>${escapeHtml(log.target)}</strong>
            <small>${escapeHtml(log.summary)}</small>
            <em>${escapeHtml(log.actor)} · ${escapeHtml(log.source)}</em>
          </span>
          <span class="admin-terminal-log-side">
            <span class="admin-terminal-log-type">${escapeHtml(getLogCategoryLabel(log))}</span>
            <b class="admin-terminal-log-impact">${escapeHtml(log.impact)}</b>
          </span>
        </button>
      </article>`;
  }

  function renderLogSourceRow(label, value, tone = "cyan") {
    return `
      <article class="admin-terminal-log-source is-${escapeHtml(tone)}">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </article>`;
  }

  function renderLogsPage(model) {
    const logs = getTerminalLogRows(model);
    const selected = logs[0] || {
      time: "—",
      type: "System",
      actor: "System",
      target: "No event selected",
      summary: "No log event available.",
      source: "System",
      before: "—",
      after: "—",
      severity: "Low",
      severityTone: "is-low",
      impact: "None",
      eventId: "LOG-0000",
      tone: "is-system"
    };

    const attendanceCount = logs.filter((log) => log.tone === "is-attendance").length;
    const inventoryCount = logs.filter((log) => log.tone === "is-inventory" || log.tone === "is-store").length;
    const financialCount = logs.filter((log) => ["is-finance", "is-liabilities", "is-market", "is-store"].includes(log.tone)).length;
    const adminCount = logs.filter((log) => log.actor !== "System").length;
    const highImpactCount = logs.filter(isHighImpactLog).length;

    return `
      <section class="admin-terminal-overview admin-terminal-logs-page" aria-label="Admin logs terminal" data-admin-terminal-page="Logs">
        ${renderLogsPageHeader(model)}

        <section class="admin-terminal-logs-command" aria-label="Log filters and summary">
          ${renderLogsMetric("Events", logs.length, "visible records", "cyan")}
          ${renderLogsMetric("Manual", adminCount, "staff / student actors", "purple")}
          ${renderLogsMetric("High Impact", highImpactCount, "review priority", "warn")}
          ${renderLogsMetric("Financial", financialCount, "cash / market / debt", "active")}

          <button class="admin-terminal-logs-export" type="button" data-admin-terminal-action="export-logs">
            <span>⇩</span>
            Export Logs
          </button>
        </section>

        <section class="admin-terminal-logs-control-strip" aria-label="Log search and scope controls">
          <label>
            <span>Search Logs</span>
            <input type="search" placeholder="Player, item, loan, contract, event ID" aria-label="Search logs" data-admin-terminal-logs-search>
          </label>
          <div>
            <button type="button" class="active" data-admin-terminal-action="filter-logs-all">All</button>
            <button type="button" data-admin-terminal-action="filter-logs-attendance">Attendance</button>
            <button type="button" data-admin-terminal-action="filter-logs-inventory">Inventory</button>
            <button type="button" data-admin-terminal-action="filter-logs-finance">Finance</button>
            <button type="button" data-admin-terminal-action="filter-logs-contracts">Contracts</button>
            <button type="button" data-admin-terminal-action="filter-logs-admin">Admin</button>
          </div>
        </section>

        <section class="admin-terminal-log-source-grid" aria-label="Log coverage summary">
          ${renderLogSourceRow("Attendance", attendanceCount, "active")}
          ${renderLogSourceRow("Inventory / Store", inventoryCount, "cyan")}
          ${renderLogSourceRow("Cash / Debt / Market", financialCount, "warn")}
          ${renderLogSourceRow("Retention", "Full trail", "purple")}
        </section>

        <div class="admin-terminal-logs-layout">
          <section class="admin-terminal-logs-timeline" aria-label="Audit timeline">
            <header>
              <div>
                <span>Timeline</span>
                <h3>System Activity</h3>
              </div>
              <div class="admin-terminal-logs-tabs">
                <button type="button" class="active" data-admin-terminal-action="filter-logs-all">All</button>
                <button type="button" data-admin-terminal-action="filter-logs-system">System</button>
                <button type="button" data-admin-terminal-action="filter-logs-admin">Admin</button>
                <button type="button" data-admin-terminal-action="filter-logs-economy">Economy</button>
              </div>
            </header>

            <div class="admin-terminal-log-list">
              ${logs.map(renderLogTimelineRow).join("")}
            </div>
          </section>

          <aside class="admin-terminal-log-detail" aria-label="Selected log detail">
            <header>
              <span>Selected Event</span>
              <strong>${escapeHtml(selected.target)}</strong>
              <small>${escapeHtml(selected.type)} · ${escapeHtml(selected.time)} · ${escapeHtml(selected.source)}</small>
            </header>

            <section class="admin-terminal-log-detail-card ${escapeHtml(selected.tone)} ${escapeHtml(selected.severityTone)}">
              <span>Event Summary</span>
              <p>${escapeHtml(selected.summary)}</p>

              <dl>
                <div>
                  <dt>Event ID</dt>
                  <dd>${escapeHtml(selected.eventId)}</dd>
                </div>
                <div>
                  <dt>Severity</dt>
                  <dd>${escapeHtml(selected.severity)}</dd>
                </div>
                <div>
                  <dt>Actor</dt>
                  <dd>${escapeHtml(selected.actor)}</dd>
                </div>
                <div>
                  <dt>Target</dt>
                  <dd>${escapeHtml(selected.target)}</dd>
                </div>
                <div>
                  <dt>Impact</dt>
                  <dd>${escapeHtml(selected.impact)}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>${escapeHtml(selected.source)}</dd>
                </div>
                <div>
                  <dt>Before</dt>
                  <dd>${escapeHtml(selected.before)}</dd>
                </div>
                <div>
                  <dt>After</dt>
                  <dd>${escapeHtml(selected.after)}</dd>
                </div>
              </dl>

              <div class="admin-terminal-log-detail-actions">
                <button type="button" data-admin-terminal-action="open-related-record">Open Record</button>
                <button type="button" data-admin-terminal-action="copy-log-id">Copy Event</button>
                <button type="button" data-admin-terminal-action="flag-log-event">Flag Event</button>
                <button type="button" data-admin-terminal-action="export-logs">Export</button>
              </div>
            </section>

            <section class="admin-terminal-log-use-cases">
              <span>Audit Controls</span>
              <p>Use this panel to trace disputes across attendance scans, cash changes, inventory rewards, store purchases, contract submissions, market events, and loan activity.</p>
              <div>
                <button type="button" data-admin-terminal-action="search-logs">Search Logs</button>
                <button type="button" data-admin-terminal-action="audit-student-history">Student History</button>
                <button type="button" data-admin-terminal-action="export-logs">Export Trail</button>
              </div>
            </section>
          </aside>
        </div>
      </section>`;
  }
