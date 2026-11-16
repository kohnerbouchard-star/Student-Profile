import assert from "node:assert/strict";

import { renderStorePage } from "../src/pages/store-page.js";

const data = {
  session: { currencyCode: "THD" },
  resourceStatus: { banking: { state: "ready" }, bankingFx: { state: "ready" } },
  bankingFx: {
    currencies: [
      { currencyCode: "ECO", minorUnit: 2 },
      { currencyCode: "THD", minorUnit: 3 },
      { currencyCode: "LUM", minorUnit: 2 },
    ],
    balances: [
      { accountKey: `bac_${"1".repeat(32)}`, accountKind: "checking", currencyCode: "ECO", availableAmount: 1001 },
      { accountKey: `bac_${"2".repeat(32)}`, accountKind: "checking", currencyCode: "THD", availableAmount: 25 },
      { accountKey: `bac_${"3".repeat(32)}`, accountKind: "checking", currencyCode: "LUM", availableAmount: 15 },
    ],
  },
  store: {
    categories: ["All", "Equipment"],
    items: [{
      id: "item-public-1", itemKey: "item-public-1", name: "Cross-border scanner",
      description: "A test Store item.", category: "Equipment", price: 10,
      stock: 5, totalAvailableQuantity: 5, sellerCount: 2, offerCount: 2,
      bestOfferKey: null, bestUnitPrice: null, currencyCode: "LUM",
      offers: [{
        offerKey: `sof_${"4".repeat(32)}`, sellerKind: "seeded",
        sellerPartyKey: `pty_${"4".repeat(32)}`, sellerName: "Econovaria Store",
        businessKey: null, businessName: null, unitPrice: 10, currencyCode: "LUM",
        availableQuantity: 3, status: "active", purchasability: "system_offer",
        purchasable: true, version: 1,
      }, {
        offerKey: `sof_${"5".repeat(32)}`, sellerKind: "business",
        sellerPartyKey: `pty_${"5".repeat(32)}`, sellerName: "Northreach Instruments",
        businessKey: `biz_${"5".repeat(32)}`, businessName: "Northreach Instruments",
        unitPrice: 9, currencyCode: "NRC", availableQuantity: 2, status: "active",
        purchasability: "business_offer", purchasable: true, version: 3,
      }],
    }],
  },
  inventory: { items: [] },
};

const html = renderStorePage(data, { storeCategory: "All" });
assert.match(html, /CHECKING FUNDING/);
assert.match(html, /3 Checking accounts/);
assert.match(html, /Retail FX is disclosed before confirmation/);
assert.match(html, /final account receives the exact server-derived remainder/i);
assert.match(html, /LUM 10/);
assert.match(html, /NRC 9/);
assert.match(html, /PRICES BY SELLER/);
assert.match(html, /2 currencies · compare offers/);
assert.doesNotMatch(html, /BEST AVAILABLE|From (?:LUM|NRC)/);
assert.match(html, /data-player-store-offer="sof_44444444444444444444444444444444"[^>]*>[^<]*.*Purchase/s);
assert.match(html, /data-player-store-offer="sof_55555555555555555555555555555555"[^>]*disabled[^>]*>[^<]*.*Funding unavailable/s);
assert.doesNotMatch(html, /LOCAL WALLET|LOCAL AVAILABLE BALANCE|GLOBAL SETTLEMENT WALLET|same-currency purchase|THD 25/i);

const unavailable = structuredClone(data);
unavailable.resourceStatus.bankingFx.state = "unavailable";
const unavailableHtml = renderStorePage(unavailable, { storeCategory: "All" });
assert.match(unavailableHtml, /Cross-border scanner/, "The catalog must remain readable without Banking FX evidence.");
assert.match(unavailableHtml, /Catalog remains available; checkout is disabled until Banking FX evidence loads/);
assert.equal((unavailableHtml.match(/data-player-store-offer="sof_[^"]+"[^>]*disabled/g) || []).length, 2, "Stale retained account data must not keep any offer enabled after the Banking FX read fails.");

console.log("Store funding rendering passed: authored offer currency remains explicit, mixed-currency Checking evidence enables checkout, and missing Banking FX evidence fails closed without hiding the catalog.");
