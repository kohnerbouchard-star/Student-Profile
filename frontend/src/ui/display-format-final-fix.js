// Final display formatting patch.
// Load this last so quantity fields never get mistaken for dates.

(function () {
  function cleanNumber(value) {
    if (value === undefined || value === null || value === '') return null;

    // Google Sheets dates can arrive as Date objects. Quantity should never be formatted as a date.
    if (value instanceof Date) return null;

    const cleaned = String(value).replace(/[$,%]/g, '').trim();
    const n = Number(cleaned);

    return Number.isFinite(n) ? n : null;
  }

  const oldFormatValue = typeof formatValue === 'function'
    ? formatValue
    : function (_key, value) {
        return typeof sanitize === 'function' ? sanitize(value) : String(value ?? '');
      };

  formatValue = function patchedFormatValue(key, value) {
    const k = String(key || '');

    // IMPORTANT: quantityPurchased contains "Purchased", so this must come before date checks.
    if (/quantity|qty|sharesOwned|shares/i.test(k)) {
      const n = cleanNumber(value);

      if (n === null) {
        return typeof sanitize === 'function' ? sanitize(value ?? '—') : String(value ?? '—');
      }

      return typeof sanitize === 'function'
        ? sanitize(n.toLocaleString())
        : n.toLocaleString();
    }

    return oldFormatValue(key, value);
  };

  // Also protect mini value formatting if another card uses it later.
  if (typeof formatMiniValue === 'function') {
    const oldFormatMiniValue = formatMiniValue;

    formatMiniValue = function patchedFormatMiniValue(label, value) {
      const k = String(label || '');

      if (/quantity|qty|shares/i.test(k)) {
        const n = cleanNumber(value);

        if (n === null) {
          return value ?? '—';
        }

        return n.toLocaleString();
      }

      return oldFormatMiniValue(label, value);
    };
  }
})();
