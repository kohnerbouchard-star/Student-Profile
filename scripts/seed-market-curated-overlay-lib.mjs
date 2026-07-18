import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function candidateShape(document) {
  const market = document.market ?? document;
  return {
    country: market.country ?? document.country,
    currency: market.currency ?? document.currency,
    exchange: market.exchange ?? document.exchange,
    instruments: market.instruments ?? document.instruments ?? [],
  };
}

function curatedIdentity(instrument, candidate, sourceFile) {
  return {
    id: instrument.id,
    symbol: instrument.symbol,
    name: instrument.name,
    country: instrument.country ?? candidate.country,
    currency: instrument.currency ?? candidate.currency,
    exchange: instrument.exchange ?? candidate.exchange,
    instrumentType: instrument.instrumentType,
    assetClass: instrument.assetClass,
    sector: instrument.sector,
    issuerId: instrument.issuerId,
    issuerName: instrument.issuerName,
    riskClass: instrument.riskClass,
    liquidityClass: instrument.liquidityClass,
    curationSourceFile: sourceFile,
  };
}

export async function overlayCuratedActiveIdentities({ countryRecords, activeRoot }) {
  const candidateFiles = (await readdir(activeRoot))
    .filter((name) => name.includes("active-market-candidate") && name.endsWith(".json"))
    .sort();
  const overlays = [];
  const canonicalNamesForSharedIssuerIds = new Map();

  for (const fileName of candidateFiles) {
    const candidate = candidateShape(await readJson(path.join(activeRoot, fileName)));
    if (!candidate.country || !countryRecords.has(candidate.country)) {
      throw new Error(`${fileName} does not identify a generated country.`);
    }
    const records = countryRecords.get(candidate.country);
    const indexesBySymbol = new Map(records.map((record, index) => [record.symbol, index]));

    for (const instrument of candidate.instruments) {
      const identity = curatedIdentity(instrument, candidate, fileName);
      const index = indexesBySymbol.get(identity.symbol);
      if (index === undefined) {
        throw new Error(`${fileName} symbol ${identity.symbol} is absent from the generated ${candidate.country} universe.`);
      }
      const generated = records[index];
      if (generated.instrumentType !== identity.instrumentType) {
        throw new Error(`${identity.symbol} changes instrument type from ${generated.instrumentType} to ${identity.instrumentType}.`);
      }
      if (generated.country !== identity.country || generated.currency !== identity.currency || generated.exchange !== identity.exchange) {
        throw new Error(`${identity.symbol} does not match canonical country, currency, or exchange identity.`);
      }
      for (const field of ["id", "symbol", "name", "issuerId", "issuerName", "assetClass", "sector"]) {
        if (typeof identity[field] !== "string" || identity[field].trim() === "") {
          throw new Error(`${fileName} ${identity.symbol ?? "<unknown>"} has invalid curated ${field}.`);
        }
      }

      if (generated.issuerId === identity.issuerId && generated.issuerName !== identity.issuerName) {
        const knownName = canonicalNamesForSharedIssuerIds.get(identity.issuerId);
        if (knownName && knownName !== identity.issuerName) {
          throw new Error(`${identity.issuerId} receives conflicting curated issuer names.`);
        }
        canonicalNamesForSharedIssuerIds.set(identity.issuerId, identity.issuerName);
      }

      records[index] = {
        ...generated,
        id: identity.id,
        name: identity.name,
        issuerId: identity.issuerId,
        issuerName: identity.issuerName,
        assetClass: identity.assetClass,
        sector: identity.sector,
        riskClass: identity.riskClass ?? generated.riskClass,
        liquidityClass: identity.liquidityClass ?? generated.liquidityClass,
        curationSource: "curated-active-candidate",
        curationSourceFile: identity.curationSourceFile,
        curationStatus: "canonical-active-identity",
        activationAuthorized: false,
        runtimeSupport: "unverified",
      };
      overlays.push({ country: candidate.country, symbol: identity.symbol, id: identity.id, sourceFile: fileName });
    }
  }

  let propagatedIssuerNameCount = 0;
  for (const records of countryRecords.values()) {
    for (let index = 0; index < records.length; index += 1) {
      const canonicalName = canonicalNamesForSharedIssuerIds.get(records[index].issuerId);
      if (!canonicalName || records[index].issuerName === canonicalName) continue;
      records[index] = {
        ...records[index],
        issuerName: canonicalName,
        issuerIdentitySource: "curated-active-candidate",
      };
      propagatedIssuerNameCount += 1;
    }
  }

  const symbols = new Set(overlays.map((entry) => entry.symbol));
  const ids = new Set(overlays.map((entry) => entry.id));
  if (overlays.length !== 96 || symbols.size !== 96 || ids.size !== 96) {
    throw new Error(`Expected 96 unique curated overlays; received ${overlays.length} records, ${symbols.size} symbols, and ${ids.size} IDs.`);
  }

  return {
    status: "canonical-active-identities-overlaid",
    overlayCount: overlays.length,
    propagatedIssuerNameCount,
    sharedIssuerIdsReconciled: [...canonicalNamesForSharedIssuerIds.keys()].sort(),
    countries: [...new Set(overlays.map((entry) => entry.country))].sort(),
    sourceFiles: candidateFiles,
    activationAuthorized: false,
  };
}
