import { previewData } from "../data/preview-data.js";
import { ApiConnectionPendingError } from "./errors.js";

const READ_KEY_MAP = Object.freeze({
  session: "session",
  dashboard: "dashboard",
  countries: "countries",
  news: "news",
  worldRuntime: "worldRuntime",
  market: "market",
  portfolio: "portfolio",
  business: "business",
  store: "store",
  marketplace: "marketplace",
  contracts: "contracts",
  inventory: "inventory",
  crafting: "crafting",
  banking: "banking",
  loans: "loans",
  messages: "messages",
  progression: "progression",
  notifications: "notifications"
});

function clone(value) {
  return globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function previewLocations() {
  const countries = ["northreach", "yrethia", "thaloris", "solvend", "eldoran", "valerion", "lumenor", "xalvoria", "dravenlok", "syndalis"];
  return countries.flatMap((countryId) => ["capital", "city", "port", "airport", "meridian"].map((kind) => ({
    publicLocationId: `loc_${countryId}_${kind}_v1`,
    availability: "normal",
    revision: 0,
  })));
}

function createPreviewWorldRuntime() {
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

export class PreviewTransport {
  constructor({ simulateWrites = false } = {}) {
    this.simulateWrites = simulateWrites;
    this.worldRuntime = createPreviewWorldRuntime();
  }

  async request({ endpointKey, method, path, payload }) {
    await delay(method === "GET" ? 80 : 180);

    if (method === "GET") {
      if (endpointKey === "worldRuntime") return clone(this.worldRuntime);
      const key = READ_KEY_MAP[endpointKey];
      if (!(key in previewData)) throw new Error(`Preview data is not defined for ${endpointKey}`);
      return clone(previewData[key]);
    }

    if (!this.simulateWrites) throw new ApiConnectionPendingError({ endpointKey, method, path, payload });

    if (endpointKey === "arrivalClass") {
      this.worldRuntime.arrival = {
        required: false,
        questionnaire: null,
        assignment: {
          classId: "analyst",
          source: "questionnaire",
          countryId: "eldoran",
          revision: 0,
          explanation: "Selected Analyst from the explainable preference score.",
          scores: [{ classId: "analyst", total: 14 }, { classId: "builder", total: 10 }],
          economicRestrictions: []
        }
      };
      return { arrival: clone(this.worldRuntime.arrival) };
    }
    if (endpointKey === "travelQuote") {
      return { quote: {
        publicQuoteId: "trq_00000000000000000000000000000001",
        fromLocationId: this.worldRuntime.travel.state.currentLocationId,
        toLocationId: payload.toLocationId,
        currencyCode: this.worldRuntime.residency.currencyCode,
        totalCostMinor: 125,
        totalDurationMinutes: 45,
        legs: [{
          publicRouteId: "rte_eldoran_valerion_land_v1",
          fromLocationId: this.worldRuntime.travel.state.currentLocationId,
          toLocationId: payload.toLocationId,
          mode: payload.allowedModes[0],
          costMinor: 125,
          durationMinutes: 45,
          routeRevision: 0
        }],
        routeStateRevision: this.worldRuntime.world.revision,
        status: "created",
        expiresAt: new Date(Date.now() + 120000).toISOString()
      } };
    }
    if (endpointKey === "travelExecute") {
      const journey = {
        publicJourneyId: "trj_00000000000000000000000000000001",
        publicQuoteId: payload.quoteId,
        fromLocationId: this.worldRuntime.travel.state.currentLocationId,
        toLocationId: "loc_valerion_capital_v1",
        currencyCode: this.worldRuntime.residency.currencyCode,
        totalCostMinor: 125,
        totalDurationMinutes: 45,
        status: "in_transit",
        departedAt: new Date().toISOString(),
        arrivalAt: new Date(Date.now() + 2700000).toISOString(),
        completedAt: null
      };
      this.worldRuntime.travel = {
        state: { ...this.worldRuntime.travel.state, status: "in_transit", activeJourneyId: journey.publicJourneyId, arrivalAt: journey.arrivalAt, revision: 1 },
        activeJourney: journey
      };
      return { journey: clone(journey) };
    }
    if (endpointKey === "travelComplete") {
      const journey = this.worldRuntime.travel.activeJourney;
      if (journey) {
        journey.status = "completed";
        journey.completedAt = new Date().toISOString();
        this.worldRuntime.travel = {
          state: { ...this.worldRuntime.travel.state, currentLocationId: journey.toLocationId, status: "available", activeJourneyId: null, arrivalAt: null, revision: 2 },
          activeJourney: null
        };
      }
      return { journey: clone(journey) };
    }
    if (endpointKey === "residencyRequest") {
      this.worldRuntime.residency = { ...this.worldRuntime.residency, pendingCountryId: payload.countryId, revision: this.worldRuntime.residency.revision + 1 };
      return { residency: clone(this.worldRuntime.residency) };
    }

    return { ok: true, preview: true, endpointKey, received: clone(payload || {}) };
  }
}
