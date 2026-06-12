(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};
  const marketProfile = app.modules.marketProfile = app.modules.marketProfile || {};

  function sanitize(value) {
    if (app.modules.sanitize && typeof app.modules.sanitize.sanitizeHtml === "function") {
      return app.modules.sanitize.sanitizeHtml(value);
    }

    if (typeof global.sanitize === "function") {
      return global.sanitize(value);
    }

    return String(value ?? "").replace(/[&<>"']/g, function (char) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;"
      }[char];
    });
  }

  // display-only
  function toNumber(value) {
    const number = Number(String(value ?? "").replace(/[$,]/g, "").trim());
    return Number.isFinite(number) ? number : 0;
  }

  // display-only
  function money(value) {
    if (typeof global.money === "function") {
      return global.money(value);
    }

    return toNumber(value).toLocaleString(undefined, {
      style: "currency",
      currency: "USD"
    });
  }

  // display-only
  function shortMoney(value) {
    const number = toNumber(value);

    if (Math.abs(number) >= 1000) {
      return number.toLocaleString(undefined, {
        style: "currency",
        currency: "USD",
        notation: "compact",
        maximumFractionDigits: 1
      });
    }

    return number.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    });
  }

  function parseMarketPercent(value) {
    if (typeof marketProfile.parseMarketPercent === "function") {
      return marketProfile.parseMarketPercent(value);
    }

    if (value === undefined || value === null || value === "") return 0;
    const raw = String(value).trim();
    const number = Number(raw.replace("%", ""));
    if (!Number.isFinite(number)) return 0;
    return raw.includes("%") || Math.abs(number) > 1 ? number : number * 100;
  }

  // display-only
  function parseMarketHistory(value) {
    if (!value) return [];

    if (Array.isArray(value)) {
      return value
        .map(parseMarketHistoryEntry)
        .filter(function (point) {
          return point && point.price > 0;
        });
    }

    const text = String(value).trim();
    if (!text) return [];

    if (text.startsWith("[") || text.startsWith("{")) {
      try {
        const parsed = JSON.parse(text);
        return parseMarketHistory(Array.isArray(parsed) ? parsed : Object.values(parsed));
      } catch (_) {}
    }

    return text
      .split(/[;\n]+/)
      .flatMap(function (chunk) {
        return chunk.includes("|") || chunk.includes(":") ? [chunk] : chunk.split(",");
      })
      .map(parseMarketHistoryEntry)
      .filter(function (point) {
        return point && point.price > 0;
      });
  }

  // display-only
  function parseMarketHistoryEntry(entry, index) {
    if (entry === undefined || entry === null || entry === "") return null;

    if (typeof entry === "number") {
      return { label: `Point ${index + 1}`, price: entry };
    }

    if (typeof entry === "object") {
      const price = Number(entry.price ?? entry.Price ?? entry.close ?? entry.Close ?? entry.value ?? entry.Value ?? 0);
      const timestamp = entry.timestamp ?? entry.Timestamp ?? entry.time ?? entry.Time ?? entry.date ?? entry.Date ?? "";
      return {
        label: formatHistoryLabel(timestamp, index),
        price
      };
    }

    const text = String(entry).trim();
    if (!text) return null;

    const pipeParts = text.split("|");
    if (pipeParts.length >= 2) {
      return {
        label: formatHistoryLabel(pipeParts[0], index),
        price: toNumber(pipeParts[1])
      };
    }

    const colonMatch = text.match(/^(.+?)[:=]\s*([$,\d.]+)$/);
    if (colonMatch) {
      return {
        label: formatHistoryLabel(colonMatch[1], index),
        price: toNumber(colonMatch[2])
      };
    }

    return {
      label: `Point ${index + 1}`,
      price: toNumber(text)
    };
  }

  // display-only
  function formatHistoryLabel(value, index) {
    if (!value) return `Point ${index + 1}`;

    const text = String(value).trim();
    const parsed = Date.parse(text.replace(" ", "T"));

    if (!Number.isNaN(parsed)) {
      try {
        return new Intl.DateTimeFormat("en-US", {
          timeZone: "Asia/Seoul",
          hour: "numeric",
          minute: "2-digit"
        }).format(new Date(parsed));
      } catch (_) {}
    }

    return text;
  }

  // display-only
  function makePointLabel(index, total, range) {
    if (index === total - 1) return "Now";
    if (range === "1M") return `${total - index - 1}d ago`;
    if (range === "1W") return `${Math.ceil((total - index - 1) / 2)}d ago`;
    return `${total - index - 1}h ago`;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function hashString(value) {
    let hash = 2166136261;

    for (let index = 0; index < String(value).length; index += 1) {
      hash ^= String(value).charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
  }

  function seededRandom(seed) {
    let state = seed || 123456789;

    return function random() {
      state += 0x6D2B79F5;
      let value = state;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  function normalRandom(random) {
    const u = Math.max(random(), 0.000001);
    const v = Math.max(random(), 0.000001);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // display-only
  function buildDisplayFallbackPricePath(stock, range) {
    const current = Number(stock && stock.currentPrice || 0);
    if (!current) return [];

    const changePct = parseMarketPercent(stock && stock.changePct);
    const steps = range === "1M" ? 24 : range === "1W" ? 14 : 9;
    const seedSource = [
      stock.ticker,
      stock.sector,
      stock.currentPrice,
      stock.changePct,
      stock.lastUpdated,
      range
    ].join("|");

    const random = seededRandom(hashString(seedSource));
    const rangeMultiplier = range === "1M" ? 2.4 : range === "1W" ? 1.55 : 1;
    const baseVolatility = clamp(
      (Math.abs(changePct) / 100) * 0.72 * rangeMultiplier + 0.008,
      0.008,
      0.09
    );
    const targetStart = current / Math.max(0.12, 1 + ((changePct * rangeMultiplier) / 100));
    const logStart = Math.log(Math.max(targetStart, 0.01));
    const logEnd = Math.log(Math.max(current, 0.01));
    let logPrice = logStart;
    let volatilityState = baseVolatility;
    let momentum = 0;
    const points = [];

    for (let index = 0; index < steps; index += 1) {
      const progress = index / Math.max(steps - 1, 1);
      const targetLog = logStart + (logEnd - logStart) * progress;

      if (index === 0) {
        points.push({ label: makePointLabel(index, steps, range), price: Math.exp(logPrice) });
        continue;
      }

      if (index === steps - 1) {
        points.push({ label: makePointLabel(index, steps, range), price: current });
        continue;
      }

      const jumpShock = random() > 0.88 ? normalRandom(random) * baseVolatility * 2.6 : 0;
      const volatilityNoise = Math.abs(normalRandom(random)) * baseVolatility * 0.55;

      volatilityState = clamp(
        volatilityState * 0.72 + volatilityNoise * 0.28,
        baseVolatility * 0.55,
        baseVolatility * 2.25
      );

      const marketNoise = normalRandom(random) * volatilityState;
      momentum = momentum * 0.42 + marketNoise * 0.58;

      logPrice = logPrice +
        ((logEnd - logStart) / Math.max(steps - 1, 1)) +
        ((targetLog - logPrice) * 0.27) +
        momentum +
        jumpShock;

      points.push({
        label: makePointLabel(index, steps, range),
        price: Math.max(Math.exp(logPrice), current * 0.05)
      });
    }

    return points;
  }

  // display-only
  function buildMarketChartPoints(stock, range) {
    const parsed = parseMarketHistory(stock && stock.history);

    if (parsed.length >= 2) {
      const wanted = range === "1M" ? 24 : range === "1W" ? 14 : 9;
      return parsed.slice(-wanted).map(function (point, index, arr) {
        return {
          label: point.label || makePointLabel(index, arr.length, range),
          price: point.price
        };
      });
    }

    return buildDisplayFallbackPricePath(stock, range);
  }

  // display-only
  function renderMarketChart(stock, range) {
    const selectedRange = range || "1D";
    const points = buildMarketChartPoints(stock, selectedRange);
    const currentPrice = Number(stock && stock.currentPrice || 0);
    const change = parseMarketPercent(stock && stock.changePct);
    const trendClass = change >= 0 ? "positive" : "negative";

    if (!points.length || !currentPrice) {
      return `<div class="market-chart-empty">No chart data is available for this stock yet.</div>`;
    }

    const width = 920;
    const height = 420;
    const left = 72;
    const right = 28;
    const top = 26;
    const bottom = 58;
    const chartW = width - left - right;
    const chartH = height - top - bottom;
    const prices = points.map(function (point) { return point.price; });
    const minRaw = Math.min.apply(null, prices);
    const maxRaw = Math.max.apply(null, prices);
    const pad = Math.max((maxRaw - minRaw) * 0.16, currentPrice * 0.006, 1);
    const min = Math.max(0, minRaw - pad);
    const max = maxRaw + pad;
    const rangeValue = max - min || 1;
    const coords = points.map(function (point, index) {
      const x = left + (index / Math.max(points.length - 1, 1)) * chartW;
      const y = top + ((max - point.price) / rangeValue) * chartH;
      return Object.assign({}, point, { x, y });
    });
    const linePath = coords.map(function (point, index) {
      return `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
    }).join(" ");
    const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(2)} ${height - bottom} L ${coords[0].x.toFixed(2)} ${height - bottom} Z`;
    const yTicks = Array.from({ length: 5 }, function (_, index) {
      const value = max - (rangeValue * index / 4);
      const y = top + (chartH * index / 4);
      return { value, y };
    });
    const xTickIndexes = [0, Math.floor((coords.length - 1) / 2), coords.length - 1]
      .filter(function (value, index, arr) {
        return arr.indexOf(value) === index;
      });

    return `
      <div class="market-chart-shell">
        <div class="market-chart-heading">
          <div>
            <span>Price chart</span>
            <strong>${sanitize(stock.ticker)} - ${sanitize(selectedRange)}</strong>
          </div>
          <div>
            <span>Range</span>
            <strong>${sanitize(money(minRaw))} - ${sanitize(money(maxRaw))}</strong>
          </div>
        </div>

        <div class="market-chart-frame">
          <svg class="market-chart-v2" viewBox="0 0 ${width} ${height}" role="img" aria-label="${sanitize(stock.ticker)} price chart with x and y axis">
            ${yTicks.map(function (tick) {
              return `
                <line x1="${left}" y1="${tick.y.toFixed(2)}" x2="${width - right}" y2="${tick.y.toFixed(2)}" class="market-grid-line"></line>
                <text x="${left - 12}" y="${(tick.y + 4).toFixed(2)}" class="market-y-label" text-anchor="end">${sanitize(shortMoney(tick.value))}</text>
              `;
            }).join("")}

            <line x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}" class="market-axis-line"></line>
            <line x1="${left}" y1="${top}" x2="${left}" y2="${height - bottom}" class="market-axis-line"></line>

            ${xTickIndexes.map(function (index) {
              return `<text x="${coords[index].x.toFixed(2)}" y="${height - 22}" class="market-x-label" text-anchor="middle">${sanitize(coords[index].label)}</text>`;
            }).join("")}

            <text x="${left + chartW / 2}" y="${height - 4}" class="market-axis-title" text-anchor="middle">Time</text>
            <text x="16" y="${top + chartH / 2}" class="market-axis-title market-axis-title-y" text-anchor="middle">Price</text>

            <path d="${areaPath}" class="market-chart-area-v2 ${trendClass}"></path>
            <path d="${linePath}" class="market-chart-line-v2 ${trendClass}"></path>

            ${coords.map(function (point, index) {
              return `
                <circle
                  cx="${point.x.toFixed(2)}"
                  cy="${point.y.toFixed(2)}"
                  r="${index === coords.length - 1 ? 5 : 3.5}"
                  class="market-chart-point ${trendClass}"
                  data-label="${sanitize(point.label)}"
                  data-price="${sanitize(money(point.price))}"
                ></circle>
              `;
            }).join("")}
          </svg>

          <div id="marketChartTooltip" class="market-chart-tooltip hidden"></div>
        </div>
      </div>
    `;
  }

  marketProfile.chartStatus = "extracted";
  marketProfile.parseMarketHistory = parseMarketHistory;
  marketProfile.buildMarketChartPoints = buildMarketChartPoints;
  marketProfile.renderMarketChart = renderMarketChart;

  app.modules.marketChartView = {
    status: "extracted",
    parseMarketHistory,
    buildMarketChartPoints,
    renderMarketChart
  };
})(window);
