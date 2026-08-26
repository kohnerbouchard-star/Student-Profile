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
  bankingFx: "bankingFx",
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

let sharedPreviewStore = null;

function refreshPreviewStoreItem(item) {
  const offers = Array.isArray(item?.offers) ? item.offers : [];
  const active = offers.filter((offer) => offer.status === "active" && offer.purchasable === true && offer.availableQuantity > 0);
  item.totalAvailableQuantity = active.reduce((sum, offer) => sum + offer.availableQuantity, 0);
  item.stock = item.totalAvailableQuantity;
  item.bestUnitPrice = active.length ? Math.min(...active.map((offer) => offer.unitPrice)) : null;
  item.price = item.bestUnitPrice ?? item.price;
  item.sellerCount = new Set(active.map((offer) => offer.sellerPartyKey || offer.sellerKey)).size;
  item.offerCount = offers.length;
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
    sharedPreviewStore ||= clone(previewData.store);
    this.storeData = sharedPreviewStore;
    this.storeOfferQuotes = new Map();
    this.storeOfferReceipts = new Map();
    this.storeSeededQuotes = new Map();
  }

  async request({ endpointKey, method, path, payload, idempotencyKey }) {
    await delay(method === "GET" ? 80 : 180);

    if (method === "GET") {
      if (endpointKey === "bankingFxHistory") {
        return clone(previewData.bankingFx.history);
      }
      if (endpointKey === "bankingFxOrders") {
        return {
          orders: clone([
            ...previewData.bankingFx.pendingOrders,
            ...previewData.bankingFx.completedOrders,
          ]),
          pagination: { cursor: null, nextCursor: null, hasMore: false, limit: 25 },
        };
      }
      if (endpointKey === "worldRuntime") return clone(this.worldRuntime);
      if (endpointKey === "store") return clone(this.storeData);
      if (endpointKey === "storeOfferReceipt") {
        const receiptKey = String(path || "").split("/").at(-1);
        const receipt = this.storeOfferReceipts.get(receiptKey);
        if (!receipt) throw new Error("Preview Store receipt is not available.");
        return { ok: true, receipt: clone({ ...receipt, alreadyCompleted: true }) };
      }
      const key = READ_KEY_MAP[endpointKey];
      if (!(key in previewData)) throw new Error(`Preview data is not defined for ${endpointKey}`);
      return clone(previewData[key]);
    }

    if (!this.simulateWrites) throw new ApiConnectionPendingError({ endpointKey, method, path, payload });

    if (endpointKey === "storeOfferQuote") {
      const item = this.storeData.items.find((candidate) =>
        candidate.offers?.some((offer) => offer.offerKey === payload.offerKey)
      );
      const offer = item?.offers?.find((candidate) => candidate.offerKey === payload.offerKey);
      if (!item || !offer || offer.purchasability !== "business_offer" || offer.purchasable !== true) throw new Error("Preview Business offer is not available.");
      const quoteKey = "quote_22222222222222222222222222222222";
      const prior = this.storeOfferQuotes.get(idempotencyKey);
      if (prior) return { ok: true, quote: clone({ ...prior, replayed: true }) };
      const quote = {
        quoteKey,
        quoteStatus: "created",
        offerKey: offer.offerKey,
        offerVersion: offer.version,
        businessKey: offer.businessKey,
        businessName: offer.businessName,
        sellerPartyKey: offer.sellerPartyKey,
        sellerName: offer.sellerName,
        catalogItemKey: item.catalogItemKey,
        canonicalItemKey: item.canonicalItemKey,
        storeItemKey: item.storeItemKey,
        quantity: payload.quantity,
        availableQuantityAtQuote: offer.availableQuantity,
        unitPrice: offer.unitPrice,
        totalPrice: offer.unitPrice * payload.quantity,
        currencyCode: offer.currencyCode,
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
        pricingVersion: "business-offer-fixed-price-v2",
        replayed: false,
      };
      this.storeOfferQuotes.set(idempotencyKey, quote);
      this.storeOfferQuotes.set(quoteKey, quote);
      return { ok: true, quote: clone(quote) };
    }
    if (endpointKey === "storeOfferPurchase") {
      const prior = this.storeOfferReceipts.get(idempotencyKey);
      if (prior) return { ok: true, receipt: clone({ ...prior, alreadyCompleted: true }), refreshRequired: true };
      const quote = this.storeOfferQuotes.get(payload.quoteKey);
      const item = this.storeData.items.find((candidate) => candidate.storeItemKey === quote?.storeItemKey);
      const offer = item?.offers?.find((candidate) => candidate.offerKey === payload.offerKey);
      if (!quote || !item || !offer || offer.purchasable !== true || offer.availableQuantity < payload.quantity) throw new Error("Preview Business offer changed.");
      offer.availableQuantity -= payload.quantity;
      offer.version += 1;
      offer.purchasable = offer.availableQuantity > 0;
      refreshPreviewStoreItem(item);
      const receipt = {
        receiptKey: "spr_22222222222222222222222222222222",
        quoteKey: quote.quoteKey,
        offerKey: quote.offerKey,
        businessKey: quote.businessKey,
        businessName: quote.businessName,
        sellerPartyKey: quote.sellerPartyKey,
        sellerName: quote.sellerName,
        catalogItemKey: quote.catalogItemKey,
        canonicalItemKey: quote.canonicalItemKey,
        storeItemKey: quote.storeItemKey,
        quantity: quote.quantity,
        unitPrice: quote.unitPrice,
        totalPrice: quote.totalPrice,
        currencyCode: quote.currencyCode,
        offerVersionBefore: quote.offerVersion,
        offerVersionAfter: quote.offerVersion + 1,
        remainingListedQuantity: offer.availableQuantity,
        completedAt: new Date().toISOString(),
        alreadyCompleted: false,
      };
      this.storeOfferReceipts.set(idempotencyKey, receipt);
      this.storeOfferReceipts.set(receipt.receiptKey, receipt);
      return { ok: true, receipt: clone(receipt), refreshRequired: true };
    }
    if (endpointKey === "storeQuote") {
      const item = this.storeData.items.find((candidate) => String(candidate.itemKey || candidate.id) === payload.itemKey);
      if (!item) throw new Error("Preview seeded Store item is not available.");
      const quote = {
        quoteKey: "quote_11111111111111111111111111111111",
        itemKey: payload.itemKey,
        itemName: item.name,
        quantity: payload.quantity,
        finalUnitPrice: item.price,
        finalTotalPrice: item.price * payload.quantity,
        currencyCode: item.currencyCode || "ELD",
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
      };
      this.storeSeededQuotes.set(quote.quoteKey, quote);
      return { ok: true, quote: clone(quote) };
    }
    if (endpointKey === "storePurchase") {
      const quote = this.storeSeededQuotes.get(payload.quoteKey);
      const item = this.storeData.items.find((candidate) => String(candidate.itemKey || candidate.id) === quote?.itemKey);
      if (!quote || !item) throw new Error("Preview seeded Store quote is not available.");
      item.stock = Math.max(0, Number(item.stock) - quote.quantity);
      return { ok: true, receipt: {
        receiptKey: "receipt_11111111111111111111111111111111",
        quoteKey: quote.quoteKey,
        itemKey: quote.itemKey,
        itemName: quote.itemName,
        quantity: quote.quantity,
        finalUnitPrice: quote.finalUnitPrice,
        finalTotalPrice: quote.finalTotalPrice,
        currencyCode: quote.currencyCode,
        inventoryQuantityOwned: quote.quantity,
        completedAt: new Date().toISOString(),
        alreadyCompleted: false,
      }, refreshRequired: true };
    }

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
