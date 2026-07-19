import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");
let differences = 0;

async function read(relativePath) {
  return await readFile(path.join(repoRoot, relativePath), "utf8");
}

async function writeExpected(relativePath, expected) {
  const absolutePath = path.join(repoRoot, relativePath);
  const current = await read(relativePath);
  if (current === expected) return;

  differences += 1;
  if (checkOnly) {
    console.error(`Shared game-timezone drift: ${relativePath}`);
    return;
  }

  await writeFile(absolutePath, expected, "utf8");
}

async function patch(relativePath, transform) {
  const source = await read(relativePath);
  await writeExpected(relativePath, transform(source));
}

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Patch anchor not found for ${label}.`);
  }
  return source.replace(before, after);
}

await patch("index.html", (source) => replaceOnce(
  source,
  `              <label>\n                <span>Difficulty</span>\n                <select id="difficultyLevel" required>`,
  `              <label>\n                <span>Game Timezone</span>\n                <select id="gameTimeZone" required aria-describedby="gameTimeZoneHelp">\n                  <option value="" selected disabled>Select timezone</option>\n                  <option value="Asia/Seoul">Seoul — Asia/Seoul</option>\n                  <option value="Asia/Tokyo">Tokyo — Asia/Tokyo</option>\n                  <option value="America/New_York">New York — America/New_York</option>\n                  <option value="America/Chicago">Chicago — America/Chicago</option>\n                  <option value="America/Denver">Denver — America/Denver</option>\n                  <option value="America/Los_Angeles">Los Angeles — America/Los_Angeles</option>\n                  <option value="Europe/London">London — Europe/London</option>\n                  <option value="Europe/Paris">Paris — Europe/Paris</option>\n                  <option value="Australia/Sydney">Sydney — Australia/Sydney</option>\n                  <option value="UTC">UTC</option>\n                </select>\n                <small id="gameTimeZoneHelp">Controls market hours for every exchange in this game.</small>\n              </label>\n\n              <label>\n                <span>Difficulty</span>\n                <select id="difficultyLevel" required>`,
  "Create Game timezone field",
));

await patch("frontend/src/features/auth/auth.js", (source) => {
  let expected = replaceOnce(
    source,
    `  initLoginClock();\n  initLoginAudio();`,
    `  initLoginClock();\n  initLoginAudio();\n  initializeGameTimeZoneOptions();`,
    "timezone option initialization",
  );

  expected = replaceOnce(
    expected,
    `function bindLoginModeToggle() {`,
    `function initializeGameTimeZoneOptions() {\n  const select = document.getElementById("gameTimeZone");\n  if (!select || typeof Intl.supportedValuesOf !== "function") return;\n\n  const existing = new Set(\n    Array.from(select.options).map((option) => option.value).filter(Boolean)\n  );\n  const fragment = document.createDocumentFragment();\n\n  for (const timeZone of Intl.supportedValuesOf("timeZone")) {\n    if (existing.has(timeZone)) continue;\n    const option = document.createElement("option");\n    option.value = timeZone;\n    option.textContent = timeZone.replaceAll("_", " ");\n    fragment.appendChild(option);\n  }\n\n  select.appendChild(fragment);\n}\n\nfunction bindLoginModeToggle() {`,
    "IANA timezone option population",
  );

  expected = replaceOnce(
    expected,
    `  const difficulty = document.getElementById("difficultyLevel")?.value || "";\n  const password = document.getElementById("createAccessCode")?.value || "";`,
    `  const difficulty = document.getElementById("difficultyLevel")?.value || "";\n  const timeZone = document.getElementById("gameTimeZone")?.value || "";\n  const password = document.getElementById("createAccessCode")?.value || "";`,
    "Create Game timezone read",
  );

  expected = replaceOnce(
    expected,
    `  if (!licenseCode || !email || !displayName || !gameName || !password || !confirmPassword || !VALID_DIFFICULTIES.has(difficulty)) {`,
    `  if (!licenseCode || !email || !displayName || !gameName || !timeZone || !password || !confirmPassword || !VALID_DIFFICULTIES.has(difficulty)) {`,
    "Create Game timezone validation",
  );

  expected = replaceOnce(
    expected,
    `      gameName,\n      difficultyPreset: difficulty\n    });`,
    `      gameName,\n      difficultyPreset: difficulty,\n      timeZone\n    });`,
    "Create Game timezone submission",
  );

  return expected;
});

await patch("frontend/src/core/api.js", (source) => {
  let expected = replaceOnce(
    source,
    `      gameName: String(input?.sessionName || "").trim(),\n      difficultyPreset: String(input?.difficulty || "").trim()`,
    `      gameName: String(input?.sessionName || "").trim(),\n      difficultyPreset: String(input?.difficulty || "").trim(),\n      stockMarketWindow: {\n        timezone: String(input?.timeZone || "").trim()\n      }`,
    "direct activation timezone payload",
  );

  expected = replaceOnce(
    expected,
    `      gameName: String(input?.gameName || "").trim(),\n      difficultyPreset: String(input?.difficultyPreset || "").trim()`,
    `      gameName: String(input?.gameName || "").trim(),\n      difficultyPreset: String(input?.difficultyPreset || "").trim(),\n      stockMarketWindow: {\n        timezone: String(input?.timeZone || "").trim()\n      }`,
    "staff signup timezone payload",
  );

  return expected;
});

await patch("backend/src/domains/auth/api/staffSignupHttpHandler.ts", (source) => {
  let expected = source;

  if (!expected.includes("normalizeRequiredStockMarketWindowSetting")) {
    expected = replaceOnce(
      expected,
      `import {\n  type EdgeSupabaseClient,`,
      `import type { JsonObject } from "../../../supabase/tableTypes.ts";\nimport {\n  normalizeRequiredStockMarketWindowSetting,\n  StockMarketWindowConfigError,\n} from "../../stocks/calendars/stockMarketWindowConfig.ts";\nimport {\n  type EdgeSupabaseClient,`,
      "staff signup timezone imports",
    );
  }

  expected = replaceOnce(
    expected,
    `  readonly difficultyPreset: string;\n}`,
    `  readonly difficultyPreset: string;\n  readonly stockMarketWindow: JsonObject;\n}`,
    "staff signup timezone input contract",
  );

  expected = replaceOnce(
    expected,
    `          difficultyPreset: input.difficultyPreset,\n        },`,
    `          difficultyPreset: input.difficultyPreset,\n          stockMarketWindow: input.stockMarketWindow,\n        },`,
    "staff signup activation timezone forwarding",
  );

  expected = replaceOnce(
    expected,
    `  const difficultyPreset = requiredText(\n    value.difficultyPreset,\n    "difficulty_required",\n    "difficultyPreset is required.",\n  ).toLowerCase();`,
    `  const difficultyPreset = requiredText(\n    value.difficultyPreset,\n    "difficulty_required",\n    "difficultyPreset is required.",\n  ).toLowerCase();\n  const stockMarketWindow = parseRequiredStockMarketWindow(\n    value.stockMarketWindow,\n  );`,
    "staff signup timezone parsing",
  );

  expected = replaceOnce(
    expected,
    `    difficultyPreset,\n  };\n}\n\nfunction requiredText(`,
    `    difficultyPreset,\n    stockMarketWindow,\n  };\n}\n\nfunction parseRequiredStockMarketWindow(value: unknown): JsonObject {\n  try {\n    return normalizeRequiredStockMarketWindowSetting(value) as JsonObject;\n  } catch (error) {\n    if (error instanceof StockMarketWindowConfigError) {\n      throw new EdgeActivationError(\n        "invalid_stock_market_timezone",\n        error.message,\n        400,\n      );\n    }\n    throw error;\n  }\n}\n\nfunction requiredText(`,
    "staff signup timezone validation helper",
  );

  return expected;
});

await patch("backend/src/domains/auth/api/staffSignupHttpHandlerTest.ts", (source) => {
  let expected = replaceOnce(
    source,
    `Deno.test("staff signup creates the linked account and first game", async () => {`,
    `Deno.test("staff signup requires an explicit game timezone before creating Auth", async () => {\n  const mock = createMock();\n  const response = await handleStaffSignupRequest(\n    signupRequest({ stockMarketWindow: undefined }),\n    mock.dependencies,\n  );\n\n  await assertError(response, 400, "invalid_stock_market_timezone");\n  assertEquals(mock.calls.authCreates, 0);\n});\n\nDeno.test("staff signup creates the linked account and first game", async () => {`,
    "staff signup missing-timezone test",
  );

  expected = replaceOnce(
    expected,
    `      difficultyPreset: "moderate",\n      ...overrides,`,
    `      difficultyPreset: "moderate",\n      stockMarketWindow: { timezone: "Asia/Seoul" },\n      ...overrides,`,
    "staff signup valid timezone fixture",
  );

  return expected;
});

for (const relativePath of [
  "backend/src/domains/licensing/api/activationHttpAdapterSmokeTest.ts",
  "backend/src/domains/licensing/api/activationRouteHandlerSmokeTest.ts",
  "backend/src/domains/licensing/infrastructure/licensingActivationSmokeTest.ts",
]) {
  await patch(relativePath, (source) =>
    source.replaceAll(
      "stockMarketWindow: {},",
      'stockMarketWindow: { timezone: "Asia/Seoul" },',
    )
  );
}

const smokeScript = `import { readFile } from "node:fs/promises";\nimport path from "node:path";\nimport { fileURLToPath } from "node:url";\n\nconst repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");\n\nasync function source(relativePath) {\n  return await readFile(path.join(repoRoot, relativePath), "utf8");\n}\n\nconst html = await source("index.html");\nconst auth = await source("frontend/src/features/auth/auth.js");\nconst api = await source("frontend/src/core/api.js");\nconst signup = await source("backend/src/domains/auth/api/staffSignupHttpHandler.ts");\n\nassertIncludes(html, 'id="gameTimeZone"');\nassertIncludes(html, 'value="Asia/Seoul"');\nassertIncludes(html, "Controls market hours for every exchange in this game.");\nassertIncludes(auth, 'document.getElementById("gameTimeZone")');\nassertIncludes(auth, "Intl.supportedValuesOf(\"timeZone\")");\nassertNotIncludes(auth, "resolvedOptions().timeZone");\nassertIncludes(api, "stockMarketWindow: {");\nassertIncludes(api, "timezone: String(input?.timeZone");\nassertIncludes(signup, "invalid_stock_market_timezone");\nassertIncludes(signup, "stockMarketWindow: input.stockMarketWindow");\n\nconsole.log("Shared game-timezone UI and activation smoke passed.");\n\nfunction assertIncludes(value, expected) {\n  if (!value.includes(expected)) {\n    throw new Error(\`Expected source to include: \${expected}\`);\n  }\n}\n\nfunction assertNotIncludes(value, unexpected) {\n  if (value.includes(unexpected)) {\n    throw new Error(\`Expected source to exclude: \${unexpected}\`);\n  }\n}\n`;

const smokePath = "scripts/shared-game-timezone-ui-smoke.mjs";
let currentSmoke = null;
try {
  currentSmoke = await read(smokePath);
} catch {
  currentSmoke = null;
}
if (currentSmoke !== smokeScript) {
  differences += 1;
  if (checkOnly) {
    console.error(`Shared game-timezone drift: ${smokePath}`);
  } else {
    await writeFile(path.join(repoRoot, smokePath), smokeScript, "utf8");
  }
}

if (checkOnly && differences > 0) {
  process.exitCode = 1;
} else {
  console.log(
    `${checkOnly ? "Verified" : "Applied"} shared game-timezone UI integration.`,
  );
}
