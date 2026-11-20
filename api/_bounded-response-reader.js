"use strict";

const { isUint8Array } = require("node:util").types;

async function readBoundedResponseBody(response, maximumBytes) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0) throw new RangeError("Invalid upstream response byte limit");
  if (response.body === null) return new Uint8Array(0);
  const reader = response.body.getReader();
  let bytes = new Uint8Array(0);
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!isUint8Array(value)) throw new TypeError("Expected upstream byte chunks");
      if (value.byteLength > maximumBytes - length) {
        cancelReader(reader);
        return null;
      }
      if (value.byteLength > 0) {
        const nextLength = length + value.byteLength;
        if (nextLength > bytes.byteLength) {
          const capacity = Math.min(maximumBytes, Math.max(nextLength, bytes.byteLength * 2, 1024));
          const grown = new Uint8Array(capacity);
          grown.set(bytes.subarray(0, length));
          bytes = grown;
        }
        bytes.set(value, length);
        length = nextLength;
      }
    }
    return bytes.subarray(0, length);
  } catch (error) {
    cancelReader(reader);
    throw error;
  } finally {
    reader.releaseLock();
  }
}

function cancelReader(reader) {
  // A rejected or stalled cancellation must not replace/delay the response error.
  try { void reader.cancel().catch(() => {}); } catch (_) {}
}

module.exports = { readBoundedResponseBody };
