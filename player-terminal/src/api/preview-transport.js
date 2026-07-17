import { previewData } from "../data/preview-data.js";
import { ApiConnectionPendingError } from "./errors.js";

const READ_KEY_MAP = Object.freeze({
  session: "session",
  dashboard: "dashboard",
  countries: "countries",
  news: "news",
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

export class PreviewTransport {
  constructor({ simulateWrites = false } = {}) {
    this.simulateWrites = simulateWrites;
  }

  async request({ endpointKey, method, path, payload }) {
    await delay(method === "GET" ? 180 : 650);

    if (method === "GET") {
      const key = READ_KEY_MAP[endpointKey];
      if (!(key in previewData)) {
        throw new Error(`Preview data is not defined for ${endpointKey}`);
      }
      return clone(previewData[key]);
    }

    if (!this.simulateWrites) {
      throw new ApiConnectionPendingError({ endpointKey, method, path, payload });
    }

    return {
      ok: true,
      preview: true,
      endpointKey,
      received: clone(payload || {})
    };
  }
}
