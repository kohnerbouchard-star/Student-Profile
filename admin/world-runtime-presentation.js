window.createWorldRuntimePresentation = function createWorldRuntimePresentation(ownerScope) {
  "use strict";

  const {
    section, title, factGrid, node, button, mutate, publicId, refreshConsole, recordList, text, ROOT_ID,
    PHASES, api, requestId, announce, CLASS_IDS,
  } = ownerScope;


  function renderCampaign(data) {
    const campaigns = Array.isArray(data.campaign?.campaigns)
      ? data.campaign.campaigns
      : [];
    const current = campaigns[0] || null;
    const scheduler = data.campaign?.scheduler || {};
    const history = Array.isArray(data.history?.history)
      ? data.history.history
      : [];
    const panel = section(
      "CAMPAIGN CONTROL",
      current ? title(current.current_phase) : "No campaign",
    );
    panel.append(factGrid([
      ["Status", current ? title(current.status) : "Not initialized"],
      ["Revision", current?.revision ?? 0],
      ["Scheduler due", scheduler.due ?? 0],
      ["Active", scheduler.active ?? 0],
      ["Paused", scheduler.paused ?? 0],
      ["Disabled", scheduler.emergencyDisabled ?? 0],
    ]));
    const controls = node("div", { className: "admin-world-controls" });
    if (current) {
      for (const action of ["pause", "resume", "emergency_disable"]) {
        const control = button(
          title(action),
          () => void mutate(
            control,
            "/campaign/control",
            {
              action,
              campaignId: publicId(current),
              correctedPhase: null,
              expectedRevision: Number(current.revision),
              reason:
                `Administrator ${title(action)} from the World operations console.`,
            },
            `${title(action)} committed and audited.`,
          ),
          {
            danger: action === "emergency_disable",
            disabled: action === "pause"
              ? current.status !== "active"
              : action === "resume"
              ? current.status !== "paused"
              : current.status === "emergency_disabled",
          },
        );
        controls.append(control);
      }
      controls.append(button(
        "Manual trigger",
        () => openManualTrigger(current),
        { secondary: true, disabled: current.status !== "active" },
      ));
    }
    controls.append(button("Refresh", () => void refreshConsole(), {
      secondary: true,
    }));
    panel.append(controls);
    panel.append(recordList(
      history,
      (row) => node("article", {}, [
        node("strong", { text: title(row.event_key || row.to_phase) }),
        node("small", { text: text(row.occurred_at || row.created_at, "Current") }),
        node("p", {
          text: text(
            row.reason,
            `${title(row.from_phase)} to ${title(row.to_phase)}`,
          ),
        }),
      ]),
      "No committed campaign history.",
    ));
    return panel;
  }

  function openManualTrigger(campaign) {
    const panel = document.querySelector(`#${ROOT_ID} .admin-world-section`);
    if (!panel || panel.querySelector(".admin-world-inline-form")) return;
    const form = node("form", {
      className: "admin-world-inline-form",
      attributes: { "aria-label": "Manual campaign trigger" },
    });
    const eventInput = node("input", {
      id: "adminWorldManualEventKey",
      attributes: {
        name: "eventKey",
        required: "",
        pattern: "[a-z0-9][a-z0-9._:-]*",
        placeholder: "manual-world-event",
      },
    });
    const phaseSelect = node("select", {
      id: "adminWorldManualNextPhase",
      attributes: { name: "nextPhase" },
    });
    const currentIndex = PHASES.indexOf(campaign.current_phase);
    const candidates = currentIndex >= 0
      ? PHASES.slice(currentIndex + 1, currentIndex + 3)
      : PHASES.slice(1, 3);
    for (const phase of candidates) {
      phaseSelect.append(node("option", { value: phase, text: title(phase) }));
    }
    const submit = node("button", {
      className: "admin-world-button",
      text: "Trigger reviewed notification event",
      type: "submit",
    });
    form.append(
      node("label", {
        text: "Event key",
        attributes: { for: eventInput.id },
      }),
      eventInput,
      node("label", {
        text: "Next phase",
        attributes: { for: phaseSelect.id },
      }),
      phaseSelect,
      submit,
    );
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      submit.disabled = true;
      try {
        await api("/campaign/manual-trigger", {
          method: "POST",
          body: {
            campaignId: publicId(campaign),
            completeCampaign: false,
            effects: [{
              effectKind: "notify_players",
              payload: {
                audience: "all_players",
                notificationDefinitionId:
                  "notification.world.manual-update.v1",
              },
            }],
            eventKey: eventInput.value.trim(),
            expectedPhase: campaign.current_phase,
            expectedRevision: Number(campaign.revision),
            nextPhase: phaseSelect.value,
            nextScheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
            prerequisiteEventKeys: [],
            reason: "Administrator initiated a reviewed World event.",
            requestId: requestId("manual.trigger"),
          },
        });
        form.remove();
        await refreshConsole("Manual campaign event committed and audited.");
      } catch (error) {
        announce(error?.message || "Manual trigger failed.", true);
        submit.disabled = false;
      }
    });
    panel.prepend(form);
    eventInput.focus();
  }

  function renderEffects(data) {
    const effects = Array.isArray(data.effects?.effects)
      ? data.effects.effects
      : [];
    const panel = section("DURABLE EFFECTS", "Effect recovery");
    panel.append(factGrid(
      Object.entries(data.effects?.summary || {}).map(([key, value]) => [
        title(key),
        value,
      ]),
    ));
    panel.append(recordList(
      effects,
      (effect) => {
        const article = node("article", {}, [
          node("strong", { text: title(effect.effect_kind) }),
          node("small", {
            text: `${title(effect.status)} · ${text(effect.public_id)}`,
          }),
          node("p", {
            text: text(effect.last_error_code, "No recorded error"),
          }),
        ]);
        if (effect.status === "failed") {
          const recover = button("Recover effect", () => void mutate(
            recover,
            `/campaign/effects/${encodeURIComponent(publicId(effect))}/recover`,
            {
              reason: "Administrator requested bounded effect recovery.",
              requestId: requestId("effect.recovery"),
            },
            "Effect recovery committed and audited.",
          ));
          article.append(recover);
        }
        return article;
      },
      "No effect commands are present.",
    ));
    return panel;
  }

  function renderArrivals(data) {
    const assignments = Array.isArray(data.arrivals?.assignments)
      ? data.arrivals.assignments
      : [];
    const panel = section("ARRIVAL CLASS", "Review and correction");
    panel.append(recordList(
      assignments,
      (assignment) => {
        const article = node("article", {}, [
          node("strong", { text: title(assignment.class_id) }),
          node("small", {
            text:
              `${title(assignment.country_id)} · revision ${text(assignment.revision, "0")}`,
          }),
          node("p", {
            text: text(assignment.override_reason, title(assignment.source)),
          }),
        ]);
        const selectId = `adminWorldClass-${publicId(assignment)}`;
        const select = node("select", {
          id: selectId,
          attributes: {
            "aria-label": `Correct Arrival Class ${publicId(assignment)}`,
          },
        });
        for (const classId of CLASS_IDS) {
          const option = node("option", {
            value: classId,
            text: title(classId),
          });
          option.selected = classId === assignment.class_id;
          select.append(option);
        }
        const correct = button("Correct class", () => void mutate(
          correct,
          `/arrival-classes/${encodeURIComponent(publicId(assignment))}/correct`,
          {
            classId: select.value,
            expectedRevision: Number(assignment.revision),
            reason:
              "Administrator corrected the session-scoped Arrival Class after review.",
            requestId: requestId("arrival.correction"),
          },
          "Arrival Class correction committed and audited.",
        ), { secondary: true });
        article.append(
          node("label", {
            text: "Corrected class",
            attributes: { for: selectId },
          }),
          select,
          correct,
        );
        return article;
      },
      "No Arrival Class assignments.",
    ));
    return panel;
  }

  function renderGeography(data) {
    const runtime = data.geography?.runtime || null;
    const locations = Array.isArray(data.geography?.locations)
      ? data.geography.locations
      : [];
    const routes = Array.isArray(data.geography?.routes)
      ? data.geography.routes
      : [];
    const panel = section(
      "GEOGRAPHY",
      `${locations.length} locations · ${routes.length} routes`,
    );
    panel.append(factGrid([
      ["World revision", runtime?.revision ?? 0],
      ["Pack", runtime?.pack_id],
      ["Version", runtime?.pack_version],
      ["Updated", runtime?.updated_at],
    ]));
    panel.append(recordList(
      routes.slice(0, 100),
      (route) => {
        const article = node("article", {}, [
          node("strong", { text: text(route.public_route_id) }),
          node("small", {
            text:
              `${title(route.mode)} · ${title(route.status)} · ${title(route.reason)}`,
          }),
          node("p", {
            text:
              `${text(route.from_location_id)} → ${text(route.to_location_id)}`,
          }),
        ]);
        const closing = route.status !== "closed";
        const toggle = button(
          closing ? "Close route" : "Reopen route",
          () => void mutate(
            toggle,
            "/routes/state",
            {
              costMultiplierBasisPoints: 10_000,
              durationMultiplierBasisPoints: 10_000,
              expectedRevision: Number(runtime?.revision || 0),
              reason: closing ? "war" : "recovery",
              requestId: requestId("route.state"),
              routeIds: [route.public_route_id],
              status: closing ? "closed" : "open",
            },
            `Route ${closing ? "closure" : "reopening"} committed and audited.`,
          ),
          { secondary: true },
        );
        article.append(toggle);
        return article;
      },
      "No routes are initialized.",
    ));
    return panel;
  }

  function renderTravel(data) {
    const states = Array.isArray(data.travel?.states)
      ? data.travel.states
      : [];
    const journeys = Array.isArray(data.travel?.journeys)
      ? data.travel.journeys
      : [];
    const panel = section(
      "TRAVEL OVERSIGHT",
      `${states.length} players · ${journeys.length} journeys`,
    );
    panel.append(recordList(
      journeys,
      (journey) => {
        const majorCost = (
          Number(journey.total_cost_minor ?? 0) / 100
        ).toFixed(2);
        return node("article", {}, [
          node("strong", {
            text:
              `${text(journey.from_location_id)} → ${text(journey.to_location_id)}`,
          }),
          node("small", {
            text: `${title(journey.status)} · ${text(journey.public_id)}`,
          }),
          node("p", {
            text:
              `${text(journey.currency_code)} ${majorCost} · ${text(journey.total_duration_minutes, "0")} minutes`,
          }),
        ]);
      },
      "No travel journeys have been recorded.",
    ));
    return panel;
  }

  function renderResidency(data) {
    const rows = Array.isArray(data.residency?.residency)
      ? data.residency.residency
      : [];
    const panel = section("RESIDENCY OVERSIGHT", `${rows.length} records`);
    panel.append(recordList(
      rows,
      (row) => node("article", {}, [
        node("strong", { text: title(row.current_country_id) }),
        node("small", {
          text:
            `${text(row.currency_code)} · revision ${text(row.revision, "0")}`,
        }),
        node("p", {
          text: row.pending_country_id
            ? `Pending request: ${title(row.pending_country_id)}`
            : "No pending residency request",
        }),
      ]),
      "No residency records have been initialized.",
    ));
    return panel;
  }

  function renderSnapshot(data) {
    return node("div", { className: "admin-world-grid" }, [
      renderCampaign(data),
      renderEffects(data),
      renderArrivals(data),
      renderGeography(data),
      renderTravel(data),
      renderResidency(data),
    ]);
  }

  return {
    renderCampaign, openManualTrigger, renderEffects, renderArrivals, renderGeography, renderTravel,
    renderResidency, renderSnapshot,
  };
};
