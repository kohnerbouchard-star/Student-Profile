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
  let contractCreateFlight = null;

  function text(value) {
    return String(value ?? "").trim();
  }

  function object(value) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  }

  function array(value) {
    return Array.isArray(value) ? value : [];
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

  function checkedValues(form, selector = 'input[type="checkbox"]:checked') {
    if (!form) return [];
    return [...form.querySelectorAll(selector)]
      .map((input) => text(input.value))
      .filter((value) => value && value !== "on");
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
        ...object(source.payload),
        ...canonical
      })
    };
  }

  function canonicalContractRewards(payload) {
    const rewardRows = array(payload.rewards).length
      ? array(payload.rewards)
      : array(payload.rewardRules);
    const cashRows = array(payload.cashRewards).length
      ? array(payload.cashRewards)
      : rewardRows.filter((reward) =>
        ["cash", "money"].includes(text(reward?.kind || reward?.rewardType).toLowerCase())
      );
    const itemRows = array(payload.itemRewards).length
      ? array(payload.itemRewards)
      : rewardRows.filter((reward) =>
        ["item", "inventory"].includes(text(reward?.kind || reward?.rewardType).toLowerCase())
      );

    const cashSource = object(cashRows[0]);
    const cashAmount = numberOrUndefined(
      cashSource.amount ?? cashSource.value ?? payload.cashRewardAmount ?? payload.rewardCash
    );
    const cash = cashAmount && cashAmount > 0
      ? {
        amount: Math.round(cashAmount * 100) / 100,
        accountType: text(cashSource.accountType) || "cash",
        currencyCode: text(
          cashSource.currencyCode || cashSource.currency || payload.currencyCode
        ).toUpperCase() || preferredStoreCurrency()
      }
      : undefined;

    const seen = new Set();
    const items = itemRows.map((reward) => {
      const source = object(reward);
      const storeItemId = text(
        source.storeItemId || source.itemUuid || source.itemId || source.id
      );
      const quantity = Math.trunc(numberOrUndefined(source.quantity) || 0);
      if (!storeItemId || quantity <= 0 || seen.has(storeItemId)) return null;
      seen.add(storeItemId);
      return {
        storeItemId,
        itemUuid: storeItemId,
        quantity,
        name: text(source.name || source.itemName) || undefined
      };
    }).filter(Boolean);

    return compact({ cash, items: items.length ? items : undefined });
  }

  function contractPayload(source) {
    const form = document.querySelector("[data-admin-terminal-contract-form]");
    const sourcePayload = object(source.payload);
    if (!form) return source;

    const title = formValue(form, "title");
    const objective = formValue(form, "objective");
    const instructions = formValue(form, "instructions");
    const evidence = formValue(form, "evidence");
    const deadline = formValue(form, "deadline");
    const postSetting = formValue(form, "postSetting") || "now";
    const postAt = formValue(form, "postAt");
    const reviewType = formValue(form, "reviewType") || text(sourcePayload.reviewType) || "teacher";
    const difficulty = formValue(form, "difficulty") || text(sourcePayload.difficulty) || "Standard";
    const reviewNote = formValue(form, "reviewNote") || text(sourcePayload.reviewNote);
    const quantity = numberOrUndefined(formValue(form, "quantity"));
    const quantityScope = formValue(form, "quantityScope") || "total";
    const locations = checkedValues(
      form,
      '[data-admin-terminal-contract-location]:checked'
    );
    const normalizedLocations = locations.includes("all") ? ["all"] : locations;
    const materials = array(sourcePayload.materials);
    const singularRequirement = object(sourcePayload.submissionRequirement);
    const existingRequirements = array(sourcePayload.submissionRequirements);
    const submissionRequirements = existingRequirements.length
      ? existingRequirements
      : Object.keys(singularRequirement).length
        ? [singularRequirement]
        : evidence
          ? [{ type: "text", prompt: evidence, required: true }]
          : [];
    const rewardPayload = canonicalContractRewards(sourcePayload);
    const completionMode = reviewType === "auto" ? "auto_check" : "manual_review";
    const targeting = normalizedLocations.includes("all") || normalizedLocations.length === 0
      ? { allPlayers: true }
      : { countryCodes: normalizedLocations };
    const status = postSetting === "draft"
      ? "draft"
      : postAt
        ? "scheduled"
        : "active";
    const metadata = compact({
      ...object(sourcePayload.metadata),
      materials,
      materialCount: materials.length,
      submissionRequirement: Object.keys(singularRequirement).length
        ? singularRequirement
        : undefined,
      submissionRequirements,
      difficulty,
      reviewNote: reviewNote || undefined,
      reviewType,
      quantity,
      quantityScope,
      postText: sourcePayload.postText || undefined,
      rewardSummary: sourcePayload.reward || undefined
    });

    return {
      ...source,
      payload: compact({
        ...sourcePayload,
        title,
        objective,
        description: objective || instructions,
        instructions,
        evidence,
        materials,
        submissionRequirement: Object.keys(singularRequirement).length
          ? singularRequirement
          : undefined,
        submissionRequirements,
        requirementsPayload: compact({
          ...object(sourcePayload.requirementsPayload),
          manualText: evidence || undefined,
          submissionRequirement: Object.keys(singularRequirement).length
            ? singularRequirement
            : undefined
        }),
        rewardPayload,
        deadline,
        deadlineAt: deadline,
        quantity,
        quantityScope,
        locations: normalizedLocations.length ? normalizedLocations : ["all"],
        targeting,
        targetingPayload: targeting,
        visibility: targeting.allPlayers ? "public" : "targeted",
        reviewType,
        completionMode,
        difficulty,
        reviewNote,
        metadata,
        postSetting,
        postAt,
        scheduledAt: postAt || undefined,
        publishedAt: postAt || undefined,
        publishNow: postSetting === "now",
        status
      })
    };
  }

  function contractCreateKey(pathname, normalized) {
    const payload = object(normalized.payload);
    return JSON.stringify({
      pathname,
      title: text(payload.title).toLowerCase(),
      instructions: text(payload.instructions),
      deadlineAt: text(payload.deadlineAt || payload.deadline),
      postAt: text(payload.postAt || payload.scheduledAt || payload.publishedAt),
      locations: array(payload.locations).map(text).filter(Boolean).sort()
    });
  }

  async function sendContractCreateOnce(request, normalized, pathname) {
    const key = contractCreateKey(pathname, normalized);
    const now = Date.now();
    const current = contractCreateFlight;
    if (current && current.key === key && now - current.startedAt < 3000) {
      if (current.response) return current.response.clone();
      return (await current.promise).clone();
    }

    const outgoing = jsonRequest(request, normalized);
    const promise = delegatedFetch(outgoing);
    const flight = { key, startedAt: now, promise, response: null };
    contractCreateFlight = flight;

    try {
      const response = await promise;
      flight.response = response.clone();
      window.setTimeout(() => {
        if (contractCreateFlight === flight) contractCreateFlight = null;
      }, 3000);
      return response;
    } catch (error) {
      if (contractCreateFlight === flight) contractCreateFlight = null;
      throw error;
    }
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
        ...object(source.payload),
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
      return sendContractCreateOnce(request, normalized, url.pathname);
    } else if (/\/store\/items$/.test(url.pathname) && source.action === "save-store-item") {
      normalized = storePayload(source);
    }

    return delegatedFetch(
      normalized === source ? request : jsonRequest(request, normalized)
    );
  };
})();
