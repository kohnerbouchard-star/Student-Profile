(function initEconovariaAdminCreateActionAdapter() {
  "use strict";

  const LOCAL_API_PREFIX = "/api/admin";
  const delegatedFetch = window.fetch.bind(window);
  const COUNTRY_CURRENCIES = {
    NORTHREACH: "NRC",
    YRETHIA: "YRC",
    THALORIS: "THD",
    SOLVEND: "SLV",
    ELDORAN: "ELD",
    VALERION: "VAL",
    LUMENOR: "LUM",
    SYNDALIS: "SYN",
    XALVORIA: "XAL",
    DRAVENLOK: "DRV"
  };

  function text(value) {
    return String(value ?? "").trim();
  }

  function numberOrUndefined(value) {
    if (value === "" || value == null) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  function formValue(form, name) {
    if (!form) return "";
    return text(new FormData(form).get(name));
  }

  function checkedValues(form) {
    if (!form) return [];
    return [...form.querySelectorAll('input[type="checkbox"]:checked')]
      .map((input) => text(input.value))
      .filter(Boolean);
  }

  function compact(record) {
    return Object.fromEntries(
      Object.entries(record).filter(([, value]) =>
        value !== undefined && value !== null && value !== ""
      )
    );
  }

  function slug(value, fallback = "general") {
    const normalized = text(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 64);
    return normalized || fallback;
  }

  function normalizedStoreStatus(value) {
    const normalized = text(value).toLowerCase();
    if (normalized === "active") return "active";
    if (normalized === "archived") return "archived";
    return "disabled";
  }

  function normalizedStoreVisibility(value) {
    const normalized = text(value).toLowerCase();
    return ["all players", "visible", "public"].includes(normalized)
      ? "visible"
      : "hidden";
  }

  function preferredStoreCurrency() {
    const model = window.Econovaria?.features?.adminOverviewTerminal?.currentModel || {};
    const candidates = [
      ...(Array.isArray(model.storeItems) ? model.storeItems : []),
      ...(Array.isArray(model.store) ? model.store : []),
      ...(Array.isArray(model.items) ? model.items : [])
    ];
    const existing = candidates
      .map((item) => text(item?.currencyCode || item?.currency_code).toUpperCase())
      .find((value) => Object.values(COUNTRY_CURRENCIES).includes(value));
    if (existing) return existing;

    const game = model.activeGame || model.game || {};
    const explicit = text(game.currencyCode || game.currency_code).toUpperCase();
    if (Object.values(COUNTRY_CURRENCIES).includes(explicit)) return explicit;

    const countryCode = text(game.countryCode || game.country_code).toUpperCase();
    return COUNTRY_CURRENCIES[countryCode] || "XAL";
  }

  async function readJson(request) {
    try {
      const value = await request.clone().json();
      return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
    } catch (_) {
      return {};
    }
  }

  function jsonRequest(request, body) {
    const headers = new Headers(request.headers);
    headers.set("Content-Type", "application/json");
    return new Request(request, {
      body: JSON.stringify(body),
      headers
    });
  }

  function playerPayload(source) {
    const form = document.querySelector("[data-admin-terminal-player-form]");
    if (!form) return source;

    const canonical = compact({
      displayName: formValue(form, "displayName"),
      rosterLabel: formValue(form, "rosterLabel") || null,
      playerIdentifier: formValue(form, "playerIdentifier"),
      accessCode: formValue(form, "accessCode"),
      status: formValue(form, "status") || "active",
      startingLocation: formValue(form, "startingLocation") || "random",
      notes: formValue(form, "notes") || null
    });

    return {
      ...source,
      ...canonical,
      payload: compact({
        ...(source.payload && typeof source.payload === "object" ? source.payload : {}),
        ...canonical
      })
    };
  }

  function contractPayload(source) {
    const form = document.querySelector("[data-admin-terminal-contract-form]");
    if (!form) return source;

    const title = formValue(form, "title");
    const objective = formValue(form, "objective");
    const instructions = formValue(form, "instructions");
    const evidence = formValue(form, "evidence");
    const deadline = formValue(form, "deadline");
    const postSetting = formValue(form, "postSetting") || "now";
    const postAt = formValue(form, "postAt");
    const locations = checkedValues(form);
    const normalizedLocations = locations.includes("all") ? ["all"] : locations;

    return {
      ...source,
      payload: compact({
        ...(source.payload && typeof source.payload === "object" ? source.payload : {}),
        title,
        objective,
        description: objective || instructions,
        instructions,
        evidence,
        submissionRequirements: evidence
          ? [{ type: "text", prompt: evidence, required: true }]
          : [],
        deadline,
        deadlineAt: deadline,
        quantity: numberOrUndefined(formValue(form, "quantity")),
        quantityScope: formValue(form, "quantityScope") || "total",
        locations: normalizedLocations.length ? normalizedLocations : ["all"],
        targeting: normalizedLocations.includes("all")
          ? { allPlayers: true }
          : { countryCodes: normalizedLocations },
        postSetting,
        postAt,
        scheduledAt: postAt || undefined,
        publishNow: postSetting === "now",
        status: postSetting === "draft"
          ? "draft"
          : postAt
            ? "scheduled"
            : "active"
      })
    };
  }

  function storePayload(source) {
    const form = document.querySelector("[data-admin-terminal-store-form]");
    if (!form) return source;

    const itemName = formValue(form, "itemName");
    const rawCategory = formValue(form, "category");
    const rawStatus = formValue(form, "status") || "Active";
    const rawVisibility = formValue(form, "visibility") || "All players";
    const stockQuantity = numberOrUndefined(formValue(form, "stockQuantity"));

    return {
      ...source,
      payload: compact({
        ...(source.payload && typeof source.payload === "object" ? source.payload : {}),
        itemKey: slug(itemName, `custom_item_${crypto.randomUUID().slice(0, 8)}`),
        itemName,
        name: itemName,
        description: formValue(form, "description"),
        category: slug(rawCategory, "general").slice(0, 32),
        status: normalizedStoreStatus(rawStatus),
        price: numberOrUndefined(formValue(form, "price")),
        currencyCode: preferredStoreCurrency(),
        stockQuantity: stockQuantity === undefined ? 0 : Math.max(0, Math.trunc(stockQuantity)),
        visibility: normalizedStoreVisibility(rawVisibility),
        sortOrder: 0
      })
    };
  }

  window.fetch = async function econovariaCreateActionFetch(input, init) {
    const rawUrl = input instanceof Request
      ? input.url
      : new URL(String(input), window.location.href).href;
    const method = text(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase() || "GET";
    const url = new URL(rawUrl, window.location.href);

    if (
      method !== "POST" ||
      !url.pathname.startsWith(`${LOCAL_API_PREFIX}/games/`)
    ) {
      return delegatedFetch(input, init);
    }

    const request = input instanceof Request
      ? new Request(input, init)
      : new Request(rawUrl, init);
    const source = await readJson(request);
    let normalized = source;

    if (/\/players$/.test(url.pathname) && source.action === "create-player") {
      normalized = playerPayload(source);
    } else if (/\/contracts$/.test(url.pathname) && source.action === "create-contract") {
      normalized = contractPayload(source);
    } else if (/\/store\/items$/.test(url.pathname) && source.action === "save-store-item") {
      normalized = storePayload(source);
    }

    return delegatedFetch(
      normalized === source ? request : jsonRequest(request, normalized)
    );
  };
})();
