export function residencyIdentity(session) {
  return JSON.stringify([session?.gameSessionId, session?.playerId, session?.playerSessionId]);
}

function usableResidency(value) {
  return value && typeof value.currentCountryId === "string" && value.currentCountryId.trim()
    && typeof value.currencyCode === "string" && value.currencyCode.trim()
    && Array.isArray(value.eligibleCountryIds)
    && value.eligibleCountryIds.every(country => typeof country === "string" && country.trim())
    && (value.pendingCountryId === null || (typeof value.pendingCountryId === "string" && value.pendingCountryId.trim()))
    && Number.isSafeInteger(value.revision) && value.revision >= 0;
}

function sameState(left, right) {
  const eligible = new Set(left.eligibleCountryIds);
  const other = new Set(right.eligibleCountryIds);
  return eligible.size === other.size && [...eligible].every(country => other.has(country))
    && left.currentCountryId === right.currentCountryId
    && left.currencyCode === right.currencyCode
    && left.pendingCountryId === right.pendingCountryId;
}

export function createResidencyRecovery() {
  let residency = null;
  let attempt = null;
  let conflict = false;
  let stale = false;

  return {
    get attempt() { return attempt; },
    get record() { return residency; },
    get status() { return attempt?.status || (conflict ? "conflict" : stale && residency ? "stale" : null); },
    markUnavailable() { stale = true; },

    reset() {
      residency = null;
      attempt = null;
      conflict = false;
      stale = false;
    },

    begin(countryId, revisionText) {
      if (this.status || !residency || residency.pendingCountryId || typeof countryId !== "string" || !countryId.trim()
        || countryId === residency.currentCountryId
        || revisionText !== String(residency.revision) || !residency.eligibleCountryIds.includes(countryId)) return null;
      attempt = { countryId, expectedRevision: residency.revision, status: "submitting" };
      return attempt;
    },

    complete(owner, result) {
      if (attempt !== owner) return null;
      if (!usableResidency(result) || result.pendingCountryId !== owner.countryId || result.revision <= owner.expectedRevision) {
        owner.status = "uncertain";
        return owner.status;
      }
      // A newer scoped read can already have advanced beyond this commit.
      if (residency && residency.revision > result.revision) {
        attempt = null;
        return "reconciled";
      }
      if (residency?.revision === result.revision && (conflict || !sameState(residency, result))) {
        attempt = null;
        conflict = true;
        return "conflict";
      }
      residency = result;
      conflict = false;
      stale = false;
      owner.status = "confirmed";
      owner.confirmed = result;
      return owner.status;
    },

    fail(owner, ambiguous) {
      if (attempt !== owner) return;
      if (ambiguous) owner.status = "uncertain";
      else attempt = null;
    },

    observe(next, explicitAttempt = null) {
      if (!usableResidency(next)) {
        stale = true;
        return false;
      }
      if (residency && next.revision < residency.revision) return false;
      if (residency && next.revision === residency.revision && !sameState(next, residency)) {
        conflict = true;
        return false;
      }
      if (!residency || next.revision > residency.revision) conflict = false;
      if (conflict) return false;
      residency = next;
      stale = false;
      const confirmed = attempt?.status === "confirmed" && next.revision >= attempt.confirmed.revision;
      // A GET at the original revision cannot fence a possibly in-flight POST.
      const reconciled = attempt?.status === "uncertain" && attempt === explicitAttempt
        && next.revision > attempt.expectedRevision;
      if (confirmed || reconciled) attempt = null;
      return confirmed || reconciled;
    },
  };
}
