(function initEconovariaAdminCreateActionAdapter() {
  "use strict";

  const LOCAL_API_PREFIX = "/api/admin";
  const delegatedFetch = window.fetch.bind(window);

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
    return {
      ...source,
      payload: compact({
        ...(source.payload && typeof source.payload === "object" ? source.payload : {}),
        displayName: formValue(form, "displayName"),
        rosterLabel: formValue(form, "rosterLabel") || null,
        status: formValue(form, "status") || "active",
        startingLocation: formValue(form, "startingLocation") || "random",
        notes: formValue(form, "notes") || null
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
    const normalizedLocations = locations.includes("all")
      ? ["all"]
      : locations;

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
    return {
      ...source,
      payload: compact({
        ...(source.payload && typeof source.payload === "object" ? source.payload : {}),
        itemName,
        name: itemName,
        description: formValue(form, "description"),
        category: formValue(form, "category"),
        itemType: formValue(form, "itemType"),
        status: formValue(form, "status") || "active",
        price: numberOrUndefined(formValue(form, "price")),
        currencyCode: "ECO",
        pricingMode: formValue(form, "pricingMode"),
        stockMode: formValue(form, "stockMode"),
        stockQuantity: numberOrUndefined(formValue(form, "stockQuantity")),
        restock: formValue(form, "restock"),
        visibility: formValue(form, "visibility"),
        fulfillment: formValue(form, "fulfillment"),
        usage: formValue(form, "usage"),
        existingImageUrl: formValue(form, "existingImageUrl") || null,
        metadata: compact({
          itemType: formValue(form, "itemType"),
          pricingMode: formValue(form, "pricingMode"),
          stockMode: formValue(form, "stockMode"),
          restock: formValue(form, "restock"),
          fulfillment: formValue(form, "fulfillment"),
          usage: formValue(form, "usage")
        })
      })
    };
  }

  window.fetch = async function econovariaCreateActionFetch(input, init) {
    const request = input instanceof Request
      ? new Request(input, init)
      : new Request(new URL(String(input), window.location.href).href, init);
    const url = new URL(request.url, window.location.href);

    if (
      request.method !== "POST" ||
      !url.pathname.startsWith(`${LOCAL_API_PREFIX}/games/`)
    ) {
      return delegatedFetch(input, init);
    }

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
