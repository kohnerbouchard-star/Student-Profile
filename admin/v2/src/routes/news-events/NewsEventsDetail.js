import { AdminDrawer, AdminField } from "../../components/index.js";
import { createElement } from "../../components/dom.js";
import { formatTime, safeText, statusBadge, titleCase, typeBadge } from "./NewsEventsViewHelpers.js";

function detailPair(label, value) {
  return createElement("div", {
    children: [
      createElement("dt", { text: label }),
      createElement("dd", { text: safeText(value, "Not available", 1_000) }),
    ],
  });
}

export function openDetail(row, onRecover, trigger) {
  const isNews = row.type === "news";
  const pairs = isNews
    ? [
      detailPair("Definition", row.newsDefinitionId),
      detailPair("Published content", "The current read model does not expose the rendered headline/body."),
      detailPair("Audience", titleCase(row.audience)),
      detailPair("Publication status", titleCase(row.status)),
      detailPair("Attempts", String(row.attemptCount ?? 0)),
      detailPair("Last delivery error", row.lastErrorCode ? titleCase(row.lastErrorCode) : "None reported"),
      detailPair("Created", formatTime(row.createdAt)),
      detailPair("Claimed", formatTime(row.claimedAt)),
      detailPair("Completed", formatTime(row.completedAt)),
    ]
    : [
      detailPair("Event key", row.eventKey),
      detailPair("Transition", `${titleCase(row.fromPhase)} → ${titleCase(row.toPhase)}`),
      detailPair("Sequence", row.sequence == null ? "Not available" : String(row.sequence)),
      detailPair("Actor", titleCase(row.actorType)),
      detailPair("Trigger", row.triggerKey || "Not exposed"),
      detailPair("Reason", row.reason || "No reason exposed"),
      detailPair("Occurred", formatTime(row.occurredAt)),
    ];

  const content = createElement("div", {
    className: "admin-news-events__detail",
    children: [
      createElement("div", {
        className: "admin-news-events__detail-badges",
        children: [typeBadge(row.type), statusBadge(row.status)],
      }),
      createElement("dl", { className: "admin-news-events__detail-grid", children: pairs }),
    ],
  });

  if (isNews && row.status === "failed") {
    const reason = AdminField({
      name: `news-recovery-reason-${row.rowKey}`,
      label: "Recovery reason",
      type: "textarea",
      required: true,
      hint: "Required by the authoritative recovery contract. Use 12–1,000 characters.",
      placeholder: "Explain why this failed publication should be retried.",
      autocomplete: "off",
    });
    reason.control.maxLength = 1_000;
    reason.control.minLength = 12;
    reason.control.rows = 5;
    const recover = createElement("button", {
      className: "admin-button",
      attrs: { type: "button" },
      text: "Recover failed publication",
    });
    recover.addEventListener("click", async () => {
      const value = reason.getValue().trim();
      if (value.length < 12) {
        reason.setError("Enter at least 12 characters explaining the recovery.");
        reason.focus();
        return;
      }
      reason.setError("");
      recover.disabled = true;
      const succeeded = await onRecover(row.rowKey, value);
      if (!succeeded) recover.disabled = false;
      else drawer.close();
    });
    content.append(createElement("section", {
      className: "admin-news-events__recovery",
      attrs: { "aria-label": "Failed news publication recovery" },
      children: [
        createElement("h3", { text: "Supported recovery action" }),
        createElement("p", { text: "This retries the existing failed campaign effect. It does not create or edit a news item." }),
        reason.element,
        recover,
      ],
    }));
  }

  const drawer = AdminDrawer({
    title: isNews ? "News publication detail" : "World event detail",
    description: safeText(row.title, isNews ? "News publication" : "World event", 320),
    content,
  });
  drawer.element.addEventListener("admin-dialog-close", () => drawer.destroy(), { once: true });
  drawer.open(trigger);
}
