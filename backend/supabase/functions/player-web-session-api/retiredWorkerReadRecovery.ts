interface PlayerReadResult {
  readonly status: number;
  readonly body: Uint8Array;
}

const MAX_CLASSIFICATION_BYTES = 8_192;
const RETIRED_WORKER_MESSAGE =
  "WorkerAlreadyRetired: request cannot be handled because the worker has already retired";

function isRetiredWorker(result: PlayerReadResult): boolean {
  if (result.status !== 500 || result.body.byteLength > MAX_CLASSIFICATION_BYTES) return false;
  try {
    const body = JSON.parse(new TextDecoder().decode(result.body));
    if (body?.code !== "Internal Server Error" || typeof body.trace !== "string") return false;
    // The pinned CLI serializes the exception stack as JSON inside its JSON response.
    const trace = body.trace.startsWith('"') ? JSON.parse(body.trace) : body.trace;
    return typeof trace === "string" &&
      (trace === RETIRED_WORKER_MESSAGE || trace.startsWith(`${RETIRED_WORKER_MESSAGE}\n`));
  } catch {
    return false;
  }
}

// This callback stays behind session, CSRF, trusted-IP and body validation.
// Never retry mutations, network ambiguity, ordinary application 500s or boot errors.
export async function recoverRetiredPlayerRead<T extends PlayerReadResult>(
  method: string,
  readOnce: () => Promise<T>,
  sleep: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<T> {
  const first = await readOnce();
  if (!["GET", "HEAD"].includes(method) || !isRetiredWorker(first)) return first;
  await sleep(150);
  return await readOnce();
}
