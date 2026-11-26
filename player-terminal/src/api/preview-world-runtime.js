function previewLocations() {
  const countries = ["northreach", "yrethia", "thaloris", "solvend", "eldoran", "valerion", "lumenor", "xalvoria", "dravenlok", "syndalis"];
  return countries.flatMap((countryId) => ["capital", "city", "port", "airport", "meridian"].map((kind) => ({
    publicLocationId: `loc_${countryId}_${kind}_v1`,
    availability: "normal",
    revision: 0,
  })));
}

export function createPreviewWorldRuntime() {
  return {
    campaign: {
      status: "active",
      phase: "opportunity",
      outcome: null,
      sequence: 2,
      currentLocationAffected: false,
      history: [
        { eventKey: "arrival-orientation", fromPhase: "arrival", toPhase: "opportunity", occurredAt: "2026-07-21T08:00:00.000Z", summary: "Arrival orientation completed." }
      ]
    },
    arrival: {
      required: true,
      questionnaire: {
        questionnaireId: "arrival-class-balanced-v1",
        version: "1.0.0",
        questions: Array.from({ length: 6 }, (_, index) => ({
          questionId: `preference-${index + 1}`,
          prompt: `Which approach best matches preference ${index + 1}?`,
          options: [
            { optionId: `analyze-${index + 1}`, label: "Review evidence and compare outcomes." },
            { optionId: `build-${index + 1}`, label: "Build a practical solution." }
          ]
        }))
      },
      assignment: null
    },
    travel: {
      state: {
        currentLocationId: "loc_eldoran_capital_v1",
        status: "available",
        activeJourneyId: null,
        arrivalAt: null,
        revision: 0,
        updatedAt: "2026-07-21T08:00:00.000Z"
      },
      activeJourney: null
    },
    residency: {
      currentCountryId: "eldoran",
      currencyCode: "ELD",
      eligibleCountryIds: ["valerion", "solvend"],
      pendingCountryId: null,
      revision: 0,
      updatedAt: "2026-07-21T08:00:00.000Z"
    },
    world: {
      revision: 1,
      locations: previewLocations(),
      routes: [
        ["rte_eldoran_valerion_land_v1", "open", "normal"],
        ["rte_eldoran_solvend_air_v1", "open", "normal"],
        ["rte_eldoran_valerion_sea_v1", "restricted", "shortage"],
        ["rte_eldoran_syndalis_meridian_v1", "open", "normal"]
      ].map(([publicRouteId, status, reason], index) => ({
        publicRouteId, status, reason,
        costMultiplierBasisPoints: index === 2 ? 12000 : 10000,
        durationMultiplierBasisPoints: index === 2 ? 14000 : 10000,
        revision: 0
      }))
    }
  };
}
