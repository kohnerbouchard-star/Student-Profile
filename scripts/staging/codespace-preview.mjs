#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createServer, request as httpRequest } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CANONICAL_STAGING_PROJECT_REF = "eecvbssdvarfcykcfrny";
const INNER_HOST = "127.0.0.1";
const INNER_PORT = Number(process.env.ECONOVARIA_PREVIEW_INNER_PORT || 4173);
const OUTER_PORT = Number(process.env.PORT || process.env.ECONOVARIA_PREVIEW_PORT || 4174);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MAX_RESPONSE_BYTES = 1_048_576;

function required(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

const projectRef = String(
  process.env.ECONOVARIA_PROJECT_REF || CANONICAL_STAGING_PROJECT_REF,
).trim();
const publishableKey = required("ECONOVARIA_SUPABASE_PUBLISHABLE_KEY");
const productionProjectRef = required("PRODUCTION_PROJECT_REF");

if (projectRef !== CANONICAL_STAGING_PROJECT_REF) {
  throw new Error("The preview is not bound to the repository-owned staging project.");
}
if (projectRef === productionProjectRef) {
  throw new Error("Production project selection is prohibited.");
}
if (!publishableKey.startsWith("sb_publishable_")) {
  throw new Error("A browser-safe Supabase publishable key is required.");
}
if (![INNER_PORT, OUTER_PORT].every((port) => Number.isInteger(port) && port >= 1 && port <= 65535)) {
  throw new Error("Preview ports must be valid TCP ports.");
}
if (INNER_PORT === OUTER_PORT) throw new Error("Preview inner and outer ports must differ.");

const child = spawn(
  "python3",
  [
    "scripts/econovaria-local-gateway.py",
    "--root",
    REPO_ROOT,
    "--project-ref",
    projectRef,
    "--publishable-key",
    publishableKey,
    "--port",
    String(INNER_PORT),
  ],
  {
    cwd: REPO_ROOT,
    env: process.env,
    stdio: ["ignore", "inherit", "inherit"],
  },
);

let childExited = false;
child.once("exit", (code, signal) => {
  childExited = true;
  if (code !== 0 && signal === null) {
    console.error(`Inner Econovaria gateway exited with status ${code}.`);
  }
});

function runtimeConfigSource() {
  const safeProjectRef = JSON.stringify(projectRef);
  const safePublishableKey = JSON.stringify(publishableKey);
  const upstreamUrl = JSON.stringify(`https://${projectRef}.supabase.co`);
  return [
    "window.__ECONOVARIA_RUNTIME_CONFIG__ = Object.freeze({",
    '  environment: "staging",',
    `  projectRef: ${safeProjectRef},`,
    `  supabaseUrl: ${upstreamUrl},`,
    "  apiProxyUrl: window.location.origin,",
    `  supabasePublishableKey: ${safePublishableKey}`,
    "});",
    "",
  ].join("\n");
}

async function waitForInnerGateway() {
  for (let attempt = 1; attempt <= 90; attempt += 1) {
    if (childExited) throw new Error("The inner Econovaria gateway exited before becoming ready.");
    try {
      const response = await fetch(`http://${INNER_HOST}:${INNER_PORT}/`, {
        signal: AbortSignal.timeout(1500),
      });
      if (response.status === 200) return;
    } catch {
      // The inner process may still be starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  throw new Error("The inner Econovaria gateway did not become ready.");
}

await waitForInnerGateway();

const server = createServer((incoming, outgoing) => {
  const path = String(incoming.url || "/");
  if (path === "/_econovaria/preview-health") {
    const payload = Buffer.from(JSON.stringify({ ok: true, environment: "staging" }));
    outgoing.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": String(payload.length),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    outgoing.end(payload);
    return;
  }
  if (path.split("?", 1)[0] === "/runtime-config.env.js") {
    const payload = Buffer.from(runtimeConfigSource(), "utf8");
    outgoing.writeHead(200, {
      "Content-Type": "application/javascript; charset=utf-8",
      "Content-Length": String(payload.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });
    outgoing.end(payload);
    return;
  }

  const headers = { ...incoming.headers };
  headers.host = `${INNER_HOST}:${INNER_PORT}`;
  delete headers.connection;
  delete headers["proxy-connection"];
  delete headers["transfer-encoding"];

  const upstream = httpRequest(
    {
      hostname: INNER_HOST,
      port: INNER_PORT,
      path,
      method: incoming.method,
      headers,
    },
    (response) => {
      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) {
          upstream.destroy(new Error("Inner preview response exceeded the maximum size."));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        const payload = Buffer.concat(chunks);
        const responseHeaders = { ...response.headers };
        delete responseHeaders.connection;
        delete responseHeaders["transfer-encoding"];
        responseHeaders["content-length"] = String(payload.length);
        responseHeaders["cache-control"] = "no-store";
        responseHeaders["x-content-type-options"] = "nosniff";
        responseHeaders["referrer-policy"] = "no-referrer";
        outgoing.writeHead(response.statusCode || 502, responseHeaders);
        outgoing.end(payload);
      });
    },
  );

  upstream.setTimeout(300_000, () => {
    upstream.destroy(new Error("Inner preview request timed out."));
  });
  upstream.on("error", () => {
    if (outgoing.headersSent) {
      outgoing.destroy();
      return;
    }
    const payload = Buffer.from(
      JSON.stringify({ code: "preview_gateway_failed", message: "The hosted preview gateway could not complete the request." }),
    );
    outgoing.writeHead(502, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": String(payload.length),
      "Cache-Control": "no-store",
    });
    outgoing.end(payload);
  });

  incoming.pipe(upstream);
});

server.listen(OUTER_PORT, "0.0.0.0", () => {
  console.log(`Econovaria hosted staging preview is listening on port ${OUTER_PORT}.`);
  console.log("Open the forwarded preview port; do not expose the inner gateway port.");
});

function shutdown() {
  server.close(() => process.exit(0));
  if (!childExited) child.kill("SIGTERM");
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("exit", () => {
  if (!childExited) child.kill("SIGTERM");
});
