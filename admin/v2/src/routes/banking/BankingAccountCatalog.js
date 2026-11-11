import { AdminDataTable, AdminEmptyState, AdminField, AdminIcon } from "../../components/index.js";
import { createElement } from "../../components/dom.js";
import { button, capabilityNote, displayAmount, displayDate, displayNumber, titleCase } from "./BankingViewHelpers.js";

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
      metric("Students", model.summary.playerCount, `${displayNumber(model.summary.playersWithAccounts)} with bank accounts`),
      metric("Checking", model.summary.checkingAccountCount, "Checking accounts"),
      metric("Savings", model.summary.savingsAccountCount, "Savings accounts"),
      metric("Currencies", model.summary.currencyCount, "Displayed separately by currency"),
    ],
  });
}

function accountList(accounts, label) {
  if (!accounts.length) {
    return createElement("span", {
      className: "admin-banking-route__not-provisioned",
      text: `${label} not available`,
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

export function catalog({ model, filters, onFiltersChange, onSelectPlayer, onAdjust }) {
  const selectedCurrency = filters.currency === "all" || model.currencies.includes(filters.currency.toUpperCase())
    ? filters.currency
    : "all";
  if (selectedCurrency !== filters.currency) onFiltersChange({ ...filters, currency: selectedCurrency });

  const search = AdminField({
    name: "banking-search",
    label: "Search students",
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
    caption: "Student Checking and Savings accounts",
    rowKey: (player) => player.rowKey,
    columns: [
      { key: "displayName", label: "Student", rowHeader: true, render: (_value, player) => playerCopy(player) },
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
              disabledReason: !player.resourceId ? "Banking activity is unavailable because this player record has no public banking reference." : "",
              onClick: () => onSelectPlayer(player),
            }),
            button({
              label: "Correct balance",
              icon: "banking",
              quiet: true,
              action: "adjust",
              disabled: !player.resourceId || player.status !== "active" || actionableAccounts.length === 0,
              disabledReason: !player.resourceId
                ? "Balance correction is unavailable because this player record has no public banking reference."
                : player.status !== "active"
                  ? "Balance correction is available only for active players."
                  : actionableAccounts.length === 0
                    ? "This player has no Checking or Savings account that can be corrected."
                    : "",
              onClick: (event) => onAdjust(player, event.currentTarget),
            }),
          );
          return group;
        },
      },
    ],
    emptyState: AdminEmptyState({
      title: "No students match",
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
        attrs: { "aria-label": "Student bank accounts" },
        children: table.element,
      }),
    ],
  });
}
