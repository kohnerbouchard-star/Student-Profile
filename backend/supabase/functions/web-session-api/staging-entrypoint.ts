type ServeHandler = (request: Request, info: unknown) => Response | Promise<Response>;

const nativeServe = Deno.serve.bind(Deno) as unknown as (
  optionsOrHandler: unknown,
  maybeHandler?: ServeHandler,
) => unknown;

function adaptedHandler(handler: ServeHandler): ServeHandler {
  return (request, info) => {
    const headers = new Headers(request.headers);
    if (!headers.has("x-real-ip")) {
      const configured = String(
        Deno.env.get("ECONOVARIA_TRUSTED_CLIENT_IP_HEADER") || "cf-connecting-ip",
      ).trim().toLowerCase();
      const trustedIp = headers.get(configured) ||
        headers.get("cf-connecting-ip") ||
        headers.get("x-real-ip");
      if (
        trustedIp &&
        trustedIp.length <= 128 &&
        !trustedIp.includes(",") &&
        !/[\r\n]/u.test(trustedIp)
      ) {
        headers.set("x-real-ip", trustedIp.trim());
      }
    }
    return handler(new Request(request, { headers }), info);
  };
}

const adaptedServe = ((
  optionsOrHandler: unknown,
  maybeHandler?: ServeHandler,
) => {
  if (typeof optionsOrHandler === "function") {
    return nativeServe(adaptedHandler(optionsOrHandler as ServeHandler));
  }
  if (typeof maybeHandler === "function") {
    return nativeServe(optionsOrHandler, adaptedHandler(maybeHandler));
  }
  return nativeServe(optionsOrHandler, maybeHandler);
}) as typeof Deno.serve;

const descriptor = Object.getOwnPropertyDescriptor(Deno, "serve");
if (!descriptor || descriptor.writable !== false) {
  (Deno as unknown as { serve: typeof Deno.serve }).serve = adaptedServe;
} else if (descriptor.configurable) {
  Object.defineProperty(Deno, "serve", { ...descriptor, value: adaptedServe });
} else {
  throw new Error("Deno.serve request adapter could not be installed.");
}

await import("./index.ts");
