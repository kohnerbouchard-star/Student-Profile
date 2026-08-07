const STORE_COUNTRY_BY_PREFIX = Object.freeze({
  drav: "dravenlok",
  eldo: "eldoran",
  lume: "lumenor",
  nort: "northreach",
  solv: "solvend",
  synd: "syndalis",
  thal: "thaloris",
  vale: "valerion",
  xalv: "xalvoria",
  yret: "yrethia",
});

const CATALOG_ASSET_BY_KEY = Object.freeze({
  "advanced-fabricator": "advanced-fabricator",
  "data-chip": "data-chip",
  "emergency-repair-kit": "emergency-repair-kit",
  "energy-cell-pack": "energy-cell-pack",
  "field-permit": "field-permit",
  "logistics-scanner": "logistics-scanner",
  "market-lens": "market-lens",
  "priority-processing-token": "priority-processing-token",
  "refined-alloy-bundle": "refined-alloy-bundle",
  "teacher-bonus-coupon": "teacher-bonus-coupon",
  "workshop-access-pass": "workshop-access-pass",
  // Preview aliases retain the existing Player Store artwork without accepting
  // an item-supplied URL as a media authority.
  "energy-cell": "energy-cell-pack",
  "priority-token": "priority-processing-token",
  "refined-alloy": "refined-alloy-bundle",
  "repair-kit": "emergency-repair-kit",
  "workshop-pass": "workshop-access-pass",
});

const SAFE_ITEM_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const UUID_IN_TEXT = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu;
const ALLOWED_ASSET_ROOTS = new Set(["./assets", "/player-terminal/assets"]);
const DEFAULT_ASSET_ROOT = "/player-terminal/assets";

export const STORE_ITEM_MEDIA_PLACEHOLDER_SRC = "/player-terminal/assets/store-item-placeholder.svg";

function publicItemName(item) {
  const value = typeof item?.name === "string" ? item.name.trim() : "";
  return value && !UUID_IN_TEXT.test(value) ? value.slice(0, 180) : "Store item";
}

function publicItemKey(item) {
  for (const value of [item?.itemKey, item?.item_key, item?.id]) {
    const key = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (key && !UUID.test(key)) return key;
  }
  return "";
}

function assetRoot(value) {
  return ALLOWED_ASSET_ROOTS.has(value) ? value : DEFAULT_ASSET_ROOT;
}

function placeholderSrc(root) {
  return root === "./assets"
    ? "./assets/store-item-placeholder.svg"
    : STORE_ITEM_MEDIA_PLACEHOLDER_SRC;
}

function descriptor({ src, alt, kind, fallback, root }) {
  return Object.freeze({
    src,
    alt,
    kind,
    fallback,
    fallbackSrc: placeholderSrc(root),
  });
}

/**
 * Resolve Store media exclusively from a public Store identity.
 *
 * Store DTOs do not currently persist custom media. Item-supplied image URLs,
 * storage paths, and upload references are therefore intentionally ignored.
 */
export function resolveStoreItemMedia(item, { assetBase = DEFAULT_ASSET_ROOT } = {}) {
  const key = publicItemKey(item);
  const name = publicItemName(item);
  const root = assetRoot(assetBase);
  const seeded = /^beta-([a-z]{4})-(.+)$/u.exec(key);

  if (seeded) {
    const country = STORE_COUNTRY_BY_PREFIX[seeded[1]];
    const slug = seeded[2];
    if (country && SAFE_ITEM_SLUG.test(slug)) {
      return descriptor({
        src: `${root}/images/items/store/${country}/${slug}.webp`,
        alt: `${name} artwork`,
        kind: "seeded",
        fallback: false,
        root,
      });
    }
  }

  const catalogAsset = CATALOG_ASSET_BY_KEY[key];
  if (catalogAsset) {
    return descriptor({
      src: `${root}/store-items/${catalogAsset}.svg`,
      alt: `${name} artwork`,
      kind: "catalog",
      fallback: false,
      root,
    });
  }

  return descriptor({
    src: placeholderSrc(root),
    alt: `Artwork unavailable for ${name}`,
    kind: "placeholder",
    fallback: true,
    root,
  });
}
