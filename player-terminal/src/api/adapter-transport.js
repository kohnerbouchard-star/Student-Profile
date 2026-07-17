export class AdapterTransport {
  constructor(adapter, config) {
    const request = typeof adapter === "function"
      ? adapter
      : adapter && typeof adapter.request === "function"
        ? adapter.request.bind(adapter)
        : null;
    if (!request) {
      throw new TypeError("A player API adapter must be an async function or expose request(context).");
    }
    this.requestAdapter = request;
    this.config = config;
  }

  request(context) {
    return this.requestAdapter({
      ...context,
      session: {
        playerSessionToken: this.config.playerSessionToken || "",
        gameSessionId: this.config.gameSessionId || "",
        playerSessionId: this.config.playerSessionId || "",
        accessToken: this.config.accessToken || ""
      },
      config: this.config
    });
  }
}
