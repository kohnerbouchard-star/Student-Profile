import { AdminEmptyState, AdminPageFrame } from "../../components/index.js";
import { createElement } from "../../components/dom.js";

const BLOCKER = "The current Admin/BFF exposes loan products and loan applications, but it has no browser-safe supervisory read contract for outstanding loans and repayment history. Loans V2 cannot display authoritative portfolio data until that contract exists outside this UI migration.";

export function LoansRoute() {
  const status = AdminEmptyState({
    title: "Loan supervision is not configured",
    message: BLOCKER,
  });
  const note = createElement("p", {
    className: "admin-u-muted",
    text: "No lending endpoint, settlement behavior, or Cash compatibility is implemented by this route. Banking remains a separate Admin domain.",
  });
  const content = createElement("div", {
    className: "admin-u-stack",
    children: [status, note],
  });
  const frame = AdminPageFrame({
    eyebrow: "Economy supervision",
    title: "Loans",
    description: "Authoritative loan supervision will appear here when the existing Admin/BFF provides a safe portfolio read contract.",
    content,
  });
  frame.element.dataset.implementationStatus = "not_configured";
  return Object.freeze({
    element: frame.element,
    destroy() {},
  });
}
