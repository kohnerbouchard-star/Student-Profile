import { bindGatewayTrustedClientIp } from "../../../src/security/edgeGatewayClientIp.ts";

const MAX_MATERIALIZED_BODY_BYTES = 1_048_577;
const originalServe = Deno.serve.bind(Deno);

async function materializeBoundedRequestBody(request: Request): Promise<Request> {
  const method = request.method.toUpperCase();
  if (
    request.body === null ||
    method === "GET" ||
    method === "HEAD" ||
    method === "OPTIONS"
  ) {
    return request;
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;

      const remainingBytes = MAX_MATERIALIZED_BODY_BYTES - totalBytes;
      const chunk = value.byteLength > remainingBytes
        ? value.subarray(0, remainingBytes)
        : value;
      chunks.push(chunk);
      totalBytes += chunk.byteLength;

      if (totalBytes >= MAX_MATERIALIZED_BODY_BYTES) {
        await reader.cancel("Player request body capture limit reached").catch(() => {});
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const headers = new Headers(request.headers);
  headers.delete("content-length");
  return new Request(request.url, {
    method: request.method,
    headers,
    body,
    signal: request.signal,
  });
}

(Deno as unknown as { serve: typeof Deno.serve }).serve = ((handler: (
  request: Request,
  info?: unknown,
) => Response | Promise<Response>) =>
  originalServe(async (incomingRequest: Request, info: unknown) => {
    const materializedRequest = await materializeBoundedRequestBody(incomingRequest);
    return handler(
      bindGatewayTrustedClientIp(
        materializedRequest,
        Deno.env.get("ECONOVARIA_TRUSTED_CLIENT_IP_HEADER"),
      ),
      info,
    );
  })) as typeof Deno.serve;
