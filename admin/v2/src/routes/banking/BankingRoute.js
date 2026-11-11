import {
  AdminConfirmDialog,
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
import { button, capabilityNote, displayAmount } from "./BankingViewHelpers.js";
import { catalog } from "./BankingAccountCatalog.js";
import { activityPanel } from "./BankingActivityPanel.js";

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
    active?.confirm?.destroy?.();
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
      label: "Correction amount",
      type: "number",
      required: true,
      placeholder: "Use a negative amount to subtract",
      hint: "Positive adds to the balance; negative subtracts from it.",
    });
    amount.control.setAttribute("step", "0.01");
    const reason = AdminField({
      name: "banking-adjustment-reason",
      label: "Teacher reason",
      type: "textarea",
      required: true,
      placeholder: "Why does this student's balance need to be corrected?",
      hint: "This reason is recorded in Activity History.",
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
      children: [AdminIcon({ name: "banking", size: 17 }), "Review correction"],
    });
    const footer = createElement("div", {
      className: "admin-banking-adjustment-form__actions",
      children: [cancel, submit],
    });
    const dialog = AdminDialog({
      title: `Correct ${player.displayName}'s balance`,
      description: "Use this only to correct an existing Checking or Savings balance. The correction is recorded in Activity History.",
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

    let footerSubmit;

    async function reviewAdjustment() {
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

      adjustmentDialog?.confirm?.destroy?.();
      const currentBalance = Number(selectedAccount.balance);
      const nextBalance = Number.isFinite(currentBalance) ? currentBalance + numericAmount : null;
      const accountLabel = selectedAccount.accountType === "savings" ? "Savings" : "Checking";
      const confirm = AdminConfirmDialog({
        title: "Confirm balance correction",
        message: `Apply ${displayAmount(numericAmount, selectedAccount.currencyCode, { signed: true })} to ${player.displayName}'s ${accountLabel}?`,
        detail: Number.isFinite(nextBalance)
          ? `${displayAmount(currentBalance, selectedAccount.currencyCode)} → ${displayAmount(nextBalance, selectedAccount.currencyCode)} · ${reasonText}`
          : reasonText,
        confirmLabel: "Apply correction",
        tone: "danger",
        failureMessage: "The balance correction could not be applied. Review the account and try again.",
        async onConfirm() {
          const result = await onAdjust(player, selectedAccount, { amount: numericAmount, reason: reasonText });
          if (result?.ok === true) {
            dialog.close("saved");
            return true;
          }
          return false;
        },
      });
      if (adjustmentDialog) adjustmentDialog.confirm = confirm;
      void confirm.open(footerSubmit);
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void reviewAdjustment();
    });
    footerSubmit = button({
      label: "Review correction",
      icon: "banking",
      action: "submit-adjustment",
      onClick: () => form.requestSubmit(),
    });
    footerSubmit.dataset.dialogAction = "submit";
    cancel.addEventListener("click", () => dialog.close("cancelled"));
    footer.replaceChildren(cancel, footerSubmit);
    adjustmentDialog = { dialog, form, confirm: null };
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
        AdminSkeleton({ label: "Loading student bank accounts", count: 6, shape: "row" }),
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
        title: "No students available",
        message: "This simulation does not currently have students with Banking records.",
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
    eyebrow: "Economy",
    title: "Banking",
    description: "Review student Checking and Savings balances and account activity. Balance corrections require a reason and confirmation before they are applied.",
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
