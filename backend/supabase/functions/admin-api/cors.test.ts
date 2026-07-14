import { corsHeaders } from "./cors.ts";

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function requestFrom(origin: string): Request {
  return new Request("https://example.test/admin-api/session/bootstrap", {
    method: "OPTIONS",
    headers: { Origin: origin },
  });
}

Deno.test("allows production and loopback development origins", () => {
  const allowed = [
    "https://kohnerbouchard-star.github.io",
    "http://localhost:4173",
    "http://localhost:5173",
    "http://127.0.0.1:4173",
    "http://127.0.0.1:8000",
    "http://0.0.0.0:4173",
    "http://[::1]:4173",
  ];

  for (const origin of allowed) {
    assertEqual(
      corsHeaders(requestFrom(origin))["Access-Control-Allow-Origin"],
      origin,
      `origin should be allowed: ${origin}`,
    );
  }
});

Deno.test("does not reflect arbitrary external origins", () => {
  assertEqual(
    corsHeaders(requestFrom("https://malicious.example"))[
      "Access-Control-Allow-Origin"
    ],
    "https://kohnerbouchard-star.github.io",
    "untrusted origin should not be reflected",
  );
});
