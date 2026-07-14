import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";

const root = process.cwd();
const adminRoot = resolve(root, "admin");
const sourceRoots = [resolve(root, "index.html"), adminRoot];
const sourceExtensions = new Set([".html", ".css", ".js", ".mjs"]);
const mediaExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".svg",
  ".ico",
  ".mp3",
  ".wav",
  ".ogg",
  ".mp4",
  ".webm",
  ".mov",
]);

function walk(path) {
  if (!existsSync(path)) return [];
  const stat = statSync(path);
  if (stat.isFile()) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = resolve(path, entry.name);
    return entry.isDirectory() ? walk(child) : [child];
  });
}

function normalizeReference(raw) {
  return String(raw || "")
    .trim()
    .replace(/^[\'"]|[\'"]$/g, "")
    .split("#")[0]
    .split("?")[0];
}

function isLocalAssetReference(reference) {
  if (!reference) return false;
  if (/^(?:data:|https?:|blob:|javascript:|mailto:|#)/i.test(reference)) return false;
  if (reference.startsWith("/") || reference.includes("${")) return false;
  const extension = extname(reference).toLowerCase();
  return mediaExtensions.has(extension) || reference === "window.ECONOVARIA_ADMIN_MOTION_BACKGROUND";
}

function referencesFrom(source) {
  const references = new Set();
  const patterns = [
    /(?:src|href|poster)\s*=\s*["']([^"']+)["']/gi,
    /url\(\s*["']?([^"')]+)["']?\s*\)/gi,
    /["']((?:\.\.?\/)?assets\/[A-Za-z0-9_./-]+)["']/g,
    /["']((?:\.\.?\/)?admin\/assets\/[A-Za-z0-9_./-]+)["']/g,
    /["'](window\.ECONOVARIA_ADMIN_MOTION_BACKGROUND)["']/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const reference = normalizeReference(match[1]);
      if (isLocalAssetReference(reference)) references.add(reference);
    }
  }

  return [...references];
}

function resolveReference(sourcePath, reference) {
  if (reference === "window.ECONOVARIA_ADMIN_MOTION_BACKGROUND") {
    return resolve(adminRoot, reference);
  }

  const extension = extname(sourcePath).toLowerCase();
  if ([".js", ".mjs"].includes(extension) && sourcePath.startsWith(`${adminRoot}/`)) {
    return resolve(adminRoot, reference);
  }

  return resolve(dirname(sourcePath), reference);
}

const sourceFiles = sourceRoots
  .flatMap(walk)
  .filter((path) => sourceExtensions.has(extname(path).toLowerCase()));

const failures = [];
const inventory = new Map();

for (const sourcePath of sourceFiles) {
  const source = readFileSync(sourcePath, "utf8");
  for (const reference of referencesFrom(source)) {
    const target = resolveReference(sourcePath, reference);
    const sourceLabel = relative(root, sourcePath);
    const targetLabel = relative(root, target);

    if (!existsSync(target)) {
      failures.push(`${sourceLabel}: missing local asset ${reference} -> ${targetLabel}`);
      continue;
    }

    const stat = statSync(target);
    if (!stat.isFile()) {
      failures.push(`${sourceLabel}: asset reference is not a file ${reference} -> ${targetLabel}`);
      continue;
    }

    if (stat.size <= 0) {
      failures.push(`${sourceLabel}: empty local asset ${reference} -> ${targetLabel}`);
      continue;
    }

    inventory.set(targetLabel, {
      bytes: stat.size,
      extension: extname(target).toLowerCase() || "extensionless",
    });
  }
}

const requiredAssets = [
  "assets/Login_Screen_Background_image_balanced_vibrant.png",
  "assets/novaria-building-blue-purple-outline-balanced.png",
  "assets/sci-fi-cinematic-background.mp3",
  "admin/assets/icons/rfid-card.svg",
  "admin/assets/icons/media-placeholder.svg",
  "admin/assets/icons/player-id.svg",
  "admin/assets/icons/adjust-balance.svg",
  "admin/assets/icons/player-settings.svg",
  "admin/assets/icons/message-player.svg",
  "admin/assets/icons/player-info.svg",
  "admin/assets/icons/player-configure.svg",
  "admin/assets/icons/bank-checking.svg",
  "admin/assets/icons/bank-savings.svg",
  "admin/assets/icons/holding-businesses.svg",
  "admin/assets/icons/holding-real-estate.svg",
  "admin/assets/icons/holding-stock-shares.svg",
  "admin/assets/icons/google-classroom-logo.svg",
  "admin/assets/icons/currency-saturn.svg",
  "admin/assets/icons/currency-neptune.svg",
  "admin/assets/icons/currency-arsenic.svg",
  "admin/assets/icons/currency-jupiter.svg",
  "admin/assets/icons/currency-alumen.svg",
  "admin/assets/icons/currency-gold.svg",
  "admin/assets/icons/currency-lapis_lazuli.svg",
  "admin/assets/icons/currency-alcali.svg",
  "admin/assets/icons/currency-lead.svg",
  "admin/assets/icons/currency-ferrum.svg",
  "admin/assets/images/csv-export-gold.png",
  "admin/assets/images/photo-frame-cyan.png",
  "admin/assets/images/photo-window-mask.png",
  "admin/assets/videos/id-background.mp4",
  "admin/assets/videos/player-background.mp4",
  "admin/assets/videos/scanner-background.mp4",
  "admin/assets/videos/contract-background.mp4",
  "admin/assets/videos/store-background.mp4",
  "admin/assets/media/player-identity-motion.svg",
  "admin/window.ECONOVARIA_ADMIN_MOTION_BACKGROUND",
  "favicon.ico",
];

for (const relativePath of requiredAssets) {
  const target = resolve(root, relativePath);
  if (!existsSync(target) || !statSync(target).isFile() || statSync(target).size <= 0) {
    failures.push(`Required repository-owned asset is missing or empty: ${relativePath}`);
  } else if (!inventory.has(relativePath)) {
    inventory.set(relativePath, {
      bytes: statSync(target).size,
      extension: extname(target).toLowerCase() || "extensionless",
    });
  }
}

const assetWiring = readFileSync(resolve(adminRoot, "asset-wiring.js"), "utf8");
if (!assetWiring.includes("ORIGINAL_CURRENCY_ICONS")) {
  failures.push("admin/asset-wiring.js does not preserve the original admin currency icon map.");
}
if (!assetWiring.includes("ORIGINAL_PLAYER_ACTION_ICONS")) {
  failures.push("admin/asset-wiring.js does not preserve the original player quick-action icon map.");
}
if (!assetWiring.includes("ORIGINAL_MODAL_VIDEOS")) {
  failures.push("admin/asset-wiring.js does not preserve the original modal video map.");
}
for (const source of [
  "./assets/videos/id-background.mp4",
  "./assets/videos/player-background.mp4",
  "./assets/videos/scanner-background.mp4",
  "./assets/videos/contract-background.mp4",
  "./assets/videos/store-background.mp4",
]) {
  if (!assetWiring.includes(source)) {
    failures.push(`admin/asset-wiring.js is missing original modal video mapping ${source}.`);
  }
}
if (assetWiring.includes("assets/icons/player-actions/")) {
  failures.push("admin/asset-wiring.js still references the non-original replacement player icon set.");
}
if (assetWiring.includes("../frontend/src/assets/currency-symbols")) {
  failures.push("admin/asset-wiring.js still redirects currency icons outside the original admin asset tree.");
}
if (assetWiring.includes("replaceBrokenMotionMedia") || assetWiring.includes("PLAYER_IDENTITY_MOTION")) {
  failures.push("admin/asset-wiring.js still replaces original modal videos with the generic identity illustration.");
}
if (!assetWiring.includes("if (!isContentMediaImage(image)) return;")) {
  failures.push("admin/asset-wiring.js still applies the generic media placeholder to every UI image.");
}

if (failures.length) {
  throw new Error(`Asset reference audit failed:\n- ${failures.join("\n- ")}`);
}

const grouped = {};
for (const [path, details] of [...inventory.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const kind = details.extension;
  grouped[kind] ||= [];
  grouped[kind].push({ path, bytes: details.bytes });
}

console.log(JSON.stringify({ assets: grouped, count: inventory.size }, null, 2));
console.log("Repository-owned asset reference audit passed.");
