import { bindGatewayTrustedClientIp } from "../../../src/security/edgeGatewayClientIp.ts";

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
