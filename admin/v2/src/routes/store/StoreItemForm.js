import {
  AdminField,
  AdminValidationSummary,
} from "../../components/index.js";
import { createElement, createId } from "../../components/dom.js";
import { isAdminErrorEnvelope, normalizeAdminError } from "../../core/error-envelope.js";

const STORE_CURRENCY_CODES = Object.freeze(["NRC", "YRC", "THD", "SLV", "ELD", "VAL", "LUM", "SYN", "XAL", "DRV"]);

function fieldId(formId, name) { return `${formId}-${name}`; }
function numericValue(value) {
  if (value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function fieldError(field, message) {
  field.setError(message);
  return { fieldId: field.control.id, label: field.label.textContent.replace(/Required$/i, "").trim(), message };
}

export function StoreItemForm({
  mode = "create",
  item = null,
  onSubmit = async () => ({ ok: false }),
  onCancel = () => {},
} = {}) {
  const editing = mode === "edit";
  const formId = createId(`admin-store-${editing ? "edit" : "create"}`);
  const form = createElement("form", { className: "admin-store-form", attrs: { id: formId, novalidate: true } });
  const validation = AdminValidationSummary();

  const name = AdminField({ id: fieldId(formId, "name"), name: "name", label: "Item name", required: true, value: item?.name || "", autocomplete: "off" });
  const description = AdminField({ id: fieldId(formId, "description"), name: "description", label: "Description", type: "textarea", rows: 4, value: item?.description || "", autocomplete: "off" });
  const category = AdminField({ id: fieldId(formId, "category"), name: "category", label: "Category", hint: "Lowercase letters, numbers, underscores, or hyphens.", required: true, value: item?.category || "general", autocomplete: "off", pattern: "[a-z0-9_-]{1,32}" });
  const price = AdminField({ id: fieldId(formId, "price"), name: "price", label: "Price", type: "number", required: true, value: item?.price ?? 0, min: 0, step: 0.01, inputMode: "decimal" });
  const currencyCode = AdminField({
    id: fieldId(formId, "currencyCode"), name: "currencyCode", label: "Currency", type: "select", required: true, value: item?.currencyCode || "",
    options: [{ value: "", label: "Select currency", disabled: true }, ...STORE_CURRENCY_CODES.map((code) => ({ value: code, label: code }))],
  });
  const stockQuantity = AdminField({
    id: fieldId(formId, "stockQuantity"), name: "stockQuantity", label: "Available quantity", type: "number", required: true,
    hint: "Finite stock. Use 0 to show the item as out of stock without archiving it.", value: item?.stockQuantity ?? 0, min: 0, step: 1, inputMode: "numeric",
  });
  const status = AdminField({
    id: fieldId(formId, "status"), name: "status", label: "Purchase status", type: "select", required: true, value: item?.status || "active",
    hint: "Disabled prevents purchasing. It does not archive the item or automatically hide it.",
    options: [{ value: "active", label: "Active · purchasable" }, { value: "disabled", label: "Disabled · purchase blocked" }],
  });
  const visibility = AdminField({
    id: fieldId(formId, "visibility"), name: "visibility", label: "Catalog visibility", type: "select", required: true, value: item?.visibility || "visible",
    hint: "Hidden removes the item from normal Store browsing. It can remain active for administrative purposes.",
    options: [{ value: "visible", label: "Visible in Store" }, { value: "hidden", label: "Hidden from Store" }],
  });
  const sortOrder = AdminField({
    id: fieldId(formId, "sortOrder"), name: "sortOrder", label: "Display order", type: "number", required: true, value: item?.sortOrder ?? 0, step: 1, inputMode: "numeric",
    hint: "Lower numbers appear earlier. Use the row Move controls for quick reordering.",
  });

  const fields = { name, description, category, price, currencyCode, stockQuantity, status, visibility, sortOrder };
  const fieldGrid = createElement("div", {
    className: "admin-store-form__grid",
    children: [name.element, category.element, price.element, currencyCode.element, stockQuantity.element, status.element, visibility.element, sortOrder.element],
  });
  description.element.classList.add("admin-store-form__wide");
  form.append(
    validation.element,
    editing ? createElement("aside", {
      className: "admin-store-form__media-note",
      attrs: { role: "note" },
      children: [
        createElement("strong", { text: "Artwork is assigned automatically" }),
        createElement("span", { text: " Seeded and catalog artwork comes from the repository media catalog; custom Store items use the branded placeholder because custom media is not persisted by this Store contract." }),
      ],
    }) : null,
    fieldGrid,
    description.element,
  );

  const cancelButton = createElement("button", { className: "admin-button admin-button--quiet", attrs: { type: "button", "data-dialog-action": "cancel" }, text: "Cancel" });
  const submitButton = createElement("button", {
    className: "admin-button",
    attrs: { type: "submit", form: formId, "data-dialog-action": "save" },
    text: editing ? "Save changes" : "Add item",
  });
  const footer = createElement("div", { className: "admin-store-form__actions", children: [cancelButton, submitButton] });
  let busy = false;

  function clearErrors() { Object.values(fields).forEach((field) => field.setError("")); validation.setErrors([]); }
  function values() {
    return {
      name: name.getValue().trim(),
      description: description.getValue().trim() || null,
      category: category.getValue().trim().toLowerCase(),
      price: numericValue(price.getValue()),
      currencyCode: currencyCode.getValue().trim().toUpperCase(),
      stockQuantity: numericValue(stockQuantity.getValue()),
      status: status.getValue(),
      visibility: visibility.getValue(),
      sortOrder: numericValue(sortOrder.getValue()),
    };
  }
  function validate() {
    clearErrors();
    const input = values();
    const errors = [];
    if (!input.name) errors.push(fieldError(name, "Enter an item name."));
    if (!/^[a-z0-9_-]{1,32}$/.test(input.category)) errors.push(fieldError(category, "Use 1 to 32 lowercase letters, numbers, underscores, or hyphens."));
    if (input.price === null || input.price < 0) errors.push(fieldError(price, "Enter a non-negative price."));
    if (!STORE_CURRENCY_CODES.includes(input.currencyCode)) errors.push(fieldError(currencyCode, "Select a Store currency."));
    if (!Number.isSafeInteger(input.stockQuantity) || input.stockQuantity < 0) errors.push(fieldError(stockQuantity, "Enter a non-negative whole quantity."));
    if (!Number.isSafeInteger(input.sortOrder)) errors.push(fieldError(sortOrder, "Enter a whole-number display order."));
    validation.setErrors(errors, { focus: errors.length > 0 });
    return errors.length === 0 ? input : null;
  }
  function setBusy(nextBusy) {
    busy = Boolean(nextBusy);
    form.setAttribute("aria-busy", busy ? "true" : "false");
    Object.values(fields).forEach((field) => field.setDisabled(busy));
    cancelButton.disabled = busy;
    submitButton.disabled = busy;
    submitButton.textContent = busy ? (editing ? "Saving…" : "Adding…") : (editing ? "Save changes" : "Add item");
  }
  function setServerError(error) {
    const envelope = isAdminErrorEnvelope(error) ? error : normalizeAdminError(error, { fieldErrors: error?.fieldErrors });
    const serverErrors = [];
    Object.entries(envelope.fieldErrors).forEach(([fieldName, message]) => {
      const target = fields[fieldName] || (fieldName === "stock" ? stockQuantity : null);
      if (target) serverErrors.push(fieldError(target, String(message || "Review this field and try again.")));
    });
    if (!serverErrors.length) serverErrors.push({ fieldId: name.control.id, label: "Store item", message: envelope.userMessage });
    validation.setErrors(serverErrors, { focus: true });
  }

  cancelButton.addEventListener("click", onCancel);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    const input = validate();
    if (!input) return;
    setBusy(true);
    try {
      const result = await onSubmit(input);
      if (result?.ok !== true) setServerError(result?.error);
    } catch (_error) {
      setServerError(null);
    } finally {
      setBusy(false);
    }
  });

  return { element: form, footer, fields: Object.freeze(fields), cancelButton, submitButton, validate, values, setBusy, setServerError, focus() { name.focus(); } };
}

export const ADMIN_STORE_CURRENCY_CODES = STORE_CURRENCY_CODES;
