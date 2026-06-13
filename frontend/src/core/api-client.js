(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};

  const ACTION_NAMES = Object.freeze({
    LOGIN: "LOGIN",
    LOGOUT: "LOGOUT",
    GET_SNAPSHOT: "GET_SNAPSHOT",
    GET_STOCK_HISTORY: "GET_STOCK_HISTORY",
    GET_STOCK_NEWS: "GET_STOCK_NEWS",
    STORE_PURCHASE: "STORE_PURCHASE",
    STOCK_TRADE: "STOCK_TRADE",
    SUBMIT_RATING: "SUBMIT_RATING",
    USE_ITEM: "USE_ITEM"
  });

  const DEFAULT_RETRY_CONFIG = Object.freeze({
    maxRetries: 3,
    baseDelayMs: 450,
    maxDelayMs: 1800
  });

  function isRetryableBusyResult(result) {
    if (!result || result.ok === true) {
      return false;
    }

    return isBusyMessage(result.message);
  }

  function isRetryableBusyError(error) {
    if (!error) {
      return false;
    }

    return isBusyMessage(error.message || String(error));
  }

  function isBusyMessage(message) {
    const text = String(message || "").toLowerCase();

    return (
      text.includes("system is busy") ||
      (text.includes("try again") && text.includes("busy")) ||
      (text.includes("lock") && text.includes("busy")) ||
      text.includes("temporarily unavailable") ||
      text.includes("service unavailable") ||
      text.includes("network error") ||
      text.includes("failed to fetch")
    );
  }

  // transport-only
  function getRetryDelay(attempt, retryConfig, random) {
    const config = Object.assign({}, DEFAULT_RETRY_CONFIG, retryConfig || {});
    const randomFn = typeof random === "function" ? random : Math.random;
    const exponential = config.baseDelayMs * Math.pow(2, attempt);
    const jitter = Math.floor(randomFn() * 250);

    return Math.min(config.maxDelayMs, exponential + jitter);
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      global.setTimeout(resolve, ms);
    });
  }

  function showRetryNotice(attemptNumber, maxRetries, message, reporter) {
    const text = `System is busy. Retrying ${attemptNumber}/${maxRetries}...`;

    if (typeof reporter === "function") {
      reporter("warn", text, message || "");
      return;
    }

    if (typeof global.showGlobalStatus === "function") {
      try {
        global.showGlobalStatus("warn", text);
        return;
      } catch (_) {}
    }

    if (global.console && typeof global.console.warn === "function") {
      global.console.warn(text, message || "");
    }
  }

  async function callApiOnce(apiUrl, body, fetchImpl) {
    const fetchFn = fetchImpl || global.fetch;

    if (typeof fetchFn !== "function") {
      throw new Error("No fetch implementation is available for the frontend API client.");
    }

    if (!apiUrl) {
      throw new Error("No API URL was provided to the frontend API client.");
    }

    const response = await fetchFn(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body || {})
    });

    return response.json();
  }

  async function callWithRetry(callOnce, body, options) {
    const config = Object.assign({}, DEFAULT_RETRY_CONFIG, options && options.retryConfig || {});
    const reporter = options && options.reporter;
    let lastResult = null;
    let lastError = null;

    for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
      try {
        const result = await callOnce(body);
        lastResult = result;

        if (!isRetryableBusyResult(result)) {
          return result;
        }

        if (attempt >= config.maxRetries) {
          return result;
        }

        showRetryNotice(attempt + 1, config.maxRetries, result.message, reporter);
        await sleep(getRetryDelay(attempt, config));
      } catch (error) {
        lastError = error;

        if (!isRetryableBusyError(error) || attempt >= config.maxRetries) {
          throw error;
        }

        showRetryNotice(attempt + 1, config.maxRetries, error.message, reporter);
        await sleep(getRetryDelay(attempt, config));
      }
    }

    if (lastError) {
      throw lastError;
    }

    return lastResult;
  }

  function createApiClient(options) {
    const config = options || {};
    const apiUrl = config.apiUrl;
    const fetchImpl = config.fetchImpl;

    return {
      call: function call(body) {
        return callApiOnce(apiUrl, body, fetchImpl);
      },
      callWithRetry: function callClientWithRetry(body, retryOptions) {
        return callWithRetry(function (requestBody) {
          return callApiOnce(apiUrl, requestBody, fetchImpl);
        }, body, retryOptions || config);
      }
    };
  }

  function createLegacyCallApiRetryWrapper(originalCallApi, options) {
    if (typeof originalCallApi !== "function") {
      throw new Error("A legacy callApi function is required before installing the retry wrapper.");
    }

    return function frontendRetryCallApi(body) {
      return callWithRetry(originalCallApi, body, options || {});
    };
  }

  app.modules.apiClient = {
    status: "extracted",
    description: "Transport-only API client helpers. This module does not change root app.js behavior unless a disabled bridge flag is enabled.",
    ACTION_NAMES,
    DEFAULT_RETRY_CONFIG,
    isRetryableBusyResult,
    isRetryableBusyError,
    isBusyMessage,
    getRetryDelay,
    sleep,
    showRetryNotice,
    callApiOnce,
    callWithRetry,
    createApiClient,
    createLegacyCallApiRetryWrapper
  };
})(window);
