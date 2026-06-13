// Frontend retry patch for temporary Apps Script lock errors.
// Loaded after app.js and all UI patches.
// This does NOT retry normal errors like insufficient balance, market closed, or invalid quantity.
// It only retries temporary busy/network-style failures.

(function installApiRetryPatch() {
  if (typeof callApi !== 'function') {
    console.warn('api-retry-fix.js loaded before callApi exists.');
    return;
  }

  if (window.__apiRetryPatchInstalled) {
    return;
  }

  window.__apiRetryPatchInstalled = true;

  const originalCallApi = callApi;

  const RETRY_CFG = {
    maxRetries: 3,
    baseDelayMs: 450,
    maxDelayMs: 1800
  };

  callApi = async function patchedCallApi(body) {
    let lastResult = null;
    let lastError = null;

    for (let attempt = 0; attempt <= RETRY_CFG.maxRetries; attempt++) {
      try {
        const result = await originalCallApi(body);
        lastResult = result;

        if (!isRetryableBusyResult(result)) {
          return result;
        }

        if (attempt >= RETRY_CFG.maxRetries) {
          return result;
        }

        showRetryNotice_(attempt + 1, RETRY_CFG.maxRetries, result.message);

        await sleep_(getRetryDelay_(attempt));

      } catch (err) {
        lastError = err;

        if (!isRetryableBusyError(err) || attempt >= RETRY_CFG.maxRetries) {
          throw err;
        }

        showRetryNotice_(attempt + 1, RETRY_CFG.maxRetries, err.message);

        await sleep_(getRetryDelay_(attempt));
      }
    }

    if (lastError) {
      throw lastError;
    }

    return lastResult;
  };


  function isRetryableBusyResult(result) {
    if (!result || result.ok === true) {
      return false;
    }

    return isBusyMessage_(result.message);
  }


  function isRetryableBusyError(err) {
    if (!err) {
      return false;
    }

    return isBusyMessage_(err.message || String(err));
  }


  function isBusyMessage_(message) {
    const text = String(message || '').toLowerCase();

    return (
      text.includes('system is busy') ||
      (text.includes('try again') && text.includes('busy')) ||
      (text.includes('lock') && text.includes('busy')) ||
      text.includes('temporarily unavailable') ||
      text.includes('service unavailable') ||
      text.includes('network error') ||
      text.includes('failed to fetch')
    );
  }


  function getRetryDelay_(attempt) {
    const exponential = RETRY_CFG.baseDelayMs * Math.pow(2, attempt);
    const jitter = Math.floor(Math.random() * 250);

    return Math.min(RETRY_CFG.maxDelayMs, exponential + jitter);
  }


  function sleep_(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }


  function showRetryNotice_(attemptNumber, maxRetries, message) {
    const text = `System is busy. Retrying ${attemptNumber}/${maxRetries}...`;

    try {
      if (typeof showGlobalStatus === 'function') {
        showGlobalStatus('warn', text);
        return;
      }
    } catch (err) {}

    console.warn(text, message || '');
  }
})();
