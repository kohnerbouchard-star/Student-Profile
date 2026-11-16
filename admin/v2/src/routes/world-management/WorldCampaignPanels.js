import { AdminDataTable, AdminEmptyState } from "../../components/index.js";
import { createElement } from "../../components/dom.js";
import { WORLD_ARRIVAL_CLASS_IDS } from "./WorldManagementApi.js";
import { actionButton, displayNumber, displayTime, factGrid, sectionCard, statusPill, titleCase } from "./WorldViewHelpers.js";

export function campaignSection(model, { mutationsDisabled, onReviewedAction }) {
  const campaign = model.campaign.current;
  const actions = [];
  if (campaign) {
    if (campaign.status === "active") {
      actions.push(actionButton({
        label: "Pause",
        quiet: true,
        disabled: mutationsDisabled || !campaign.campaignId,
        action: "campaign-pause",
        onClick(event) {
          onReviewedAction({
            opener: event.currentTarget,
            title: "Pause World campaign",
            message: `Pause the campaign in ${titleCase(campaign.currentPhase)}?`,
            detail: "This changes the authoritative campaign lifecycle and is revision-checked by the Admin API.",
            action: () => onReviewedAction.handlers.onCampaignAction("pause"),
          });
        },
      }));
    }
    if (campaign.status === "paused") {
      actions.push(actionButton({
        label: "Resume",
        quiet: true,
        disabled: mutationsDisabled || !campaign.campaignId,
        action: "campaign-resume",
        onClick(event) {
          onReviewedAction({
            opener: event.currentTarget,
            title: "Resume World campaign",
            message: `Resume the campaign from ${titleCase(campaign.currentPhase)}?`,
            detail: "The authoritative scheduler can continue only if the campaign revision still matches.",
            action: () => onReviewedAction.handlers.onCampaignAction("resume"),
          });
        },
      }));
    }
    if (campaign.status !== "emergency_disabled") {
      actions.push(actionButton({
        label: "Emergency disable",
        danger: true,
        disabled: mutationsDisabled || !campaign.campaignId,
        action: "campaign-emergency-disable",
        onClick(event) {
          onReviewedAction({
            opener: event.currentTarget,
            title: "Emergency disable campaign",
            message: "Emergency disable the authoritative World campaign?",
            detail: "This is a high-impact lifecycle control. It does not create News or Events and requires the current campaign revision.",
            action: () => onReviewedAction.handlers.onCampaignAction("emergency_disable"),
          });
        },
      }));
    }
  }

  const historyTable = AdminDataTable({
    caption: "World campaign history",
    rows: model.campaign.history,
    rowKey: (row) => row.rowKey,
    columns: [
      {
        key: "eventKey",
        label: "Event",
        rowHeader: true,
        render: (value, row) => titleCase(value || row.toPhase, "World transition"),
      },
      {
        key: "fromPhase",
        label: "Transition",
        render: (_value, row) => `${titleCase(row.fromPhase)} → ${titleCase(row.toPhase)}`,
      },
      { key: "sequence", label: "Sequence", align: "end", render: displayNumber },
      {
        key: "reason",
        label: "Reason",
        render: (value) => value || "No reason recorded",
      },
      {
        key: "occurredAt",
        label: "Occurred",
        render: (value, row) => displayTime(value || row.createdAt),
      },
    ],
    emptyState: AdminEmptyState({
      title: "No campaign history",
      message: "No committed World campaign transitions were returned.",
      compact: true,
    }),
  });

  return sectionCard({
    id: "world-campaign",
    eyebrow: "Simulation lifecycle",
    title: campaign
      ? `${titleCase(campaign.currentPhase)} · ${titleCase(campaign.status)}`
      : "No campaign initialized",
    description: "Only existing pause, resume, and emergency-disable controls are exposed. Manual event/news generation is intentionally excluded.",
    actions,
    children: [
      factGrid([
        ["Campaign revision", campaign ? displayNumber(campaign.revision) : "—"],
        ["Scheduled", campaign ? displayTime(campaign.scheduledAt) : "—"],
        ["Scheduler due", displayNumber(model.campaign.scheduler.due)],
        ["Active campaigns", displayNumber(model.campaign.scheduler.active)],
        ["Paused campaigns", displayNumber(model.campaign.scheduler.paused)],
        ["Emergency disabled", displayNumber(model.campaign.scheduler.emergencyDisabled)],
      ]),
      createElement("div", {
        className: "admin-world-route__table admin-world-route__table--history",
        children: historyTable.element,
      }),
    ],
  });
}

export function effectsSection(model, { mutationsDisabled, onReviewedAction }) {
  const table = AdminDataTable({
    caption: "Durable World effects",
    rows: model.effects,
    rowKey: (row) => row.rowKey,
    columns: [
      {
        key: "effectKind",
        label: "Effect",
        rowHeader: true,
        render: (value) => titleCase(value),
      },
      { key: "status", label: "State", render: statusPill },
      { key: "attemptCount", label: "Attempts", align: "end", render: displayNumber },
      {
        key: "lastErrorCode",
        label: "Last error",
        render: (value) => value ? titleCase(value) : "—",
      },
      {
        key: "actions",
        label: "Actions",
        align: "end",
        render: (_value, effect) => {
          if (effect.status !== "failed") return "No action required";
          return actionButton({
            label: "Recover",
            quiet: true,
            disabled: mutationsDisabled || !effect.effectId,
            action: "effect-recover",
            onClick(event) {
              onReviewedAction({
                opener: event.currentTarget,
                title: "Recover failed World effect",
                message: `Retry the failed ${titleCase(effect.effectKind)} effect?`,
                detail: "Recovery uses the existing bounded, idempotent World effect-recovery contract.",
                action: () => onReviewedAction.handlers.onRecoverEffect(effect),
              });
            },
          });
        },
      },
    ],
    emptyState: AdminEmptyState({
      title: "No World effects",
      message: "No durable effect commands were returned for the selected game.",
      compact: true,
    }),
  });

  return sectionCard({
    id: "world-effects",
    eyebrow: "Simulation effects",
    title: `${displayNumber(model.effects.length)} effect commands`,
    description: `${displayNumber(model.summary.failedEffectCount)} failed effects require review. Effect payloads and News content are not displayed here.`,
    children: [createElement("div", {
      className: "admin-world-route__table admin-world-route__table--effects",
      children: table.element,
    })],
  });
}

export function arrivalsSection(model, { mutationsDisabled, onReviewedAction }) {
  const table = AdminDataTable({
    caption: "Arrival Class assignments",
    rows: model.arrivals,
    rowKey: (row) => row.rowKey,
    columns: [
      {
        key: "countryId",
        label: "Country",
        rowHeader: true,
        render: (value) => titleCase(value),
      },
      {
        key: "classId",
        label: "Arrival Class",
        render: (value, assignment) => {
          const select = createElement("select", {
            className: "admin-world-route__select",
            attrs: {
              "aria-label": `Arrival Class for ${titleCase(assignment.countryId)}`,
              disabled: mutationsDisabled || !assignment.assignmentId,
            },
          });
          WORLD_ARRIVAL_CLASS_IDS.forEach((classId) => {
            const option = createElement("option", {
              attrs: { value: classId },
              text: titleCase(classId),
            });
            option.selected = classId === assignment.classId;
            select.append(option);
          });
          return select;
        },
      },
      { key: "source", label: "Source", render: (value) => titleCase(value) },
      { key: "revision", label: "Revision", align: "end", render: displayNumber },
      {
        key: "actions",
        label: "Actions",
        align: "end",
        render: (_value, assignment, rowIndex) => actionButton({
          label: "Correct",
          quiet: true,
          disabled: mutationsDisabled || !assignment.assignmentId,
          action: "arrival-correct",
          onClick(event) {
            const row = event.currentTarget.closest("tr");
            const select = row?.querySelector("select");
            const nextClass = String(select?.value || "").trim();
            if (!nextClass || nextClass === assignment.classId) return;
            onReviewedAction({
              opener: event.currentTarget,
              title: "Correct Arrival Class",
              message: `Change ${titleCase(assignment.countryId)} assignment from ${titleCase(assignment.classId)} to ${titleCase(nextClass)}?`,
              detail: `This revision-checked correction applies only to the authoritative assignment represented by row ${rowIndex + 1}.`,
              action: () => onReviewedAction.handlers.onCorrectArrival(assignment, nextClass),
            });
          },
        }),
      },
    ],
    emptyState: AdminEmptyState({
      title: "No Arrival Class assignments",
      message: "No initialized Arrival Class assignments were returned.",
      compact: true,
    }),
  });

  return sectionCard({
    eyebrow: "Arrival configuration",
    title: `${displayNumber(model.arrivals.length)} assignments`,
    description: "Corrections use only the eight Arrival Classes already accepted by the World Admin contract.",
    children: [createElement("div", {
      className: "admin-world-route__table admin-world-route__table--arrivals",
      children: table.element,
    })],
  });
}
