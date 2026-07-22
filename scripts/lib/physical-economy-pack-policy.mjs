export const ITEM_CLASSES = new Set([
  "material", "component", "equipment", "consumable", "blueprint", "authorization",
]);
export const RECIPE_KEY = /^recipe\.[a-z0-9][a-z0-9._-]{2,127}$/;
export const ITEM_KEY = /^[a-z0-9][a-z0-9_-]{0,63}$/;
export const COUNTRY_CODES = new Set([
  "NORTHREACH", "YRETHIA", "THALORIS", "SOLVEND", "ELDORAN",
  "VALERION", "LUMENOR", "XALVORIA", "DRAVENLOK", "SYNDALIS",
]);
export const SAFE_EFFECT_CODES = new Set([
  "POWER_SECURE_ANALYSIS", "CREATE_VERIFIED_LEDGER_SNAPSHOT",
  "PRESERVE_RESEARCH_SAMPLE", "RUN_WATER_TEST",
  "EXTEND_TRANSLATION_COVERAGE", "CREATE_PUBLIC_BRIEFING",
  "PROTECT_SHIPMENT", "IMPROVE_SALVAGE_CLASSIFICATION",
  "REROUTE_ELIGIBLE_SHIPMENT", "ERASE_SENSITIVE_DATA",
]);
export const DISABLED_EFFECT_TOKENS = ["REPAIR", "DURABILITY", "MAINTENANCE"];
export const DIFFICULTIES = ["easy", "moderate", "hard", "insane"];
