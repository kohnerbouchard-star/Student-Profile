import {
  AdminDataTable,
  AdminDialog,
  AdminEmptyState,
  AdminErrorState,
  AdminField,
  AdminIcon,
  AdminPageFrame,
  AdminSkeleton,
  AdminStaleState,
  AdminValidationSummary,
} from "../../components/index.js";
import { createElement } from "../../components/dom.js";
import { ADMIN_DATA_STATES } from "../../core/data-state.js";

function titleCase(value, fallback = "Not available") {
  const text = String(value || "").trim();
  return text
    ? text.replace(/[_-]+/g, " ").replace(/\b\p{L}/gu, (letter) => letter.toUpperCase())
    : fallback;
}

function displayNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString(undefined) : "—";
}

function displayAmount(value, currencyCode, { signed = false } = {}) {
  if (!Number.isFinite(Number(value))) return "—";
  const number = Number(value);
  const amount = Math.abs(number).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const sign = signed ? (number > 0 ? "+" : number < 0 ? "−" : "") : (number < 0 ? "−" : "");
  const code = String(currencyCode || "").trim().toUpperCase();
  return `${sign}${amount}${code ? ` ${code}` : ""}`;
}

function displayDate(value) {
  const timestamp = Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp)) return "Not available";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function button({ label, icon, quiet = false, onClick, disabled = false, action }) {
  const element = createElement("button", {
    className: `admin-button${quiet ? " admin-button--quiet" : ""}`,
    attrs: { type: "button", disabled },
    dataset: { bankingAction: action },
    children: [icon ? AdminIcon({ name: icon, size: 17 }) : null, label],
  });
  element.addEventListener("click", onClick);
  return element;
}

function metric(label, value, detail) {
  return createElement("article", {
    className: "admin-banking-route__metric",
    children: [
      createElement("span", { text: label }),
      createElement("output", { text: displayNumber(value) }),
      createElement("small", { text: detail }),
    ],
  });
}

function summary(model) {
  return createElement("section", {
    className: "admin-banking-route__summary",
    attrs: { "aria-label": "Banking summary" },
    children: [
      metric("Players", model.summary.playerCount, `${displayNumber(model.summary.playersWithAccounts)} with bank accounts`),
      metric("Checking", model.summary.checkingAccountCount, "Provisioned account rows"),
      metric("Savings", model.summary.savingsAccountCount, "Provisioned account rows"),
      metric("Currencies", model.summary.currencyCount, "Kept separate; never cross-summed"),
    ],
  });
}

function accountList(accounts, label) {
  if (!accounts.length) {
    return createElement("span", {
      className: "admin-banking-route__not-provisioned",
      text: `${label} not provisioned`,
    });
  }
  return createElement("div", {
    className: "admin-banking-route__account-list",
    children: accounts.map((account) => createElement("span", {
      className: "admin-banking-route__account-balance",
      children: [
        createElement("strong", { text: displayAmount(account.balance, account.currencyCode) }),
        account.updatedAt ? createElement("small", { text: `Updated ${displayDate(account.updatedAt)}` }) : null,
      ],
    })),
  });
}

function playerCopy(player) {
  return createElement("div", {
    className: "admin-banking-route__player-copy",
    children: [
      createElement("strong", { text: player.displayName }),
      player.rosterLabel ? createElement("small", { text: player.rosterLabel }) : null,
    ],
  });
}

function statusPill(status) {
  return createElement("span", {
    className: "admin-banking-route__status",
    dataset: { status: String(status || "unknown").toLowerCase() },
    text: titleCase(status),
  });
}

function capabilityNote() {
  return createElement("aside", {
    className: "admin-banking-route__contract-note",
    attrs: { "aria-label": "Banking contract scope" },
    children: [
      AdminIcon({ name: "info", size: 18 }),
      createElement("p", {
        text: "Transfers appear here when they are posted to the authoritative player ledger. The current Admin contract does not expose a personal transfer mutation, so this surface does not initiate transfers.",
      }),
    ],
  });
}

function activityTable(history) {
  const table = AdminDataTable({
    caption: "Posted Checking and Savings ledger activity",
    rowKey: (entry) => entry.rowKey,
    rows: history.entries,
    columns: [
      { key: "createdAt", label: "Date", render: (value) => displayDate(value) },
      {
        key: "description",
        label: "Activity",
        rowHeader: true,
        render: (value, entry) => createElement("div", {
          className: "admin-banking-route__activity-copy",
          children: [
            createElement("strong", { text: value }),
            createElement("small", { text: entry.isTransfer ? "Posted account transfer" : entry.category }),
          ],
        }),
      },
      { key: "accountType", label: "Account", render: (value) => titleCase(value) },
      {
        key: "amount",
        label: "Amount",
        align: "end",
        render: (value, entry) => createElement("span", {
          className: "admin-banking-route__ledger-amount",
          dataset: { direction: Number(value) < 0 ? "debit" : Number(value) > 0 ? "credit" : "neutral" },
          text: displayAmount(value, entry.currencyCode, { signed: true }),
        }),
      },
      { key: "entryType", label: "Entry", render: (value) => titleCase(value) },
    ],
    emptyState: AdminEmptyState({
      title: "No posted banking activity",
      message: "No Checking or Savings ledger entries are available for this player.",
      compact: true,
    }),
  });
  return table.element;
}

function activityPanel({ player, historyState, onClose, onRefresh }) {
  const actions = createElement("div", {
    className: "admin-banking-route__activity-actions",
    children: [
      button({
        label: historyState.status === ADMIN_DATA_STATES.REFRESHING ? "Refreshing…" : "Refresh activity",
        icon: "refresh",
        quiet: true,
        disabled: historyState.status === ADMIN_DATA_STATES.REFRESHING,
        action: "refresh-activity",
        onClick: onRefresh,
      }),
      button({ label: "Close", icon: "close", quiet: true, action: "close-activity", onClick: onClose }),
    ],
  });
  const body = createElement("div", { className: "admin-banking-route__activity-body" });

  if (historyState.status === ADMIN_DATA_STATES.INITIAL_LOADING) {
    body.append(AdminSkeleton({ label: `Loading ${player.displayName} banking activity`, count: 5, shape: "row" }));
  } else if (historyState.status === ADMIN_DATA_STATES.FAILED) {
    body.append(AdminErrorState({
      title: "Banking activity unavailable",
      message: historyState.error?.userMessage,
      requestId: historyState.error?.requestId,
      retryAfterSeconds: historyState.error?.retryAfterSeconds,
      retry: historyState.error?.retryable === false ? null : { label: "Try again", onClick: onRefresh },
      compact: true,
    }));
  } else if (historyState.status === ADMIN_DATA_STATES.EMPTY) {
    body.append(AdminEmptyState({
      title: "No posted banking activity",
      message: "No Checking or Savings ledger entries are available for this player.",
      compact: true,
    }));
  } else {
    const table = activityTable(historyState.data);
    const content = historyState.status === ADMIN_DATA_STATES.REFRESHING
      ? createElement("div", {
        className: "admin-banking-route__activity-resolved",
        children: [
          createElement("div", {
            className: "admin-banking-route__refresh-state",
            attrs: { role: "status" },
            children: [AdminIcon({ name: "refresh", size: 17 }), "Refreshing posted activity…"],
          }),
          table,
        ],
      })
      : table;
    body.append(historyState.status === ADMIN_DATA_STATES.STALE
      ? AdminStaleState({
        message: "Showing the latest loaded banking activity while refresh is unavailable.",
        retry: { label: "Refresh", onClick: onRefresh },
        content,
      })
      : content);
  }

  return createElement("section", {
    className: "admin-banking-route__activity-panel",
    attrs: { "aria-label": `${player.displayName} banking activity` },
    children: [
      createElement("header", {
        className: "admin-banking-route__activity-header",
        children: [
          createElement("div", { children: [
            createElement("span", { text: "Posted ledger activity" }),
            createElement("h2", { text: player.displayName }),
            createElement("p", { text: "Checking and Savings entries only. Private ownership identifiers are not displayed." }),
          ] }),
          actions,
        ],
      }),
      body,
    ],
  });
}

function catalog({ model, filters, onFiltersChange, onSelectPlayer, onAdjust }) {
  const selectedCurrency = filters.currency === "all" || model.currencies.includes(filters.currency.toUpperCase())
    ? filters.currency
    : "all";
  if (selectedCurrency !== filters.currency) onFiltersChange({ ...filters, currency: selectedCurrency });

  const search = AdminField({
    name: "banking-search",
    label: "Search players",
    type: "search",
    placeholder: "Name, roster label, or country",
    autocomplete: "off",
    value: filters.query,
    prefix: AdminIcon({ name: "search", size: 16 }),
  });
  const currency = AdminField({
    name: "banking-currency",
    label: "Currency",
    type: "select",
    value: selectedCurrency,
    options: [
      { value: "all", label: "All currencies" },
      ...model.currencies.map((code) => ({ value: code.toLowerCase(), label: code })),
    ],
  });
  const controls = createElement("section", {
    className: "admin-banking-route__controls",
    attrs: { "aria-label": "Banking filters" },
    children: [search.element, currency.element],
  });

  const table = AdminDataTable({
    caption: "Player Checking and Savings accounts",
    rowKey: (player) => player.rowKey,
    columns: [
      { key: "displayName", label: "Player", rowHeader: true, render: (_value, player) => playerCopy(player) },
      { key: "countryName", label: "Country", render: (value) => value || "Unassigned" },
      { key: "status", label: "Status", render: (value) => statusPill(value) },
      { key: "checking", label: "Checking", render: (value) => accountList(value, "Checking") },
      { key: "savings", label: "Savings", render: (value) => accountList(value, "Savings") },
      {
        key: "actions",
        label: "Actions",
        align: "end",
        render: (_value, player) => {
          const actionableAccounts = player.accounts.filter((account) => Boolean(account.currencyCode));
          const group = createElement("div", { className: "admin-banking-route__row-actions" });
          group.append(
            button({
              label: "Activity",
              icon: "logs",
              quiet: true,
              action: "activity",
              disabled: !player.resourceId,
              onClick: () => onSelectPlayer(player),
            }),
            button({
              label: "Adjust",
              icon: "banking",
              quiet: true,
              action: "adjust",
              disabled: !player.resourceId || player.status !== "active" || actionableAccounts.length === 0,
              onClick: (event) => onAdjust(player, event.currentTarget),
            }),
          );
          return group;
        },
      },
    ],
    emptyState: AdminEmptyState({
      title: "No players match",
      message: "Try changing the search or currency filter.",
      compact: true,
    }),
  });

  function applyFilters() {
    const query = search.getValue().trim().toLocaleLowerCase();
    const currencyCode = currency.getValue().toUpperCase();
    const rows = model.players.filter((player) => {
      const searchable = [player.displayName, player.rosterLabel, player.countryName].join(" ").toLocaleLowerCase();
      const matchesQuery = !query || searchable.includes(query);
      const matchesCurrency = currencyCode === "ALL"
        || player.accounts.some((account) => account.currencyCode === currencyCode);
      return matchesQuery && matchesCurrency;
    });
    table.setRows(rows);
    onFiltersChange({ query: search.getValue(), currency: currency.getValue() });
  }

  search.control.addEventListener("input", applyFilters);
  currency.control.addEventListener("change", applyFilters);
  applyFilters();

  return createElement("div", {
    className: "admin-banking-route__resolved",
    children: [
      summary(model),
      capabilityNote(),
      controls,
      createElement("section", {
        className: "admin-banking-route__catalog",
        attrs: { "aria-label": "Player bank accounts" },
        children: table.element,
      }),
    ],
  });
}

/** Renders the source-owned Admin V2 Banking route. */
export function BankingRoute({
  state,
  filters = { query: "", currency: "all" },
  selectedPlayer = null,
  historyState,
  onFiltersChange = () => {},
  onRefresh = async () => {},
  onSelectPlayer = async () => {},
  onClosePlayer = () => {},
  onRefreshHistory = async () => {},
  onAdjust = async () => ({ ok: false }),
} = {}) {
  let destroyed = false;
  let adjustmentDialog = null;

  function destroyAdjustmentDialog() {
    const active = adjustmentDialog;
    adjustmentDialog = null;
    active?.dialog.destroy();
  }

  function openAdjustmentDialog(player, opener) {
    destroyAdjustmentDialog();
    const accounts = player.accounts.filter((account) => Boolean(account.currencyCode));
    const account = AdminField({
      name: "banking-account",
      label: "Account",
      type: "select",
      required: true,
      options: accounts.map((item, index) => ({
        value: String(index),
        label: `${item.accountType === "savings" ? "Savings" : "Checking"} · ${item.currencyCode} · ${displayAmount(item.balance, item.currencyCode)}`,
      })),
      value: "0",
    });
    const amount = AdminField({
      name: "banking-adjustment-amount",
      label: "Adjustment amount",
      type: "number",
      required: true,
      placeholder: "Use a negative amount to debit",
      hint: "A positive amount credits the account; a negative amount debits it.",
    });
    amount.control.setAttribute("step", "0.01");
    const reason = AdminField({
      name: "banking-adjustment-reason",
      label: "Reason",
      type: "textarea",
      required: true,
      placeholder: "Why is this administrative correction required?",
      hint: "Required for the authoritative ledger and audit trail.",
    });
    reason.control.setAttribute("maxlength", "300");
    const validation = AdminValidationSummary();
    const form = createElement("form", {
      className: "admin-banking-adjustment-form",
      attrs: { novalidate: true },
      children: [validation.element, account.element, amount.element, reason.element],
    });
    const cancel = createElement("button", {
      className: "admin-button admin-button--quiet",
      attrs: { type: "button", "data-dialog-action": "cancel" },
      text: "Cancel",
    });
    const submit = createElement("button", {
      className: "admin-button",
      attrs: { type: "submit", form: "", "data-dialog-action": "submit" },
      children: [AdminIcon({ name: "banking", size: 17 }), "Post adjustment"],
    });
    const footer = createElement("div", {
      className: "admin-banking-adjustment-form__actions",
      children: [cancel, submit],
    });
    const dialog = AdminDialog({
      title: `Adjust ${player.displayName}`,
      description: "Post an administrative adjustment to an existing Checking or Savings account. This does not create accounts or initiate transfers.",
      content: form,
      footer,
      size: "medium",
      initialFocus: () => account.control,
      onClose() {
        queueMicrotask(() => {
          if (adjustmentDialog?.dialog === dialog) destroyAdjustmentDialog();
        });
      },
    });
    submit.removeAttribute("form");
    form.append(submit);
    submit.classList.add("admin-u-visually-hidden");

    async function submitAdjustment() {
      const errors = [];
      const index = Number(account.getValue());
      const selectedAccount = Number.isSafeInteger(index) ? accounts[index] : null;
      const numericAmount = Number(amount.getValue());
      const reasonText = reason.getValue().trim();
      account.setError(selectedAccount ? "" : "Select an existing account.");
      amount.setError(Number.isFinite(numericAmount) && numericAmount !== 0 ? "" : "Enter a non-zero amount.");
      reason.setError(reasonText && reasonText.length <= 300 ? "" : "Enter a reason up to 300 characters.");
      if (!selectedAccount) errors.push({ fieldId: account.control.id, label: "Account", message: "Select an existing account." });
      if (!Number.isFinite(numericAmount) || numericAmount === 0) {
        errors.push({ fieldId: amount.control.id, label: "Amount", message: "Enter a non-zero amount." });
      }
      if (!reasonText || reasonText.length > 300) {
        errors.push({ fieldId: reason.control.id, label: "Reason", message: "Enter a reason up to 300 characters." });
      }
      validation.setErrors(errors, { focus: errors.length > 0 });
      if (errors.length > 0) return;

      dialog.setBusy(true);
      const result = await onAdjust(player, selectedAccount, { amount: numericAmount, reason: reasonText });
      if (result?.ok === true) dialog.close("saved");
      else dialog.setBusy(false);
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void submitAdjustment();
    });
    const footerSubmit = button({
      label: "Post adjustment",
      icon: "banking",
      action: "submit-adjustment",
      onClick: () => form.requestSubmit(),
    });
    footerSubmit.dataset.dialogAction = "submit";
    cancel.addEventListener("click", () => dialog.close("cancelled"));
    footer.replaceChildren(cancel, footerSubmit);
    adjustmentDialog = { dialog, form };
    dialog.open(opener);
  }

  const refresh = button({
    label: state.status === ADMIN_DATA_STATES.REFRESHING ? "Refreshing…" : "Refresh",
    icon: "refresh",
    quiet: true,
    action: "refresh",
    disabled: state.status === ADMIN_DATA_STATES.REFRESHING,
    onClick: onRefresh,
  });
  const content = createElement("div", {
    className: "admin-banking-route",
    dataset: { adminV2State: state.status },
    attrs: { "aria-busy": [ADMIN_DATA_STATES.INITIAL_LOADING, ADMIN_DATA_STATES.REFRESHING].includes(state.status) },
  });

  if (state.status === ADMIN_DATA_STATES.INITIAL_LOADING) {
    content.append(createElement("div", {
      className: "admin-banking-route__loading-layout",
      children: [
        AdminSkeleton({ label: "Loading Banking summary", count: 4, shape: "card" }),
        AdminSkeleton({ label: "Loading player bank accounts", count: 6, shape: "row" }),
      ],
    }));
  } else if (state.status === ADMIN_DATA_STATES.FAILED) {
    content.append(AdminErrorState({
      title: "Banking could not be loaded",
      message: state.error?.userMessage,
      requestId: state.error?.requestId,
      retryAfterSeconds: state.error?.retryAfterSeconds,
      retry: state.error?.retryable === false ? null : { label: "Try again", onClick: onRefresh },
    }));
  } else if (state.status === ADMIN_DATA_STATES.EMPTY) {
    content.append(
      capabilityNote(),
      AdminEmptyState({
        title: "No players available",
        message: "This game does not currently have players with Banking records to supervise.",
      }),
    );
  } else {
    const resolved = catalog({
      model: state.data,
      filters,
      onFiltersChange,
      onSelectPlayer,
      onAdjust: openAdjustmentDialog,
    });
    const withRefresh = state.status === ADMIN_DATA_STATES.REFRESHING
      ? createElement("div", {
        className: "admin-banking-route__resolved-wrapper",
        children: [
          createElement("div", {
            className: "admin-banking-route__refresh-state",
            attrs: { role: "status" },
            children: [AdminIcon({ name: "refresh", size: 17 }), "Refreshing account balances…"],
          }),
          resolved,
        ],
      })
      : resolved;
    content.append(state.status === ADMIN_DATA_STATES.STALE
      ? AdminStaleState({
        message: "Showing the latest loaded Banking data while refresh is unavailable.",
        retry: { label: "Refresh", onClick: onRefresh },
        content: withRefresh,
      })
      : withRefresh);
  }

  if (selectedPlayer) {
    content.append(activityPanel({
      player: selectedPlayer,
      historyState,
      onClose: onClosePlayer,
      onRefresh: onRefreshHistory,
    }));
  }

  const frame = AdminPageFrame({
    eyebrow: "Finance",
    title: "Banking",
    description: "Supervise authoritative Checking and Savings balances and posted ledger activity. Administrative corrections use the existing ledger adjustment contract.",
    actions: refresh,
    content,
  });

  return {
    element: frame.element,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      destroyAdjustmentDialog();
    },
  };
}
