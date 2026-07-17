import { validInvalidationResources } from "./freshness.js";

const invalidatedResources = new Set();

export function markResourceInvalidations(resources) {
  const valid = validInvalidationResources(resources);
  valid.forEach((resource) => invalidatedResources.add(resource));
  return valid;
}

export function isResourceInvalidated(resource) {
  return invalidatedResources.has(String(resource || ""));
}

export function clearResourceInvalidation(resource) {
  invalidatedResources.delete(String(resource || ""));
}

export function clearAllResourceInvalidations() {
  invalidatedResources.clear();
}

export function pendingResourceInvalidations() {
  return [...invalidatedResources];
}
