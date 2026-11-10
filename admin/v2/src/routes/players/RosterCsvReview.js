import { AdminDataTable, AdminDialog } from "../../components/index.js";
import { createElement, createId } from "../../components/dom.js";
import { checkRosterCsv, ROSTER_CSV_MAX_BYTES } from "./roster-csv.js";

/** Names stay in dialog memory. Transmission requires an explicit reviewed import. */
export function RosterCsvReview({ onClose = () => {}, onImport, onBusy = () => {} } = {}) {
  let destroyed = false;
  let generation = 0;
  let source = null;
  let studentNames = [];
  let busy = false;
  let attempted = false;
  let imported = false;
  const available = typeof onImport === "function";
  const fileId = createId("roster-csv-file");
  const helpId = createId("roster-csv-help");
  const input = createElement("input", {
    attrs: { id: fileId, type: "file", accept: ".csv,text/csv", "aria-describedby": helpId },
  });
  const headerId = createId("roster-csv-header");
  const headerMode = createElement("select", {
    attrs: { id: headerId },
    children: [
      createElement("option", { text: "Detect a name heading", attrs: { value: "auto" } }),
      createElement("option", { text: "No header: every row is a student", attrs: { value: "absent" } }),
      createElement("option", { text: "First row is a heading", attrs: { value: "present" } }),
    ],
  });
  const status = createElement("p", { attrs: { role: "status", "aria-live": "polite" } });
  const results = createElement("div", { dataset: { rosterCsvResults: "true" } });
  const confirmId = createId("roster-csv-confirm");
  const confirmation = createElement("input", { attrs: { id: confirmId, type: "checkbox" } });
  const confirmationText = createElement("label", { attrs: { for: confirmId } });
  const confirmationBox = createElement("div", { children: [confirmation, confirmationText] });
  confirmationBox.hidden = true;
  const element = createElement("section", {
    className: "admin-players-route__detail",
    children: [
      createElement("p", { text: available
        ? "Preview stays on this device until you confirm. Import sends only student names to Econovaria and stores them in this game's roster. The CSV file is not uploaded or saved. Each row creates a new student, even if a name already exists."
        : "Import unavailable. This checks the file on this device only. Nothing is uploaded or saved." }),
      createElement("p", {
        attrs: { id: helpId },
        text: "Use a UTF-8 CSV of up to 128 KiB and 200 students. One student name per row, in one column. No IDs, credentials, or other fields are needed. A name heading is optional; check the preview and header option.",
      }),
      createElement("label", { text: "Roster CSV file", attrs: { for: fileId } }), input,
      createElement("label", { text: "CSV heading", attrs: { for: headerId } }), headerMode,
      status, results, confirmationBox,
    ],
  });
  const close = createElement("button", {
    className: "admin-button admin-button--quiet", text: "Close", attrs: { type: "button" },
  });
  const submit = createElement("button", {
    className: "admin-button", text: "Create students", attrs: { type: "button", disabled: true },
  });
  submit.hidden = !available;
  close.addEventListener("click", onClose);
  const footer = createElement("div", { children: [close, submit] });

  function showErrors(errors) {
    studentNames = [];
    confirmationBox.hidden = true;
    submit.disabled = true;
    status.textContent = `${errors.length} issue${errors.length === 1 ? "" : "s"} found. Correct the file and choose it again.`;
    results.replaceChildren(createElement("ul", { children: errors.map(({ row, message }) => createElement("li", {
      text: `${row ? `Row ${row}: ` : ""}${message}`,
    })) }));
  }

  function showPreview() {
    if (destroyed || source === null || attempted) return;
    confirmation.checked = false;
    submit.disabled = true;
    const checked = checkRosterCsv(source, { headerMode: headerMode.value });
    if (!checked.ok) { showErrors(checked.errors); return; }
    studentNames = checked.rows.map((row) => row.displayName);
    status.textContent = `${checked.rows.length} student row${checked.rows.length === 1 ? "" : "s"} passed local format checks. ${checked.headerSkipped ? "The first row was treated as a heading." : "Every row was treated as a student."}${checked.duplicateNameCount ? " Repeated names are kept as separate student rows." : ""}`;
    const table = AdminDataTable({
      caption: "Local CSV preview. No students have been created.", rowKey: (row) => `csv-row-${row.row}`,
      columns: [{ key: "row", label: "CSV row" }, { key: "displayName", label: "Student name", rowHeader: true }],
    });
    table.setRows(checked.rows);
    results.replaceChildren(table.element);
    confirmationBox.hidden = !available;
    confirmationText.textContent = `I checked the ${studentNames.length} names and the selected game. Create ${studentNames.length} new student accounts in this game and generate their Player IDs and Access Codes. Codes appear once; I will keep them private and save them before closing.`;
  }

  async function inspectFile() {
    if (attempted || destroyed) return;
    const current = ++generation;
    const file = input.files?.[0];
    source = null;
    studentNames = [];
    results.replaceChildren();
    confirmationBox.hidden = true;
    submit.disabled = true;
    status.textContent = "";
    if (!file) return;
    if (file.size > ROSTER_CSV_MAX_BYTES) {
      showErrors([{ message: "Use a CSV file no larger than 128 KiB." }]);
      input.value = "";
      return;
    }
    status.textContent = "Checking the file on this device…";
    try {
      const content = await file.text();
      if (destroyed || current !== generation) return;
      source = content;
      showPreview();
    } catch {
      if (!destroyed && current === generation) showErrors([{ message: "The file could not be read. Choose a UTF-8 CSV file and try again." }]);
    } finally {
      if (!destroyed && current === generation) input.value = "";
    }
  }

  async function importStudents() {
    if (!available || busy || imported || destroyed || !confirmation.checked || !studentNames.length) return;
    attempted = true;
    busy = true;
    source = null;
    input.disabled = headerMode.disabled = confirmation.disabled = close.disabled = submit.disabled = true;
    onBusy(true);
    status.textContent = "Creating students securely. Keep this dialog open until the result arrives. This can take a minute.";
    let response;
    try { response = await onImport([...studentNames]); }
    catch { response = { ok: false }; }
    if (destroyed) return;
    busy = false;
    close.disabled = false;
    onBusy(false);
    if (response?.ok !== true) {
      status.textContent = "The import result could not be confirmed. Do not start a new import: some or all students may already exist. Retry this same request safely, or check the roster before leaving. Closing or reloading can lose this retry context.";
      submit.textContent = "Retry same import";
      submit.disabled = false;
      return;
    }
    imported = true;
    studentNames = [];
    confirmationBox.hidden = true;
    submit.hidden = true;
    const result = response.result;
    status.textContent = result.credentialsAvailable
      ? `${result.createdCount} students created. These Player IDs and Access Codes let students sign in. Codes are shown only now. Copy them privately before closing; they are not saved in this browser or recoverable from the roster.`
      : `This import already created ${result.createdCount} students. No new accounts were created by this retry. Access Codes cannot be shown again. Use each student's protected Update credentials action to set a replacement code if needed.`;
    const table = AdminDataTable({
      caption: result.credentialsAvailable ? "New student sign-in details. Keep private." : "Previously imported students. Codes unavailable.",
      rowKey: (row) => `import-row-${row.row}`,
      columns: [
        { key: "row", label: "Student row" }, { key: "displayName", label: "Student name", rowHeader: true },
        { key: "playerIdentifier", label: "Player ID" },
        ...(result.credentialsAvailable ? [{ key: "accessCode", label: "Access Code" }] : []),
      ],
    });
    table.setRows(result.students);
    results.replaceChildren(table.element);
  }

  const updateConfirmation = () => { submit.disabled = !confirmation.checked || !studentNames.length || busy || imported; };
  confirmation.addEventListener("change", updateConfirmation);
  submit.addEventListener("click", importStudents);
  headerMode.addEventListener("change", showPreview);
  input.addEventListener("change", inspectFile);
  return {
    element, footer, input,
    hasImported: () => imported,
    isBusy: () => busy,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      generation += 1;
      source = null;
      studentNames = [];
      confirmation.removeEventListener("change", updateConfirmation);
      submit.removeEventListener("click", importStudents);
      headerMode.removeEventListener("change", showPreview);
      input.removeEventListener("change", inspectFile);
      close.removeEventListener("click", onClose);
      input.value = "";
      results.replaceChildren();
      status.textContent = "";
    },
  };
}

export function openRosterCsvReview(opener, { onImport, onReviewClose = () => {} } = {}) {
  let dialog;
  const review = RosterCsvReview({ onImport, onBusy: (value) => dialog.setBusy(value), onClose: () => dialog.close("close-button") });
  dialog = AdminDialog({
    title: "Import roster CSV", description: "Preview student names, then confirm account creation in the selected game.",
    content: review.element, footer: review.footer, size: "large", protectUnsavedChanges: false,
    initialFocus: () => review.input,
    onBeforeClose: (reason) => reason === "destroyed" || !review.isBusy(),
    onClose(reason) {
      const imported = review.hasImported();
      review.destroy();
      onReviewClose({ imported, reason });
      queueMicrotask(() => dialog.destroy());
    },
  });
  dialog.open(opener);
  return { dialog, form: review };
}
