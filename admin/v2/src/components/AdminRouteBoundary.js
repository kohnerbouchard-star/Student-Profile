import { AdminIcon } from "./AdminIcon.js";
import { appendContent, createElement, createId, replaceContent } from "./dom.js";

export function AdminRouteBoundary({
  routeId = "overview",
  mode = "source",
  content,
  icon = "info",
  legacyHref,
  legacyTitle = "Continue in the legacy admin",
  legacyMessage = "This area is still served by the existing admin while its source-owned replacement is prepared.",
  plannedTitle = "Admin v2 destination planned",
  plannedMessage = "This domain is part of the Admin product, but its source-owned v2 surface has not migrated yet.",
  handoffLabel = "Open existing Admin",
  onHandoff,
} = {}) {
  const root = createElement("div", {
    className: "admin-route-boundary",
    dataset: { route: routeId, mode },
  });

  function render(next = {}) {
    if (Object.hasOwn(next, "routeId")) routeId = next.routeId;
    if (Object.hasOwn(next, "mode")) mode = next.mode;
    if (Object.hasOwn(next, "content")) content = next.content;
    if (Object.hasOwn(next, "icon")) icon = next.icon;
    if (Object.hasOwn(next, "legacyHref")) legacyHref = next.legacyHref;
    root.dataset.route = routeId;
    root.dataset.mode = mode;

    if (mode === "source") {
      replaceContent(root, typeof content === "function" ? content({ routeId }) : content);
      return;
    }

    const planned = mode === "planned";
    const titleId = createId(`admin-route-${planned ? "planned" : "handoff"}-title`);
    const panel = createElement("section", {
      className: `admin-route-boundary__handoff${planned ? " admin-route-boundary__handoff--planned" : ""}`,
      attrs: { "aria-labelledby": titleId },
    });
    panel.append(
      createElement("div", {
        className: "admin-route-boundary__icon",
        children: AdminIcon({ name: icon, size: 24 }),
      }),
      createElement("h2", { attrs: { id: titleId }, text: planned ? plannedTitle : legacyTitle }),
      createElement("p", { text: planned ? plannedMessage : legacyMessage }),
    );
    if (!planned && legacyHref) {
      const action = createElement("a", {
        className: "admin-button",
        attrs: { href: legacyHref },
        children: [AdminIcon({ name: "chevronRight", size: 17 }), handoffLabel],
      });
      action.addEventListener("click", (event) => onHandoff?.({ routeId, legacyHref, event }));
      appendContent(panel, action);
    }
    replaceContent(root, panel);
  }

  render();
  return {
    element: root,
    render,
    showSource(nextContent = content) { render({ mode: "source", content: nextContent }); },
    showLegacy(nextLegacyHref = legacyHref) { render({ mode: "legacy", legacyHref: nextLegacyHref }); },
    showPlanned() { render({ mode: "planned", legacyHref: null }); },
  };
}
