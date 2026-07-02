// Overview attendance widgets plus reusable modal/form shells.
  function getAttendanceStatusCounts(model) {
    const fallback = { total: 28, present: 24, late: 3, absent: 1 };
    const explicit = model?.attendanceStatusCounts || model?.attendanceCounts || model?.statusCounts;
    const rows = Array.isArray(model?.attendance) ? model.attendance : [];
    const totalPlayers = Number(model?.totalPlayers ?? model?.playerCount ?? explicit?.total ?? fallback.total) || fallback.total;

    if (explicit && typeof explicit === "object") {
      const present = Number(explicit.present ?? explicit.checkedIn ?? explicit.active ?? fallback.present) || 0;
      const late = Number(explicit.late ?? explicit.pending ?? explicit.waiting ?? fallback.late) || 0;
      const absent = Number(explicit.absent ?? explicit.missing ?? fallback.absent) || 0;
      const total = Number(explicit.total ?? totalPlayers ?? (present + late + absent)) || totalPlayers;
      return normalizeAttendanceCounts({ total, present, late, absent }, model, rows);
    }

    const rowCounts = rows.reduce((acc, row) => {
      const status = String(row.status || row.attendanceStatus || "").toLowerCase();
      if (["on time", "present", "checked in", "checked-in", "checked_in", "active"].includes(status)) acc.present += 1;
      else if (["late", "pending", "waiting"].includes(status)) acc.late += 1;
      else if (["absent", "missing", "offline"].includes(status)) acc.absent += 1;
      else acc.late += 1;
      return acc;
    }, { total: rows.length, present: 0, late: 0, absent: 0 });

    // If attendance rows are only a short recent-log sample, do not treat them as the whole roster.
    const hasRosterSizedRows = rows.length >= totalPlayers || rows.length >= 8;
    const baseCounts = hasRosterSizedRows
      ? { total: rows.length, present: rowCounts.present, late: rowCounts.late, absent: rowCounts.absent }
      : fallback;

    return normalizeAttendanceCounts({ ...baseCounts, total: totalPlayers || baseCounts.total }, model, rows);
  }

  function normalizeAttendanceCounts(counts, model, rows) {
    const total = Math.max(Number(counts.total) || 0, 0);
    const present = Math.max(Number(counts.present) || 0, 0);
    const late = Math.max(Number(counts.late ?? counts.pending) || 0, 0);
    const absent = Math.max(Number(counts.absent) || Math.max(total - present - late, 0), 0);
    const attendanceRate = total ? Math.round((present / total) * 100) : 0;

    const latestRow = rows.find((row) => row.student || row.name || row.status || row.time) || null;

    const rewardsIssued = rows.reduce((sum, row) => {
      const reward = String(row.reward || "").replace(/[^\d.-]/g, "");
      const value = Number(reward);
      return Number.isFinite(value) ? sum + value : sum;
    }, 0);

    const latestScan = model?.attendanceSummary?.latestScan
      || (latestRow
        ? `${latestRow.student || latestRow.name || "Player"} · ${latestRow.status || "Scanned"}${latestRow.time ? ` · ${latestRow.time}` : ""}`
        : "No scans yet");

    return {
      total,
      present,
      late,
      absent,
      attendanceRate,
      rewardsIssued: Number(model?.attendanceSummary?.rewardsIssued ?? rewardsIssued) || 0,
      latestScan
    };
  }

  function renderAttendance(model) {
    const counts = getAttendanceStatusCounts(model);

    return `
      <section class="admin-terminal-attendance" aria-label="Attendance summary">
        <div class="admin-terminal-attendance-head">
          <div>
            <span class="admin-terminal-section-kicker">Attendance</span>
            <h3>Status overview</h3>
          </div>
          <button class="admin-terminal-card-view-button" type="button" data-admin-terminal-action="view-attendance">View</button>
        </div>

        <div class="admin-terminal-attendance-body">
          <div class="admin-terminal-attendance-total">
            <strong>${escapeHtml(counts.total)}</strong>
            <span>Total players</span>
          </div>

          <div class="admin-terminal-attendance-rate">
            <strong>${escapeHtml(counts.attendanceRate)}%</strong>
            <span>Present rate</span>
          </div>

          <div class="admin-terminal-attendance-status-grid" aria-label="Player status counts">
            <span class="is-good"><strong>${escapeHtml(counts.present)}</strong><small>Present</small></span>
            <span class="is-warn"><strong>${escapeHtml(counts.late)}</strong><small>Late</small></span>
            <span class="is-bad"><strong>${escapeHtml(counts.absent)}</strong><small>Absent</small></span>
          </div>
        </div>

        <div class="admin-terminal-attendance-detail-grid">
          <span class="is-wide"><strong>${escapeHtml(counts.latestScan)}</strong><small>Latest scan</small></span>
          <span><strong>${renderCurrencyAmount(counts.rewardsIssued, "NRC")}</strong><small>Attendance rewards today</small></span>
        </div>
      </section>`;
  }

  function renderModalShell({ id, tone = "cyan", eyebrow, title, body, footer, backdropClass = "", modalClass = "" }) {
    const extraBackdropClass = backdropClass ? ` ${escapeHtml(backdropClass)}` : "";
    const extraModalClass = modalClass ? ` ${escapeHtml(modalClass)}` : "";
    return `
      <div class="admin-terminal-modal-backdrop${extraBackdropClass}" data-admin-terminal-modal-backdrop data-modal-id="${escapeHtml(id)}">
        <section class="admin-terminal-modal is-${escapeHtml(tone)}${extraModalClass}" role="dialog" aria-modal="true" aria-labelledby="${escapeHtml(id)}-title">
          <header class="admin-terminal-modal-head">
            <div>
              <span>${escapeHtml(eyebrow)}</span>
              <h3 id="${escapeHtml(id)}-title">${escapeHtml(title)}</h3>
            </div>
            <button class="admin-terminal-modal-close admin-terminal-modal-top-close-v474" type="button" aria-label="Close popup" title="Close" data-admin-terminal-modal-close>×</button>
          </header>

          <div class="admin-terminal-modal-body">
            ${body}
          </div>

          ${footer ? `<footer class="admin-terminal-modal-footer">${footer}</footer>` : ""}
        </section>
      </div>`;
  }

  function renderAttendanceScannerModal(model) {
    const counts = getAttendanceStatusCounts(model);
    const recent = Array.isArray(model.attendance) ? model.attendance.slice(0, 3) : [];

    return renderModalShell({
      id: "attendance-scanner",
      tone: "amber",
      eyebrow: "Attendance scanner",
      title: "Scan attendance",
      body: `
        <div class="admin-terminal-scanner-video-container" data-admin-terminal-scanner-console data-scan-mode="auto">
          <video class="admin-terminal-scanner-video" autoplay muted loop playsinline preload="auto" aria-hidden="true">
            <source src="./assets/videos/scanner-background.mp4" type="video/mp4" />
          </video>

          <input class="admin-terminal-scanner-hidden-input" data-admin-terminal-auto-scan-input type="text" autocomplete="off" inputmode="text" aria-label="Auto scanner capture input" />

          <header class="admin-terminal-video-topbar">
            <div class="admin-terminal-video-mode">
              <span class="admin-terminal-mode-dot" aria-hidden="true"></span>
              <div>
                <strong>Attendance Scanner</strong>
                <small><span data-admin-terminal-mode-label>Auto</span> · <span data-admin-terminal-scanner-state>Armed</span></small>
              </div>
            </div>

            <div class="admin-terminal-topbar-controls">
              <div class="admin-terminal-scan-mode-tabs" role="group" aria-label="Scanner input mode">
                <button type="button" data-admin-terminal-set-mode="auto" aria-pressed="true" onclick="window.Econovaria?.features?.adminOverviewTerminal?.setScannerMode?.('auto')">Auto</button>
                <button type="button" data-admin-terminal-set-mode="manual" aria-pressed="false" onclick="window.Econovaria?.features?.adminOverviewTerminal?.setScannerMode?.('manual')">Manual</button>
              </div>

              <button class="admin-terminal-hud-close" type="button" data-admin-terminal-modal-close aria-label="Close scanner">
                <span>Close</span>
                <b aria-hidden="true">×</b>
              </button>
            </div>
          </header>

          <section class="admin-terminal-video-last-scan" data-admin-terminal-last-scan-card>
            <div class="admin-terminal-last-scan-empty" data-admin-terminal-last-scan-empty>
              <span>Last scanned</span>
              <strong>Ready</strong>
              <small>Scan a player code. The result appears here.</small>
            </div>

            <div class="admin-terminal-last-scan-result" data-admin-terminal-last-scan-result hidden>
              <div class="admin-terminal-scan-player-block">
                <div>
                  <span>Last scanned</span>
                  <strong data-admin-terminal-last-scan-player>—</strong>
                  <small data-admin-terminal-last-scan-time>—</small>
                </div>
              </div>

              <div class="admin-terminal-last-scan-meta">
                <span class="is-status is-present" data-admin-terminal-last-scan-status>Present</span>
                <span class="is-reward" data-admin-terminal-last-scan-reward>0.00</span>
              </div>
            </div>
          </section>

          <section class="admin-terminal-auto-capture-panel" data-admin-terminal-auto-panel>
            <span class="admin-terminal-scanner-dot" aria-hidden="true"></span>
            <div>
              <strong>Listening</strong>
              <small>Auto-submit is active.</small>
            </div>
            <button type="button" data-admin-terminal-action="mock-start-scanner">Refocus</button>
          </section>

          <section class="admin-terminal-manual-entry-panel" data-admin-terminal-manual-panel hidden>
            <div>
              <strong>Manual entry</strong>
              <small>Fallback mode</small>
            </div>
            <div class="admin-terminal-scanner-input-row">
              <input id="adminTerminalScannerInput" data-admin-terminal-manual-scan-input type="text" autocomplete="off" inputmode="text" placeholder="Player ID / access code" />
              <button type="button" data-admin-terminal-action="mock-confirm-scan">Submit</button>
            </div>
          </section>

          <footer class="admin-terminal-scanner-video-stats">
            <span class="is-good"><small>Present</small><strong>${escapeHtml(counts.present)}</strong></span>
            <span class="is-warn"><small>Late</small><strong>${escapeHtml(counts.late)}</strong></span>
            <span class="is-bad"><small>Absent</small><strong>${escapeHtml(counts.absent)}</strong></span>
          </footer>
        </div>`,
      footer: ``
    });
  }


  function renderAddContractModal(model) {
    return renderModalShell({
      id: "add-contract",
      title: "Add Contract",
      eyebrow: "Teacher command",
      body: `
        <div class="admin-terminal-contract-container" data-admin-terminal-contract-console data-reward-mode="cash">
          <video class="admin-terminal-contract-video" autoplay muted loop playsinline preload="auto" aria-hidden="true">
            <source src="./assets/videos/contract-background.mp4" type="video/mp4" />
          </video>

          <header class="admin-terminal-contract-topbar">
            <div class="admin-terminal-contract-title-block">
              <span class="admin-terminal-mode-dot" aria-hidden="true"></span>
              <div>
                <strong>Create Contract</strong>
                <small>Assignment + reward setup</small>
              </div>
            </div>

            <button class="admin-terminal-hud-close" type="button" data-admin-terminal-modal-close aria-label="Close add contract">
              <span>Close</span>
              <b aria-hidden="true">×</b>
            </button>
          </header>

          <form class="admin-terminal-contract-form" data-admin-terminal-contract-form>
            <section class="admin-terminal-contract-main">
              <section class="admin-terminal-contract-writing-v494 admin-terminal-contract-writing-v495" aria-label="Contract writing fields">
                <label class="admin-terminal-field is-title">
                  <span>Contract title</span>
                  <input type="text" name="title" data-admin-terminal-contract-title placeholder="Example: Market Analysis Brief" autocomplete="off" />
                </label>

                <label class="admin-terminal-field is-wide">
                  <span>Objective</span>
                  <input type="text" name="objective" data-admin-terminal-contract-objective placeholder="What should the student complete?" autocomplete="off" />
                </label>

                <label class="admin-terminal-field is-wide">
                  <span>Instructions</span>
                  <textarea name="instructions" rows="4" data-admin-terminal-contract-instructions placeholder="Write the exact instructions students will see."></textarea>
                </label>

                <label class="admin-terminal-field is-wide">
                  <span>Submission requirement</span>
                  <textarea name="evidence" rows="3" data-admin-terminal-contract-evidence placeholder="What should students turn in or prove?"></textarea>
                </label>
              </section>

              <div class="admin-terminal-contract-grid is-four">
                <label class="admin-terminal-field">
                  <span>Deadline</span>
                  <input type="datetime-local" name="deadline" data-admin-terminal-contract-deadline />
                </label>

                <label class="admin-terminal-field">
                  <span>Qty offered</span>
                  <input type="number" name="quantity" min="1" step="1" value="1" data-admin-terminal-contract-quantity />
                </label>

                <label class="admin-terminal-field">
                  <span>Qty scope</span>
                  <select name="quantityScope" data-admin-terminal-contract-quantity-scope>
                    <option value="total">Total pool</option>
                    <option value="per_location">Per selected country</option>
                  </select>
                </label>

                <div class="admin-terminal-field admin-terminal-location-field" data-admin-terminal-location-field>
                  <span>Location</span>
                  <button type="button" class="admin-terminal-location-toggle" data-admin-terminal-location-toggle aria-expanded="false">
                    <strong data-admin-terminal-location-summary>All countries</strong>
                    <b aria-hidden="true">⌄</b>
                  </button>

                  <div class="admin-terminal-location-menu" data-admin-terminal-location-menu hidden>
                    <label><input type="checkbox" value="all" data-admin-terminal-contract-location checked /> All countries</label>
                    <label><input type="checkbox" value="NORTHREACH" data-admin-terminal-contract-location /> Northreach</label>
                    <label><input type="checkbox" value="YRETHIA" data-admin-terminal-contract-location /> Yrethia</label>
                    <label><input type="checkbox" value="THALORIS" data-admin-terminal-contract-location /> Thaloris</label>
                    <label><input type="checkbox" value="SOLVEND" data-admin-terminal-contract-location /> Solvend</label>
                    <label><input type="checkbox" value="ELDORAN" data-admin-terminal-contract-location /> Eldoran</label>
                    <label><input type="checkbox" value="VALERION" data-admin-terminal-contract-location /> Valerion</label>
                    <label><input type="checkbox" value="LUMENOR" data-admin-terminal-contract-location /> Lumenor</label>
                    <label><input type="checkbox" value="XALVORIA" data-admin-terminal-contract-location /> Xalvoria</label>
                    <label><input type="checkbox" value="DRAVENLOK" data-admin-terminal-contract-location /> Dravenlok</label>
                    <label><input type="checkbox" value="SYNDALIS" data-admin-terminal-contract-location /> Syndalis</label>
                  </div>
                </div>
              </div>

              <div class="admin-terminal-contract-grid is-review-v495">
                <label class="admin-terminal-field">
                  <span>Review type</span>
                  <select name="reviewType" data-admin-terminal-contract-review-type>
                    <option value="teacher">Teacher review</option>
                    <option value="auto">Auto-complete</option>
                  </select>
                </label>

                <label class="admin-terminal-field">
                  <span>Post setting</span>
                  <select name="postSetting" data-admin-terminal-contract-post-setting>
                    <option value="now">Post now</option>
                    <option value="scheduled">Schedule post</option>
                    <option value="draft">Save as draft</option>
                  </select>
                </label>
              </div>

              <details class="admin-terminal-contract-advanced-v495">
                <summary>Advanced options</summary>
                <div class="admin-terminal-contract-grid is-authoring-meta-v494 is-advanced-v495">
                  <label class="admin-terminal-field">
                    <span>Category</span>
                    <select name="category" data-admin-terminal-contract-category>
                      <option value="contracts">Contracts</option>
                      <option value="simulation">Simulation</option>
                      <option value="writing">Writing</option>
                      <option value="research">Research</option>
                    </select>
                  </label>

                  <label class="admin-terminal-field">
                    <span>Difficulty</span>
                    <select name="difficulty" data-admin-terminal-contract-difficulty>
                      <option value="Standard">Standard</option>
                      <option value="Advanced">Advanced</option>
                      <option value="Quick task">Quick task</option>
                      <option value="Major contract">Major contract</option>
                    </select>
                  </label>

                  <label class="admin-terminal-field is-wide">
                    <span>Internal note</span>
                    <textarea name="reviewNote" rows="2" data-admin-terminal-contract-review-note placeholder="Optional note for the reviewer. Not shown to players."></textarea>
                  </label>
                </div>
              </details>

              <label class="admin-terminal-field" data-admin-terminal-scheduled-post-panel hidden>
                <span>Post at</span>
                <input type="datetime-local" name="postAt" data-admin-terminal-contract-post-at />
              </label>
            </section>

            <aside class="admin-terminal-contract-reward">
              <div class="admin-terminal-reward-add-top" role="group" aria-label="Choose reward type to add">
                <button type="button" data-admin-terminal-action="stage-cash-reward" aria-pressed="true">+ Cash</button>
                <button type="button" data-admin-terminal-action="stage-item-reward" aria-pressed="false">+ Item</button>
              </div>

              <div class="admin-terminal-reward-stage" data-admin-terminal-reward-stage data-reward-kind="cash">
                <div class="admin-terminal-reward-stage-row is-cash" data-admin-terminal-reward-stage-cash>
                  <label>
                    <span>Cash amount</span>
                    <input type="number" min="0" step="1" placeholder="10" data-admin-terminal-stage-cash />
                  </label>

                  <button type="button" data-admin-terminal-action="confirm-staged-reward">Add</button>
                </div>

                <div class="admin-terminal-reward-stage-row is-item" data-admin-terminal-reward-stage-item hidden>
                  <label>
                    <span>Item</span>
                    <select data-admin-terminal-stage-item>
                      <option value="homework_pass">Homework Pass</option>
                      <option value="late_pass">Late Pass</option>
                      <option value="seat_swap">Seat Swap</option>
                      <option value="music_request">Class Music Request</option>
                      <option value="bonus_hint">Bonus Hint</option>
                      <option value="quiz_reroll">Quiz Reroll</option>
                      <option value="supply_pack">Supply Pack</option>
                      <option value="team_bonus">Team Bonus Token</option>
                      <option value="market_tip">Market Tip</option>
                      <option value="mystery_box">Mystery Box</option>
                    </select>
                  </label>

                  <label>
                    <span>Qty</span>
                    <input type="number" min="1" step="1" value="1" data-admin-terminal-stage-item-quantity />
                  </label>

                  <button type="button" data-admin-terminal-action="confirm-staged-reward">Add</button>
                </div>
              </div>

              <div class="admin-terminal-selected-rewards">
                <span>Reward per completion</span>
                <p>Paid to each player after each successful contract completion.</p>
                <div class="admin-terminal-contract-reward-list" data-admin-terminal-contract-rewards-list>
                  <p class="admin-terminal-selected-rewards-empty" data-admin-terminal-selected-rewards-empty>No rewards added yet.</p>
                </div>
              </div>

              <div class="admin-terminal-contract-actions">
                <button type="button" data-admin-terminal-action="mock-preview-contract">Preview</button>
                <button type="submit" data-admin-terminal-action="mock-save-contract">Save Contract</button>
              </div>
            </aside>
          </form>

          <section class="admin-terminal-contract-preview" data-admin-terminal-contract-preview>
            <span>Preview</span>
            <strong>Market Analysis Brief</strong>
            <small>Reward: 10.00 · Deadline: not set</small>
          </section>
        </div>`,
      footer: ``
    });
  }


  function closeTerminalPreviewOverlay() {
    document.querySelectorAll("[data-admin-terminal-player-side-preview]").forEach((node) => node.remove());
  }

  function openTerminalPreviewOverlay(html) {
    const root = getModalRoot();
    const modal = root.querySelector(".admin-terminal-modal");
    if (!modal) return;

    closeTerminalPreviewOverlay();
    modal.insertAdjacentHTML("beforeend", html);

    const overlay = modal.querySelector("[data-admin-terminal-player-side-preview]");
    overlay?.querySelector("[data-admin-terminal-preview-close]")?.focus?.();

    overlay?.addEventListener("click", (event) => {
      const closeHit = event.target?.closest?.("[data-admin-terminal-preview-close]");
      const backdropHit = event.target?.matches?.("[data-admin-terminal-preview-overlay-backdrop]");
      if (!closeHit && !backdropHit) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      closeTerminalPreviewOverlay();
    }, true);
  }

  function readStoreItemDraft(root) {
    if (!root) return {};

    const priceValue = root.querySelector("[data-admin-terminal-store-price]")?.value?.trim();
    const pricingMode = root.querySelector("[data-admin-terminal-store-pricing-mode]")?.value || "Fixed price";
    const stockMode = root.querySelector("[data-admin-terminal-store-stock-mode]")?.value || "Unlimited";
    const stockQuantity = root.querySelector("[data-admin-terminal-store-stock-quantity]")?.value?.trim();
    const countryStockInputs = Array.from(root.querySelectorAll("[data-admin-terminal-store-country-stock]"));
    const countryStockTotal = countryStockInputs.reduce((total, input) => total + (Number(input.value) || 0), 0);
    const stockedCountryCount = countryStockInputs.filter((input) => Number(input.value) > 0).length;
    const countryStockText = `${countryStockTotal} total · ${stockedCountryCount}/${countryStockInputs.length} countries stocked`;

    return {
      itemName: root.querySelector("[data-admin-terminal-store-name]")?.value?.trim() || "New item",
      description: root.querySelector("[data-admin-terminal-store-description]")?.value?.trim() || "Player-facing item description will appear here.",
      category: readSelectedOptionText(root.querySelector("[data-admin-terminal-store-category]"), "Consumable"),
      itemType: readSelectedOptionText(root.querySelector("[data-admin-terminal-store-type]"), "One-time use"),
      sourceLabel: "Teacher custom item",
      price: priceValue !== "" && priceValue != null ? priceValue : "10",
      currency: readSelectedOptionText(root.querySelector("[data-admin-terminal-store-currency]"), "NRC"),
      pricingMode: readSelectedOptionText(root.querySelector("[data-admin-terminal-store-pricing-mode]"), pricingMode),
      stockText: stockMode === "Country" ? countryStockText : stockMode === "Limited" ? `${stockQuantity || "Quantity required"} available` : "Unlimited stock",
      status: readSelectedOptionText(root.querySelector("[data-admin-terminal-store-status]"), "Active"),
      visibility: readSelectedOptionText(root.querySelector("[data-admin-terminal-store-visibility]"), "All players"),
      restock: readSelectedOptionText(root.querySelector("[data-admin-terminal-store-restock]"), "Manual restock"),
      fulfillment: readSelectedOptionText(root.querySelector("[data-admin-terminal-store-fulfillment]"), "Add to inventory"),
      usageRule: readSelectedOptionText(root.querySelector("[data-admin-terminal-store-usage]"), "Player redeems manually")
    };
  }

  function renderStorePlayerListingPreview(draft) {
    const itemName = draft.itemName || "New item";
    const description = draft.description || "Player-facing item description will appear here.";
    const category = draft.category || "Consumable";
    const itemType = draft.itemType || "One-time use";
    const price = draft.price || "10";
    const currency = draft.currency || "NRC";
    const stockText = draft.stockText || "Unlimited stock";
    const pricingMode = draft.pricingMode || "Fixed price";
    const status = draft.status || "Active";
    const visibility = draft.visibility || "All players";
    const fulfillment = draft.fulfillment || "Add to inventory";
    const usageRule = draft.usageRule || "Player redeems manually";
    const isUnavailable = status === "Draft" || status === "Hidden" || status === "Sold out";

    return `
      <div class="admin-terminal-player-side-preview" data-admin-terminal-player-side-preview>
        <div class="admin-terminal-preview-overlay-backdrop" data-admin-terminal-preview-overlay-backdrop></div>
        <article class="admin-terminal-player-side-panel is-store-listing" role="dialog" aria-modal="true" aria-label="Player-side store listing preview">
          <header class="admin-terminal-player-side-head">
            <div>
              <span>Player-side preview</span>
              <strong>Store listing</strong>
            </div>
            <button type="button" data-admin-terminal-preview-close aria-label="Close player-side preview">×</button>
          </header>

          <section class="admin-terminal-player-store-card">
            <div class="admin-terminal-player-store-card-top">
              <span>${escapeHtml(category)}</span>
              <small>${escapeHtml(itemType)}</small>
            </div>

            <h3>${escapeHtml(itemName)}</h3>
            <p>${escapeHtml(description)}</p>

            <div class="admin-terminal-player-store-meta">
              <span><small>Price</small><strong>${escapeHtml(price)} ${escapeHtml(currency)}</strong></span>
              <span><small>Pricing</small><strong>${escapeHtml(pricingMode)}</strong></span>
              <span><small>Stock</small><strong>${escapeHtml(stockText)}</strong></span>
            </div>

            <div class="admin-terminal-player-store-fulfillment">
              <small>Fulfillment</small>
              <strong>${escapeHtml(fulfillment)}</strong>
            </div>

            <div class="admin-terminal-player-store-fulfillment">
              <small>Usage / Visibility</small>
              <strong>${escapeHtml(usageRule)} · ${escapeHtml(visibility)}</strong>
            </div>

            <button type="button" ${isUnavailable ? "disabled" : ""}>${isUnavailable ? escapeHtml(status) : "Buy item"}</button>
          </section>
        </article>
      </div>`;
  }

  function readPlayerDraft(root) {
    if (!root) return {};

    const playerIdMode = root.querySelector("[data-admin-terminal-player-id-mode]")?.value || "auto";
    const manualPlayerId = root.querySelector("[data-admin-terminal-player-manual-id]")?.value?.trim();
    const accessCodeMode = root.querySelector("[data-admin-terminal-player-access-code-mode]")?.value || "auto";
    const manualAccessCode = root.querySelector("[data-admin-terminal-player-manual-access-code]")?.value?.trim();

    return {
      displayName: root.querySelector("[data-admin-terminal-player-display-name]")?.value?.trim() || "New player",
      rosterLabel: root.querySelector("[data-admin-terminal-player-roster-label]")?.value?.trim() || "optional",
      status: readSelectedOptionText(root.querySelector("[data-admin-terminal-player-status]"), "Active"),
      playerIdText: playerIdMode === "manual" ? (manualPlayerId || "Manual ID required") : "Generated after create",
      startingLocation: readSelectedOptionText(root.querySelector("[data-admin-terminal-player-starting-location]"), "Randomized"),
      accessText: accessCodeMode === "manual"
        ? (manualAccessCode || "Manual code required")
        : accessCodeMode === "none"
          ? "No code yet"
          : "Generated after save"
    };
  }

  function renderPlayerSideProfilePreview(draft) {
    const displayName = draft.displayName || "New player";
    const rosterLabel = draft.rosterLabel || "optional";
    const status = draft.status || "Active";
    const playerIdText = draft.playerIdText || "Generated after create";
    const startingLocation = draft.startingLocation || "Randomized";
    const accessText = draft.accessText || "Generated after save";
    const avatarCode = String(displayName).slice(0, 1).toUpperCase() || "P";
    const playerId = makeSixDigitPlayerId(playerIdText, `${displayName}:${rosterLabel}`);
    const sciId = makeSciIdSerial(`${displayName}:${rosterLabel}:${status}`, playerId);
    const cashValue = "0.00";
    const portfolioValue = "0.00";
    const positionsHeld = "0";
    const netWorth = "0.00";
    const rank = "—";
    const sessionStatus = readSciIdSessionStatus(draft, status);

    return `
      <div class="admin-terminal-player-side-preview" data-admin-terminal-player-side-preview>
        <div class="admin-terminal-preview-overlay-backdrop" data-admin-terminal-preview-overlay-backdrop></div>
        <article class="admin-terminal-player-side-panel is-player-profile is-sci-id-preview" role="dialog" aria-modal="true" aria-label="Sci-fi player ID preview">
          <header class="admin-terminal-player-side-head">
            <div>
              <span>Player-side preview</span>
              <strong>Sci-Fi ID card</strong>
            </div>
            <button type="button" data-admin-terminal-preview-close aria-label="Close player-side preview">×</button>
          </header>

          <section class="admin-terminal-sci-id-shell is-preview-id">
            <video class="admin-terminal-sci-id-video" autoplay muted loop playsinline preload="auto" aria-hidden="true">
              <source src="./assets/videos/id-background.mp4" type="video/mp4" />
            </video>

            <div class="admin-terminal-sci-id-card">
              <button class="admin-terminal-sci-id-close" type="button" data-admin-terminal-preview-close aria-label="Close ID card" title="Close">×</button>

              <header class="admin-terminal-sci-id-top">
                <div>
                  <span>Eco Novaria Citizen ID</span>
                  <strong>${escapeHtml(displayName)}</strong>
                  <small class="admin-terminal-sci-id-serial">ID: ${escapeHtml(sciId)}</small>
                </div>
              </header>

              <div class="admin-terminal-sci-id-rail" aria-label="ID quick actions">
                <button type="button" aria-label="Player information" title="Player information"><img class="admin-terminal-sci-id-rail-icon" src="./assets/icons/player-info.svg" alt="" aria-hidden="true" /></button>
                <button type="button" aria-label="Player settings" title="Player settings"><img class="admin-terminal-sci-id-rail-icon" src="./assets/icons/player-configure.svg" alt="" aria-hidden="true" /></button>
              </div>

              <div class="admin-terminal-sci-id-mounted-readouts" aria-label="Player ID data">
                <div class="admin-terminal-sci-id-rank-badge">
                  <small>Rank</small>
                  <strong>#${escapeHtml(rank)}</strong>
                </div>

                <div class="admin-terminal-sci-id-top-readout is-status ${sessionStatus.stateClass}">
                  <small>${escapeHtml(sessionStatus.caption)}</small>
                <span class="admin-terminal-sci-id-status-value"><i aria-hidden="true"></i><strong>${escapeHtml(sessionStatus.label)}</strong></span>
                </div>

                <div class="admin-terminal-sci-id-top-readout is-nationality">
                  <small>Location</small>
                  <strong>${escapeHtml(startingLocation)}</strong>
                </div>
              <div class="admin-terminal-sci-id-bottom-strip" aria-label="Player financial summary">
                <div class="admin-terminal-sci-id-bottom-readout is-net-worth">
                  <small>Net Worth</small>
                  <strong>${renderPlayerCurrencyAmount(netWorth, { ...player, location })}</strong>
                </div>
              </div>
              </div>

              <div class="admin-terminal-sci-id-body">
                <aside class="admin-terminal-sci-id-avatar-block">
                  <div class="admin-terminal-sci-id-avatar" data-admin-terminal-avatar-frame>
                    <img data-admin-terminal-avatar-image alt="" hidden />
                    <span>${escapeHtml(avatarCode)}</span>
                    <i aria-hidden="true"></i>
                    <button class="admin-terminal-sci-id-avatar-edit" type="button" data-admin-terminal-action="change-sci-avatar" aria-label="Change avatar picture" title="Change avatar picture">✎</button>
                    <input type="file" accept="image/*" data-admin-terminal-avatar-input hidden />
                  </div>
                </aside>

                <main class="admin-terminal-sci-id-data" aria-hidden="true"></main>
              </div>
            </div>
          </section>
        </article>
      </div>`;
  }


  function readContractDraft(root) {
    if (!root) return {};

    const title = root.querySelector("[data-admin-terminal-contract-title]")?.value?.trim() || "Market Analysis Brief";
    const objective = root.querySelector("[data-admin-terminal-contract-objective]")?.value?.trim() || "Objective will appear here for students.";
    const instructions = root.querySelector("[data-admin-terminal-contract-instructions]")?.value?.trim() || "Contract instructions will appear here for students.";
    const evidence = root.querySelector("[data-admin-terminal-contract-evidence]")?.value?.trim() || "Submission requirement pending.";
    const successCriteria = root.querySelector("[data-admin-terminal-contract-success]")?.value?.trim() || "Acceptance criteria pending.";
    const reviewNote = root.querySelector("[data-admin-terminal-contract-review-note]")?.value?.trim() || "No internal review note.";
    const category = readSelectedOptionText(root.querySelector("[data-admin-terminal-contract-category]"), "Contracts");
    const difficulty = readSelectedOptionText(root.querySelector("[data-admin-terminal-contract-difficulty]"), "Standard");
    const evidenceType = readSelectedOptionText(root.querySelector("[data-admin-terminal-contract-evidence-type]"), "Written response");
    const deadlineValue = root.querySelector("[data-admin-terminal-contract-deadline]")?.value;
    const quantity = root.querySelector("[data-admin-terminal-contract-quantity]")?.value?.trim() || "1";
    const quantityScope = root.querySelector("[data-admin-terminal-contract-quantity-scope]")?.value || "total";
    const postSetting = root.querySelector("[data-admin-terminal-contract-post-setting]")?.value || "now";
    const postAtValue = root.querySelector("[data-admin-terminal-contract-post-at]")?.value;
    const reward = readContractReward(root);
    const locationText = readContractLocationText(root);
    const deadlineText = formatContractDateTime(deadlineValue);
    const postText = postSetting === "scheduled"
      ? `Posts ${formatContractDateTime(postAtValue)}`
      : postSetting === "draft"
        ? "Draft only"
        : "Available now";
    const quantityText = quantityScope === "per_location"
      ? `${quantity} per selected country`
      : `${quantity} total available`;

    return {
      title,
      objective,
      instructions,
      evidence,
      successCriteria,
      reviewNote,
      category,
      difficulty,
      evidenceType,
      deadlineText,
      reward,
      locationText,
      quantityText,
      postText,
      isDraft: postSetting === "draft"
    };
  }

  function renderContractPlayerListingPreview(draft) {
    const title = draft.title || "Market Analysis Brief";
    const metaParts = [
      draft.deadlineText && draft.deadlineText !== "not set" ? `Deadline: ${draft.deadlineText}` : "Deadline: not set",
      draft.category || "Contracts"
    ];
    const meta = draft.meta || metaParts.filter(Boolean).join(" · ");
    const reward = draft.reward || "No reward";
    const locationText = draft.locationText || "All countries";
    const quantityText = draft.quantityText || "1 total available";
    const postText = draft.postText || "Available now";
    const objective = draft.objective || "Objective will appear here for students.";
    const instructions = draft.instructions || "Contract instructions will appear here for students.";
    const evidence = draft.evidence || "Submission requirement pending.";
    const successCriteria = draft.successCriteria || "Acceptance criteria pending.";
    const evidenceType = draft.evidenceType || "Written response";
    const isDraft = Boolean(draft.isDraft);

    return `
      <div class="admin-terminal-player-side-preview" data-admin-terminal-player-side-preview>
        <div class="admin-terminal-preview-overlay-backdrop" data-admin-terminal-preview-overlay-backdrop></div>
        <article class="admin-terminal-player-side-panel is-contract-listing is-active-contract-view" role="dialog" aria-modal="true" aria-label="Active contract preview">
          <header class="admin-terminal-player-side-head">
            <div>
              <span>Preview</span>
              <strong>Active contract view</strong>
            </div>
            <button type="button" data-admin-terminal-preview-close aria-label="Close contract preview">×</button>
          </header>

          <section class="admin-terminal-dashboard-profile is-contract is-preview-contract">
            <div class="admin-terminal-dashboard-contract-mark">▣</div>

            <div class="admin-terminal-dashboard-profile-main">
              <span>Player-side contract listing</span>
              <h3>${escapeHtml(title)}</h3>
              <p>${escapeHtml(meta)}</p>
            </div>

            <div class="admin-terminal-dashboard-profile-grid">
              <span><small>Reward</small><strong>${escapeHtml(reward)}</strong></span>
              <span><small>Visibility</small><strong>${escapeHtml(isDraft ? "Draft" : postText)}</strong></span>
              <span><small>Availability</small><strong>${escapeHtml(isDraft ? "Not posted" : "Open")}</strong></span>
              <span><small>Evidence</small><strong>${escapeHtml(evidenceType)}</strong></span>
            </div>

            <div class="admin-terminal-preview-contract-brief-v494">
              <span>Objective</span>
              <p>${escapeHtml(objective)}</p>
              <span>Instructions</span>
              <p>${escapeHtml(instructions)}</p>
              <span>Submission</span>
              <p>${escapeHtml(evidence)}</p>
              <span>Accept if</span>
              <p>${escapeHtml(successCriteria)}</p>
            </div>

            <div class="admin-terminal-dashboard-contract-preview">
              <span>Student view</span>
              <strong>${escapeHtml(title)}</strong>
              <small>Reward: ${escapeHtml(reward)} · ${escapeHtml(meta)}</small>
              <p class="admin-terminal-dashboard-contract-instructions">${escapeHtml(instructions)}</p>
              <div class="admin-terminal-dashboard-contract-subgrid">
                <span><small>Location</small><strong>${escapeHtml(locationText)}</strong></span>
                <span><small>Quantity</small><strong>${escapeHtml(quantityText)}</strong></span>
              </div>
              <button type="button" ${isDraft ? "disabled" : ""}>${isDraft ? "Draft" : "Accept contract"}</button>
            </div>
          </section>
        </article>
      </div>`;
  }


  function renderAddStoreItemModal(model = {}) {
    const editItem = model?.__storeEditItem || null;
    const isEditMode = Boolean(editItem);
    const selectIfStoreValue = (actual, expected) => String(actual || "").toLowerCase() === String(expected || "").toLowerCase() ? " selected" : "";
    const editName = editItem?.name || "";
    const editDescription = editItem?.description || "";
    const editCategory = editItem?.category || "Consumable";
    const editType = editItem?.itemType || "One-time use";
    const editStatus = editItem?.status || "Active";
    const editPrice = editItem?.price || "";
    const editCurrency = editItem?.currency || "NRC";
    const editPricingMode = editItem?.pricingMode || "Fixed price";
    const editStockMode = editItem?.stockMode || "Unlimited";
    const editStockQuantity = editItem?.stockQuantity || "";
    const editRestock = editItem?.restock || "Manual restock";
    const editVisibility = editItem?.visibility || "All players";
    const editFulfillment = editItem?.fulfillment || "Add to inventory";
    const editUsage = editItem?.usageRule || "Player redeems manually";
    const modalEyebrow = isEditMode ? "Edit custom store item" : "Custom store item";
    const modalTitle = isEditMode ? "Edit Custom Item" : "Add Custom Item";
    const modeTitle = isEditMode ? "Edit Custom Item" : "Create Custom Item";
    const modeMeta = isEditMode ? "Teacher-created · editable · system-safe" : "Teacher-created · economy-safe · optional";
    const itemNameLabel = isEditMode ? "Custom item name" : "Custom item name";
    const submitLabel = isEditMode ? "Save Changes" : "Create Custom Item";
    return renderModalShell({
      id: isEditMode ? "edit-store-item" : "add-store-item",
      tone: "purple",
      eyebrow: modalEyebrow,
      title: modalTitle,
      body: `
        <div class="admin-terminal-store-container" data-admin-terminal-store-console data-admin-terminal-store-edit-mode="${isEditMode ? "true" : "false"}">
          <video class="admin-terminal-store-video" autoplay muted loop playsinline preload="auto" aria-hidden="true">
            <source src="./assets/videos/store-background.mp4" type="video/mp4" />
          </video>

          <header class="admin-terminal-store-topbar">
            <div class="admin-terminal-store-title-block">
              <span class="admin-terminal-mode-dot" aria-hidden="true"></span>
              <div>
                <strong>${escapeHtml(modeTitle)}</strong>
                <small>${escapeHtml(modeMeta)}</small>
              </div>
            </div>

            <button class="admin-terminal-hud-close" type="button" data-admin-terminal-modal-close aria-label="Close store item editor">
              <span>Close</span>
              <b aria-hidden="true">×</b>
            </button>
          </header>

          <form class="admin-terminal-store-form is-catalog-v479" data-admin-terminal-store-form>
            <section class="admin-terminal-store-main">
              <div class="admin-terminal-store-settings-head">
                <span>Item identity</span>
                <small>${escapeHtml(isEditMode ? "Update this teacher-created item. System-seeded Store items remain locked." : "Create a teacher-controlled item. System-seeded Store items are visible but protected from editing.")}</small>
              </div>

              <label class="admin-terminal-field is-title">
                <span>${escapeHtml(itemNameLabel)}</span>
                <input type="text" name="itemName" data-admin-terminal-store-name placeholder="Example: Workshop Access Pass" value="${escapeHtml(editName)}" autocomplete="off" />
              </label>

              <label class="admin-terminal-field">
                <span>Player-facing description</span>
                <textarea name="description" rows="3" data-admin-terminal-store-description placeholder="What does this teacher-created item do, and when should players buy it?">${escapeHtml(editDescription)}</textarea>
              </label>

              <section class="admin-terminal-store-source-lock-v481" aria-label="Custom item source policy">
                <span>Catalog source</span>
                <strong>Teacher custom item</strong>
                <small>System-seeded materials, equipment, and consumables are view-only in this console so the game economy cannot be broken accidentally.</small>
              </section>

              <div class="admin-terminal-store-grid is-identity-v479">
                <label class="admin-terminal-field">
                  <span>Catalog class</span>
                  <select name="category" data-admin-terminal-store-category>
                    <option value="Material"${selectIfStoreValue(editCategory, "Material")}>Material</option>
                    <option value="Equipment"${selectIfStoreValue(editCategory, "Equipment")}>Equipment</option>
                    <option value="Consumable"${selectIfStoreValue(editCategory, "Consumable")}>Consumable</option>
                  </select>
                </label>

                <label class="admin-terminal-field">
                  <span>Item type</span>
                  <select name="itemType" data-admin-terminal-store-type>
                    <option value="Crafting input"${selectIfStoreValue(editType, "Crafting input")}>Crafting input</option>
                    <option value="Reusable tool"${selectIfStoreValue(editType, "Reusable tool")}>Reusable tool</option>
                    <option value="One-time use"${selectIfStoreValue(editType, "One-time use")}>One-time use</option>
                    <option value="Access pass"${selectIfStoreValue(editType, "Access pass")}>Access pass</option>
                    <option value="Service token"${selectIfStoreValue(editType, "Service token")}>Service token</option>
                    <option value="Contract unlock"${selectIfStoreValue(editType, "Contract unlock")}>Contract unlock</option>
                  </select>
                </label>

                <label class="admin-terminal-field">
                  <span>Status</span>
                  <select name="status" data-admin-terminal-store-status>
                    <option value="Active"${selectIfStoreValue(editStatus, "Active")}>Active</option>
                    <option value="Draft"${selectIfStoreValue(editStatus, "Draft")}>Draft</option>
                    <option value="Hidden"${selectIfStoreValue(editStatus, "Hidden")}>Hidden</option>
                    <option value="Low Stock"${selectIfStoreValue(editStatus, "Low Stock")}>Low Stock</option>
                    <option value="Sold out"${selectIfStoreValue(editStatus, "Sold out")}>Sold out</option>
                    <option value="Restricted"${selectIfStoreValue(editStatus, "Restricted")}>Restricted</option>
                  </select>
                </label>
              </div>

              <div class="admin-terminal-store-settings-head">
                <span>Pricing and availability</span>
                <small>Set the custom item price and availability. System items stay backend controlled.</small>
              </div>

              <div class="admin-terminal-store-grid is-pricing-v479">
                <label class="admin-terminal-field">
                  <span>Price</span>
                  <input type="number" min="0" step="1" name="price" data-admin-terminal-store-price placeholder="10" value="${escapeHtml(editPrice)}" inputmode="numeric" />
                </label>

                <label class="admin-terminal-field">
                  <span>Currency</span>
                  <select name="currency" data-admin-terminal-store-currency>
                    <option value="NRC"${selectIfStoreValue(editCurrency, "NRC")}>NRC</option>
                    <option value="Steam Bucks"${selectIfStoreValue(editCurrency, "Steam Bucks")}>Steam Bucks</option>
                    <option value="Credits"${selectIfStoreValue(editCurrency, "Credits")}>Credits</option>
                  </select>
                </label>

                <label class="admin-terminal-field">
                  <span>Pricing mode</span>
                  <select name="pricingMode" data-admin-terminal-store-pricing-mode>
                    <option value="Fixed price"${selectIfStoreValue(editPricingMode, "Fixed price")}>Fixed price</option>
                    <option value="Economy-linked"${selectIfStoreValue(editPricingMode, "Economy-linked")}>Variable by country</option>
                  </select>
                </label>

                <label class="admin-terminal-field">
                  <span>Stock mode</span>
                  <select name="stockMode" data-admin-terminal-store-stock-mode>
                    <option value="Unlimited"${selectIfStoreValue(editStockMode, "Unlimited")}>Unlimited across all countries</option>
                    <option value="Limited"${selectIfStoreValue(editStockMode, "Limited")}>Shared global quantity</option>
                    <option value="Country"${selectIfStoreValue(editStockMode, "Country")}>Different stock by country</option>
                  </select>
                </label>

                <label class="admin-terminal-field" data-admin-terminal-store-stock-quantity-panel hidden>
                  <span>Quantity</span>
                  <input type="number" min="1" step="1" name="stockQuantity" data-admin-terminal-store-stock-quantity placeholder="25" value="${escapeHtml(editStockQuantity)}" inputmode="numeric" />
                </label>

                <section class="admin-terminal-store-country-panel-v480" data-admin-terminal-store-country-stock-panel hidden>
                  <header>
                    <span>Country stock allocation</span>
                    <small>Set local available units. Countries with 0 stock can show as sold out while other countries stay available.</small>
                  </header>
                  <div class="admin-terminal-store-country-grid-v480">
                    ${["Northreach", "Yrethia", "Solvend", "Eldoran", "Thaloris", "Valerion", "Syndalis", "Kaivora", "Orinth", "Dravik"].map((country, countryIndex) => `
                      <label class="admin-terminal-field is-country-stock-v480">
                        <span>${country}</span>
                        <input type="number" min="0" step="1" value="${countryIndex < 3 ? 10 : countryIndex < 7 ? 5 : 2}" data-admin-terminal-store-country-stock="${country}" inputmode="numeric" />
                      </label>`).join("")}
                  </div>
                </section>


                <label class="admin-terminal-field">
                  <span>Restock cadence</span>
                  <select name="restock" data-admin-terminal-store-restock>
                    <option value="Manual restock"${selectIfStoreValue(editRestock, "Manual restock")}>Manual restock</option>
                    <option value="Daily restock"${selectIfStoreValue(editRestock, "Daily restock")}>Daily restock</option>
                    <option value="Weekly restock"${selectIfStoreValue(editRestock, "Weekly restock")}>Weekly restock</option>
                    <option value="Per class cycle"${selectIfStoreValue(editRestock, "Per class cycle")}>Per class cycle</option>
                    <option value="Never restock"${selectIfStoreValue(editRestock, "Never restock")}>Never restock</option>
                  </select>
                </label>

                <label class="admin-terminal-field">
                  <span>Visibility</span>
                  <select name="visibility" data-admin-terminal-store-visibility>
                    <option value="All players"${selectIfStoreValue(editVisibility, "All players")}>All players</option>
                    <option value="Selected locations"${selectIfStoreValue(editVisibility, "Selected locations")}>Selected locations</option>
                    <option value="Unlocked by contract"${selectIfStoreValue(editVisibility, "Unlocked by contract")}>Unlocked by contract</option>
                    <option value="Admin release only"${selectIfStoreValue(editVisibility, "Admin release only")}>Admin release only</option>
                  </select>
                </label>
              </div>

              <div class="admin-terminal-store-settings-head">
                <span>Fulfillment rules</span>
                <small>Decide what happens after purchase and how the item can be used.</small>
              </div>

              <div class="admin-terminal-store-grid is-rules">
                <label class="admin-terminal-field">
                  <span>Fulfillment</span>
                  <select name="fulfillment" data-admin-terminal-store-fulfillment>
                    <option value="Add to inventory"${selectIfStoreValue(editFulfillment, "Add to inventory")}>Add to inventory</option>
                    <option value="Add equipment record"${selectIfStoreValue(editFulfillment, "Add equipment record")}>Add equipment record</option>
                    <option value="Auto-consume on purchase"${selectIfStoreValue(editFulfillment, "Auto-consume on purchase")}>Auto-consume on purchase</option>
                    <option value="Manual redemption"${selectIfStoreValue(editFulfillment, "Manual redemption")}>Manual redemption</option>
                    <option value="Admin approval required"${selectIfStoreValue(editFulfillment, "Admin approval required")}>Admin approval required</option>
                  </select>
                </label>

                <label class="admin-terminal-field">
                  <span>Usage rule</span>
                  <select name="usage" data-admin-terminal-store-usage>
                    <option value="Player redeems manually"${selectIfStoreValue(editUsage, "Player redeems manually")}>Player redeems manually</option>
                    <option value="Auto applies once"${selectIfStoreValue(editUsage, "Auto applies once")}>Auto applies once</option>
                    <option value="Reusable until removed"${selectIfStoreValue(editUsage, "Reusable until removed")}>Reusable until removed</option>
                    <option value="Requires admin confirmation"${selectIfStoreValue(editUsage, "Requires admin confirmation")}>Requires admin confirmation</option>
                  </select>
                </label>
              </div>
            </section>

            <aside class="admin-terminal-store-preview">
              <div class="admin-terminal-store-preview-head">
                <span>${escapeHtml(isEditMode ? "Edit item preview" : "Custom item preview")}</span>
                <strong data-admin-terminal-store-preview-name>New item</strong>
              </div>

              <div class="admin-terminal-store-preview-card" data-admin-terminal-store-summary>
                <span>Catalog setup</span>
                <strong>New item</strong>
                <small>Custom · Consumable · One-time use · 10 NRC · Unlimited stock</small>
              </div>

              <div class="admin-terminal-store-preview-grid">
                <div class="admin-terminal-store-preview-item">
                  <span>Price</span>
                  <strong data-admin-terminal-store-preview-price>10 NRC</strong>
                </div>

                <div class="admin-terminal-store-preview-item">
                  <span>Pricing</span>
                  <strong data-admin-terminal-store-preview-pricing>Fixed price</strong>
                </div>

                <div class="admin-terminal-store-preview-item">
                  <span>Stock</span>
                  <strong data-admin-terminal-store-preview-stock>Unlimited</strong>
                </div>


                <div class="admin-terminal-store-preview-item">
                  <span>Status</span>
                  <strong data-admin-terminal-store-preview-status>Active</strong>
                </div>
              </div>

              <div class="admin-terminal-store-preview-note">
                <span>Fulfillment</span>
                <small data-admin-terminal-store-preview-note>Purchased item is added to the player inventory.</small>
              </div>

              <div class="admin-terminal-store-actions">
                <button type="button" class="is-secondary" data-admin-terminal-action="preview-store-player-listing">Preview Player View</button>
                <button type="submit" data-admin-terminal-action="mock-save-store-item">${escapeHtml(submitLabel)}</button>
              </div>
            </aside>
          </form>
        </div>`,
      footer: ``
    });
  }


  function syncStoreItemPanels(root) {
    if (!root) return;

    const stockMode = root.querySelector("[data-admin-terminal-store-stock-mode]")?.value || "Unlimited";
    const quantityPanel = root.querySelector("[data-admin-terminal-store-stock-quantity-panel]");
    const countryPanel = root.querySelector("[data-admin-terminal-store-country-stock-panel]");

    if (quantityPanel) {
      quantityPanel.hidden = stockMode !== "Limited";
      quantityPanel.style.display = stockMode === "Limited" ? "grid" : "none";
    }

    if (countryPanel) {
      countryPanel.hidden = stockMode !== "Country";
      countryPanel.style.display = stockMode === "Country" ? "grid" : "none";
    }
  }

  function updateStoreItemPreview() {
    const root = document.querySelector("[data-admin-terminal-store-console]");
    if (!root) return;

    syncStoreItemPanels(root);

    const itemName = root.querySelector("[data-admin-terminal-store-name]")?.value?.trim() || "New item";
    const category = readSelectedOptionText(root.querySelector("[data-admin-terminal-store-category]"), "Consumable");
    const itemType = readSelectedOptionText(root.querySelector("[data-admin-terminal-store-type]"), "One-time use");
    const priceValue = root.querySelector("[data-admin-terminal-store-price]")?.value?.trim();
    const price = priceValue !== "" && priceValue != null ? priceValue : "10";
    const currency = readSelectedOptionText(root.querySelector("[data-admin-terminal-store-currency]"), "NRC");
    const pricingMode = readSelectedOptionText(root.querySelector("[data-admin-terminal-store-pricing-mode]"), "Fixed price");
    const stockMode = root.querySelector("[data-admin-terminal-store-stock-mode]")?.value || "Unlimited";
    const stockQuantity = root.querySelector("[data-admin-terminal-store-stock-quantity]")?.value?.trim();
    const countryStockInputs = Array.from(root.querySelectorAll("[data-admin-terminal-store-country-stock]"));
    const countryStockTotal = countryStockInputs.reduce((total, input) => total + (Number(input.value) || 0), 0);
    const stockedCountryCount = countryStockInputs.filter((input) => Number(input.value) > 0).length;
    const stockText = stockMode === "Country"
      ? `${countryStockTotal} total · ${stockedCountryCount}/${countryStockInputs.length} countries stocked`
      : stockMode === "Limited" ? `${stockQuantity || "Quantity required"} available` : "Unlimited";
    const status = readSelectedOptionText(root.querySelector("[data-admin-terminal-store-status]"), "Active");
    const fulfillment = readSelectedOptionText(root.querySelector("[data-admin-terminal-store-fulfillment]"), "Add to inventory");
    const usageRule = readSelectedOptionText(root.querySelector("[data-admin-terminal-store-usage]"), "Player redeems manually");
    const visibility = readSelectedOptionText(root.querySelector("[data-admin-terminal-store-visibility]"), "All players");

    const previewName = root.querySelector("[data-admin-terminal-store-preview-name]");
    const summary = root.querySelector("[data-admin-terminal-store-summary]");
    const previewPrice = root.querySelector("[data-admin-terminal-store-preview-price]");
    const previewStock = root.querySelector("[data-admin-terminal-store-preview-stock]");
    const previewPricing = root.querySelector("[data-admin-terminal-store-preview-pricing]");
    const previewStatus = root.querySelector("[data-admin-terminal-store-preview-status]");
    const previewNote = root.querySelector("[data-admin-terminal-store-preview-note]");

    if (previewName) previewName.textContent = itemName;
    if (previewPrice) previewPrice.textContent = pricingMode === "Economy-linked" ? `${price} ${currency} base` : `${price} ${currency}`;
    if (previewPricing) previewPricing.textContent = pricingMode;
    if (previewStock) previewStock.textContent = stockText;
    if (previewStatus) previewStatus.textContent = status;

    if (previewNote) {
      previewNote.textContent = fulfillment === "Admin approval required"
        ? `Purchase requires admin approval. ${usageRule}. ${visibility}.`
        : fulfillment === "Auto-consume on purchase"
          ? `Purchase applies immediately. ${usageRule}. ${visibility}.`
          : fulfillment === "Manual redemption"
            ? `Item is granted, then redeemed manually. ${usageRule}. ${visibility}.`
            : `${fulfillment}. ${usageRule}. ${visibility}.`;
    }

    if (summary) {
      const titleNode = summary.querySelector("strong");
      const metaNode = summary.querySelector("small");
      if (titleNode) titleNode.textContent = itemName;
      if (metaNode) metaNode.textContent = `Custom · ${category} · ${itemType} · ${pricingMode} · ${price} ${currency} · ${stockText}`;
    }
  }

  function bindStoreItemModalControls(root) {
    const storeRoot = root?.querySelector?.("[data-admin-terminal-store-console]");
    if (!storeRoot) return;

    root.querySelector(".admin-terminal-modal")?.classList.add("is-store-modal");

    if (storeRoot.dataset.controlsBound === "true") return;
    storeRoot.dataset.controlsBound = "true";

    storeRoot.addEventListener("input", updateStoreItemPreview, true);
    storeRoot.addEventListener("change", updateStoreItemPreview, true);

    root.addEventListener("click", (event) => {
      const previewAction = event.target?.closest?.('[data-admin-terminal-action="preview-store-player-listing"]');
      if (!previewAction || !storeRoot.contains(previewAction)) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();

      updateStoreItemPreview();
      openTerminalPreviewOverlay(renderStorePlayerListingPreview(readStoreItemDraft(storeRoot)));
    }, true);

    const form = storeRoot.querySelector("[data-admin-terminal-store-form]");
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopPropagation();

      updateStoreItemPreview();

      const itemName = storeRoot.querySelector("[data-admin-terminal-store-name]")?.value?.trim();
      const stockMode = storeRoot.querySelector("[data-admin-terminal-store-stock-mode]")?.value || "Unlimited";
      const stockQuantity = storeRoot.querySelector("[data-admin-terminal-store-stock-quantity]")?.value?.trim();

      if (!itemName) {
        storeRoot.querySelector("[data-admin-terminal-store-name]")?.focus?.();
        if (typeof showGlobalStatus === "function") showGlobalStatus("warn", "Item name is required.");
        return;
      }

      if (stockMode === "Limited" && (!stockQuantity || Number(stockQuantity) <= 0)) {
        storeRoot.querySelector("[data-admin-terminal-store-stock-quantity]")?.focus?.();
        if (typeof showGlobalStatus === "function") showGlobalStatus("warn", "Limited stock requires a quantity.");
        return;
      }

      if (stockMode === "Country") {
        const countryInputs = Array.from(storeRoot.querySelectorAll("[data-admin-terminal-store-country-stock]"));
        const totalCountryStock = countryInputs.reduce((total, input) => total + (Number(input.value) || 0), 0);
        if (totalCountryStock <= 0) {
          countryInputs[0]?.focus?.();
          if (typeof showGlobalStatus === "function") showGlobalStatus("warn", "Country stock requires at least one stocked country.");
          return;
        }
      }

      if (typeof showGlobalStatus === "function") showGlobalStatus("ok", storeRoot.dataset.adminTerminalStoreEditMode === "true" ? "Custom store item changes saved locally. Backend update pending." : "Custom store item saved locally. System items remain protected.");
    });

    updateStoreItemPreview();

    window.requestAnimationFrame(() => {
      storeRoot.querySelector("[data-admin-terminal-store-name]")?.focus?.();
    });
  }


  function renderAddPlayerModal(model) {
    return renderModalShell({
      title: "Add Player",
      eyebrow: "Roster command",
      body: `
        <div class="admin-terminal-player-container" data-admin-terminal-player-console>
          <video class="admin-terminal-player-video" autoplay muted loop playsinline preload="auto" aria-hidden="true">
            <source src="./assets/videos/player-background.mp4" type="video/mp4" />
          </video>

          <header class="admin-terminal-player-topbar">
            <div class="admin-terminal-player-title-block">
              <span class="admin-terminal-mode-dot" aria-hidden="true"></span>
              <div>
                <strong>Create Player</strong>
                <small>Roster profile + access setup</small>
              </div>
            </div>

            <button class="admin-terminal-hud-close is-player-top-close" type="button" data-admin-terminal-modal-close aria-label="Close add player">
              <span>Close</span>
              <b aria-hidden="true">×</b>
            </button>
          </header>

          <form class="admin-terminal-player-form" data-admin-terminal-player-form>
            <section class="admin-terminal-player-main">
              <label class="admin-terminal-field is-title">
                <span>Display name</span>
                <input type="text" name="displayName" data-admin-terminal-player-display-name placeholder="Example: Mina Park" autocomplete="off" />
              </label>

              <label class="admin-terminal-field">
                <span>Roster label</span>
                <input type="text" name="rosterLabel" data-admin-terminal-player-roster-label placeholder="Example: G10-A / #12 / Team Orion" autocomplete="off" />
              </label>

              <div class="admin-terminal-player-settings-head">
                <span>Player settings</span>
                <small>Auto-generated values can be overridden manually.</small>
              </div>

              <div class="admin-terminal-player-grid is-settings">
                <label class="admin-terminal-field is-player-status">
                  <span>Status</span>
                  <select name="status" data-admin-terminal-player-status>
                    <option value="active">Active</option>
                    <option value="pending">Pending</option>
                    <option value="inactive">Inactive</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </label>

                <label class="admin-terminal-field is-player-id-mode">
                  <span>Player ID</span>
                  <select name="playerIdMode" data-admin-terminal-player-id-mode>
                    <option value="auto">Auto-generate</option>
                    <option value="manual">Manual entry</option>
                  </select>
                </label>

                <label class="admin-terminal-field is-player-manual-id" data-admin-terminal-player-id-manual-panel hidden>
                  <span>Manual Player ID</span>
                  <input type="text" name="manualPlayerId" data-admin-terminal-player-manual-id placeholder="Example: P-1024" autocomplete="off" />
                </label>

                <label class="admin-terminal-field is-player-access-mode">
                  <span>Access code</span>
                  <select name="accessCodeMode" data-admin-terminal-player-access-code-mode>
                    <option value="auto">Auto-generate</option>
                    <option value="manual">Manual entry</option>
                    <option value="none">Create later</option>
                  </select>
                </label>

                <label class="admin-terminal-field is-player-manual-access" data-admin-terminal-player-access-code-manual-panel hidden>
                  <span>Manual access code</span>
                  <input type="text" name="manualAccessCode" data-admin-terminal-player-manual-access-code placeholder="Example: ORION-204" autocomplete="off" />
                </label>

                <label class="admin-terminal-field is-player-location">
                  <span>Starting location</span>
                  <select name="startingLocation" data-admin-terminal-player-starting-location>
                    <option value="random">Randomized</option>
                    <option value="NORTHREACH">Northreach</option>
                    <option value="YRETHIA">Yrethia</option>
                    <option value="THALORIS">Thaloris</option>
                    <option value="SOLVEND">Solvend</option>
                    <option value="ELDORAN">Eldoran</option>
                    <option value="VALERION">Valerion</option>
                    <option value="LUMENOR">Lumenor</option>
                    <option value="XALVORIA">Xalvoria</option>
                    <option value="DRAVENLOK">Dravenlok</option>
                    <option value="SYNDALIS">Syndalis</option>
                  </select>
                </label>
              </div>

              <label class="admin-terminal-field">
                <span>Notes</span>
                <textarea name="notes" rows="4" data-admin-terminal-player-notes placeholder="Optional teacher-only note for this roster entry. Backend field pending."></textarea>
              </label>
            </section>

            <aside class="admin-terminal-player-access is-setup-preview">
              <div class="admin-terminal-player-access-head">
                <span>Setup preview</span>
                <strong data-admin-terminal-player-preview-name>New player</strong>
              </div>

              <div class="admin-terminal-player-preview-card" data-admin-terminal-player-summary>
                <span>Live setup</span>
                <strong>New player</strong>
                <small>Roster: optional · Status: Active · Player ID: Auto-generated · Start: Randomized · Access: Generated after save</small>
              </div>

              <div class="admin-terminal-player-preview-grid">
                <div class="admin-terminal-player-preview-item">
                  <span>Status</span>
                  <strong data-admin-terminal-player-preview-status>Active</strong>
                </div>

                <div class="admin-terminal-player-preview-item">
                  <span>Player ID</span>
                  <strong data-admin-terminal-player-preview-id>Auto-generated</strong>
                </div>

                <div class="admin-terminal-player-preview-item">
                  <span>Starting location</span>
                  <strong data-admin-terminal-player-preview-location>Randomized</strong>
                </div>

                <div class="admin-terminal-player-preview-item">
                  <span>Access code</span>
                  <strong data-admin-terminal-player-preview-access>Generated after save</strong>
                </div>
              </div>

              <div class="admin-terminal-player-preview-note">
                <span>Result</span>
                <small data-admin-terminal-player-preview-note>This player will be created with the selected setup. Manual values override generated values.</small>
              </div>

              <div class="admin-terminal-player-actions is-visible-actions">
                <button type="button" class="is-secondary" data-admin-terminal-action="preview-player-side-profile">Preview</button>
                <button type="submit" data-admin-terminal-action="mock-save-player">Create Player</button>
              </div>
            </aside>
          </form>
        </div>`,
      footer: ``
    });
  }

  function getActiveScannerInput() {
    const consoleRoot = document.querySelector("[data-admin-terminal-scanner-console]");
    if (!consoleRoot) return null;

    const isManual = consoleRoot.dataset.scanMode === "manual";
    return isManual
      ? consoleRoot.querySelector("[data-admin-terminal-manual-scan-input]")
      : consoleRoot.querySelector("[data-admin-terminal-auto-scan-input]");
  }

  function focusActiveScannerInput() {
    const input = getActiveScannerInput();
    window.requestAnimationFrame(() => input?.focus?.());
  }

  function setScannerMode(mode) {
    const consoleRoot = document.querySelector("[data-admin-terminal-scanner-console]");
    if (!consoleRoot) return;

    const nextMode = mode === "manual" ? "manual" : "auto";
    const autoPanel = consoleRoot.querySelector("[data-admin-terminal-auto-panel]");
    const manualPanel = consoleRoot.querySelector("[data-admin-terminal-manual-panel]");
    const modeLabel = consoleRoot.querySelector("[data-admin-terminal-mode-label]");
    const state = consoleRoot.querySelector("[data-admin-terminal-scanner-state]");
    const autoInput = consoleRoot.querySelector("[data-admin-terminal-auto-scan-input]");
    const manualInput = consoleRoot.querySelector("[data-admin-terminal-manual-scan-input]");
    const autoButton = consoleRoot.querySelector('[data-admin-terminal-set-mode="auto"]');
    const manualButton = consoleRoot.querySelector('[data-admin-terminal-set-mode="manual"]');

    consoleRoot.dataset.scanMode = nextMode;

    if (autoButton) autoButton.setAttribute("aria-pressed", nextMode === "auto" ? "true" : "false");
    if (manualButton) manualButton.setAttribute("aria-pressed", nextMode === "manual" ? "true" : "false");

    if (autoPanel) {
      autoPanel.hidden = nextMode !== "auto";
      autoPanel.style.display = nextMode === "auto" ? "grid" : "none";
      autoPanel.setAttribute("aria-hidden", nextMode === "auto" ? "false" : "true");
    }

    if (manualPanel) {
      manualPanel.hidden = nextMode !== "manual";
      manualPanel.style.display = nextMode === "manual" ? "grid" : "none";
      manualPanel.setAttribute("aria-hidden", nextMode === "manual" ? "false" : "true");
    }

    if (modeLabel) modeLabel.textContent = nextMode === "manual" ? "Manual" : "Auto";

    if (state) {
      state.textContent = nextMode === "manual" ? "Manual input ready" : "Armed";
      state.classList.remove("is-captured");
    }

    window.clearTimeout(window.Econovaria.features.adminOverviewTerminal.scannerAutoSubmitTimer);

    window.requestAnimationFrame(() => {
      if (nextMode === "manual") manualInput?.focus?.();
      else autoInput?.focus?.();
    });
  }

  function scheduleAutoScannerCapture(input) {
    if (!input) return;
    window.clearTimeout(window.Econovaria.features.adminOverviewTerminal.scannerAutoSubmitTimer);
    const raw = String(input.value || "").trim();
    if (!raw) return;

    window.Econovaria.features.adminOverviewTerminal.scannerAutoSubmitTimer = window.setTimeout(() => {
      if (String(input.value || "").trim()) handleMockScannerCapture("auto");
    }, 420);
  }

  function handleMockScannerCapture(source = "confirm") {
    const consoleRoot = document.querySelector("[data-admin-terminal-scanner-console]");
    const input = getActiveScannerInput();
    const state = document.querySelector("[data-admin-terminal-scanner-state]");
    const empty = document.querySelector("[data-admin-terminal-last-scan-empty]");
    const result = document.querySelector("[data-admin-terminal-last-scan-result]");
    const player = result?.querySelector("[data-admin-terminal-last-scan-player]");
    const targetLabel = document.querySelector(".admin-terminal-hud-top-right [data-admin-terminal-last-scan-player]");
    const timeNode = document.querySelector("[data-admin-terminal-last-scan-time]");
    const status = document.querySelector("[data-admin-terminal-last-scan-status]");
    const reward = document.querySelector("[data-admin-terminal-last-scan-reward]");
    const raw = String(input?.value || "").trim();

    if (!raw && source !== "rearm") {
      focusActiveScannerInput();
      if (typeof showGlobalStatus === "function") showGlobalStatus("warn", "Scanner is armed. No code entered yet.");
      return;
    }

    const code = raw || "SCANNED-PLAYER";
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    // Placeholder values until backend returns actual player/status/reward.
    const nextStatus = "Present";
    const nextReward = "1.00";

    if (state) {
      state.textContent = "Scan captured";
      state.classList.add("is-captured");
    }

    if (empty) empty.hidden = true;
    if (result) result.hidden = false;
    if (player) player.textContent = code;
    if (targetLabel) targetLabel.textContent = code;
    if (timeNode) timeNode.textContent = `Scanned ${time}`;
    if (status) {
      status.textContent = nextStatus;
      status.className = "is-status is-present";
    }
    if (reward) reward.textContent = nextReward;

    if (input) {
      input.value = "";
      input.focus();
    }

    if (consoleRoot) {
      window.setTimeout(() => {
        const currentState = consoleRoot.querySelector("[data-admin-terminal-scanner-state]");
        if (currentState) {
          currentState.classList.remove("is-captured");
          currentState.textContent = consoleRoot.dataset.scanMode === "manual" ? "Manual input ready" : "Awaiting scan";
        }
        focusActiveScannerInput();
      }, 900);
    }

    if (typeof showGlobalStatus === "function") {
      const label = source === "auto" ? "Auto-submitted scan" : source === "enter" ? "Scan submitted from Enter key" : "Scan submitted";
      showGlobalStatus("warn", `${label}. Backend wiring pending.`);
    }
  }

  function getModalRoot() {
    let root = document.querySelector("[data-admin-terminal-modal-root]");
    if (!root) {
      root = document.createElement("div");
      root.setAttribute("data-admin-terminal-modal-root", "");
      document.body.appendChild(root);
    }
    return root;
  }

  function closeTerminalModal() {
    const root = document.querySelector("[data-admin-terminal-modal-root]");
    if (!root) return;

    const topModal = root.lastElementChild;
    if (topModal) {
      topModal.remove();
    } else {
      root.innerHTML = "";
    }

    if (!root.children.length) {
      document.documentElement.classList.remove("admin-terminal-modal-open");
    }
  }

  function closeAllTerminalModals() {
    const root = document.querySelector("[data-admin-terminal-modal-root]");
    if (!root) return;
    root.innerHTML = "";
    document.documentElement.classList.remove("admin-terminal-modal-open");
  }

    function bindScannerModalControls(root) {
    const scanner = root?.querySelector?.("[data-admin-terminal-scanner-console]");
    if (!scanner) return;

    if (scanner.dataset.controlsBound === "true") return;
    scanner.dataset.controlsBound = "true";

    root.addEventListener("click", (event) => {
      const modalClose = event.target?.closest?.("[data-admin-terminal-modal-close]");
      const modalBackdrop = event.target?.matches?.("[data-admin-terminal-modal-backdrop]");
      const action = event.target?.closest?.("[data-admin-terminal-action]");

      if (modalClose || modalBackdrop) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        closeTerminalModal();
        return;
      }

      if (!action || !scanner.contains(action)) return;

      const actionName = action.dataset.adminTerminalAction;

      if (actionName === "mock-confirm-scan") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        handleMockScannerCapture("confirm");
        return;
      }

      if (actionName === "mock-start-scanner") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        focusActiveScannerInput();

        const state = scanner.querySelector("[data-admin-terminal-scanner-state]");
        if (state) {
          state.classList.remove("is-captured");
          state.textContent = scanner.dataset.scanMode === "manual" ? "Manual input ready" : "Armed";
        }

        if (typeof showGlobalStatus === "function") showGlobalStatus("warn", "Scanner focus restored. Backend wiring pending.");
      }
    }, true);

    root.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      if (!event.target?.matches?.("[data-admin-terminal-auto-scan-input], [data-admin-terminal-manual-scan-input]")) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      handleMockScannerCapture("enter");
    }, true);

    setScannerMode(scanner.dataset.scanMode === "manual" ? "manual" : "auto");
  }
