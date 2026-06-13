window.Econovaria = window.Econovaria || {};
window.Econovaria.ui = window.Econovaria.ui || {};

function showGlobalStatus(type, message) {
  const el = document.getElementById("globalStatus");
  if (!el) return;
  el.className = `global-status ${type || ""}`;
  el.textContent = message;
  el.classList.remove("hidden");
}

function hideGlobalStatus() {
  const el = document.getElementById("globalStatus");
  if (!el) return;
  el.textContent = "";
  el.classList.add("hidden");
}

function updateIdentity() {
  const s = selectedStudent();
  if (!s) return;

  const role = currentSession?.role || "STUDENT";
  const label = PERMISSION_SETS[role]?.label || role;

  document.getElementById("identityName").textContent = s.name || "Student";
  document.getElementById("identityMeta").textContent = `Grade ${s.grade || "—"} · ${s.homeroom || "—"}`;
  document.getElementById("permissionSummary").innerHTML = `<span class="badge good">${sanitize(label)}</span><span class="badge">Live account</span>`;
  document.getElementById("connectionMode").textContent = "Synced account";
  document.getElementById("connectionCopy").textContent = "Your dashboard updates after confirmed actions.";
}

function metric(label, value, note, helpText) {
  return `
    <div class="metric">
      <div class="label">${sanitize(label)}</div>
      <div class="value">${sanitize(value)}</div>
      <div class="note">${sanitize(note || "")}</div>
      ${helpText ? help(helpText) : ""}
    </div>`;
}

function mini(label, value) {
  return `<div class="mini-row"><span>${sanitize(label)}</span><strong>${sanitize(formatMiniValue(label, value))}</strong></div>`;
}

function help(text) {
  return `<p class="help-text">${sanitize(text)}</p>`;
}

function showStatus(element, ok, message) {
  if (!element) return;

  if (ok === null) {
    element.className = "status-box loading";
  } else {
    element.className = `status-box ${ok ? "ok" : "bad"}`;
  }

  element.textContent = message;
}

function isButtonLoading(button) {
  return Boolean(button && button.dataset.loading === "true");
}

function setButtonLoading(button, isLoading, loadingText) {
  if (!button) return;

  if (!button.dataset.originalText) {
    button.dataset.originalText = button.textContent.trim();
  }

  if (isLoading) {
    button.dataset.loading = "true";
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.classList.add("is-loading");
    button.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>${sanitize(loadingText || "Loading...")}</span>`;
    return;
  }

  button.dataset.loading = "false";
  button.disabled = false;
  button.removeAttribute("aria-busy");
  button.classList.remove("is-loading");
  button.textContent = button.dataset.originalText || "Submit";
}

function setControlsDisabled(container, disabled, exceptions = []) {
  if (!container) return;

  const exceptionSet = new Set(exceptions.filter(Boolean));

  container.querySelectorAll("input, select, textarea, button").forEach((control) => {
    if (exceptionSet.has(control)) return;
    control.disabled = disabled;
  });
}

function table(rows, columns, emptyMessage) {
  if (!rows || !rows.length) {
    return `<div class="empty">${sanitize(emptyMessage)}</div>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>${columns.map((col) => `<th>${labelize(col)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${rows.map((row) => `<tr>${columns.map((col) => `<td>${formatValue(col, row[col])}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

Object.assign(window.Econovaria.ui, {
  showGlobalStatus,
  hideGlobalStatus,
  updateIdentity,
  metric,
  mini,
  help,
  showStatus,
  isButtonLoading,
  setButtonLoading,
  setControlsDisabled,
  table
});
