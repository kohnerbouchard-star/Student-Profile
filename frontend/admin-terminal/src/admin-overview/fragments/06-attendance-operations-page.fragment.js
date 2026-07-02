// Attendance operations page: roster, exceptions, rewards, and daily ledger.
  function getTerminalAttendanceRows(model) {
    const rosterPlayers = getTerminalPlayerRows(model);
    const explicitRows = Array.isArray(model?.attendance) ? model.attendance : [];

    if (explicitRows.length) {
      return explicitRows.map((row, index) => {
        const status = String(row.status || (index % 4 === 0 ? "Late" : "Present")).trim();
        const normalized = status.toLowerCase();
        const tone =
          normalized.includes("present") ? "is-present" :
          normalized.includes("late") ? "is-late" :
          normalized.includes("absent") ? "is-absent" :
          "is-offline";

        return {
          student: row.student || row.name || rosterPlayers[index]?.name || `Player ${index + 1}`,
          location: row.location || rosterPlayers[index]?.location || "—",
          status,
          tone,
          time: row.time || (normalized.includes("present") ? "08:01" : normalized.includes("late") ? "08:14" : "—"),
          reward: row.reward || (normalized.includes("present") ? "+10.00" : normalized.includes("late") ? "+4.00" : "0.00"),
          source: row.source || "Scanner",
          note: row.note || (normalized.includes("late") ? "Late scan" : normalized.includes("absent") ? "No scan recorded" : "Verified")
        };
      });
    }

    return rosterPlayers.map((player, index) => {
      const status = index === 1 ? "Late" : index === 3 ? "Absent" : player.session.label === "ONLINE" ? "Present" : "Offline";
      const normalized = status.toLowerCase();
      const tone =
        normalized === "present" ? "is-present" :
        normalized === "late" ? "is-late" :
        normalized === "absent" ? "is-absent" :
        "is-offline";

      return {
        student: player.name,
        location: player.location,
        status,
        tone,
        time: normalized === "present" ? "08:01" : normalized === "late" ? "08:14" : "—",
        reward: normalized === "present" ? "+10.00" : normalized === "late" ? "+4.00" : "0.00",
        source: normalized === "offline" || normalized === "absent" ? "No Scan" : "Scanner",
        note: normalized === "late" ? "Late scan" : normalized === "absent" ? "No scan recorded" : "Verified"
      };
    });
  }

  function renderAttendancePageHeader(model) {
    return `
      <header class="admin-terminal-top admin-terminal-page-top">
        <div>
          <span>Attendance / operations</span>
          <h2>Attendance</h2>
          <p>Resolve exceptions, correct records, and audit attendance rewards after scanning.</p>
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

  function renderAttendanceStat(label, value, meta, tone = "cyan") {
    return `
      <article class="admin-terminal-attendance-stat is-${escapeHtml(tone)}">
        <small>${escapeHtml(label)}</small>
        <strong>${escapeHtml(value)}</strong>
        <span>${escapeHtml(meta)}</span>
      </article>`;
  }

  function renderAttendanceRow(row) {
    return `
      <article class="admin-terminal-attendance-row ${escapeHtml(row.tone)}">
        <div class="admin-terminal-attendance-row-player">
          <i aria-hidden="true"></i>
          <span>
            <strong>${escapeHtml(row.student)}</strong>
            <small>${escapeHtml(row.location)}</small>
          </span>
        </div>

        <div class="admin-terminal-attendance-row-status">
          <strong>${escapeHtml(row.status)}</strong>
          <small>${escapeHtml(row.note)}</small>
        </div>

        <div class="admin-terminal-attendance-row-time">
          <small>Time</small>
          <strong>${escapeHtml(row.time)}</strong>
        </div>

        <div class="admin-terminal-attendance-row-reward">
          <small>Reward</small>
          <strong>${renderSignedCurrencyAmount(row.reward, "NRC")}</strong>
        </div>

        <button type="button" data-admin-terminal-action="manual-attendance-correction">Correct</button>
      </article>`;
  }

  function getAttendanceRowKey(row, index = 0) {
    const raw = row.id || row.studentId || row.playerId || row.student || row.name || `attendance-${index}`;
    return String(raw || `attendance-${index}`)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || `attendance-${index}`;
  }

  function getAttendanceStatusGroup(row) {
    const status = String(row?.status || "").toLowerCase();
    if (status.includes("excused") || status.includes("absent")) return "absent";
    if (status.includes("absent") || status.includes("offline") || status.includes("missing") || status.includes("no scan")) return "absent";
    if (status.includes("late")) return "late";
    if (status.includes("present") || status.includes("checked")) return "present";
    return "needs";
  }

  function getAttendanceProblemType(row) {
    const status = String(row?.status || "").toLowerCase();
    const note = String(row?.note || "").toLowerCase();
    const source = String(row?.source || "").toLowerCase();
    const reward = String(row?.reward || "").toLowerCase();

    if (note.includes("duplicate")) return "Duplicate scan";
    if (note.includes("reward") && (note.includes("failed") || note.includes("missing"))) return "Reward issue";
    if (source.includes("manual") || source.includes("correction")) return "Manual review";
    if (status.includes("absent") || status.includes("offline") || source.includes("no scan")) return "No scan";
    if (status.includes("late")) return "Late scan";
    if (reward === "0.00" || reward === "+0.00") return "No reward";
    return "";
  }

  function getAttendanceRewardNumber(row) {
    const raw = String(row?.reward || "0").replace(/[^0-9.-]/g, "");
    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
  }

  function getAttendanceHistoryForRow(row, index = 0) {
    if (Array.isArray(row.history) && row.history.length) {
      return row.history.map((item, itemIndex) => ({
        date: item.date || item.day || (itemIndex === 0 ? "Today" : `Previous ${itemIndex}`),
        status: item.status || row.status || "Present",
        time: item.time || row.time || "—",
        reward: item.reward || row.reward || "0.00",
        source: item.source || row.source || "Scanner",
        note: item.note || item.reason || "Verified"
      }));
    }

    const isLate = String(row.status || "").toLowerCase().includes("late");
    const isAbsent = String(row.status || "").toLowerCase().includes("absent") || String(row.status || "").toLowerCase().includes("offline");

    return [
      { date: "Today", status: row.status || "Present", time: row.time || (isAbsent ? "—" : isLate ? "08:14" : "08:02"), reward: row.reward || (isAbsent ? "0.00" : isLate ? "+4.00" : "+10.00"), source: row.source || (isAbsent ? "System" : "Scanner"), note: row.note || (isAbsent ? "Auto-marked absent after 1-hour cutoff" : isLate ? "Checked in after attendance cutoff" : "Verified on-time check-in") },
      { date: "Yesterday", status: index % 3 === 0 ? "Late" : "Present", time: index % 3 === 0 ? "08:13" : "08:01", reward: index % 3 === 0 ? "+4.00" : "+10.00", source: "Scanner", note: index % 3 === 0 ? "Checked in after attendance cutoff" : "Verified on-time check-in" },
      { date: "Jun 21", status: "Present", time: "08:03", reward: "+10.00", source: "Scanner", note: "Verified on-time check-in" },
      { date: "Jun 20", status: "Absent", time: "—", reward: "0.00", source: "System", note: "Auto-marked absent after 1-hour cutoff" }
    ];
  }

  function isAttendanceNeedsAction(row) {
    const group = getAttendanceStatusGroup(row);
    return Boolean(getAttendanceProblemType(row)) || group === "absent" || group === "late";
  }

  function getOperationalAttendanceRows(model) {
    return getTerminalAttendanceRows(model).map((row, index) => {
      const key = getAttendanceRowKey(row, index);
      const group = getAttendanceStatusGroup(row);
      const issue = getAttendanceProblemType(row);
      const needsAction = isAttendanceNeedsAction(row);
      const history = getAttendanceHistoryForRow(row, index);

      return {
        ...row,
        key,
        index,
        group,
        issue,
        needsAction,
        rewardValue: getAttendanceRewardNumber(row),
        history,
        priority: group === "absent" ? 1 : group === "late" ? 2 : needsAction ? 3 : 4
      };
    }).sort((a, b) => a.priority - b.priority || a.student.localeCompare(b.student));
  }

  function getSelectedAttendanceRow(model, rows) {
    const feature = window.Econovaria.features.adminOverviewTerminal;
    const selectedKey = feature.selectedAttendanceKey || rows.find((row) => row.needsAction)?.key || rows[0]?.key || "";
    const selected = rows.find((row) => row.key === selectedKey) || rows[0] || null;
    if (selected) feature.selectedAttendanceKey = selected.key;
    return selected;
  }

  function renderAttendanceOpsButton(label, meta, actionName, tone = "") {
    return `
      <button type="button" class="${tone ? `is-${escapeHtml(tone)}` : ""}" data-admin-terminal-action="${escapeHtml(actionName)}">
        <strong>${escapeHtml(label)}</strong>
        <small>${escapeHtml(meta)}</small>
      </button>`;
  }

  function renderAttendanceMissionCard(label, value, meta = "", tone = "cyan", valueIsHtml = false) {
    const valueMarkup = valueIsHtml ? String(value ?? "") : escapeHtml(value);
    return `
      <article class="admin-terminal-attendance-v204-metric is-${escapeHtml(tone)}">
        <small>${escapeHtml(label)}</small>
        <strong>${valueMarkup}</strong>
        ${meta ? `<span>${escapeHtml(meta)}</span>` : ""}
      </article>`;
  }

  function renderAttendanceExceptionRow(row, selectedKey) {
    return `
      <button
        type="button"
        class="admin-terminal-attendance-v204-exception ${escapeHtml(row.tone)}${row.key === selectedKey ? " is-selected" : ""}"
        data-admin-terminal-action="select-attendance-student"
        data-attendance-key="${escapeHtml(row.key)}"
      >
        <span>${escapeHtml(row.issue || row.status || "Review")}</span>
        <strong>${escapeHtml(row.student)}</strong>
        <small>${escapeHtml(row.location)} · ${escapeHtml(row.time)} · ${renderSignedCurrencyAmount(row.reward, "NRC")}</small>
      </button>`;
  }

  function renderAttendanceStudentRow(row, selectedKey) {
    const rewardText = String(row?.reward || "").trim();
    const rewardValue = Number(String(row?.reward || "").replace(/[^0-9.-]/g, ""));
    const rewardTone = rewardText.includes("-") || rewardValue < 0 ? "is-negative" : rewardText.includes("+") || rewardValue > 0 ? "is-positive" : "is-neutral";
    const groupTone = row?.group ? ` group-${String(row.group).toLowerCase()}` : "";

    return `
      <button
        type="button"
        class="admin-terminal-attendance-v204-student admin-terminal-attendance-v209-student ${escapeHtml(row.tone)}${escapeHtml(groupTone)}${row.key === selectedKey ? " is-selected" : ""}"
        data-admin-terminal-action="select-attendance-student"
        data-attendance-key="${escapeHtml(row.key)}"
      >
        <span class="status-dot" aria-hidden="true"></span>
        <span class="identity">
          <strong>${escapeHtml(row.student)}</strong>
          <small>${escapeHtml(row.location)}</small>
        </span>
        <span class="status">${escapeHtml(row.status)}</span>
        <span class="time">${escapeHtml(row.time)}</span>
        <span class="reward ${escapeHtml(rewardTone)}">${renderSignedCurrencyAmount(row.reward, "NRC")}</span>
      </button>`;
  }

  function renderAttendanceRosterColumnHeader() {
    return `
      <div class="admin-terminal-attendance-v209-table-head" aria-hidden="true">
        <span></span>
        <span>Student</span>
        <span>Status</span>
        <span>Last Scan</span>
        <span>Reward</span>
      </div>`;
  }

  function renderAttendanceRosterEmptyRow() {
    return `
      <div class="admin-terminal-attendance-v204-student admin-terminal-attendance-v209-student is-empty-state" aria-hidden="true">
        <span class="status-dot"></span>
        <span class="identity">
          <strong>—</strong>
          <small>—</small>
        </span>
        <span class="status">—</span>
        <span class="time">—</span>
        <span class="reward">—</span>
      </div>`;
  }

  function normalizeAttendanceRosterMatch(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function getRosterNotCheckedInRows(model, existingRows = []) {
    const rosterPlayers = getTerminalPlayerRows(model);
    const existingKeys = new Set(
      existingRows.map((row) => `${normalizeAttendanceRosterMatch(row.student)}::${normalizeAttendanceRosterMatch(row.location)}`)
    );

    return rosterPlayers
      .filter((player) => !existingKeys.has(`${normalizeAttendanceRosterMatch(player.name)}::${normalizeAttendanceRosterMatch(player.location)}`))
      .map((player, index) => {
        const synthetic = {
          student: player.name,
          location: player.location || "—",
          status: "No scan",
          tone: "is-absent",
          time: "—",
          reward: "—",
          source: "Roster",
          note: "No check-in recorded",
          history: [
            { date: "Today", status: "Absent", time: "—", reward: "0.00", source: "System", note: "Auto-marked absent after 1-hour cutoff" },
            { date: "Yesterday", status: "Present", time: "08:01", reward: "+10.00", source: "Scanner", note: "Verified on-time check-in" },
            { date: "Jun 21", status: "Present", time: "08:03", reward: "+10.00", source: "Scanner", note: "Verified on-time check-in" },
            { date: "Jun 20", status: "Absent", time: "—", reward: "0.00", source: "System", note: "Auto-marked absent after 1-hour cutoff" }
          ]
        };
        const rowIndex = existingRows.length + index;
        return {
          ...synthetic,
          key: getAttendanceRowKey({ student: synthetic.student, status: `missing-${synthetic.status}` }, rowIndex),
          index: rowIndex,
          group: "missing",
          issue: "No scan",
          needsAction: true,
          rewardValue: 0,
          priority: 3.5
        };
      })
      .sort((a, b) => a.student.localeCompare(b.student));
  }

  function renderAttendanceCompactGroup(label, rows, selectedKey) {
    const normalized = String(label || "").toLowerCase();
    const toneClass = normalized.includes("present") ? "is-present" : normalized.includes("late") ? "is-late" : normalized.includes("absent") ? "is-absent" : normalized.includes("not checked") || normalized.includes("missing") ? "is-missing" : normalized.includes("other") ? "is-other" : "is-neutral";

    return `
      <section class="admin-terminal-attendance-v204-group admin-terminal-attendance-v209-group ${toneClass}">
        <header>
          <span>${escapeHtml(label)}</span>
        </header>
        <div>
          ${renderAttendanceRosterColumnHeader()}${rows.length ? rows.map((row) => renderAttendanceStudentRow(row, selectedKey)).join("") : renderAttendanceRosterEmptyRow()}
        </div>
      </section>`;
  }

  function renderAttendanceHistoryLedgerRow(item) {
    const status = String(item?.status || "").toLowerCase();
    const tone = status.includes("late") ? "is-late" : status.includes("absent") || status.includes("excused") || status.includes("absent") ? "is-absent" : "is-present";
    const displayStatus = status.includes("excused") || status.includes("absent") ? "Absent" : (item.status || "Present");

    return `
      <article class="admin-terminal-attendance-v220-history-row ${escapeHtml(tone)}">
        <span>${escapeHtml(item.time || "—")}</span>
        <strong>${escapeHtml(item.date || "—")}</strong>
        <small>${escapeHtml(displayStatus)}</small>
        <small>${renderSignedCurrencyAmount(item.reward || "—", "NRC")}</small>
        <small>${escapeHtml(item.source || "—")}</small>
        <em>${escapeHtml(item.note || "—")}</em>
      </article>`;
  }

  function renderAttendanceStudentDetailV204(row) {
    if (!row) {
      return `
        <aside class="admin-terminal-attendance-v204-detail">
          <header>
            <span>Student Record</span>
            <strong>Select a student</strong>
          </header>
        </aside>`;
    }

    const history = Array.isArray(row.history) ? row.history : [];
    const lateCount = history.filter((item) => String(item.status || "").toLowerCase().includes("late")).length;
    const absentCount = history.filter((item) => String(item.status || "").toLowerCase().includes("absent")).length;
    const presentCount = history.filter((item) => String(item.status || "").toLowerCase().includes("present")).length;

    return `
      <aside class="admin-terminal-attendance-v204-detail admin-terminal-attendance-v207-detail admin-terminal-attendance-v208-detail admin-terminal-attendance-v209-detail" aria-label="Selected student attendance record">
        <header>
          <span>Student Record</span>
          <small>${escapeHtml(row.location)}</small>
          <strong>${escapeHtml(row.student)}</strong>
        </header>

        <section class="admin-terminal-attendance-v204-status-card admin-terminal-attendance-v208-status-card admin-terminal-attendance-v209-status-card ${escapeHtml(row.tone)}">
          <div>
            <small>Current Status</small>
            <strong>${escapeHtml(row.status)}</strong>
          </div>
          <dl>
            <div><dt>Last Scan</dt><dd>${escapeHtml(row.time)}</dd></div>
            <div><dt>Reward</dt><dd>${renderSignedCurrencyAmount(row.reward, "NRC")}</dd></div>
            <div><dt>Present</dt><dd>${escapeHtml(presentCount)}</dd></div>
            <div><dt>Late</dt><dd>${escapeHtml(lateCount)}</dd></div>
            <div><dt>Absent</dt><dd>${escapeHtml(absentCount)}</dd></div>
          </dl>
        </section>

        <section class="admin-terminal-attendance-v207-reward-editor admin-terminal-attendance-v208-reward-editor admin-terminal-attendance-v209-reward-editor" aria-label="Attendance reward adjustment">
          <details>
            <summary>
              <span>
                <small>Reward Adjustment</small>
                <strong>Adjust payout</strong>
              </span>
              <em class="admin-terminal-attendance-v211-drawer-chevron" aria-hidden="true"></em>
            </summary>
            <div class="admin-terminal-attendance-v207-reward-form admin-terminal-attendance-v208-reward-form admin-terminal-attendance-v225-reward-form">
              <label>
                <span>Record date</span>
                <input type="date" value="${escapeHtml(getAttendanceHistoryInputDate(history[0]?.date || "Today"))}" aria-label="Attendance record date to adjust">
              </label>
              <label>
                <span>New attendance reward</span>
                <input type="number" min="0" step="1" value="${escapeHtml(String(row.reward || "").replace(/[^0-9.]/g, "") || "0")}" aria-label="Overwrite attendance reward amount">
              </label>
              <label>
                <span>Adjustment note</span>
                <textarea rows="3" aria-label="Reward correction note" placeholder="Only for manual payout correction"></textarea>
              </label>
              <button type="button" data-admin-terminal-action="attendance-adjust-reward">
                Submit Adjustment
              </button>
            </div>
          </details>
        </section>
      </aside>`;
  }

  function renderAttendanceHistoryColumnHeader() {
    return `
      <div class="admin-terminal-attendance-v223-table-head admin-terminal-attendance-v224-table-head" aria-hidden="true">
        <span></span>
        <span>Record</span>
        <span>Status</span>
        <span>Reward</span>
        <span>Event</span>
        <span>Adjustment Note</span>
      </div>`;
  }

  function getAttendanceHistoryInputDate(rawDate) {
    const raw = String(rawDate || "").trim();
    if (!raw || raw.toLowerCase() === "today") return "2026-06-26";
    if (raw.toLowerCase() === "yesterday") return "2026-06-25";
    const match = raw.match(/^([A-Z][a-z]{2}) (\d{1,2})(?:,\s*(\d{4}))?$/);
    if (match) {
      const monthMap = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
      const month = monthMap[match[1]] || "06";
      const day = String(match[2]).padStart(2, "0");
      const year = match[3] || "2026";
      return `${year}-${month}-${day}`;
    }
    return "2026-06-26";
  }

  function getAttendanceHistoryAbsoluteDate(rawDate, itemIndex = 0) {
    const raw = String(rawDate || "").trim();
    if (!raw || raw.toLowerCase() === "today") return "Jun 26, 2026";
    if (raw.toLowerCase() === "yesterday") return "Jun 25, 2026";
    if (/^[A-Z][a-z]{2} \d{1,2}$/.test(raw)) return `${raw}, 2026`;
    return raw;
  }

  function getAttendanceHistoryMeta(item, itemIndex = 0) {
    const raw = String(item?.date || "").trim().toLowerCase();
    const time = String(item?.time || "—").trim();
    if (raw === "today") return `Today · ${time}`;
    if (raw === "yesterday") return `Yesterday · ${time}`;
    return time;
  }

  function getAttendanceHistoryDisplayEvent(item) {
    const status = String(item?.status || "").toLowerCase();
    const note = String(item?.note || "").trim();
    const noteLower = note.toLowerCase();

    if (status.includes("absent") || status.includes("excused") || status.includes("absent") || noteLower.includes("auto absent") || noteLower.includes("no scan") || noteLower.includes("check-in recorded") || noteLower.includes("auto-marked absent")) {
      return "Auto-marked absent after 1-hour cutoff";
    }
    if (status.includes("late") || noteLower.includes("late arrival") || noteLower.includes("attendance cutoff")) {
      return "Checked in after attendance cutoff";
    }
    if (noteLower.includes("verified")) {
      return "Verified on-time check-in";
    }
    return note || "Verified on-time check-in";
  }

  function getAttendanceAdjustmentNote(item) {
    const note = item?.adjustmentNote || item?.payoutNote || item?.rewardAdjustmentNote || item?.manualAdjustmentNote || item?.manualNote || "";
    return String(note || "").trim() || "—";
  }

  function renderAttendanceLedgerRowV204(row, rowIndex = 0) {
    const status = String(row?.status || "").toLowerCase();
    const tone = status.includes("late") ? "is-late" : status.includes("absent") || status.includes("excused") || status.includes("absent") ? "is-absent" : "is-present";
    const displayStatus = status.includes("excused") || status.includes("absent") ? "Absent" : (row?.status || "—");
    const rewardText = String(row?.reward || "—").trim();
    const rewardValue = Number(String(rewardText).replace(/[^0-9.-]/g, ""));
    const rewardTone = rewardText.includes("-") || rewardValue < 0 ? "is-negative" : rewardText.includes("+") || rewardValue > 0 ? "is-positive" : "is-neutral";

    return `
      <article class="admin-terminal-attendance-v223-history-row admin-terminal-attendance-v224-history-row ${escapeHtml(tone)}">
        <span class="status-dot" aria-hidden="true"></span>
        <span class="identity">
          <strong>${escapeHtml(getAttendanceHistoryAbsoluteDate(row.date, rowIndex))}</strong>
          <small>${escapeHtml(getAttendanceHistoryMeta(row, rowIndex))}</small>
        </span>
        <span class="status">${escapeHtml(displayStatus)}</span>
        <span class="reward ${escapeHtml(rewardTone)}">${renderSignedCurrencyAmount(rewardText || "—", "NRC")}</span>
        <span class="event">${escapeHtml(getAttendanceHistoryDisplayEvent(row))}</span>
        <span class="adjustment-note">${escapeHtml(getAttendanceAdjustmentNote(row))}</span>
      </article>`;
  }

  function renderAttendanceOpsPage(model) {
    const operationalRows = getOperationalAttendanceRows(model);
    const notCheckedInRows = getRosterNotCheckedInRows(model, operationalRows);
    const rows = [...operationalRows, ...notCheckedInRows];
    const counts = getAttendanceStatusCounts(model);
    const selected = getSelectedAttendanceRow(model, rows);
    const selectedKey = selected?.key || "";
    const presentRows = rows.filter((row) => row.group === "present");
    const lateRows = rows.filter((row) => row.group === "late");
    const absentRows = rows.filter((row) => row.group === "absent");
    const notScannedRows = rows.filter((row) => row.group === "missing");
    const excusedRows = rows.filter((row) => row.group === "excused");
    const historyRows = Array.isArray(selected?.history) ? selected.history : [];
    const exportPlayerOptions = Array.from(
      new Map(rows.map((row) => [String(row.student || "").trim().toLowerCase(), row]).filter(([key]) => key)).values()
    ).sort((a, b) => String(a.student || "").localeCompare(String(b.student || "")));
    const rewardTotal = rows.reduce((sum, row) => sum + row.rewardValue, 0) || counts.rewardsIssued || 0;

    return `
      <section class="admin-terminal-overview admin-terminal-attendance-v204 admin-terminal-attendance-v206 admin-terminal-attendance-v207 admin-terminal-attendance-v208 admin-terminal-attendance-v209 admin-terminal-attendance-v211 admin-terminal-attendance-v216 admin-terminal-attendance-v217 admin-terminal-attendance-v220 admin-terminal-attendance-v221 admin-terminal-attendance-v222 admin-terminal-attendance-v223 admin-terminal-attendance-v224 admin-terminal-attendance-v225 admin-terminal-attendance-v227" aria-label="Attendance operations terminal" data-admin-terminal-page="Attendance">
        ${renderAttendancePageHeader(model)}

        <section class="admin-terminal-attendance-v207-actions admin-terminal-attendance-v208-actions" aria-label="Attendance quick actions">
          <button type="button" class="admin-terminal-attendance-v208-overview-action admin-terminal-action is-amber" data-admin-terminal-action="scan-attendance">
            <span class="admin-terminal-action-rail" aria-hidden="true"></span>
            <span class="admin-terminal-action-mark" aria-hidden="true">${renderNavIcon("attendance")}</span>
            <span class="admin-terminal-action-copy">
              <strong>Scan Attendance</strong>
              <small>Open Scanner</small>
            </span>
            <span class="admin-terminal-action-arrow" aria-hidden="true">↗</span>
          </button>

          <button type="button" class="admin-terminal-attendance-v208-overview-action admin-terminal-action is-amber is-export" data-admin-terminal-action="attendance-open-export">
            <span class="admin-terminal-action-rail" aria-hidden="true"></span>
            <span class="admin-terminal-action-mark admin-terminal-attendance-v209-export-icon" aria-hidden="true">
              <img src="./assets/images/csv-export-gold.png" alt="">
            </span>
            <span class="admin-terminal-action-copy">
              <strong>Export CSV</strong>
              <small>Attendance Records</small>
            </span>
            <span class="admin-terminal-action-arrow" aria-hidden="true">↗</span>
          </button>
        </section>

        <section class="admin-terminal-attendance-v204-metrics admin-terminal-attendance-v207-metrics admin-terminal-attendance-v208-metrics" aria-label="Attendance operational metrics">
          ${renderAttendanceMissionCard("Present", counts.present, "", "good")}
          ${renderAttendanceMissionCard("Late", counts.late, "", "warn")}
          ${renderAttendanceMissionCard("Absent", counts.absent, "", "danger")}
          ${renderAttendanceMissionCard("Rewards Issued", renderCurrencyAmount(rewardTotal, "NRC"), "", "cyan", true)}
        </section>

        <section class="admin-terminal-attendance-v206-workspace admin-terminal-attendance-v207-workspace admin-terminal-attendance-v208-workspace">
          <section class="admin-terminal-attendance-v204-roster admin-terminal-attendance-v206-roster admin-terminal-attendance-v207-roster admin-terminal-attendance-v208-roster">
            <header>
              <div>
                <span>Roster</span>
                <strong>Student attendance records</strong>
              </div>
            </header>

            ${renderAttendanceCompactGroup("Present", presentRows, selectedKey)}
            ${renderAttendanceCompactGroup("Late", lateRows, selectedKey)}
            ${renderAttendanceCompactGroup("Absent", absentRows, selectedKey)}
            ${renderAttendanceCompactGroup("Not Checked In", notScannedRows, selectedKey)}
            ${""}
          </section>

          ${renderAttendanceStudentDetailV204(selected)}
        </section>

        <section class="admin-terminal-attendance-v207-ledger admin-terminal-attendance-v208-ledger admin-terminal-attendance-v221-ledger" aria-label="Attendance history ledger">
          <header>
            <div>
              <span>Attendance History</span>
              <strong>Attendance Timeline</strong>
              <small>${escapeHtml(selected?.student || "No student selected")}${selected?.location ? ` · ${escapeHtml(selected.location)}` : ""}</small>
            </div>
            <div class="admin-terminal-attendance-v207-ledger-controls admin-terminal-attendance-v208-ledger-controls">
              <button type="button" data-admin-terminal-action="attendance-ledger-prev-day" aria-label="Previous day">←</button>
              <input type="date" aria-label="Attendance history date lookup">
              <button type="button" data-admin-terminal-action="attendance-ledger-next-day" aria-label="Next day">→</button>
              <select aria-label="Attendance history time period">
                <option>Today</option>
                <option>This week</option>
                <option>All records</option>
              </select>
              <input type="search" placeholder="Search history" aria-label="Search attendance history records">
            </div>
          </header>
          <div class="admin-terminal-attendance-v207-ledger-list admin-terminal-attendance-v208-ledger-list admin-terminal-attendance-v223-history-list">
            ${renderAttendanceHistoryColumnHeader()}
            ${historyRows.length ? historyRows.map((row, rowIndex) => renderAttendanceLedgerRowV204(row, rowIndex)).join("") : `
              <article class="admin-terminal-attendance-v204-empty">No attendance history available for this student.</article>
            `}
          </div>
        </section>

        <dialog class="admin-terminal-attendance-v207-export admin-terminal-attendance-v208-export" aria-label="Attendance export options">
          <form method="dialog">
            <header>
              <span>Export CSV</span>
              <strong>Attendance records</strong>
            </header>
            <label>
              <span>Export scope</span>
              <select>
                <option>Whole roster</option>
                <option>Specific player</option>
              </select>
            </label>
            <label>
              <span>Specific player</span>
              <select aria-label="Specific player export selection">
                <option value="">Select player</option>
                ${exportPlayerOptions.map((row) => `
                  <option value="${escapeHtml(row.key || row.student)}">${escapeHtml(row.student)}${row.location ? ` · ${escapeHtml(row.location)}` : ""}</option>
                `).join("")}
              </select>
            </label>
            <label>
              <span>Time period</span>
              <select>
                <option>Week</option>
                <option>Month</option>
                <option>Quarter</option>
                <option>Year</option>
              </select>
            </label>
            <footer>
              <button value="cancel">Cancel</button>
              <button value="default" data-admin-terminal-action="export-attendance">Export CSV</button>
            </footer>
          </form>
        </dialog>
      </section>`;
  }
