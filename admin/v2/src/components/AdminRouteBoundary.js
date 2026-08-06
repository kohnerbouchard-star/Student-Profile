import { AdminIcon } from "./AdminIcon.js";
import { appendContent, createElement, createId, replaceContent } from "./dom.js";

export function AdminRouteBoundary({
  routeId = "overview",
  mode = "source",
  content,
  legacyHref,
  legacyTitle = "Continue in the legacy admin",
  legacyMessage = "This area is still served by the existing admin while its source-owned replacement is prepared.",
  handoffLabel = "Open existing admin",
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
    if (Object.hasOwn(next, "legacyHref")) legacyHref = next.legacyHref;
    root.dataset.route = routeId;
    root.dataset.mode = mode;

    if (mode === "source") {
      replaceContent(root, typeof content === "function" ? content({ routeId }) : content);
      return;
    }

    const titleId = createId("admin-route-handoff-title");
    const handoff = createElement("section", {
      className: "admin-route-boundary__handoff",
      attrs: { "aria-labelledby": titleId },
    });
    const action = createElement(legacyHref ? "a" : "button", {
      className: "admin-button",
      attrs: {
        href: legacyHref,
        type: legacyHref ? null : "button",
      },
      children: [AdminIcon({ name: "chevronRight", size: 17 }), handoffLabel],
    });
    action.addEventListener("click", (event) => onHandoff?.({ routeId, legacyHref, event }));
    handoff.append(
      createElement("div", {
        className: "admin-route-boundary__icon",
        children: AdminIcon({ name: "logs", size: 24 }),
      }),
      createElement("h2", { attrs: { id: titleId }, text: legacyTitle }),
      createElement("p", { text: legacyMessage }),
    );
    appendContent(handoff, action);
    replaceContent(root, handoff);
  }

  render();
  return {
    element: root,
    render,
    showSource(nextContent = content) { render({ mode: "source", content: nextContent }); },
    showLegacy(nextLegacyHref = legacyHref) { render({ mode: "legacy", legacyHref: nextLegacyHref }); },
  };
}
