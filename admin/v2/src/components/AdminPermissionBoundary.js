import { AdminIcon } from "./AdminIcon.js";
import { AdminSkeleton } from "./AdminSkeleton.js";
import { appendContent, createElement, replaceContent } from "./dom.js";

export function AdminPermissionBoundary({
  allowed = false,
  pending = false,
  content,
  deniedTitle = "Access restricted",
  deniedMessage = "You do not have permission to view this area.",
  onDenied,
} = {}) {
  const root = createElement("div", { className: "admin-permission-boundary" });

  function render(nextState = {}) {
    if (Object.hasOwn(nextState, "allowed")) allowed = Boolean(nextState.allowed);
    if (Object.hasOwn(nextState, "pending")) pending = Boolean(nextState.pending);
    root.dataset.state = pending ? "pending" : allowed ? "allowed" : "denied";

    if (pending) {
      replaceContent(root, AdminSkeleton({ label: "Checking access", count: 3, shape: "panel" }));
      return;
    }

    if (allowed) {
      replaceContent(root, typeof content === "function" ? content() : content);
      return;
    }

    const denial = createElement("section", {
      className: "admin-permission-boundary__denial",
      attrs: { role: "alert", "aria-label": deniedTitle },
    });
    denial.append(
      createElement("div", { className: "admin-state__icon", children: AdminIcon({ name: "lock", size: 28 }) }),
      createElement("h2", { text: deniedTitle }),
      createElement("p", { text: deniedMessage }),
    );
    if (onDenied) {
      const button = createElement("button", {
        className: "admin-button admin-button--quiet",
        attrs: { type: "button" },
        text: "Return to overview",
      });
      button.addEventListener("click", onDenied);
      appendContent(denial, button);
    }
    replaceContent(root, denial);
  }

  render();
  return {
    element: root,
    setPermission(nextAllowed, nextPending = false) { render({ allowed: nextAllowed, pending: nextPending }); },
    setContent(nextContent) { content = nextContent; render(); },
  };
}
