/**
 * Loans has no browser-safe supervisory read contract on the current Admin/BFF.
 * This compatibility factory intentionally exposes no transport methods.
 */
export function createLoansApiClient() {
  return Object.freeze({
    implementationStatus: "not_configured",
    cancelLoansRequest() {
      return false;
    },
  });
}
