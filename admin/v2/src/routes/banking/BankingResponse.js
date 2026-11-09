/** Internal presentation-envelope reader; transport validation remains in BankingApi. */
export function readBankingResponseRows(result, fields, allowBareArray = false) {
  if (allowBareArray && Array.isArray(result)) return result;
  const candidates = [result, result?.value, result?.data, result?.data?.data, result?.payload]
    .filter((value) => Boolean(value && typeof value === "object" && !Array.isArray(value)));
  // Candidate order precedes alias order: an earlier roster (even empty) wins.
  for (const candidate of candidates) {
    for (const field of fields) {
      if (Array.isArray(candidate[field])) return candidate[field];
    }
  }
  // Preserve absence separately from an authoritative empty collection.
  return null;
}
