import { AdminDataTable, AdminDialog } from "../../components/index.js";
import { createElement, createId } from "../../components/dom.js";
import { checkRosterCsv, ROSTER_CSV_MAX_BYTES } from "./roster-csv.js";

/** File data lives only in this dialog. No network, storage, or enrollment action. */
export function RosterCsvReview({ onClose = () => {} } = {}) {
  let destroyed = false;
  let generation = 0;
  const fileId = createId("roster-csv-file");
  const helpId = createId("roster-csv-help");
  const input = createElement("input", {
    attrs: { id: fileId, type: "file", accept: ".csv,text/csv", "aria-describedby": helpId },
  });
  const status = createElement("p", { attrs: { role: "status", "aria-live": "polite" } });
  const results = createElement("div", { dataset: { rosterCsvResults: "true" } });
  const element = createElement("section", {
    className: "admin-players-route__detail",
    children: [
      createElement("p", {
        text: "Import unavailable. This checks the file on this device only. No players are created, no credentials are generated, and nothing is uploaded or saved.",
      }),
      createElement("p", {
        attrs: { id: helpId },
        text: "Use a UTF-8 CSV of up to 128 KiB and 200 players. Include exactly: display_name, roster_label, player_identifier. Roster label may be empty. Do not include Access Codes or other personal information.",
      }),
      createElement("label", { text: "Roster CSV file", attrs: { for: fileId } }),
      input,
      status,
      results,
    ],
  });
  const close = createElement("button", {
    className: "admin-button admin-button--quiet",
    text: "Close",
    attrs: { type: "button" },
  });
  close.addEventListener("click", onClose);

  function showErrors(errors) {
    status.textContent = `${errors.length} issue${errors.length === 1 ? "" : "s"} found. Correct the file and choose it again.`;
    results.replaceChildren(createElement("ul", {
      children: errors.map(({ row, message }) => createElement("li", {
        text: `${row ? `Row ${row}: ` : ""}${message}`,
      })),
    }));
  }

  async function inspectFile() {
    const current = ++generation;
    const file = input.files?.[0];
    results.replaceChildren();
    status.textContent = "";
    if (!file || destroyed) return;
    if (file.size > ROSTER_CSV_MAX_BYTES) {
      showErrors([{ message: "Use a CSV file no larger than 128 KiB." }]);
      input.value = "";
      return;
    }
    status.textContent = "Checking the file on this device…";
    try {
      const source = await file.text();
      if (destroyed || current !== generation) return;
      const checked = checkRosterCsv(source);
      if (!checked.ok) showErrors(checked.errors);
      else {
        status.textContent = `${checked.rows.length} player row${checked.rows.length === 1 ? "" : "s"} passed local format checks. Import is unavailable; no players were created. Existing-roster conflicts have not been checked.`;
        const table = AdminDataTable({
          caption: "Local CSV preview. Not an enrollment result.",
          rowKey: (row) => `csv-row-${row.row}`,
          columns: [
            { key: "row", label: "CSV row" },
            { key: "displayName", label: "Player name", rowHeader: true },
            { key: "rosterLabel", label: "Roster label" },
            { key: "playerIdentifier", label: "Player ID" },
          ],
        });
        table.setRows(checked.rows);
        results.replaceChildren(table.element);
      }
    } catch {
      if (!destroyed && current === generation) showErrors([{ message: "The file could not be read. Choose a UTF-8 CSV file and try again." }]);
    } finally {
      if (!destroyed && current === generation) input.value = "";
    }
  }
  input.addEventListener("change", inspectFile);
  return {
    element,
    footer: close,
    input,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      generation += 1;
      input.removeEventListener("change", inspectFile);
      close.removeEventListener("click", onClose);
      input.value = "";
      results.replaceChildren();
      status.textContent = "";
    },
  };
}

export function openRosterCsvReview(opener) {
  let dialog;
  const review = RosterCsvReview({ onClose: () => dialog.close("close-button") });
  dialog = AdminDialog({
    title: "Check roster CSV",
    description: "Local format checks only. Secure roster import is not available yet.",
    content: review.element,
    footer: review.footer,
    size: "large",
    protectUnsavedChanges: false,
    initialFocus: () => review.input,
    onClose() {
      review.destroy();
      queueMicrotask(() => dialog.destroy());
    },
  });
  dialog.open(opener);
  return { dialog, form: review };
}
