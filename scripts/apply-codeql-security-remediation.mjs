import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const changed = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function write(relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  const previous = fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, "utf8") : null;
  if (previous === content) return;
  fs.writeFileSync(absolutePath, content);
  changed.push(relativePath);
}

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing remediation anchor: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Non-unique remediation anchor: ${label}`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function patch(relativePath, transform) {
  const source = read(relativePath);
  const next = transform(source);
  if (next === source) throw new Error(`Remediation produced no change: ${relativePath}`);
  write(relativePath, next);
}

patch("backend/supabase/functions/staff-mfa-api/mfaQrCode.ts", (source) => {
  let next = replaceOnce(
    source,
    String.raw`const SVG_DATA_URL = /^data:image\/svg\+xml(?:(?:;charset=utf-8)|(?:;utf-8))?(;base64)?,([\s\S]*)$/iu;
const SAFE_ROOT_TAG = /^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/iu;`,
    `const SVG_DATA_URL_METADATA = new Set([\n  "data:image/svg+xml",\n  "data:image/svg+xml;charset=utf-8",\n  "data:image/svg+xml;utf-8",\n]);`,
    "MFA regex constants",
  );

  next = replaceOnce(
    next,
    `  const root = SAFE_ROOT_TAG.exec(svg);\n  if (!root) return "";\n\n  const rootAttributes = readAttributes(root[1]);`,
    `  const root = readSvgEnvelope(svg);\n  if (!root) return "";\n\n  const rootAttributes = readAttributes(root.attributes);`,
    "MFA SVG envelope",
  );

  next = replaceOnce(
    next,
    `  const body = stripComments(root[2]);\n  const blackCells = readQrCells(body, modules);`,
    `  const body = stripComments(root.body);\n  if (body === null) return "";\n  const blackCells = readQrCells(body, modules);`,
    "MFA body comment handling",
  );

  next = replaceOnce(
    next,
    `function decodeSvgDataUrl(value: unknown): string {\n  const input = String(value || "").trim();\n  const match = SVG_DATA_URL.exec(input);\n  if (!match) return "";\n\n  try {\n    const raw = match[1]\n      ? decodeBase64Utf8(match[2])\n      : decodeTextPayload(match[2]);\n    const normalized = raw.trim();\n    const bytes = new TextEncoder().encode(normalized);\n    return bytes.byteLength > 0 && bytes.byteLength <= MAX_QR_SVG_BYTES\n      ? normalized\n      : "";\n  } catch {\n    return "";\n  }\n}`,
    `function decodeSvgDataUrl(value: unknown): string {\n  const input = String(value || "").trim();\n  const separator = input.indexOf(",");\n  if (separator <= 0) return "";\n\n  const metadata = input.slice(0, separator).toLowerCase();\n  const payload = input.slice(separator + 1);\n  const isBase64 = metadata.endsWith(";base64");\n  const mediaType = isBase64 ? metadata.slice(0, -7) : metadata;\n  if (!SVG_DATA_URL_METADATA.has(mediaType)) return "";\n\n  try {\n    const raw = isBase64\n      ? decodeBase64Utf8(payload)\n      : decodeTextPayload(payload);\n    const normalized = raw.trim();\n    const bytes = new TextEncoder().encode(normalized);\n    return bytes.byteLength > 0 && bytes.byteLength <= MAX_QR_SVG_BYTES\n      ? normalized\n      : "";\n  } catch {\n    return "";\n  }\n}`,
    "MFA data URL parser",
  );

  next = replaceOnce(
    next,
    `function stripComments(value: string): string {\n  return value.replace(/<!--[\\s\\S]*?-->/gu, "");\n}`,
    `function readSvgEnvelope(svg: string): { attributes: string; body: string } | null {\n  let source = svg.trim();\n  if (source.startsWith("<?xml")) {\n    const declarationEnd = source.indexOf("?>", 5);\n    if (declarationEnd < 0) return null;\n    source = source.slice(declarationEnd + 2).trimStart();\n  }\n\n  while (source.startsWith("<!--")) {\n    const commentEnd = source.indexOf("-->", 4);\n    if (commentEnd < 0) return null;\n    source = source.slice(commentEnd + 3).trimStart();\n  }\n\n  if (source.slice(0, 4).toLowerCase() !== "<svg") return null;\n  const boundary = source.charAt(4);\n  if (boundary && boundary !== ">" && !/\\s/u.test(boundary)) return null;\n\n  const openingEnd = findTagEnd(source, 4);\n  if (openingEnd < 0) return null;\n  const lowerSource = source.toLowerCase();\n  const closingStart = lowerSource.lastIndexOf("</svg>");\n  if (closingStart <= openingEnd || source.slice(closingStart + 6).trim()) return null;\n\n  const body = source.slice(openingEnd + 1, closingStart);\n  if (body.toLowerCase().includes("</svg>")) return null;\n  return { attributes: source.slice(4, openingEnd), body };\n}\n\nfunction findTagEnd(source: string, start: number): number {\n  let quoted = false;\n  for (let index = start; index < source.length; index += 1) {\n    const character = source.charAt(index);\n    if (character === '"') {\n      quoted = !quoted;\n      continue;\n    }\n    if (!quoted && character === ">") return index;\n    if (!quoted && character === "<") return -1;\n  }\n  return -1;\n}\n\nfunction stripComments(value: string): string | null {\n  let output = "";\n  let cursor = 0;\n  while (cursor < value.length) {\n    const start = value.indexOf("<!--", cursor);\n    if (start < 0) {\n      output += value.slice(cursor);\n      return output;\n    }\n    output += value.slice(cursor, start);\n    const end = value.indexOf("-->", start + 4);\n    if (end < 0) return null;\n    cursor = end + 3;\n  }\n  return output;\n}`,
    "MFA deterministic comment parser",
  );

  return next;
});

patch("backend/src/security/adminBffRequestAuth.ts", (source) => replaceOnce(
  source,
  `  const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];\n  if (!audience.includes(VERCEL_AUDIENCE)) return null;`,
  `  const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];\n  const hasExpectedAudience = audience.some(\n    (candidate) => typeof candidate === "string" && candidate === VERCEL_AUDIENCE,\n  );\n  if (!hasExpectedAudience) return null;`,
  "exact Vercel audience comparison",
));

patch("backend/src/domains/players/api/playerLoginHttpHandler.ts", (source) => replaceOnce(
  source,
  `function generatePlayerRecoveryGameCode(): string {\n  const bytes = randomBytes(PLAYER_RECOVERY_GAME_CODE_LENGTH);\n  let out = "";\n  for (const byte of bytes) {\n    out += PLAYER_RECOVERY_GAME_CODE_ALPHABET.charAt(\n      byte % PLAYER_RECOVERY_GAME_CODE_ALPHABET.length,\n    );\n  }\n  return out;\n}`,
  `function generatePlayerRecoveryGameCode(): string {\n  const alphabetLength = PLAYER_RECOVERY_GAME_CODE_ALPHABET.length;\n  const maximumUnbiasedByte = 256 - (256 % alphabetLength);\n  let out = "";\n\n  while (out.length < PLAYER_RECOVERY_GAME_CODE_LENGTH) {\n    const bytes = randomBytes(PLAYER_RECOVERY_GAME_CODE_LENGTH - out.length);\n    for (const byte of bytes) {\n      if (byte >= maximumUnbiasedByte) continue;\n      out += PLAYER_RECOVERY_GAME_CODE_ALPHABET.charAt(byte % alphabetLength);\n      if (out.length === PLAYER_RECOVERY_GAME_CODE_LENGTH) break;\n    }\n  }\n\n  return out;\n}`,
  "unbiased recovery game code generation",
));

patch("scripts/player-login-identity-smoke.mjs", (source) => {
  let next = replaceOnce(
    source,
    `const SESSION_COOKIE = "econovaria_player_session=v1.AAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBBBB; Path=/; HttpOnly; SameSite=Strict";`,
    `const SESSION_COOKIE = "econovaria_player_session=v1.AAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBBBB; Path=/; HttpOnly; SameSite=Strict";\n\nfunction isJsDelivrRequest(rawUrl) {\n  try {\n    const url = new URL(rawUrl);\n    return url.protocol === "https:" && url.hostname === "cdn.jsdelivr.net";\n  } catch (_) {\n    return false;\n  }\n}`,
    "exact jsDelivr origin helper",
  );
  next = replaceOnce(
    next,
    `  if (request.url().includes("cdn.jsdelivr.net")) return;`,
    `  if (isJsDelivrRequest(request.url())) return;`,
    "jsDelivr request filter",
  );
  return next;
});

patch("scripts/local-staging-gateway.py", (source) => {
  let next = replaceOnce(
    source,
    `import os\nimport signal`,
    `import os\nimport re\nimport signal`,
    "gateway regex import",
  );
  next = replaceOnce(
    next,
    `LOCAL_HOSTS: Final[frozenset[str]] = frozenset({"localhost", "127.0.0.1", "::1"})`,
    `LOCAL_HOSTS: Final[frozenset[str]] = frozenset({"localhost", "127.0.0.1", "::1"})\nHEADER_NAME_PATTERN: Final[re.Pattern[str]] = re.compile(\n    r"^[!#$%&'*+\\-.^_\\`|~0-9A-Za-z]+$"\n)`,
    "gateway header-name grammar",
  );
  next = replaceOnce(
    next,
    `def filtered_response_headers(headers) -> list[tuple[str, str]]:\n    """Return end-to-end response headers, excluding upstream CORS metadata."""\n    result: list[tuple[str, str]] = []\n    for name, value in headers:\n        lower_name = name.lower()\n        if lower_name in HOP_BY_HOP_HEADERS:\n            continue\n        if lower_name.startswith("access-control-"):\n            continue\n        result.append((name, value))\n    return result`,
    `def is_safe_response_header(name: object, value: object) -> bool:\n    """Reject malformed names and CR/LF-bearing values before send_header()."""\n    normalized_name = str(name)\n    normalized_value = str(value)\n    return (\n        bool(HEADER_NAME_PATTERN.fullmatch(normalized_name))\n        and "\\r" not in normalized_name\n        and "\\n" not in normalized_name\n        and "\\r" not in normalized_value\n        and "\\n" not in normalized_value\n    )\n\n\ndef filtered_response_headers(headers) -> list[tuple[str, str]]:\n    """Return validated end-to-end response headers without upstream CORS metadata."""\n    result: list[tuple[str, str]] = []\n    for name, value in headers:\n        lower_name = str(name).lower()\n        if lower_name in HOP_BY_HOP_HEADERS:\n            continue\n        if lower_name.startswith("access-control-"):\n            continue\n        if not is_safe_response_header(name, value):\n            continue\n        result.append((str(name), str(value)))\n    return result`,
    "gateway response-header validation",
  );
  return next;
});

const gameSelectionModule = `(function installAdminGameSelection(runtime) {\n  "use strict";\n\n  const PREFIX = "econovaria:admin-game:v1:";\n  const SAFE_GAME_ID = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[A-Za-z0-9_-]{16,128})$/i;\n\n  function read() {\n    const value = String(runtime.name || "");\n    if (!value.startsWith(PREFIX)) return "";\n    const gameId = value.slice(PREFIX.length);\n    if (SAFE_GAME_ID.test(gameId)) return gameId;\n    runtime.name = "";\n    return "";\n  }\n\n  function write(value) {\n    const gameId = String(value || "").trim();\n    if (!SAFE_GAME_ID.test(gameId)) {\n      throw new Error("The selected game identifier is invalid.");\n    }\n    runtime.name = PREFIX + gameId;\n    return gameId;\n  }\n\n  function clear() {\n    if (String(runtime.name || "").startsWith(PREFIX)) runtime.name = "";\n  }\n\n  runtime.EconovariaAdminGameSelection = Object.freeze({ read, write, clear });\n})(window);\n`;
write("frontend/src/core/admin-game-selection.js", gameSelectionModule);

patch("index.html", (source) => {
  let next = replaceOnce(
    source,
    `  <script>\n    (function clearSignedOutAdminState() {`,
    `  <script src="frontend/src/core/admin-game-selection.js"></script>\n  <script>\n    (function clearSignedOutAdminState() {`,
    "login game-selection module",
  );
  next = replaceOnce(
    next,
    `        window.sessionStorage.removeItem("econovaria.admin.selected-game.v1");`,
    `        window.EconovariaAdminGameSelection?.clear?.();`,
    "login selected-game cleanup",
  );
  return next;
});

patch("admin/index.html", (source) => replaceOnce(
  source,
  `  <script src="../frontend/src/core/runtime-config.js"></script>\n  <script defer src="./auth-session-manager.js"></script>`,
  `  <script src="../frontend/src/core/runtime-config.js"></script>\n  <script defer src="../frontend/src/core/admin-game-selection.js"></script>\n  <script defer src="./auth-session-manager.js"></script>`,
  "admin game-selection module",
));

patch("frontend/src/core/login.js", (source) => {
  let next = replaceOnce(
    source,
    `    runtime.sessionStorage.removeItem(selectedGameStorageKey());`,
    `    runtime.EconovariaAdminGameSelection?.clear?.();`,
    "login selected-game clear",
  );
  next = replaceOnce(
    next,
    `    runtime.sessionStorage.setItem(selectedGameStorageKey(), id);`,
    `    runtime.EconovariaAdminGameSelection?.write?.(id);`,
    "login selected-game write",
  );
  return next;
});

const selectedGameRuntimeFiles = [
  "frontend/src/core/api.js",
  "admin/session-gate.js",
  "admin/auth-session-manager.js",
  "admin/admin-auth.js",
  "admin/admin-logout-controller.js",
  "admin/logout-confirmation.js",
  "frontend/src/core/admin-logout-override.js",
  "auth/reset-password.js",
  "admin/game-code-wiring.js",
  "admin/messaging-policy-surface.js",
  "admin/progression-review-surface.js",
  "admin/player-access-code-bridge.js",
  "admin/crafting-oversight-surface.js",
  "admin/game-creation-controls.js",
  "admin/settings-simplified.js",
  "admin/game-session-controls.js",
  "admin/player-identity-wiring.js",
  "admin/messaging-moderation-surface.js",
];

for (const relativePath of selectedGameRuntimeFiles) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) continue;
  const source = fs.readFileSync(absolutePath, "utf8");
  let next = source;
  next = next.replaceAll(
    "window.sessionStorage.getItem(SELECTED_GAME_KEY)",
    "window.EconovariaAdminGameSelection?.read?.()",
  );
  next = next.replaceAll(
    "window.sessionStorage.getItem(ECONOVARIA_API_SELECTED_GAME_STORAGE_KEY)",
    "window.EconovariaAdminGameSelection?.read?.()",
  );
  next = next.replaceAll(
    'window.sessionStorage.getItem("econovaria.admin.selected-game.v1")',
    "window.EconovariaAdminGameSelection?.read?.()",
  );
  next = next.replaceAll(
    "window.sessionStorage.removeItem(SELECTED_GAME_KEY)",
    "window.EconovariaAdminGameSelection?.clear?.()",
  );
  next = next.replaceAll(
    "window.sessionStorage.removeItem(ECONOVARIA_API_SELECTED_GAME_STORAGE_KEY)",
    "window.EconovariaAdminGameSelection?.clear?.()",
  );
  next = next.replaceAll(
    'window.sessionStorage.removeItem("econovaria.admin.selected-game.v1")',
    "window.EconovariaAdminGameSelection?.clear?.()",
  );
  if (next !== source) write(relativePath, next);
}

const selectionTest = `import assert from "node:assert/strict";\nimport test from "node:test";\nimport vm from "node:vm";\nimport { readFileSync } from "node:fs";\n\nconst source = readFileSync(new URL("../frontend/src/core/admin-game-selection.js", import.meta.url), "utf8");\n\nfunction install(name = "") {\n  const window = { name };\n  vm.runInNewContext(source, { window });\n  return window;\n}\n\ntest("selected game is tab-scoped and validated without Web Storage", () => {\n  const window = install();\n  const id = "50b44055-4958-441c-81b5-851d79214cd6";\n  assert.equal(window.EconovariaAdminGameSelection.write(id), id);\n  assert.equal(window.EconovariaAdminGameSelection.read(), id);\n  assert.match(window.name, /^econovaria:admin-game:v1:/);\n  window.EconovariaAdminGameSelection.clear();\n  assert.equal(window.name, "");\n});\n\ntest("invalid or foreign window.name content is not accepted", () => {\n  assert.equal(install("https://untrusted.example/").EconovariaAdminGameSelection.read(), "");\n  const window = install("econovaria:admin-game:v1:<script>");\n  assert.equal(window.EconovariaAdminGameSelection.read(), "");\n  assert.equal(window.name, "");\n});\n`;
write("scripts/admin-game-selection-memory.test.mjs", selectionTest);

const sourceContractTest = `import assert from "node:assert/strict";\nimport test from "node:test";\nimport { readFileSync } from "node:fs";\n\nfunction source(path) {\n  return readFileSync(new URL(\`../\${path}\`, import.meta.url), "utf8");\n}\n\ntest("CodeQL remediation removes the flagged security patterns", () => {\n  const qr = source("backend/supabase/functions/staff-mfa-api/mfaQrCode.ts");\n  assert.doesNotMatch(qr, /SAFE_ROOT_TAG|stripComments\\([^)]*\\)\\s*\\{\\s*return[^;]*\\.replace/s);\n\n  const auth = source("backend/src/security/adminBffRequestAuth.ts");\n  assert.doesNotMatch(auth, /audience\\.includes\\(/);\n\n  const player = source("backend/src/domains/players/api/playerLoginHttpHandler.ts");\n  assert.match(player, /maximumUnbiasedByte/);\n\n  const smoke = source("scripts/player-login-identity-smoke.mjs");\n  assert.doesNotMatch(smoke, /request\\.url\\(\\)\\.includes\\(\"cdn\\.jsdelivr\\.net\"\\)/);\n\n  const gateway = source("scripts/local-staging-gateway.py");\n  assert.match(gateway, /is_safe_response_header/);\n  assert.match(gateway, /"\\\\r" not in normalized_value/);\n\n  const login = source("frontend/src/core/login.js");\n  assert.doesNotMatch(login, /sessionStorage\\.setItem\\(selectedGameStorageKey\\(\\)/);\n});\n`;
write("scripts/codeql-security-remediation.test.mjs", sourceContractTest);

console.log(JSON.stringify({ changed }, null, 2));
