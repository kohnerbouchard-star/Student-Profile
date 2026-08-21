import {
  BUSINESS_STOCKROOM_LOCATION_KEYS,
  type BusinessStockroomLocationKey,
  type BusinessStockroomSnapshotDto,
} from "../../contracts/playerBusinessContracts.ts";
import {
  approximatelyEqual,
  containsInternalUuid,
  invalidStockroomResult,
  type ParsedStockroomItem,
  type ParsedStockroomLocation,
} from "./businessStockroomResultParser.ts";

export function buildBusinessStockroomSnapshot(
  parsedLocations: readonly ParsedStockroomLocation[],
  parsedItems: readonly ParsedStockroomItem[],
): BusinessStockroomSnapshotDto {
  const businessKeys = new Set([
    ...parsedLocations.map((location) => location.businessKey),
    ...parsedItems.map((item) => item.businessKey),
  ]);
  if (businessKeys.size !== 1) {
    throw invalidStockroomResult("Stockroom rows do not share one Business key.");
  }
  const businessKey = [...businessKeys][0];
  if (!businessKey) {
    throw invalidStockroomResult("Stockroom Business key is missing.");
  }

  const locationByKey = new Map<
    BusinessStockroomLocationKey,
    ParsedStockroomLocation
  >();
  const accountKeys = new Set<string>();
  for (const location of parsedLocations) {
    if (locationByKey.has(location.locationKey)) {
      throw invalidStockroomResult(
        `Duplicate Stockroom location: ${location.locationKey}.`,
      );
    }
    if (accountKeys.has(location.accountKey)) {
      throw invalidStockroomResult("Stockroom account key is duplicated.");
    }
    locationByKey.set(location.locationKey, location);
    accountKeys.add(location.accountKey);
  }

  for (const locationKey of BUSINESS_STOCKROOM_LOCATION_KEYS) {
    if (!locationByKey.has(locationKey)) {
      throw invalidStockroomResult(`Stockroom location is missing: ${locationKey}.`);
    }
  }

  const uniqueItems = new Set<string>();
  for (const item of parsedItems) {
    const location = locationByKey.get(item.locationKey);
    if (!location || location.accountKey !== item.accountKey) {
      throw invalidStockroomResult(
        `Stockroom item account does not match ${item.locationKey}.`,
      );
    }
    const uniqueKey = `${item.locationKey}:${item.itemKey}`;
    if (uniqueItems.has(uniqueKey)) {
      throw invalidStockroomResult(`Duplicate Stockroom holding: ${uniqueKey}.`);
    }
    uniqueItems.add(uniqueKey);
  }

  reconcileLocationAggregates(locationByKey, parsedItems);

  const locations = BUSINESS_STOCKROOM_LOCATION_KEYS.map((locationKey) => {
    const location = locationByKey.get(locationKey);
    if (!location) throw invalidStockroomResult("Stockroom location disappeared.");
    return {
      accountKey: location.accountKey,
      locationKey: location.locationKey,
      label: location.label,
      itemCount: location.itemCount,
      quantityOwned: location.quantityOwned,
      quantityReserved: location.quantityReserved,
      quantityAvailable: location.quantityAvailable,
    };
  });
  const locationOrder = new Map(
    BUSINESS_STOCKROOM_LOCATION_KEYS.map((locationKey, index) => [
      locationKey,
      index,
    ]),
  );
  const items = [...parsedItems]
    .sort((left, right) =>
      (locationOrder.get(left.locationKey) ?? 99) -
        (locationOrder.get(right.locationKey) ?? 99) ||
      left.itemClass.localeCompare(right.itemClass) ||
      left.name.localeCompare(right.name) ||
      left.canonicalKey.localeCompare(right.canonicalKey)
    )
    .map((item) => ({
      accountKey: item.accountKey,
      locationKey: item.locationKey,
      itemKey: item.itemKey,
      canonicalKey: item.canonicalKey,
      name: item.name,
      itemClass: item.itemClass,
      subtype: item.subtype,
      quantityOwned: item.quantityOwned,
      quantityReserved: item.quantityReserved,
      quantityAvailable: item.quantityAvailable,
      averageUnitCost: item.averageUnitCost,
      costCurrencyCode: item.costCurrencyCode,
      version: item.version,
    }));

  const snapshot = { businessKey, locations, items };
  if (containsInternalUuid(snapshot)) {
    throw invalidStockroomResult("Stockroom result leaked an internal UUID.");
  }
  return snapshot;
}

function reconcileLocationAggregates(
  locationByKey: ReadonlyMap<
    BusinessStockroomLocationKey,
    ParsedStockroomLocation
  >,
  parsedItems: readonly ParsedStockroomItem[],
): void {
  for (const locationKey of BUSINESS_STOCKROOM_LOCATION_KEYS) {
    const location = locationByKey.get(locationKey);
    if (!location) throw invalidStockroomResult("Stockroom location disappeared.");
    const locationItems = parsedItems.filter(
      (item) => item.locationKey === locationKey,
    );
    const totals = locationItems.reduce(
      (result, item) => ({
        quantityOwned: result.quantityOwned + item.quantityOwned,
        quantityReserved: result.quantityReserved + item.quantityReserved,
        quantityAvailable: result.quantityAvailable + item.quantityAvailable,
      }),
      { quantityOwned: 0, quantityReserved: 0, quantityAvailable: 0 },
    );
    if (
      location.itemCount !== locationItems.length ||
      !approximatelyEqual(location.quantityOwned, totals.quantityOwned) ||
      !approximatelyEqual(location.quantityReserved, totals.quantityReserved) ||
      !approximatelyEqual(location.quantityAvailable, totals.quantityAvailable)
    ) {
      throw invalidStockroomResult(
        `Stockroom aggregate does not reconcile for ${locationKey}.`,
      );
    }
  }
}
