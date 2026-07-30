const MAX_QR_SVG_BYTES = 1_000_000;
const MAX_COMPACT_QR_DATA_URL_LENGTH = 200_000;
const SVG_DATA_URL = /^data:image\/svg\+xml(?:(?:;charset=utf-8)|(?:;utf-8))?(;base64)?,([\s\S]*)$/iu;
const SAFE_ROOT_TAG = /^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/iu;
const ATTRIBUTE = /([A-Za-z_:][A-Za-z0-9:._-]*)\s*=\s*"([^"]*)"/gu;
const RECT = /<rect\b([^>]*)\/\s*>/giu;

export function normalizeMfaQrCode(value: unknown): string {
  const svg = decodeSvgDataUrl(value);
  if (!svg || !isSafeStaticSvg(svg)) return "";

  const root = SAFE_ROOT_TAG.exec(svg);
  if (!root) return "";

  const rootAttributes = readAttributes(root[1]);
  if (!rootAttributes) return "";
  if (rootAttributes.get("xmlns") !== "http://www.w3.org/2000/svg") return "";

  const width = parsePositiveInteger(rootAttributes.get("width"));
  const height = parsePositiveInteger(rootAttributes.get("height"));
  if (
    width === null ||
    height === null ||
    width !== height ||
    width < 87 ||
    width > 555 ||
    width % 3 !== 0
  ) {
    return "";
  }

  const modules = width / 3 - 8;
  if (
    !Number.isSafeInteger(modules) ||
    modules < 21 ||
    modules > 177 ||
    (modules - 21) % 4 !== 0
  ) {
    return "";
  }

  const body = stripComments(root[2]);
  const blackCells = readQrCells(body, modules);
  if (!blackCells) return "";

  const compactSvg = buildCompactQrSvg(modules, blackCells);
  const dataUrl = `data:image/svg+xml;base64,${btoa(compactSvg)}`;
  return dataUrl.length <= MAX_COMPACT_QR_DATA_URL_LENGTH ? dataUrl : "";
}

function decodeSvgDataUrl(value: unknown): string {
  const input = String(value || "").trim();
  const match = SVG_DATA_URL.exec(input);
  if (!match) return "";

  try {
    const raw = match[1]
      ? decodeBase64Utf8(match[2])
      : decodeTextPayload(match[2]);
    const normalized = raw.trim();
    const bytes = new TextEncoder().encode(normalized);
    return bytes.byteLength > 0 && bytes.byteLength <= MAX_QR_SVG_BYTES
      ? normalized
      : "";
  } catch {
    return "";
  }
}

function decodeTextPayload(payload: string): string {
  if (!payload.includes("%")) return payload;
  return decodeURIComponent(payload);
}

function decodeBase64Utf8(payload: string): string {
  if (!/^[A-Za-z0-9+/]*={0,2}$/u.test(payload) || payload.length % 4 !== 0) {
    throw new Error("invalid base64");
  }
  const binary = atob(payload);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function isSafeStaticSvg(svg: string): boolean {
  return !(
    /<!DOCTYPE\b|<!ENTITY\b|<\?xml-stylesheet\b/iu.test(svg) ||
    /<(?:script|foreignObject|iframe|object|embed|style|image|use|a)\b/iu.test(svg) ||
    /\son[a-z]+\s*=/iu.test(svg) ||
    /(?:href|xlink:href)\s*=/iu.test(svg) ||
    /\burl\s*\(/iu.test(svg)
  );
}

function readQrCells(body: string, modules: number): ReadonlySet<string> | null {
  const withoutRects = body.replace(RECT, "");
  if (withoutRects.trim()) return null;

  const expected = modules * modules;
  const maximumCoordinate = 12 + (modules - 1) * 3;
  const seen = new Set<string>();
  const blackCells = new Set<string>();

  RECT.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = RECT.exec(body)) !== null) {
    const attributes = readAttributes(match[1]);
    if (!attributes) return null;

    const allowed = new Set(["x", "y", "width", "height", "style", "fill", "stroke"]);
    if ([...attributes.keys()].some((name) => !allowed.has(name))) return null;

    const x = parsePositiveInteger(attributes.get("x"));
    const y = parsePositiveInteger(attributes.get("y"));
    const rectWidth = parsePositiveInteger(attributes.get("width"));
    const rectHeight = parsePositiveInteger(attributes.get("height"));
    const fill = readRectFill(attributes);
    if (
      x === null ||
      y === null ||
      rectWidth !== 3 ||
      rectHeight !== 3 ||
      (fill !== "black" && fill !== "white") ||
      x < 12 ||
      y < 12 ||
      x > maximumCoordinate ||
      y > maximumCoordinate ||
      x % 3 !== 0 ||
      y % 3 !== 0
    ) {
      return null;
    }

    const column = x / 3 - 4;
    const row = y / 3 - 4;
    const coordinate = `${column}:${row}`;
    if (seen.has(coordinate)) return null;
    seen.add(coordinate);
    if (fill === "black") blackCells.add(coordinate);
    if (seen.size > expected) return null;
  }

  return seen.size === expected &&
      blackCells.size > 0 &&
      blackCells.size < expected
    ? blackCells
    : null;
}

function readRectFill(attributes: ReadonlyMap<string, string>): "black" | "white" | "" {
  const direct = String(attributes.get("fill") || "").trim().toLowerCase();
  if (direct === "black" || direct === "#000" || direct === "#000000") return "black";
  if (direct === "white" || direct === "#fff" || direct === "#ffffff") return "white";

  const style = String(attributes.get("style") || "").replace(/\s+/gu, "").toLowerCase();
  const match = /(?:^|;)fill:(black|white|#000|#000000|#fff|#ffffff)(?:;|$)/u.exec(style);
  if (!match) return "";
  return new Set(["black", "#000", "#000000"]).has(match[1]) ? "black" : "white";
}

function readAttributes(source: string): Map<string, string> | null {
  const attributes = new Map<string, string>();
  const remainder = source.replace(ATTRIBUTE, (_match, rawName: string, value: string) => {
    const name = rawName.toLowerCase();
    if (attributes.has(name)) return "__DUPLICATE_ATTRIBUTE__";
    attributes.set(name, value);
    return "";
  });
  return remainder.trim() ? null : attributes;
}

function stripComments(value: string): string {
  return value.replace(/<!--[\s\S]*?-->/gu, "");
}

function parsePositiveInteger(value: string | undefined): number | null {
  if (!value || !/^\d{1,4}$/u.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function buildCompactQrSvg(modules: number, blackCells: ReadonlySet<string>): string {
  const size = modules + 8;
  const segments: string[] = [];

  for (let row = 0; row < modules; row += 1) {
    let runStart = -1;
    for (let column = 0; column <= modules; column += 1) {
      const black = column < modules && blackCells.has(`${column}:${row}`);
      if (black && runStart < 0) {
        runStart = column;
        continue;
      }
      if (!black && runStart >= 0) {
        const x = runStart + 4;
        const y = row + 4;
        const length = column - runStart;
        segments.push(`M${x} ${y}h${length}v1h-${length}z`);
        runStart = -1;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path fill="#000" d="${segments.join("")}"/></svg>`;
}
