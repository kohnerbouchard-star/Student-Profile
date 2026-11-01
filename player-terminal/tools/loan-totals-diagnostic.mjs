const MAX_LINES = 64;
const MAX_BYTES = 2048;
const MASK = "[masked]";
const LABEL_OR_STATE = /^(?:Available[\t\p{Zs}]+credit|Outstanding|Next[\t\p{Zs}]+payment|On-time[\t\p{Zs}]+rate|Unavailable|None[\t\p{Zs}]+scheduled|Currency[\t\p{Zs}]+unavailable|No[\t\p{Zs}]+currency[\t\p{Zs}]+obligations[\t\p{Zs}]+or[\t\p{Zs}]+offers|Currency[\t\p{Zs}]+totals[\t\p{Zs}]+(?:incomplete|unavailable))$/iu;
const MONEY_LINE = /^(?:([A-Z]{3,12})[\t\p{Zs}]*(?:[+-]?[0-9][0-9.,\t\p{Zs}]*|Unavailable)|[+-]?[0-9][0-9.,\t\p{Zs}]*([A-Z]{3,12}))$/iu;

/** Diagnostic data only: never changes the original monetary comparison. */
export function captureLoanTotalsSummary(summary, currencies) {
  let originalLineCount = 1;
  for (let offset = summary.indexOf("\n"); offset !== -1; offset = summary.indexOf("\n", offset + 1)) originalLineCount += 1;
  const capture = {
    originalUtf8Bytes: Buffer.byteLength(summary, "utf8"),
    originalLineCount,
    inspectedLineCount: Math.min(originalLineCount, MAX_LINES),
    maskedLineCount: 0,
    omittedLineCount: originalLineCount,
    truncated: originalLineCount > MAX_LINES,
    lines: [],
  };
  let start = 0;
  for (let lineIndex = 0; lineIndex < capture.inspectedLineCount; lineIndex += 1) {
    const next = summary.indexOf("\n", start);
    const end = next === -1 ? summary.length : next;
    // Skip lines whose UTF-16 length alone already exceeds the byte budget.
    if (end - start > MAX_BYTES) {
      capture.truncated = true;
      start = end + 1;
      continue;
    }
    const line = summary.slice(start, end);
    start = end + 1;
    const content = line.replace(/\r$/u, "").replace(/^[\t\p{Zs}]+|[\t\p{Zs}]+$/gu, "");
    const monetary = content.match(MONEY_LINE);
    const monetaryCode = monetary?.[1] || monetary?.[2];
    const allowed = LABEL_OR_STATE.test(content) || Boolean(monetaryCode && currencies.has(monetaryCode.toUpperCase()));
    if (!allowed) capture.maskedLineCount += 1;
    capture.lines.push({ lineIndex, text: allowed ? line : MASK });
    capture.omittedLineCount -= 1;
    fitCapture(capture);
  }
  // Later counter growth must not invalidate the serialized-byte bound.
  fitCapture(capture);
  return capture;
}

function fitCapture(capture) {
  while (Buffer.byteLength(JSON.stringify(capture), "utf8") > MAX_BYTES && capture.lines.length) {
    capture.lines.pop();
    capture.omittedLineCount += 1;
    capture.truncated = true;
  }
}
