import { AdminDataTable, AdminEmptyState } from "../../components/index.js";
import { createElement } from "../../components/dom.js";
import { actionButton, displayBasisPoints, displayMinor, displayNumber, displayTime, sectionCard, statusPill, titleCase } from "./WorldViewHelpers.js";

export function geographySection(model, { mutationsDisabled, onReviewedAction }) {
  const locationNames = new Map(
    model.geography.locations.map((location) => [location.locationId, location.displayName]),
  );
  const locationsTable = AdminDataTable({
    caption: "World locations",
    rows: model.geography.locations,
    rowKey: (row) => row.rowKey,
    columns: [
      {
        key: "displayName",
        label: "Location",
        rowHeader: true,
      },
      { key: "countryId", label: "Country", render: (value) => titleCase(value) },
      { key: "locationKind", label: "Type", render: (value) => titleCase(value) },
      { key: "availability", label: "Availability", render: statusPill },
      { key: "revision", label: "Revision", align: "end", render: displayNumber },
    ],
    emptyState: AdminEmptyState({
      title: "No locations initialized",
      message: "The selected game has no authoritative World locations.",
      compact: true,
    }),
  });

  const routesTable = AdminDataTable({
    caption: "World routes",
    rows: model.geography.routes,
    rowKey: (row) => row.rowKey,
    columns: [
      {
        key: "fromLocationId",
        label: "Route",
        rowHeader: true,
        render: (_value, route) => {
          const from = locationNames.get(route.fromLocationId) || titleCase(route.fromLocationId);
          const to = locationNames.get(route.toLocationId) || titleCase(route.toLocationId);
          return `${from} → ${to}`;
        },
      },
      { key: "mode", label: "Mode", render: (value) => titleCase(value) },
      { key: "status", label: "State", render: statusPill },
      { key: "baseCostMinor", label: "Base cost", align: "end", render: displayMinor },
      {
        key: "baseDurationMinutes",
        label: "Base duration",
        align: "end",
        render: (value) => Number.isFinite(Number(value)) ? `${displayNumber(value)} min` : "—",
      },
      {
        key: "costMultiplierBasisPoints",
        label: "Cost factor",
        align: "end",
        render: displayBasisPoints,
      },
      {
        key: "actions",
        label: "Actions",
        align: "end",
        render: (_value, route) => {
          const reopening = route.status === "closed";
          return actionButton({
            label: reopening ? "Reopen" : "Close",
            quiet: true,
            danger: !reopening,
            disabled: mutationsDisabled || !model.runtime || !route.routeId,
            disabledReason: mutationsDisabled
              ? "Refresh World state before changing routes so the operation uses the latest revision."
              : !model.runtime
                ? "World runtime metadata is unavailable."
                : !route.routeId ? "This route has no actionable reference." : "",
            action: reopening ? "route-reopen" : "route-close",
            onClick(event) {
              const from = locationNames.get(route.fromLocationId) || titleCase(route.fromLocationId);
              const to = locationNames.get(route.toLocationId) || titleCase(route.toLocationId);
              onReviewedAction({
                opener: event.currentTarget,
                title: reopening ? "Reopen World route" : "Close World route",
                message: `${reopening ? "Reopen" : "Close"} ${from} → ${to}?`,
                detail: reopening
                  ? "The existing contract restores the route to open with recovery reason and neutral multipliers."
                  : "The existing contract closes the route with war reason and neutral multipliers.",
                action: () => onReviewedAction.handlers.onToggleRoute(route),
              });
            },
          });
        },
      },
    ],
    emptyState: AdminEmptyState({
      title: "No routes initialized",
      message: "The selected game has no authoritative World routes.",
      compact: true,
    }),
  });

  return sectionCard({
    id: "world-geography",
    eyebrow: "Geography & movement",
    title: `${displayNumber(model.geography.locations.length)} locations · ${displayNumber(model.geography.routes.length)} routes`,
    description: "Route close/reopen is the only geography mutation currently exposed because it already exists in the World Admin contract.",
    children: [
      createElement("div", {
        className: "admin-world-route__table admin-world-route__table--locations",
        children: locationsTable.element,
      }),
      createElement("div", {
        className: "admin-world-route__table admin-world-route__table--routes",
        children: routesTable.element,
      }),
    ],
  });
}

export function travelSection(model) {
  const locationNames = new Map(
    model.geography.locations.map((location) => [location.locationId, location.displayName]),
  );
  const table = AdminDataTable({
    caption: "World travel journeys",
    rows: model.travel.journeys,
    rowKey: (row) => row.rowKey,
    columns: [
      {
        key: "fromLocationId",
        label: "Journey",
        rowHeader: true,
        render: (_value, journey) => {
          const from = locationNames.get(journey.fromLocationId) || titleCase(journey.fromLocationId);
          const to = locationNames.get(journey.toLocationId) || titleCase(journey.toLocationId);
          return `${from} → ${to}`;
        },
      },
      { key: "status", label: "State", render: statusPill },
      { key: "currencyCode", label: "Currency", render: (value) => value || "—" },
      {
        key: "totalCostMinor",
        label: "Cost",
        align: "end",
        render: (value, journey) => {
          const cost = displayMinor(value);
          return journey.currencyCode && cost !== "—"
            ? `${cost} · ${journey.currencyCode}`
            : cost;
        },
      },
      {
        key: "totalDurationMinutes",
        label: "Duration",
        align: "end",
        render: (value) => Number.isFinite(Number(value)) ? `${displayNumber(value)} min` : "—",
      },
      {
        key: "arrivalAt",
        label: "Arrival",
        render: displayTime,
      },
    ],
    emptyState: AdminEmptyState({
      title: "No travel journeys",
      message: "No authoritative player journeys were returned for World supervision.",
      compact: true,
    }),
  });

  return sectionCard({
    id: "world-travel",
    eyebrow: "Travel oversight",
    title: `${displayNumber(model.travel.states.length)} travel states · ${displayNumber(model.travel.journeys.length)} journeys`,
    description: "Review aggregate travel state. Player identity details remain protected on this operational view.",
    children: [createElement("div", {
      className: "admin-world-route__table admin-world-route__table--travel",
      children: table.element,
    })],
  });
}

export function residencySection(model) {
  const table = AdminDataTable({
    caption: "World residency states",
    rows: model.residency,
    rowKey: (row) => row.rowKey,
    columns: [
      {
        key: "currentCountryId",
        label: "Current country",
        rowHeader: true,
        render: (value) => titleCase(value),
      },
      { key: "currencyCode", label: "Currency", render: (value) => value || "—" },
      {
        key: "pendingCountryId",
        label: "Pending move",
        render: (value) => value ? titleCase(value) : "None",
      },
      {
        key: "eligibleCountryIds",
        label: "Eligible countries",
        render: (value) => Array.isArray(value) && value.length
          ? value.map((item) => titleCase(item)).join(", ")
          : "—",
      },
      { key: "revision", label: "Revision", align: "end", render: displayNumber },
      { key: "updatedAt", label: "Updated", render: displayTime },
    ],
    emptyState: AdminEmptyState({
      title: "No residency records",
      message: "No authoritative residency state was returned.",
      compact: true,
    }),
  });

  return sectionCard({
    eyebrow: "Residency oversight",
    title: `${displayNumber(model.residency.length)} residency records`,
    description: "Current, pending, and eligible country state is read-only here. Residency changes are not supported by this management surface.",
    children: [createElement("div", {
      className: "admin-world-route__table admin-world-route__table--residency",
      children: table.element,
    })],
  });
}
