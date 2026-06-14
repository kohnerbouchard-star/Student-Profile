function getStockHistorySheet_(ss, createIfMissing) {
  const names = [
    'Imported_Stock_History',
    APP_CFG.SHEETS.STOCK_PRICE_HISTORY,
    'Stock_Price_History',
    'Imported_Stock_Price_History',
    'Stock_History'
  ].filter(Boolean);

  for (let i = 0; i < names.length; i++) {
    const sheet = ss.getSheetByName(names[i]);

    if (sheet) {
      return sheet;
    }
  }

  if (!createIfMissing) {
    return null;
  }

  return getOrCreateSheet_(
    ss,
    'Imported_Stock_History',
    APP_CFG.HEADERS.STOCK_PRICE_HISTORY
  );
}

function setupStockHistoryAndNews() {
  const ss = getStockSS_();

  getStockHistorySheet_(ss, true);

  getOrCreateSheet_(
    ss,
    APP_CFG.SHEETS.STOCK_NEWS_REPORTS,
    APP_CFG.HEADERS.STOCK_NEWS_REPORTS
  );

  console.log('Stock history and news sheets are ready.');
}

function installStockHistoryAndNewsTriggers() {
  removeStockHistoryAndNewsTriggers_();

  ScriptApp.newTrigger('logStockPriceHistory')
    .timeBased()
    .everyMinutes(APP_CFG.STOCK.HISTORY_LOG_MINUTE_INTERVAL || 15)
    .create();

  ScriptApp.newTrigger('generateStockNewsReports')
    .timeBased()
    .everyHours(1)
    .create();

  console.log('Stock history/news triggers installed.');
}

function removeStockHistoryAndNewsTriggers_() {
  const triggerNames = {
    logStockPriceHistory: true,
    generateStockNewsReports: true
  };

  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (triggerNames[trigger.getHandlerFunction()]) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function logStockPriceHistory() {
  if (!isStockMarketOpen_()) {
    return;
  }

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(1000)) {
    console.log('Stock history skipped: another process is running.');
    return;
  }

  try {
    const ss = getStockSS_();

    const marketSheet = getSheet_(ss, APP_CFG.SHEETS.STOCK_MARKET);
    const marketTable = getTable_(marketSheet, ['Ticker', 'Current_Price']);

    const historySheet = getStockHistorySheet_(ss, true);

    const now = now_();
    const nowTimestamp = timestamp_(now);
    const today = dateKey_(now);
    const timeText = Utilities.formatDate(now, APP_CFG.TZ, 'HH:mm:ss');

    if (stockHistoryAlreadyLoggedThisMinute_(historySheet, now)) {
      console.log('Stock history already logged for this minute.');
      return;
    }

    const rows = marketTable.rows
      .filter(function(r) {
        const active = cleanString_(getVal_(r, ['Active'])) || 'Yes';
        return isTruthy_(active);
      })
      .map(function(r) {
        return [
          nowTimestamp,
          today,
          timeText,
          normalizeTicker_(getVal_(r, ['Ticker'])),
          cleanString_(getVal_(r, ['Company_Name', 'Company Name'])),
          cleanString_(getVal_(r, ['Sector'])),
          cleanString_(getVal_(r, ['Asset_Type', 'Asset Type'])),
          Number(getVal_(r, ['Current_Price', 'Current Price'])) || 0,
          normalizePercentNumber_(getVal_(r, ['Change_%', 'Change %'])),
          cleanString_(getVal_(r, ['Trend'])),
          getVal_(r, ['Volume']),
          'Open'
        ];
      })
      .filter(function(row) {
        return row[3] && row[7] > 0;
      });

    if (!rows.length) {
      console.log('No stock rows available for history logging.');
      return;
    }

    historySheet
      .getRange(historySheet.getLastRow() + 1, 1, rows.length, rows[0].length)
      .setValues(rows);

    trimSheetToMaxDataRows_(
      historySheet,
      APP_CFG.STOCK.MAX_HISTORY_ROWS || 10000,
      2000
    );

    console.log('Logged stock history rows: ' + rows.length);

  } finally {
    try {
      lock.releaseLock();
    } catch (err) {}
  }
}

function generateStockNewsReports() {
  if (!isStockMarketOpen_()) {
    return;
  }

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(1000)) {
    console.log('Stock news skipped: another process is running.');
    return;
  }

  try {
    const ss = getStockSS_();

    const marketSheet = getSheet_(ss, APP_CFG.SHEETS.STOCK_MARKET);
    const marketTable = getTable_(marketSheet, ['Ticker', 'Current_Price']);

    const historySheet = getStockHistorySheet_(ss, true);

    const newsSheet = getOrCreateSheet_(
      ss,
      APP_CFG.SHEETS.STOCK_NEWS_REPORTS,
      APP_CFG.HEADERS.STOCK_NEWS_REPORTS
    );

    const now = now_();
    const today = dateKey_(now);
    const nowTimestamp = timestamp_(now);

    const existingToday = getExistingNewsTickerMap_(newsSheet, today);
    const previousPriceMap = getRecentHistoryPriceMap_(historySheet, 3000);

    const minMove = Number(APP_CFG.STOCK.NEWS_MIN_ABS_CHANGE_PCT) || 1.5;
    const maxReports = Number(APP_CFG.STOCK.NEWS_REPORTS_PER_RUN) || 8;

    const candidates = marketTable.rows
      .map(function(r) {
        const ticker = normalizeTicker_(getVal_(r, ['Ticker']));
        const active = cleanString_(getVal_(r, ['Active'])) || 'Yes';
        const currentPrice = Number(getVal_(r, ['Current_Price', 'Current Price'])) || 0;
        const changePct = normalizePercentNumber_(getVal_(r, ['Change_%', 'Change %']));

        return {
          ticker: ticker,
          active: isTruthy_(active),
          companyName: cleanString_(getVal_(r, ['Company_Name', 'Company Name'])) || ticker,
          sector: cleanString_(getVal_(r, ['Sector'])),
          assetType: cleanString_(getVal_(r, ['Asset_Type', 'Asset Type'])),
          currentPrice: currentPrice,
          changePct: changePct,
          trend: cleanString_(getVal_(r, ['Trend']))
        };
      })
      .filter(function(stock) {
        return (
          stock.active &&
          stock.ticker &&
          stock.currentPrice > 0 &&
          !existingToday[stock.ticker] &&
          Math.abs(stock.changePct) >= minMove
        );
      })
      .sort(function(a, b) {
        return Math.abs(b.changePct) - Math.abs(a.changePct);
      })
      .slice(0, maxReports);

    if (!candidates.length) {
      console.log('No major stock news candidates found.');
      return;
    }

    const rows = candidates.map(function(stock) {
      const previousPrice = previousPriceMap[stock.ticker] || '';
      const report = buildStockNewsReport_(stock);

      return [
        nowTimestamp,
        today,
        stock.ticker,
        stock.companyName,
        stock.sector,
        report.headline,
        report.summary,
        report.impact,
        report.sentiment,
        previousPrice,
        stock.currentPrice,
        stock.changePct,
        'Yes'
      ];
    });

    newsSheet
      .getRange(newsSheet.getLastRow() + 1, 1, rows.length, rows[0].length)
      .setValues(rows);

    console.log('Generated stock news reports: ' + rows.length);

  } finally {
    try {
      lock.releaseLock();
    } catch (err) {}
  }
}

function trimStockPriceHistoryNow() {
  const ss = getStockSS_();

  const sheet = getStockHistorySheet_(ss, true);

  trimSheetToMaxDataRows_(
    sheet,
    APP_CFG.STOCK.MAX_HISTORY_ROWS || 10000
  );

  console.log('Stock price history trimmed.');
}

function getStockNewsReports_(ss, limit) {
  limit = Math.min(Number(limit) || 200, 500);

  const sheetNames = [
    'Imported_Stock_News',
    APP_CFG.SHEETS.STOCK_NEWS_REPORTS,
    'Stock_News_Reports',
    'Stock_News'
  ].filter(Boolean);

  const seenSheets = {};
  const allNews = [];

  sheetNames.forEach(function(name) {
    if (seenSheets[name]) {
      return;
    }

    seenSheets[name] = true;

    const sheet = ss.getSheetByName(name);

    if (!sheet || sheet.getLastRow() < 2) {
      return;
    }

    const table = getTable_(sheet, ['Timestamp', 'Ticker', 'Headline']);

    table.rows.forEach(function(r) {
      const active = cleanString_(getVal_(r, ['Active', 'Status'])) || 'Yes';

      if (!isNewsRowVisible_(active)) {
        return;
      }

      const timestamp = getVal_(r, ['Timestamp']);
      const date = getVal_(r, ['Date']);
      const ticker = normalizeTicker_(getVal_(r, ['Ticker']));
      const headline = cleanString_(getVal_(r, ['Headline']));
      const summary = cleanString_(getVal_(r, ['Summary', 'Body']));

      if (!ticker || !headline) {
        return;
      }

      allNews.push({
        timestamp: timestamp,
        date: date,
        ticker: ticker,
        companyName: cleanString_(getVal_(r, ['Company_Name', 'Company Name'])),
        sector: cleanString_(getVal_(r, ['Sector'])),
        headline: headline,
        summary: summary,
        impact: cleanString_(getVal_(r, ['Impact', 'Impact_Type', 'Impact Type'])),
        sentiment: cleanString_(getVal_(r, ['Sentiment'])),
        priceBefore: getVal_(r, ['Price_Before', 'Price Before']),
        priceAfter: getVal_(r, ['Price_After', 'Price After']),
        changePct: getVal_(r, ['Change_%', 'Change %', 'Price_Impact_%', 'Price Impact %']),
        sourceSheet: name,
        _sort: newsSortMillis_(timestamp || date),
        _dedupeKey: [
          normalizeNewsDateKey_(date || timestamp),
          ticker,
          headline
        ].join('|')
      });
    });
  });

  const deduped = {};
  const rows = [];

  allNews
    .sort(function(a, b) {
      return b._sort - a._sort;
    })
    .forEach(function(row) {
      if (deduped[row._dedupeKey]) {
        return;
      }

      deduped[row._dedupeKey] = true;

      rows.push({
        timestamp: row.timestamp,
        date: row.date,
        ticker: row.ticker,
        companyName: row.companyName,
        sector: row.sector,
        headline: row.headline,
        summary: row.summary,
        impact: row.impact,
        sentiment: row.sentiment,
        priceBefore: row.priceBefore,
        priceAfter: row.priceAfter,
        changePct: row.changePct,
        sourceSheet: row.sourceSheet
      });
    });

  return rows.slice(0,limit);
}

function isNewsRowVisible_(value) {
  const text = cleanString_(value).toLowerCase();

  if (!text) {
    return true;
  }

  return [
    'yes',
    'true',
    'active',
    'published',
    'open',
    '1'
  ].indexOf(text) !== -1;
}

function newsSortMillis_(value) {
  if (!value) {
    return 0;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  const parsed = new Date(value).getTime();

  if (!isNaN(parsed)) {
    return parsed;
  }

  return 0;
}

function getStockPriceHistory_(ss, payload) {
  payload = payload || {};

  const ticker = normalizeTicker_(payload.ticker);
  const limit = Math.min(Number(payload.limit) || 120, 300);

  const sheet = getStockHistorySheet_(ss, false);

  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }

  const table = getTable_(sheet, ['Timestamp', 'Ticker', 'Price']);

  let rows = table.rows;

  if (ticker) {
    rows = rows.filter(function(r) {
      return normalizeTicker_(getVal_(r, ['Ticker'])) === ticker;
    });
  }

  return rows
    .slice(-limit)
    .map(function(r) {
      return {
        timestamp: getVal_(r, ['Timestamp']),
        date: getVal_(r, ['Date']),
        time: getVal_(r, ['Time']),
        ticker: normalizeTicker_(getVal_(r, ['Ticker'])),
        companyName: cleanString_(getVal_(r, ['Company_Name', 'Company Name'])),
        sector: cleanString_(getVal_(r, ['Sector'])),
        assetType: cleanString_(getVal_(r, ['Asset_Type', 'Asset Type'])),
        price: Number(getVal_(r, ['Price', 'Current_Price', 'Current Price'])) || 0,
        changePct: getVal_(r, ['Change_%', 'Change %']),
        trend: cleanString_(getVal_(r, ['Trend'])),
        volume: getVal_(r, ['Volume']),
        marketStatus: getVal_(r, ['Market_Status', 'Market Status'])
      };
    });
}

function getActiveMarketRows_(ss) {
  const sheet =
    ss.getSheetByName(APP_CFG.SHEETS.STOCK_MARKET) ||
    ss.getSheetByName('Imported_Stock_Market') ||
    ss.getSheetByName('Stock_Market');

  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }

  const historyMetrics = getStockHistoryMetricsForSnapshot_(ss);
  const table = getTable_(sheet, ['Ticker', 'Current_Price']);

  return table.rows
    .filter(function(r) {
      const active = cleanString_(getVal_(r, ['Active'])) || 'Yes';
      return isTruthy_(active);
    })
    .map(function(r) {
      const ticker = normalizeTicker_(getVal_(r, ['Ticker']));
      const metrics = historyMetrics[ticker] || {};

      const sheetPrice =
        Number(getVal_(r, ['Current_Price', 'Current Price', 'Price'])) || 0;

      const currentPrice =
        Number(metrics.currentPrice) ||
        sheetPrice ||
        0;

      return {
        ticker: ticker,
        companyName: cleanString_(getVal_(r, ['Company_Name', 'Company Name'])) || ticker,
        sector: cleanString_(getVal_(r, ['Sector'])),
        currentPrice: currentPrice,

        changePct:
          metrics.changePct !== '' &&
          metrics.changePct !== null &&
          typeof metrics.changePct !== 'undefined'
            ? metrics.changePct
            : getVal_(r, ['Change_%', 'Change %']),

        trend: metrics.trend || cleanString_(getVal_(r, ['Trend'])),
        assetType: cleanString_(getVal_(r, ['Asset_Type', 'Asset Type'])) || 'Stock',

        previousClose: metrics.previousClose || '',
        dayLow: metrics.dayLow || '',
        dayHigh: metrics.dayHigh || '',
        volume: metrics.volume || '',
        marketCap: getVal_(r, ['Market_Cap', 'Market Cap', 'Market_Value', 'Market Value']) || '',
        lastUpdated: metrics.lastUpdated || getVal_(r, ['Last_Updated', 'Last Updated', 'Timestamp']),
        history: metrics.history || []
      };
    });
}

function getStockHistoryMetricsForSnapshot_(ss) {
  const sheet = getStockHistorySheet_(ss, false);

  if (!sheet || sheet.getLastRow() < 2) {
    console.info('No imported stock history sheet found.');
    return {};
  }

  const table = getTable_(sheet, ['Timestamp', 'Ticker', 'Price']);

  const rows = table.rows
    .map(function(r) {
      const ticker = normalizeTicker_(getVal_(r, ['Ticker']));

      const dateValue = getVal_(r, ['Date']);
      const timeValue = getVal_(r, ['Time']);

      const timestamp =
        getVal_(r, ['Timestamp']) ||
        combineStockHistoryDateTime_(dateValue, timeValue);

      const price =
        Number(getVal_(r, ['Price', 'Current_Price', 'Current Price', 'Close'])) || 0;

      const volume =
        Number(getVal_(r, ['Volume', 'Trade_Volume', 'Trade Volume', 'Daily_Volume', 'Daily Volume'])) || 0;

      return {
        ticker: ticker,
        timestamp: timestamp,
        date: dateValue,
        time: timeValue,
        price: price,
        volume: volume,
        dateKey: stockHistoryDateKey_(timestamp || dateValue)
      };
    })
    .filter(function(row) {
      return row.ticker && row.price > 0;
    });

  const grouped = {};

  rows.forEach(function(row) {
    if (!grouped[row.ticker]) {
      grouped[row.ticker] = [];
    }

    grouped[row.ticker].push(row);
  });

  const result = {};

  Object.keys(grouped).forEach(function(ticker) {
    const tickerRows = grouped[ticker].sort(function(a, b) {
      return stockHistoryMillis_(a.timestamp) - stockHistoryMillis_(b.timestamp);
    });

    if (!tickerRows.length) {
      return;
    }

    const latest = tickerRows[tickerRows.length - 1];
    const latestDateKey = latest.dateKey;

    const dayRows = tickerRows.filter(function(row) {
      return row.dateKey === latestDateKey;
    });

    const previousDayRows = tickerRows.filter(function(row) {
      return row.dateKey && row.dateKey < latestDateKey;
    });

    const previousClose =
      previousDayRows.length
        ? previousDayRows[previousDayRows.length - 1].price
        : tickerRows.length >= 2
          ? tickerRows[tickerRows.length - 2].price
          : latest.price;

    const pricesToday = dayRows
      .map(function(row) {
        return Number(row.price) || 0;
      })
      .filter(function(price) {
        return price > 0;
      });

    const dayLow = pricesToday.length ? Math.min.apply(null, pricesToday) : latest.price;
    const dayHigh = pricesToday.length ? Math.max.apply(null, pricesToday) : latest.price;

    const volume = dayRows.reduce(function(total, row) {
      return total + (Number(row.volume) || 0);
    }, 0);

    const changePct = previousClose
      ? ((latest.price - previousClose) / previousClose) * 100
      : 0;

    result[ticker] = {
      currentPrice: latest.price,
      previousClose: round2_(previousClose),
      dayLow: round2_(dayLow),
      dayHigh: round2_(dayHigh),
      volume: volume || latest.volume || '',
      lastUpdated: latest.timestamp,
      changePct: round2_(changePct),
      trend: changePct >= 0 ? 'Up' : 'Down',
      history: tickerRows.slice(-80).map(function(row) {
        return {
          timestamp: row.timestamp,
          label: formatStockHistoryPointLabel_(row.timestamp),
          price: row.price,
          volume: row.volume
        };
      })
    };
  });

  return result;
}

function stockHistoryAlreadyLoggedThisMinute_(sheet, now) {
  if (!sheet || sheet.getLastRow() < 2) {
    return false;
  }

  const currentMinute = Utilities.formatDate(now, APP_CFG.TZ, 'yyyy-MM-dd HH:mm');
  const lastTimestamp = cleanString_(sheet.getRange(sheet.getLastRow(), 1).getValue());

  return lastTimestamp.slice(0, 16) === currentMinute;
}

function trimSheetToMaxDataRows_(sheet, maxDataRows, maxDeleteThisRun) {
  maxDataRows = Number(maxDataRows) || 10000;

  const dataRows = Math.max(0, sheet.getLastRow() - 1);
  const extraRows = dataRows - maxDataRows;

  if (extraRows <= 0) {
    return;
  }

  let rowsToDelete = extraRows;

  if (maxDeleteThisRun) {
    rowsToDelete = Math.min(rowsToDelete, Number(maxDeleteThisRun));
  }

  while (rowsToDelete > 0) {
    const batchSize = Math.min(rowsToDelete, 5000);
    sheet.deleteRows(2, batchSize);
    rowsToDelete -= batchSize;
  }
}

function getExistingNewsTickerMap_(sheet, dateText) {
  const map = {};

  if (!sheet || sheet.getLastRow() < 2) {
    return map;
  }

  const table = getTable_(sheet, ['Date', 'Ticker']);
  const targetDate = normalizeNewsDateKey_(dateText);

  table.rows.forEach(function(r) {
    const rowDate = normalizeNewsDateKey_(getVal_(r, ['Date', 'Timestamp']));
    const ticker = normalizeTicker_(getVal_(r, ['Ticker']));

    if (rowDate === targetDate && ticker) {
      map[ticker] = true;
    }
  });

  return map;
}

function normalizeNewsDateKey_(value) {
  if (!value) {
    return '';
  }

  if (value instanceof Date) {
    return Utilities.formatDate(value, APP_CFG.TZ, 'yyyy-MM-dd');
  }

  const text = cleanString_(value);

  if (!text) {
    return '';
  }

  const parsed = new Date(text);

  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, APP_CFG.TZ, 'yyyy-MM-dd');
  }

  return text.slice(0, 10);
}

function removeDuplicateStockNewsReportsNow() {
  const ss = getStockSS_();

  const sheet =
    ss.getSheetByName(APP_CFG.SHEETS.STOCK_NEWS_REPORTS) ||
    ss.getSheetByName('Stock_News_Reports') ||
    ss.getSheetByName('Imported_Stock_News');

  if (!sheet || sheet.getLastRow() < 2) {
    console.log('No stock news rows to clean.');
    return;
  }

  const table = getTable_(sheet, ['Timestamp', 'Ticker', 'Headline']);
  const seen = {};
  const rowsToDelete = [];

  table.rows.forEach(function(r) {
    const dateKey = normalizeNewsDateKey_(getVal_(r, ['Date', 'Timestamp']));
    const ticker = normalizeTicker_(getVal_(r, ['Ticker']));
    const headline = cleanString_(getVal_(r, ['Headline']));

    if (!dateKey || !ticker || !headline) {
      return;
    }

    const key = [dateKey, ticker, headline].join('|');

    if (seen[key]) {
      rowsToDelete.push(r._row);
    } else {
      seen[key] = true;
    }
  });

  rowsToDelete
    .sort(function(a, b) {
      return b - a;
    })
    .forEach(function(rowNumber) {
      sheet.deleteRow(rowNumber);
    });

  console.log('Removed duplicate stock news rows: ' + rowsToDelete.length);
}

function testStockNewsReportsNow_() {
  const ss = getStockSS_();
  const news = getStockNewsReports_(ss, 20);

  console.log('News rows returned:', news.length);
  console.log(JSON.stringify(news.slice(0, 10).map(function(row) {
    return {
      timestamp: row.timestamp,
      date: row.date,
      ticker: row.ticker,
      headline: row.headline,
      impact: row.impact,
      sentiment: row.sentiment,
      changePct: row.changePct
    };
  }), null, 2));
}

function getRecentHistoryPriceMap_(sheet, lookbackRows) {
  const map = {};

  if (!sheet || sheet.getLastRow() < 2) {
    return map;
  }

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const rowCount = Math.min(Number(lookbackRows) || 3000, lastRow - 1);
  const startRow = Math.max(2, lastRow - rowCount + 1);

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const headerMap = {};

  headers.forEach(function(header, index) {
    headerMap[normalizeHeader_(header)] = index;
  });

  const tickerCol = headerMap.ticker;
  const priceCol = headerMap.price;

  if (typeof tickerCol === 'undefined' || typeof priceCol === 'undefined') {
    return map;
  }

  const values = sheet.getRange(startRow, 1, rowCount, lastCol).getValues();

  for (let i = values.length - 1; i >= 0; i--) {
    const ticker = normalizeTicker_(values[i][tickerCol]);

    if (!ticker || map[ticker]) {
      continue;
    }

    map[ticker] = Number(values[i][priceCol]) || '';
  }

  return map;
}

function buildStockNewsReport_(stock) {
  const absMove = Math.abs(stock.changePct);

  let sentiment = 'Neutral';
  let direction = 'holds steady';
  let verb = 'moves';

  if (stock.changePct > 0) {
    sentiment = 'Positive';
    direction = 'rises';
    verb = 'gains';
  } else if (stock.changePct < 0) {
    sentiment = 'Negative';
    direction = 'falls';
    verb = 'drops';
  }

  let impact = 'Low';

  if (absMove >= 5) {
    impact = 'High';
  } else if (absMove >= 2) {
    impact = 'Medium';
  }

  const sectorText = stock.sector ? stock.sector + ' sector' : 'market';
  const moveText = formatSignedPercent_(stock.changePct);

  return {
    sentiment: sentiment,
    impact: impact,
    headline: stock.companyName + ' ' + direction + ' ' + moveText + ' in simulated trading',
    summary:
      stock.ticker +
      ' ' +
      verb +
      ' ' +
      moveText +
      ' to ' +
      round2_(stock.currentPrice) +
      '. The move is tied to current activity in the ' +
      sectorText +
      '. Students should compare the price move with the company trend, sector conditions, and their own portfolio exposure.'
  };
}

function normalizePercentNumber_(value) {
  const text = cleanString_(value);

  if (!text) {
    return 0;
  }

  const hadPercentSign = text.indexOf('%') !== -1;
  const n = Number(text.replace('%', '').replace(',', ''));

  if (isNaN(n)) {
    return 0;
  }

  if (!hadPercentSign && Math.abs(n) > 0 && Math.abs(n) <= 1) {
    return round2_(n * 100);
  }

  return round2_(n);
}

function formatSignedPercent_(value) {
  const n = Number(value) || 0;

  if (n > 0) {
    return '+' + round2_(n) + '%';
  }

  return round2_(n) + '%';
}

function combineStockHistoryDateTime_(dateValue, timeValue) {
  if (!dateValue && !timeValue) {
    return '';
  }

  if (dateValue instanceof Date && timeValue instanceof Date) {
    return Utilities.formatDate(dateValue, APP_CFG.TZ, 'yyyy-MM-dd') + ' ' +
      Utilities.formatDate(timeValue, APP_CFG.TZ, 'HH:mm:ss');
  }

  if (dateValue instanceof Date) {
    return Utilities.formatDate(dateValue, APP_CFG.TZ, 'yyyy-MM-dd') +
      (timeValue ? ' ' + cleanString_(timeValue) : '');
  }

  return cleanString_(dateValue) + (timeValue ? ' ' + cleanString_(timeValue) : '');
}

function stockHistoryDateKey_(value) {
  if (!value) {
    return '';
  }

  try {
    return Utilities.formatDate(new Date(value), APP_CFG.TZ, 'yyyy-MM-dd');
  } catch (err) {
    return cleanString_(value).slice(0, 10);
  }
}

function stockHistoryMillis_(value) {
  if (!value) {
    return 0;
  }

  const millis = new Date(value).getTime();

  if (!isNaN(millis)) {
    return millis;
  }

  return 0;
}

function formatStockHistoryPointLabel_(value) {
  if (!value) {
    return '';
  }

  try {
    return Utilities.formatDate(new Date(value), APP_CFG.TZ, 'M/d HH:mm');
  } catch (err) {
    return cleanString_(value);
  }
}

function testImportedStockHistorySnapshot_() {
  const ss = getStockSS_();
  const metrics = getStockHistoryMetricsForSnapshot_(ss);

  console.log('Tickers with history:', Object.keys(metrics).length);
  console.log(JSON.stringify(Object.keys(metrics).slice(0, 5).map(function(ticker) {
    return {
      ticker: ticker,
      previousClose: metrics[ticker].previousClose,
      dayLow: metrics[ticker].dayLow,
      dayHigh: metrics[ticker].dayHigh,
      volume: metrics[ticker].volume,
      lastUpdated: metrics[ticker].lastUpdated,
      historyPoints: metrics[ticker].history ? metrics[ticker].history.length : 0
    };
  }), null, 2));
}

function testMarketRowsWithHistory_() {
  const ss = getStockSS_();
  const rows = getActiveMarketRows_(ss);

  console.log('Market rows:', rows.length);
  console.log(JSON.stringify(rows.slice(0, 5).map(function(row) {
    return {
      ticker: row.ticker,
      currentPrice: row.currentPrice,
      previousClose: row.previousClose,
      dayLow: row.dayLow,
      dayHigh: row.dayHigh,
      volume: row.volume,
      lastUpdated: row.lastUpdated,
      historyPoints: row.history ? row.history.length : 0
    };
  }), null, 2));
}