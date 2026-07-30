const MAX_QR_SVG_BYTES = 200_000;
const BASE64_IMAGE_DATA_URL =
  /^data:image\/(?:png|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/u;
const UTF8_SVG_DATA_URL = /^data:image\/svg\+xml;(?:utf-8|utf8),/iu;

export function normalizeMfaQrCode(value: unknown): string {
  const qrCode = String(value || "").trim();
  if (BASE64_IMAGE_DATA_URL.test(qrCode)) return qrCode;

  let svg = qrCode;
  const utf8Prefix = UTF8_SVG_DATA_URL.exec(qrCode);
  if (utf8Prefix) {
    svg = qrCode.slice(utf8Prefix[0].length);
    if (/^\s*%3c/iu.test(svg)) {
      try {
        svg = decodeURIComponent(svg);
      } catch {
        return "";
      }
    }
  }

  const bytes = new TextEncoder().encode(svg);
  if (
    bytes.byteLength === 0 ||
    bytes.byteLength > MAX_QR_SVG_BYTES ||
    !/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/iu.test(svg) ||
    /<!DOCTYPE\b|<!ENTITY\b|<\?xml-stylesheet\b/iu.test(svg) ||
    /<(?:script|foreignObject|iframe|object|embed|style)\b/iu.test(svg) ||
    /\son[a-z]+\s*=/iu.test(svg) ||
    /(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|data:|javascript:)/iu.test(svg) ||
    /url\(\s*["']?\s*(?:https?:|data:|javascript:)/iu.test(svg)
  ) {
    return "";
  }

  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}
