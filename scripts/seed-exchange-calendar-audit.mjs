import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = path.join(
  repoRoot,
  "docs",
  "seed-content",
  "markets",
  "exchanges",
  "exchange-calendar-registry-v1.json",
);

const expected = new Map([
  ["NORTHREACH", "FGX"],
  ["YRETHIA", "SBX"],
  ["THALORIS", "DHM"],
  ["SOLVEND", "AUX"],
  ["ELDORAN", "CMX"],
  ["VALERION", "GFX"],
  ["LUMENOR", "SCX"],
  ["XALVORIA", "ECX"],
  ["DRAVENLOK", "IHX"],
  ["SYNDALIS", "BDX"],
]);

const registry = JSON.parse(await readFile(registryPath, "utf8"));
const issues = [];

if (registry.productionAuthorized !== false) {
  issues.push("registry must remain production unauthorized");
}
if (registry.runtimeActivationAllowed !== false) {
  issues.push("registry must remain runtime activation disabled");
}
if (registry.recordCount !== expected.size) {
  issues.push(`recordCount must be ${expected.size}`);
}
if (!Array.isArray(registry.exchanges) || registry.exchanges.length !== expected.size) {
  issues.push(`exchanges must contain exactly ${expected.size} records`);
}

const ids = new Set();
const codes = new Set();
const countries = new Set();
const clockPattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

for (const exchange of registry.exchanges ?? []) {
  if (typeof exchange.id !== "string" || !exchange.id.startsWith("exchange.")) {
    issues.push("every exchange must have a stable exchange.* ID");
  } else if (ids.has(exchange.id)) {
    issues.push(`duplicate exchange ID ${exchange.id}`);
  } else {
    ids.add(exchange.id);
  }

  if (codes.has(exchange.exchangeCode)) {
    issues.push(`duplicate exchange code ${exchange.exchangeCode}`);
  }
  codes.add(exchange.exchangeCode);

  if (countries.has(exchange.countryCode)) {
    issues.push(`duplicate country ${exchange.countryCode}`);
  }
  countries.add(exchange.countryCode);

  if (expected.get(exchange.countryCode) !== exchange.exchangeCode) {
    issues.push(`${exchange.countryCode} must use ${expected.get(exchange.countryCode)}`);
  }
  if (exchange.timeZone !== "Asia/Seoul") {
    issues.push(`${exchange.exchangeCode} must preserve the initial Asia/Seoul baseline`);
  }
  if (JSON.stringify(exchange.regularTradingDays) !== "[1,2,3,4,5]") {
    issues.push(`${exchange.exchangeCode} must trade Monday through Friday`);
  }
  if (!clockPattern.test(exchange.opensAt) || exchange.opensAt !== "08:00") {
    issues.push(`${exchange.exchangeCode} must open at 08:00`);
  }
  if (!clockPattern.test(exchange.closesAt) || exchange.closesAt !== "17:00") {
    issues.push(`${exchange.exchangeCode} must close at 17:00`);
  }
  if (!Array.isArray(exchange.holidayDates)) {
    issues.push(`${exchange.exchangeCode} holidayDates must be an array`);
  }
  if (!exchange.earlyCloses || Array.isArray(exchange.earlyCloses) || typeof exchange.earlyCloses !== "object") {
    issues.push(`${exchange.exchangeCode} earlyCloses must be an object`);
  }
  if (exchange.activationAuthorized !== false) {
    issues.push(`${exchange.exchangeCode} must remain activation disabled`);
  }
}

for (const [country, exchangeCode] of expected) {
  if (!countries.has(country)) issues.push(`missing country ${country}`);
  if (!codes.has(exchangeCode)) issues.push(`missing exchange ${exchangeCode}`);
}

if (registry.sharedInitialSessionPolicy?.closedSessionPricePolicy !== "hold-last-authoritative-close") {
  issues.push("closed-session price policy must hold the last authoritative close");
}
if (registry.sharedInitialSessionPolicy?.closedSessionExecutionPolicy !== "reject-immediate-fill") {
  issues.push("closed-session execution policy must reject immediate fills");
}
if (registry.sharedInitialSessionPolicy?.overnightInformationPolicy !== "bounded-opening-gap") {
  issues.push("overnight information must use a bounded opening gap");
}

if (issues.length > 0) {
  for (const issue of issues) console.error(`Exchange calendar audit: ${issue}`);
  process.exitCode = 1;
} else {
  console.log("Verified ten exchange calendars with the Asia/Seoul weekday 08:00-17:00 baseline; holiday activation remains pending.");
}
