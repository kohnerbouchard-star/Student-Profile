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
  yret: "yrethia"
});

const SAFE_ITEM_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DEFAULT_STORE_IMAGE = "./assets/store-items/store-item-custom.svg";

function fallbackImage(item) {
  const candidate = typeof item?.image === "string" ? item.image.trim() : "";
  return candidate || DEFAULT_STORE_IMAGE;
}

export function resolveStoreItemImage(item) {
  const itemKey = typeof item?.itemKey === "string" ? item.itemKey.trim().toLowerCase() : "";
  const match = /^beta-([a-z]{4})-(.+)$/.exec(itemKey);
  if (!match) return fallbackImage(item);

  const country = STORE_COUNTRY_BY_PREFIX[match[1]];
  const itemSlug = match[2];
  if (!country || !SAFE_ITEM_SLUG.test(itemSlug)) return fallbackImage(item);

  return `./assets/images/items/store/${country}/${itemSlug}.webp`;
}
