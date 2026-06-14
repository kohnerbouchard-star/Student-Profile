// Final display formatting patch.
// Load this last so quantity fields never get mistaken for dates.

(function () {
  const root = window.Econovaria = window.Econovaria || {};
  const utils = root.utils = root.utils || {};

  function escapeDisplay(value) {
    if (typeof utils.sanitize === 'function') return utils.sanitize(value);
    if (typeof window.sanitize === 'function') return window.sanitize(value);
    return String(value ?? '');
  }

  function cleanNumber(value) {
    if (value === undefined || value === null || value === '') return null;

    // Google Sheets dates can arrive as Date objects. Quantity should never be formatted as a date.
    if (value instanceof Date) return null;

    const cleaned = String(value).replace(/[$,%]/g, '').trim();
    const n = Number(cleaned);

    return Number.isFinite(n) ? n : null;
  }

  const oldFormatValue = typeof utils.formatValue === 'function'
    ? utils.formatValue
    : typeof window.formatValue === 'function'
      ? window.formatValue
    : function (_key, value) {
        return escapeDisplay(value);
      };

  function patchedFormatValue(key, value) {
    const k = String(key || '');

    // IMPORTANT: quantityPurchased contains "Purchased", so this must come before date checks.
    if (/quantity|qty|sharesOwned|shares/i.test(k)) {
      const n = cleanNumber(value);

      if (n === null) {
        return escapeDisplay(value ?? '—');
      }

      return escapeDisplay(n.toLocaleString());
    }

    return oldFormatValue(key, value);
  }

  utils.formatValue = patchedFormatValue;
  window.formatValue = patchedFormatValue;

  // Also protect mini value formatting if another card uses it later.
  const oldFormatMiniValue = typeof utils.formatMiniValue === 'function'
    ? utils.formatMiniValue
    : typeof window.formatMiniValue === 'function'
      ? window.formatMiniValue
      : null;

  if (oldFormatMiniValue) {
    function patchedFormatMiniValue(label, value) {
      const k = String(label || '');

      if (/quantity|qty|shares/i.test(k)) {
        const n = cleanNumber(value);

        if (n === null) {
          return escapeDisplay(value ?? '—');
        }

        return escapeDisplay(n.toLocaleString());
      }

      return oldFormatMiniValue(label, value);
    }

    utils.formatMiniValue = patchedFormatMiniValue;
    window.formatMiniValue = patchedFormatMiniValue;
  }
})();
