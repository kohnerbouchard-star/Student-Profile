// Student-facing display fixes loaded after app.js.
// Keeps pending prediction results clean and prevents NaN from appearing in tables.

function isBlankDisplayValue(value) {
  return value === undefined || value === null || value === '' || String(value).trim() === '';
}

function isFiniteDisplayNumber(value) {
  if (isBlankDisplayValue(value)) return false;
  const cleaned = String(value).replace(/[$,%]/g, '').trim();
  return Number.isFinite(Number(cleaned));
}

function money(value) {
  if (!isFiniteDisplayNumber(value)) return '—';

  const n = Number(String(value).replace(/[$,]/g, '').trim());

  return n.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD'
  });
}

function normalizeRatingRow(row) {
  const rewardStatus = pick(row, ['rewardStatus', 'Reward_Status', 'Reward Status', 'Status', 'status']);
  const rewardAmountRaw = pick(row, ['rewardAmount', 'Reward_Amount', 'Reward Amount']);
  const targetPriceRaw = pick(row, ['targetPrice', 'Target_Price', 'Target Price']);
  const endOfDayRaw = pick(row, ['endOfDayPrice', 'End_Of_Day_Price', 'End Of Day Price']);

  return {
    timestamp: pick(row, ['timestamp', 'Timestamp', 'Date', 'date']),
    ticker: pick(row, ['ticker', 'Ticker']),
    rating: pick(row, ['rating', 'Rating', 'Prediction', 'prediction']),
    targetPrice: isFiniteDisplayNumber(targetPriceRaw) ? Number(targetPriceRaw) : '',
    reason: pick(row, ['reason', 'Reason']),
    rewardStatus: rewardStatus || 'Pending',
    rewardAmount: isFiniteDisplayNumber(rewardAmountRaw) ? Number(rewardAmountRaw) : '',
    endOfDayPrice: isFiniteDisplayNumber(endOfDayRaw) ? Number(endOfDayRaw) : '',
    accuracy: pick(row, ['accuracy', 'Accuracy_%', 'Accuracy %'])
  };
}

function formatValue(key, value) {
  if (value === undefined || value === null || value === '') {
    if (/rewardStatus|status/i.test(key)) {
      return '<span class="badge warn">Pending</span>';
    }

    return '—';
  }

  if (/rewardStatus/i.test(key)) {
    const text = String(value).trim() || 'Pending';
    const lower = text.toLowerCase();
    const cls = lower.includes('pending') || lower.includes('unchecked') || lower.includes('not checked')
      ? 'warn'
      : lower.includes('success') || lower.includes('paid') || lower.includes('reward') || lower.includes('complete')
        ? 'good'
        : lower.includes('denied') || lower.includes('failed')
          ? 'bad'
          : '';

    return `<span class="badge ${cls}">${sanitize(text)}</span>`;
  }

  if (/timestamp|date|updated|purchased/i.test(key)) {
    return sanitize(formatDateTime(value));
  }

  if (/changePct|accuracy/i.test(key)) {
    return sanitize(formatPercentLike(value));
  }

  if (/rewardAmount/i.test(key)) {
    if (!isFiniteDisplayNumber(value)) return '—';
    return sanitize(money(value));
  }

  if (/amount|balance|price|cost|spent|value|target/i.test(key)) {
    if (!isFiniteDisplayNumber(value)) return '—';
    return sanitize(money(value));
  }

  if (/gainLoss/i.test(key)) {
    if (!isFiniteDisplayNumber(value)) return '—';
    const cls = Number(value) >= 0 ? 'positive' : 'negative';
    return `<span class="${cls}">${sanitize(money(value))}</span>`;
  }

  if (/status|active/i.test(key)) {
    const text = String(value).trim() || 'Pending';
    const lower = text.toLowerCase();
    const cls = lower.includes('success') || lower.includes('active') || lower.includes('complete')
      ? 'good'
      : lower.includes('pending')
        ? 'warn'
        : lower.includes('denied') || lower.includes('failed')
          ? 'bad'
          : '';

    return `<span class="badge ${cls}">${sanitize(text)}</span>`;
  }

  return sanitize(value);
}
