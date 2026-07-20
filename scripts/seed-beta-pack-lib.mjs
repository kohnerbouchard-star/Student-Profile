import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const COUNTRY_CONFIG = Object.freeze({
  northreach: { code: 'NORTHREACH', currency: 'NRC', exchange: 'FGX', costFactor: 1.12 },
  yrethia: { code: 'YRETHIA', currency: 'YRC', exchange: 'SBX', costFactor: 1.08 },
  thaloris: { code: 'THALORIS', currency: 'THD', exchange: 'DHM', costFactor: 0.92 },
  solvend: { code: 'SOLVEND', currency: 'SLV', exchange: 'AUX', costFactor: 1.18 },
  eldoran: { code: 'ELDORAN', currency: 'ELD', exchange: 'CMX', costFactor: 0.84 },
  valerion: { code: 'VALERION', currency: 'VAL', exchange: 'GFX', costFactor: 1.25 },
  lumenor: { code: 'LUMENOR', currency: 'LUM', exchange: 'SCX', costFactor: 1.06 },
  xalvoria: { code: 'XALVORIA', currency: 'XAL', exchange: 'ECX', costFactor: 1.16 },
  dravenlok: { code: 'DRAVENLOK', currency: 'DRV', exchange: 'IHX', costFactor: 0.95 },
  syndalis: { code: 'SYNDALIS', currency: 'SYN', exchange: 'BDX', costFactor: 1.2 },
});

export const COUNTRY_IDS = Object.freeze(Object.keys(COUNTRY_CONFIG));

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export async function sha256File(filePath) {
  return sha256(await readFile(filePath));
}

export function stableNumber(seed, min, max, decimals = 2) {
  const raw = Number.parseInt(sha256(seed).slice(0, 12), 16) / 0xffffffffffff;
  const value = min + (max - min) * raw;
  return Number(value.toFixed(decimals));
}

export function roundTo(value, increment = 1, decimals = 2) {
  const rounded = Math.round(value / increment) * increment;
  return Number(rounded.toFixed(decimals));
}

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

export async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, canonicalJson(value), 'utf8');
}

export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

export async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export async function walkFiles(root, predicate = () => true) {
  const output = [];
  if (!(await exists(root))) return output;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...(await walkFiles(entryPath, predicate)));
    else if (entry.isFile() && predicate(entryPath)) output.push(entryPath);
  }
  return output.sort();
}

export function pointInPolygon(point, polygon) {
  const [x, y] = point;
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const [xi, yi] = polygon[index];
    const [xj, yj] = polygon[previous];
    const intersects = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

export function pointInRegion(point, polygons) {
  return polygons.some((polygon) => pointInPolygon(point, polygon));
}

export function deterministicPointInRegion(region, seed, ordinal = 0) {
  const allPoints = region.polygons.flat();
  const xs = allPoints.map(([x]) => x);
  const ys = allPoints.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  if (ordinal === 0 && pointInRegion(region.centroid, region.polygons)) return region.centroid.map(Number);
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const x = stableNumber(`${seed}:x:${attempt}`, minX + 4, maxX - 4, 0);
    const y = stableNumber(`${seed}:y:${attempt}`, minY + 4, maxY - 4, 0);
    if (pointInRegion([x, y], region.polygons)) return [x, y];
  }
  throw new Error(`Could not derive an in-region point for ${region.id} (${seed}).`);
}

export function extractRecordArray(document) {
  for (const key of ['records', 'contracts', 'packages', 'locations', 'instruments', 'events', 'eventChains', 'tutorials', 'templates', 'newsTemplates', 'items']) {
    if (Array.isArray(document?.[key])) return document[key];
  }
  return [];
}

export function safeText(value, fallback = '') {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return fallback;
}

export function slug(value) {
  return safeText(value, 'item')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 56) || 'item';
}

export function parseCli(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument ${token}`);
    const key = token.slice(2);
    if (['activate', 'allow-soft-rollback', 'help'].includes(key)) options[key] = true;
    else options[key] = argv[++index] ?? null;
  }
  return options;
}
