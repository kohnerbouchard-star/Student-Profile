import { PLAYER_ENDPOINTS, resolveEndpoint } from "./endpoints.js";
import { PreviewTransport } from "./preview-transport.js";
import { HttpTransport } from "./http-transport.js";
import { AdapterTransport } from "./adapter-transport.js";

export class PlayerApi {
  constructor(config) {
    this.config = config;
    this.transport = config.usePreviewData
      ? new PreviewTransport({ simulateWrites: config.simulatePreviewWrites })
      : config.apiCall || config.adapter
        ? new AdapterTransport(config.apiCall || config.adapter, config)
        : new HttpTransport(config);
  }

  setSession(session) {
    if (!session || typeof session !== "object") return;
    if (session.playerSessionToken) this.config.playerSessionToken = session.playerSessionToken;
    if (session.gameSessionId) this.config.gameSessionId = session.gameSessionId;
    if (session.playerSessionId) this.config.playerSessionId = session.playerSessionId;
    if (session.accessToken) this.config.accessToken = session.accessToken;
  }

  request(endpointKey, { params, payload } = {}) {
    const endpoint = PLAYER_ENDPOINTS[endpointKey];
    if (!endpoint) throw new Error(`Unknown player API endpoint: ${endpointKey}`);
    const path = resolveEndpoint(endpoint, params);
    return this.transport.request({ endpointKey, method: endpoint.method, path, payload });
  }

  async bootstrap() {
    const keys = ["session", "dashboard", "countries", "news", "market", "portfolio", "business", "store", "marketplace", "contracts", "inventory", "crafting", "banking", "loans", "messages", "progression", "notifications"];
    const values = await Promise.all(keys.map((key) => this.request(key)));
    return Object.fromEntries(keys.map((key, index) => [key, values[index]]));
  }

  execute(endpointKey, payload, params) {
    return this.request(endpointKey, { payload, params });
  }
}
