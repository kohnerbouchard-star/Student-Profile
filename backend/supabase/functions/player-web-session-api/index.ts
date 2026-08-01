import { bindGatewayTrustedClientIp } from "../../../src/security/edgeGatewayClientIp.ts";
import { createPlayerApiReadResilientFetch } from "../_shared/playerApiReadResilience.ts";

const originalFetch = globalThis.fetch.bind(globalThis);
const resilientPlayerApiFetch = createPlayerApiReadResilientFetch(
  originalFetch,
  {
    onRetry: (event) => {
      console.warn(JSON.stringify({
        event: "player_api_read_retry",
        attempt: event.attempt,
        nextAttempt: event.nextAttempt,
        delayMs: event.delayMs,
        path: event.path,
        status: event.status,
        reason: event.reason,
      }));
    },
  },
);

(globalThis as unknown as { fetch: typeof globalThis.fetch }).fetch =
  resilientPlayerApiFetch as typeof globalThis.fetch;

const originalServe = Deno.serve.bind(Deno);

(Deno as unknown as { serve: typeof Deno.serve }).serve = ((handler: (
  request: Request,
  info?: unknown,
) => Response | Promise<Response>) =>
  originalServe((incomingRequest: Request, info: unknown) =>
    handler(
      bindGatewayTrustedClientIp(
        incomingRequest,
        Deno.env.get("ECONOVARIA_TRUSTED_CLIENT_IP_HEADER"),
      ),
      info,
    )
  )) as typeof Deno.serve;

await import("./runtime.ts");
