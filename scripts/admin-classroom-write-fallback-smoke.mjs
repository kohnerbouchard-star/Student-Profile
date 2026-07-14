import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const ACCESS_TOKEN = "browser-smoke-access-token";
const fallbackSource = readFileSync("admin/classroom-write-fallback.js", "utf8");
const adminHtml = readFileSync("admin/index.html", "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function createStorage(values = {}) {
  const state = new Map(Object.entries(values));
  return {
    getItem(key) {
      return state.has(key) ? state.get(key) : null;
    },
    setItem(key, value) {
      state.set(key, String(value));
    },
    removeItem(key) {
      state.delete(key);
    },
  };
}

const calls = [];
let primaryStatus = 200;

async function nativeFetch(input, init) {
  const request = input instanceof Request
    ? new Request(input, init)
    : new Request(String(input), init);
  let body = null;
  if (!["GET", "HEAD"].includes(request.method)) {
    try {
      body = await request.clone().json();
    } catch (_) {
      body = await request.clone().text();
    }
  }

  const record = {
    url: request.url,
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    body,
  };
  calls.push(record);

  const isClassroom = request.url.includes("/functions/v1/classroom-api/");
  return new Response(JSON.stringify({
    data: isClassroom ? { accepted: true } : { primary: true },
  }), {
    status: isClassroom ? 200 : primaryStatus,
    headers: { "content-type": "application/json" },
  });
}

const sessionStorage = createStorage({
  "econovaria.admin.auth.v1": JSON.stringify({
    accessToken: ACCESS_TOKEN,
    user: { id: "00000000-0000-4000-8000-000000000002" },
  }),
  "econovaria.admin.selected-game.v1": GAME_ID,
});

const windowObject = {
  fetch: nativeFetch,
  location: { href: "http://127.0.0.1:4173/admin/" },
  sessionStorage,
};
windowObject.window = windowObject;

runInNewContext(fallbackSource, {
  window: windowObject,
  Request,
  Response,
  Headers,
  URL,
  console,
  Set,
  JSON,
  String,
  Object,
  Array,
  decodeURIComponent,
  encodeURIComponent,
});

assert(
  windowObject.EconovariaClassroomWriteFallback?.canonicalWrite,
  "Classroom write fallback did not initialize.",
);

const createAdapterIndex = adminHtml.indexOf("./create-action-adapter.js");
const fallbackIndex = adminHtml.indexOf("./classroom-write-fallback.js");
const bootIndex = adminHtml.indexOf("./dist/admin-overview-boot.js");
assert(createAdapterIndex >= 0, "Admin page does not load create-action-adapter.js.");
assert(fallbackIndex > createAdapterIndex, "Classroom fallback must load after the create adapter.");
assert(bootIndex > fallbackIndex, "Classroom fallback must load before the admin boot script.");

calls.length = 0;
primaryStatus = 200;
const successfulPrimary = await windowObject.fetch(
  new Request(`http://127.0.0.1:4173/api/admin/games/${GAME_ID}/players`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "create-player",
      payload: {
        displayName: "No Retry Player",
        rosterLabel: "NO-RETRY",
        playerIdentifier: "RFID:NO-RETRY",
        accessCode: "NO-RETRY-4826",
      },
    }),
  }),
);
assert(successfulPrimary.status === 200, "Successful primary write did not pass through.");
assert(calls.length === 1, "Successful primary write unexpectedly retried.");
assert(calls[0].url.includes("/api/admin/"), "Primary write did not use the local admin adapter.");

calls.length = 0;
primaryStatus = 400;
const playerResponse = await windowObject.fetch(
  new Request(`http://127.0.0.1:4173/api/admin/games/${GAME_ID}/players`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "create-player",
      payload: {
        displayName: "Fallback Player",
        rosterLabel: "FALLBACK-001",
        playerIdentifier: "RFID:FALLBACK-001",
        accessCode: "FALLBACK-5937",
        startingLocation: "NORTHREACH",
      },
    }),
  }),
);
assert(playerResponse.status === 200, "Player fallback did not return the classroom response.");
assert(calls.length === 2, `Player fallback expected two requests, received ${calls.length}.`);
assert(calls[0].url.includes("/api/admin/"), "Player fallback did not try admin-api first.");
assert(
  calls[1].url.endsWith(`/functions/v1/classroom-api/games/${GAME_ID}/players`),
  `Player fallback used an unexpected URL: ${calls[1].url}`,
);
assert(calls[1].method === "POST", "Player fallback did not use POST.");
assert(calls[1].body.displayName === "Fallback Player", "Player display name was not normalized.");
assert(calls[1].body.rosterLabel === "FALLBACK-001", "Player roster label was not normalized.");
assert(calls[1].body.playerIdentifier === "RFID:FALLBACK-001", "RFID Player ID was not normalized.");
assert(calls[1].body.accessCode === "FALLBACK-5937", "Access Code was not normalized.");
assert(calls[1].headers.authorization === `Bearer ${ACCESS_TOKEN}`, "Player fallback omitted authorization.");
assert(Boolean(calls[1].headers.apikey), "Player fallback omitted the publishable API key.");
assert(!("x-csrf-token" in calls[1].headers), "Player fallback forwarded x-csrf-token.");
assert(!("x-econovaria-csrf" in calls[1].headers), "Player fallback forwarded x-econovaria-csrf.");

calls.length = 0;
primaryStatus = 404;
const attendanceResponse = await windowObject.fetch(
  new Request(`http://127.0.0.1:4173/api/admin/games/${GAME_ID}/attendance/scans`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "scan-attendance",
      payload: { scannedCode: "RFID:PLAYER-123", timezone: "Asia/Seoul" },
    }),
  }),
);
assert(attendanceResponse.status === 200, "Attendance fallback did not return the classroom response.");
assert(calls.length === 2, `Attendance fallback expected two requests, received ${calls.length}.`);
assert(
  calls[1].url.endsWith(`/functions/v1/classroom-api/games/${GAME_ID}/attendance/scan`),
  `Attendance fallback used an unexpected URL: ${calls[1].url}`,
);
assert(calls[1].body.playerId === "RFID:PLAYER-123", "Attendance Player ID was not normalized.");
assert(calls[1].body.deviceTimezone === "Asia/Seoul", "Attendance timezone was not normalized.");

console.log("Admin classroom write fallback identity smoke passed.");
