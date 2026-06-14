function apiRouter(body) {
  let lock = null;
  let locked = false;

  try {
    if (!body) {
      return safeResponse_({
        ok: false,
        message: 'Missing request body.'
      });
    }

    const action = cleanString_(body.action).toUpperCase();

    if (!action) {
      return safeResponse_({
        ok: false,
        message: 'Missing action.'
      });
    }

    let result;

    if (action === 'LOGIN') {
      result = apiLogin_(body);

      return safeResponse_(result || {
        ok: false,
        message: 'Login returned no response.'
      });
    }

    if (action === 'LOGOUT') {
      result = apiLogout_(body);

      return safeResponse_(result || {
        ok: true
      });
    }

    if (action === 'GET_SNAPSHOT') {
      const session = requireSession_(body);

      result = {
        ok: true,
        snapshot: getStudentSnapshot_(session.cardId)
      };

      return safeResponse_(result);
    }

    if (action === 'GET_STOCK_HISTORY') {
      requireSession_(body);

      result = {
        ok: true,
        history: getStockPriceHistory_(getStockSS_(), body.payload || {})
      };

      return safeResponse_(result);
    }

    if (action === 'GET_STOCK_NEWS') {
      requireSession_(body);

      result = {
        ok: true,
        news: safeStockNews_(getStockSS_(), body.payload && body.payload.limit)
      };

      return safeResponse_(result);
    }

    lock = LockService.getScriptLock();

    if (!lock.tryLock(8000)) {
      return safeResponse_({
        ok: false,
        message: 'System is busy. Try again.'
      });
    }

    locked = true;

    const session = requireSession_(body);

    if (action === 'STORE_PURCHASE') {
      result = apiStorePurchase_(session, body.payload || {});

      return safeResponse_(result || {
        ok: false,
        message: 'Store purchase returned no response.'
      });
    }

    if (action === 'STOCK_TRADE') {
      result = apiStockTrade_(session, body.payload || {});

      return safeResponse_(result || {
        ok: false,
        message: 'Stock trade returned no response.'
      });
    }

    if (action === 'SUBMIT_RATING') {
      result = apiSubmitRating_(session, body.payload || {});

      return safeResponse_(result || {
        ok: false,
        message: 'Rating submission returned no response.'
      });
    }

    if (action === 'USE_ITEM') {
      result = apiUseItem_(session, body.payload || {});

      return safeResponse_(result || {
        ok: false,
        message: 'Item use request returned no response.'
      });
    }

    return safeResponse_({
      ok: false,
      message: 'Unknown action: ' + action
    });

  } catch (err) {
    console.error(err);

    return safeResponse_({
      ok: false,
      message: err && err.message ? err.message : String(err)
    });

  } finally {
    if (locked && lock) {
      try {
        lock.releaseLock();
      } catch (err) {}
    }
  }
}

function apiLogin_(body) {
  const cardId = normalizeCardId_(
    body.accessCode ||
    body.cardId ||
    body.code ||
    ''
  );

  if (!cardId) {
    return {
      ok: false,
      message: 'Enter your access code.'
    };
  }

  const masterSS = getMasterSS_();
  const student = findStudentByCard_(masterSS, cardId);

  if (!student) {
    return {
      ok: false,
      message: 'Access denied.'
    };
  }

  if (student.active && !isTruthy_(student.active)) {
    return {
      ok: false,
      message: 'Account inactive.'
    };
  }

  const token = Utilities.getUuid();

  CacheService.getScriptCache().put(
    'session:' + token,
    JSON.stringify({
      cardId: student.cardId,
      createdAt: Date.now()
    }),
    APP_CFG.SESSION_TTL_SECONDS
  );

  return {
    ok: true,
    token: token,
    sessionToken: token,
    profile: scrubStudent_(student),
    snapshot: getStudentSnapshot_(student.cardId)
  };
}

function apiLogout_(body) {
  const token = cleanString_(body && (body.token || body.sessionToken));

  if (token) {
    CacheService.getScriptCache().remove('session:' + token);
  }

  return {
    ok: true
  };
}

function requireSession_(body) {
  const token = cleanString_(body && (body.token || body.sessionToken));

  if (!token) {
    throw new Error('Missing session. Please log in again.');
  }

  const raw = CacheService.getScriptCache().get('session:' + token);

  if (!raw) {
    throw new Error('Session expired. Please log in again.');
  }

  return JSON.parse(raw);
}

function findStudentByCard_(ss, cardId) {
  const sheet = getSheet_(ss, APP_CFG.SHEETS.STUDENTS);
  const table = getTable_(sheet, ['Card_ID', 'Student_Name']);

  const target = normalizeCardId_(cardId);

  for (const row of table.rows) {
    const rowCard = normalizeCardId_(
      getVal_(row, ['Card_ID', 'Card ID', 'CardID', 'Card'])
    );

    if (rowCard === target) {
      return {
        _row: row._row,
        _values: row._values,
        _table: table,
        cardId: rowCard,
        rawCardId: cleanString_(
          getVal_(row, ['Card_ID', 'Card ID', 'CardID', 'Card'])
        ),
        name: cleanString_(
          getVal_(row, ['Student_Name', 'Student Name', 'Name'])
        ),
        grade: getVal_(row, ['Grade']),
        homeroom: getVal_(row, ['Homeroom', 'Class']),
        balance: Number(getVal_(row, ['Balance', 'Current Balance'])) || 0,
        jobTitle: cleanString_(getVal_(row, ['Job_Title', 'Job Title', 'Job'])),
        active: cleanString_(getVal_(row, ['Active'])) || 'Yes'
      };
    }
  }

  return null;
}

function scrubStudent_(student) {
  return {
    name: student.name,
    grade: student.grade,
    homeroom: student.homeroom,
    balance: student.balance,
    jobTitle: student.jobTitle,
    active: student.active
  };
}

function getStudentSnapshot_(cardId) {
  const masterSS = getMasterSS_();
  const stockSS = getStockSS_();

  const student = findStudentByCard_(masterSS, cardId);

  if (!student) {
    throw new Error('Student not found.');
  }

  return {
    profile: scrubStudent_(student),
    store: getActiveStoreItems_(masterSS),
    transactions: getStudentTransactions_(masterSS, cardId),
    inventory: getStudentInventory_(masterSS, cardId),
    market: getActiveMarketRows_(stockSS),
    portfolio: getStudentPortfolio_(stockSS, cardId),
    ratings: getStudentRatings_(stockSS, cardId),
    news: safeStockNews_(stockSS, 500)
  };
}

/**
 * Faster partial snapshot.
 * Use this after write actions so Apps Script does not reload every sheet.
 */
function getFastStudentSnapshot_(cardId, options) {
  options = options || {};

  const needsMaster =
    options.profile ||
    options.store ||
    options.transactions ||
    options.inventory;

  const needsStock =
    options.market ||
    options.portfolio ||
    options.ratings ||
    options.stockTrades ||
    options.news;

  const masterSS = needsMaster ? getMasterSS_() : null;
  const stockSS = needsStock ? getStockSS_() : null;

  const snapshot = {};

  if (options.profile) {
    const student = findStudentByCard_(masterSS, cardId);

    if (!student) {
      throw new Error('Student not found.');
    }

    snapshot.profile = scrubStudent_(student);
  }

  if (options.store) {
    snapshot.store = getActiveStoreItems_(masterSS);
  }

  if (options.transactions) {
    snapshot.transactions = getStudentTransactions_(masterSS, cardId);
  }

  if (options.inventory) {
    snapshot.inventory = getStudentInventory_(masterSS, cardId);
  }

  if (options.market) {
    snapshot.market = getActiveMarketRows_(stockSS);
  }

  if (options.portfolio) {
    snapshot.portfolio = getStudentPortfolio_(stockSS, cardId);
  }

  if (options.ratings) {
    snapshot.ratings = getStudentRatings_(stockSS, cardId);
  }

  if (options.news) {
    snapshot.news = safeStockNews_(stockSS, 500);
  }

  if (options.stockTrades) {
    snapshot.stockTrades = getStudentStockTrades_(stockSS, cardId);
  }

  return snapshot;
}

function getStudentStockTrades_(ss, cardId) {
  const sheet = ss.getSheetByName(APP_CFG.SHEETS.STOCK_TRADE_LOG);

  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }

  const table = getTable_(sheet, ['Timestamp', 'Card_ID']);
  const target = normalizeCardId_(cardId);

  return table.rows
    .filter(function(r) {
      return normalizeCardId_(getVal_(r, ['Card_ID', 'Card ID'])) === target;
    })
    .slice(-15)
    .reverse()
    .map(function(r) {
      return {
        timestamp: getVal_(r, ['Timestamp']),
        mode: getVal_(r, ['Action']),
        itemId: getVal_(r, ['Ticker']),
        itemName: getVal_(r, ['Ticker']),
        amount: getVal_(r, ['Total_Value', 'Total Value']),
        status: getVal_(r, ['Status']),
        note: getVal_(r, ['Note'])
      };
    });
}

function getActiveStoreItems_(ss) {
  const sheet = getSheet_(ss, APP_CFG.SHEETS.STORE);
  const table = getTable_(sheet, ['Item_ID', 'Item_Name', 'Price']);

  return table.rows
    .filter(function(r) {
      const active = cleanString_(getVal_(r, ['Active', 'Available'])) || 'Yes';
      return isTruthy_(active);
    })
    .map(function(r) {
      return {
        itemId: cleanString_(getVal_(r, ['Item_ID', 'Item ID', 'ItemID'])),
        itemName: cleanString_(getVal_(r, ['Item_Name', 'Item Name', 'Name'])),
        price: Number(getVal_(r, ['Price', 'Cost'])) || 0,
        inventory: getVal_(r, ['Inventory', 'Stock']),
        category: cleanString_(getVal_(r, ['Category'])),
        description: cleanString_(getVal_(r, ['Description']))
      };
    });
}

function getStudentTransactions_(ss, cardId) {
  const sheet = ss.getSheetByName(APP_CFG.SHEETS.TRANSACTIONS);

  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }

  const table = getTable_(sheet, ['Timestamp', 'Card_ID']);
  const target = normalizeCardId_(cardId);

  return table.rows
    .filter(function(r) {
      return normalizeCardId_(getVal_(r, ['Card_ID', 'Card ID'])) === target;
    })
    .slice(-15)
    .reverse()
    .map(function(r) {
      return {
        timestamp: getVal_(r, ['Timestamp']),
        mode: getVal_(r, ['Mode']),
        amount: getVal_(r, ['Amount']),
        startingBalance: getVal_(r, ['Starting_Balance', 'Starting Balance']),
        endingBalance: getVal_(r, ['Ending_Balance', 'Ending Balance']),
        itemId: getVal_(r, ['Item_ID', 'Item ID']),
        itemName: getVal_(r, ['Item_Name', 'Item Name']),
        note: getVal_(r, ['Note']),
        status: getVal_(r, ['Status'])
      };
    });
}

function getStudentInventory_(ss, cardId) {
  const sheet = ss.getSheetByName(APP_CFG.SHEETS.STUDENT_INVENTORY);

  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }

  const table = getTable_(sheet, ['Card_ID', 'Item_ID']);
  const target = normalizeCardId_(cardId);

  return table.rows
    .filter(function(r) {
      return normalizeCardId_(getVal_(r, ['Card_ID', 'Card ID'])) === target;
    })
    .map(function(r) {
      return {
        itemId: getVal_(r, ['Item_ID', 'Item ID']),
        itemName: getVal_(r, ['Item_Name', 'Item Name']),
        category: getVal_(r, ['Category']),
        quantityPurchased:
          Number(getVal_(r, ['Quantity_Purchased', 'Quantity Purchased', 'Quantity'])) || 0,
        totalSpent:
          Number(getVal_(r, ['Total_Spent', 'Total Spent'])) || 0,
        lastPurchased: getVal_(r, ['Last_Purchased', 'Last Purchased'])
      };
    });
}

function getStudentPortfolio_(ss, cardId) {
  const sheet = ss.getSheetByName(APP_CFG.SHEETS.STOCK_PORTFOLIO);

  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }

  const table = getTable_(sheet, ['Card_ID', 'Ticker']);
  const target = normalizeCardId_(cardId);

  return table.rows
    .filter(function(r) {
      return normalizeCardId_(getVal_(r, ['Card_ID', 'Card ID'])) === target;
    })
    .filter(function(r) {
      return Number(getVal_(r, ['Shares_Owned', 'Shares Owned', 'Shares'])) > 0;
    })
    .map(function(r) {
      return {
        ticker: normalizeTicker_(getVal_(r, ['Ticker'])),
        sharesOwned:
          Number(getVal_(r, ['Shares_Owned', 'Shares Owned', 'Shares'])) || 0,
        avgBuyPrice:
          Number(getVal_(r, ['Avg_Buy_Price', 'Avg Buy Price'])) || 0,
        totalCost:
          Number(getVal_(r, ['Total_Cost', 'Total Cost'])) || 0,
        lastUpdated: getVal_(r, ['Last_Updated', 'Last Updated'])
      };
    });
}

function getStudentRatings_(ss, cardId) {
  const sheet = ss.getSheetByName(APP_CFG.SHEETS.STOCK_RATINGS);

  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }

  const table = getTable_(sheet, ['Timestamp', 'Card_ID']);
  const target = normalizeCardId_(cardId);

  return table.rows
    .filter(function(r) {
      return normalizeCardId_(getVal_(r, ['Card_ID', 'Card ID'])) === target;
    })
    .slice(-15)
    .reverse()
    .map(function(r) {
      return {
        timestamp: getVal_(r, ['Timestamp']),
        ticker: getVal_(r, ['Ticker']),
        rating: getVal_(r, ['Rating']),
        targetPrice: getVal_(r, ['Target_Price', 'Target Price']),
        reason: getVal_(r, ['Reason']),
        rewardStatus: getVal_(r, ['Reward_Status', 'Reward Status']),
        rewardAmount: getVal_(r, ['Reward_Amount', 'Reward Amount'])
      };
    });
}

function safeStockNews_(stockSS, limit) {
  try {
    if (typeof getStockNewsReports_ !== 'function') {
      return [];
    }

    return getStockNewsReports_(stockSS, limit || 15) || [];

  } catch (err) {
    console.error(
      'Stock news failed safely: ' +
      (err && err.message ? err.message : String(err))
    );

    return [];
  }
}

function apiStorePurchase_(session, payload) {
  const itemId = cleanString_(payload.itemId);
  const quantity = Number(payload.quantity);

  if (!itemId || !Number.isInteger(quantity) || quantity <= 0) {
    return {
      ok: false,
      message: 'Choose an item and enter a valid quantity.'
    };
  }

  const ss = getMasterSS_();
  const student = findStudentByCard_(ss, session.cardId);

  if (!student) {
    return {
      ok: false,
      message: 'Student not found.'
    };
  }

  if (student.active && !isTruthy_(student.active)) {
    return {
      ok: false,
      message: 'Account inactive.'
    };
  }

  const storeSheet = getSheet_(ss, APP_CFG.SHEETS.STORE);
  const storeTable = getTable_(storeSheet, ['Item_ID', 'Item_Name', 'Price']);

  const targetItem = cleanString_(itemId).toLowerCase();

  const item = storeTable.rows.find(function(r) {
    const rowItemId = cleanString_(
      getVal_(r, ['Item_ID', 'Item ID', 'ItemID'])
    ).toLowerCase();

    const rowItemName = cleanString_(
      getVal_(r, ['Item_Name', 'Item Name', 'Name'])
    ).toLowerCase();

    return rowItemId === targetItem || rowItemName === targetItem;
  });

  if (!item) {
    return {
      ok: false,
      message: 'Store item not found.'
    };
  }

  const active = cleanString_(getVal_(item, ['Active', 'Available'])) || 'Yes';

  if (!isTruthy_(active)) {
    return {
      ok: false,
      message: 'Item is not active.'
    };
  }

  const price = Number(getVal_(item, ['Price', 'Cost'])) || 0;

  if (price <= 0) {
    return {
      ok: false,
      message: 'Invalid item price.'
    };
  }

  const inventoryCol = col_(storeTable, ['Inventory', 'Stock']);
  const inventoryRaw = inventoryCol === -1 ? '' : item._values[inventoryCol];

  const inventory =
    inventoryRaw !== '' && !isNaN(Number(inventoryRaw))
      ? Number(inventoryRaw)
      : null;

  if (inventory !== null && quantity > inventory) {
    return {
      ok: false,
      message: 'Not enough inventory available.'
    };
  }

  const totalCost = round2_(price * quantity);
  const startingBalance = Number(student.balance) || 0;
  const endingBalance = round2_(startingBalance - totalCost);

  if (endingBalance < 0) {
    logTransaction_(
      ss,
      student,
      'STORE_PURCHASE',
      totalCost,
      startingBalance,
      startingBalance,
      item,
      'Denied - insufficient balance',
      'Not enough balance.'
    );

    return {
      ok: false,
      message: 'Purchase denied: not enough balance.',
      snapshot: getFastStudentSnapshot_(session.cardId, {
        profile: true,
        transactions: true
      })
    };
  }

  setRowValue_(student._table, student, ['Balance', 'Current Balance'], endingBalance);
  setRowValue_(student._table, student, ['Last_Updated', 'Last Updated'], timestamp_(now_()));
  writeRow_(student._table, student);

  if (inventory !== null && inventoryCol !== -1) {
    item._values[inventoryCol] = Math.max(0, inventory - quantity);
    writeRow_(storeTable, item);
  }

  logTransaction_(
    ss,
    student,
    'STORE_PURCHASE',
    totalCost,
    startingBalance,
    endingBalance,
    item,
    'Success',
    'Store purchase'
  );

  updateStudentInventory_(ss, student, item, quantity, totalCost);

  return {
    ok: true,
    message: 'Purchase completed.',
    snapshot: getFastStudentSnapshot_(session.cardId, {
      profile: true,
      store: true,
      inventory: true,
      transactions: true
    })
  };
}

function logTransaction_(ss, student, mode, amount, startingBalance, endingBalance, item, status, note) {
  const sheet = getOrCreateSheet_(
    ss,
    APP_CFG.SHEETS.TRANSACTIONS,
    APP_CFG.HEADERS.TRANSACTIONS
  );

  const now = now_();

  appendByHeader_(sheet, APP_CFG.HEADERS.TRANSACTIONS, {
    Timestamp: timestamp_(now),
    Date: dateKey_(now),
    Card_ID: student.rawCardId || student.cardId,
    Student_Name: student.name,
    Mode: mode,
    Amount: amount,
    Starting_Balance: startingBalance,
    Ending_Balance: endingBalance,
    Item_ID: item ? getVal_(item, ['Item_ID', 'Item ID']) : '',
    Item_Name: item ? getVal_(item, ['Item_Name', 'Item Name']) : '',
    Note: note || '',
    Status: status || 'Success'
  });
}

function updateStudentInventory_(ss, student, item, quantity, totalCost) {
  const sheet = getOrCreateSheet_(
    ss,
    APP_CFG.SHEETS.STUDENT_INVENTORY,
    APP_CFG.HEADERS.STUDENT_INVENTORY
  );

  const table = getTable_(sheet, ['Card_ID', 'Item_ID']);

  const card = normalizeCardId_(student.cardId);
  const itemId = cleanString_(getVal_(item, ['Item_ID', 'Item ID']));
  const normalizedItem = itemId.toLowerCase();

  const existing = table.rows.find(function(r) {
    return (
      normalizeCardId_(getVal_(r, ['Card_ID', 'Card ID'])) === card &&
      cleanString_(getVal_(r, ['Item_ID', 'Item ID'])).toLowerCase() === normalizedItem
    );
  });

  const nowText = timestamp_(now_());

  if (existing) {
    setRowValue_(table, existing, ['Student_Name', 'Student Name'], student.name);
    setRowValue_(table, existing, ['Item_Name', 'Item Name'], getVal_(item, ['Item_Name', 'Item Name']));
    setRowValue_(table, existing, ['Category'], getVal_(item, ['Category']));

    setRowValue_(
      table,
      existing,
      ['Quantity_Purchased', 'Quantity Purchased', 'Quantity'],
      Number(getVal_(existing, ['Quantity_Purchased', 'Quantity Purchased', 'Quantity'])) + quantity
    );

    setRowValue_(
      table,
      existing,
      ['Total_Spent', 'Total Spent'],
      round2_(Number(getVal_(existing, ['Total_Spent', 'Total Spent'])) + totalCost)
    );

    setRowValue_(table, existing, ['Last_Purchased', 'Last Purchased'], nowText);
    setRowValue_(table, existing, ['Last_Updated', 'Last Updated'], nowText);
    writeRow_(table, existing);
    return;
  }

  appendByHeader_(sheet, APP_CFG.HEADERS.STUDENT_INVENTORY, {
    Card_ID: student.rawCardId || student.cardId,
    Student_Name: student.name,
    Item_ID: itemId,
    Item_Name: getVal_(item, ['Item_Name', 'Item Name']),
    Category: getVal_(item, ['Category']),
    Quantity_Purchased: quantity,
    Total_Spent: totalCost,
    Last_Purchased: nowText,
    Last_Updated: nowText
  });
}

function apiStockTrade_(session, payload) {
  if (!isStockMarketOpen_()) {
    return {
      ok: false,
      message: 'Market is closed.'
    };
  }

  const action = cleanString_(payload.action).toUpperCase();
  const ticker = normalizeTicker_(payload.ticker);
  const shares = Number(payload.shares);

  if (!['BUY', 'SELL'].includes(action)) {
    return {
      ok: false,
      message: 'Action must be BUY or SELL.'
    };
  }

  if (!ticker || !Number.isInteger(shares) || shares <= 0) {
    return {
      ok: false,
      message: 'Ticker and whole-number shares are required.'
    };
  }

  const masterSS = getMasterSS_();
  const stockSS = getStockSS_();

  const student = findStudentByCard_(masterSS, session.cardId);

  if (!student) {
    return {
      ok: false,
      message: 'Student not found.'
    };
  }

  const stock = findStockByTicker_(stockSS, ticker);

  if (!stock) {
    return {
      ok: false,
      message: 'Ticker not found or inactive.'
    };
  }

  if (action === 'BUY') {
    return buyStock_(masterSS, stockSS, student, stock, shares);
  }

  return sellStock_(masterSS, stockSS, student, stock, shares);
}

function isStockMarketOpen_() {
  const hour = Number(Utilities.formatDate(now_(), APP_CFG.TZ, 'H'));
  return hour >= APP_CFG.STOCK.MARKET_OPEN_HOUR && hour < APP_CFG.STOCK.MARKET_CLOSE_HOUR;
}

function findStockByTicker_(ss, ticker) {
  const sheet = getSheet_(ss, APP_CFG.SHEETS.STOCK_MARKET);
  const table = getTable_(sheet, ['Ticker', 'Current_Price']);

  const target = normalizeTicker_(ticker);

  const row = table.rows.find(function(r) {
    const rowTicker = normalizeTicker_(getVal_(r, ['Ticker']));
    const active = cleanString_(getVal_(r, ['Active'])) || 'Yes';
    return rowTicker === target && isTruthy_(active);
  });

  if (!row) {
    return null;
  }

  return {
    ticker: target,
    name: cleanString_(getVal_(row, ['Company_Name', 'Company Name'])) || target,
    price: Number(getVal_(row, ['Current_Price', 'Current Price'])) || 0
  };
}

function buyStock_(masterSS, stockSS, student, stock, shares) {
  const totalCost = round2_(stock.price * shares);

  if (student.balance < totalCost) {
    logStockTrade_(
      stockSS,
      student,
      'BUY',
      stock,
      shares,
      stock.price,
      totalCost,
      'Denied',
      'Insufficient balance'
    );

    return {
      ok: false,
      message: 'Buy denied: not enough balance.',
      snapshot: getFastStudentSnapshot_(student.cardId, {
        profile: true,
        stockTrades: true
      })
    };
  }

  const endingBalance = round2_(student.balance - totalCost);

  setRowValue_(student._table, student, ['Balance', 'Current Balance'], endingBalance);
  setRowValue_(student._table, student, ['Last_Updated', 'Last Updated'], timestamp_(now_()));
  writeRow_(student._table, student);

  updatePortfolioBuy_(stockSS, student, stock, shares, totalCost);

  logStockTrade_(
    stockSS,
    student,
    'BUY',
    stock,
    shares,
    stock.price,
    totalCost,
    'Success',
    ''
  );

  return {
    ok: true,
    message: 'Stock purchase completed.',
    snapshot: getFastStudentSnapshot_(student.cardId, {
      profile: true,
      portfolio: true,
      stockTrades: true
    })
  };
}

function sellStock_(masterSS, stockSS, student, stock, shares) {
  const holding = findHolding_(stockSS, student.cardId, stock.ticker);

  if (!holding || holding.sharesOwned < shares) {
    logStockTrade_(
      stockSS,
      student,
      'SELL',
      stock,
      shares,
      stock.price,
      0,
      'Denied',
      'Not enough shares'
    );

    return {
      ok: false,
      message: 'Sell denied: not enough shares.',
      snapshot: getFastStudentSnapshot_(student.cardId, {
        profile: true,
        portfolio: true,
        stockTrades: true
      })
    };
  }

  const saleValue = round2_(stock.price * shares);
  const endingBalance = round2_(student.balance + saleValue);

  setRowValue_(student._table, student, ['Balance', 'Current Balance'], endingBalance);
  setRowValue_(student._table, student, ['Last_Updated', 'Last Updated'], timestamp_(now_()));
  writeRow_(student._table, student);

  updatePortfolioSell_(stockSS, holding, shares);

  logStockTrade_(
    stockSS,
    student,
    'SELL',
    stock,
    shares,
    stock.price,
    saleValue,
    'Success',
    ''
  );

  return {
    ok: true,
    message: 'Stock sale completed.',
    snapshot: getFastStudentSnapshot_(student.cardId, {
      profile: true,
      portfolio: true,
      stockTrades: true
    })
  };
}

function findHolding_(ss, cardId, ticker) {
  const sheet = ss.getSheetByName(APP_CFG.SHEETS.STOCK_PORTFOLIO);

  if (!sheet || sheet.getLastRow() < 2) {
    return null;
  }

  const table = getTable_(sheet, ['Card_ID', 'Ticker']);
  const targetCard = normalizeCardId_(cardId);
  const targetTicker = normalizeTicker_(ticker);

  const row = table.rows.find(function(r) {
    return (
      normalizeCardId_(getVal_(r, ['Card_ID', 'Card ID'])) === targetCard &&
      normalizeTicker_(getVal_(r, ['Ticker'])) === targetTicker
    );
  });

  if (!row) {
    return null;
  }

  return {
    table: table,
    row: row,
    sharesOwned: Number(getVal_(row, ['Shares_Owned', 'Shares Owned', 'Shares'])) || 0,
    avgBuyPrice: Number(getVal_(row, ['Avg_Buy_Price', 'Avg Buy Price'])) || 0,
    totalCost: Number(getVal_(row, ['Total_Cost', 'Total Cost'])) || 0
  };
}

function updatePortfolioBuy_(ss, student, stock, shares, totalCost) {
  const sheet = getOrCreateSheet_(
    ss,
    APP_CFG.SHEETS.STOCK_PORTFOLIO,
    APP_CFG.HEADERS.STOCK_PORTFOLIO
  );

  const holding = findHolding_(ss, student.cardId, stock.ticker);
  const nowText = timestamp_(now_());

  if (holding) {
    const oldShares = holding.sharesOwned;
    const oldCost = holding.totalCost;
    const newShares = oldShares + shares;
    const newCost = round2_(oldCost + totalCost);
    const avg = round2_(newCost / newShares);

    setRowValue_(holding.table, holding.row, ['Student_Name', 'Student Name'], student.name);
    setRowValue_(holding.table, holding.row, ['Shares_Owned', 'Shares Owned', 'Shares'], newShares);
    setRowValue_(holding.table, holding.row, ['Avg_Buy_Price', 'Avg Buy Price'], avg);
    setRowValue_(holding.table, holding.row, ['Total_Cost', 'Total Cost'], newCost);
    setRowValue_(holding.table, holding.row, ['Last_Updated', 'Last Updated'], nowText);
    writeRow_(holding.table, holding.row);
    return;
  }

  appendByHeader_(sheet, APP_CFG.HEADERS.STOCK_PORTFOLIO, {
    Card_ID: student.rawCardId || student.cardId,
    Student_Name: student.name,
    Ticker: stock.ticker,
    Shares_Owned: shares,
    Avg_Buy_Price: stock.price,
    Total_Cost: totalCost,
    Last_Updated: nowText
  });
}

function updatePortfolioSell_(ss, holding, shares) {
  const remaining = holding.sharesOwned - shares;

  if (remaining <= 0) {
    holding.table.sheet.deleteRow(holding.row._row);
    return;
  }

  const remainingCost = round2_(holding.avgBuyPrice * remaining);

  setRowValue_(holding.table, holding.row, ['Shares_Owned', 'Shares Owned', 'Shares'], remaining);
  setRowValue_(holding.table, holding.row, ['Total_Cost', 'Total Cost'], remainingCost);
  setRowValue_(holding.table, holding.row, ['Last_Updated', 'Last Updated'], timestamp_(now_()));
  writeRow_(holding.table, holding.row);
}

function logStockTrade_(ss, student, action, stock, shares, price, totalValue, status, note) {
  const sheet = getOrCreateSheet_(
    ss,
    APP_CFG.SHEETS.STOCK_TRADE_LOG,
    APP_CFG.HEADERS.STOCK_TRADE_LOG
  );

  const now = now_();

  appendByHeader_(sheet, APP_CFG.HEADERS.STOCK_TRADE_LOG, {
    Timestamp: timestamp_(now),
    Date: dateKey_(now),
    Card_ID: student.rawCardId || student.cardId,
    Student_Name: student.name,
    Action: action,
    Ticker: stock.ticker,
    Shares: shares,
    Price: price,
    Total_Value: totalValue,
    Status: status,
    Note: note || ''
  });
}

function apiSubmitRating_(session, payload) {
  const hour = Number(Utilities.formatDate(now_(), APP_CFG.TZ, 'H'));

  if (hour < APP_CFG.STOCK.RATING_OPEN_HOUR || hour >= APP_CFG.STOCK.RATING_CLOSE_HOUR) {
    return {
      ok: false,
      message: 'Rating submissions are closed.'
    };
  }

  const ticker = normalizeTicker_(payload.ticker);
  const rating = cleanString_(payload.rating).toUpperCase();
  const targetPrice = Number(payload.targetPrice);
  const reason = cleanString_(payload.reason);

  if (!ticker || !['BUY', 'HOLD', 'SELL'].includes(rating) || targetPrice <= 0 || reason.length < 10) {
    return {
      ok: false,
      message: 'Ticker, rating, target price, and a reason are required.'
    };
  }

  const masterSS = getMasterSS_();
  const stockSS = getStockSS_();
  const student = findStudentByCard_(masterSS, session.cardId);

  if (!student) {
    return {
      ok: false,
      message: 'Student not found.'
    };
  }

  const stock = findStockByTicker_(stockSS, ticker);

  if (!stock) {
    return {
      ok: false,
      message: 'Ticker not found or inactive.'
    };
  }

  if (ratingSubmittedToday_(stockSS, student.cardId, ticker)) {
    return {
      ok: false,
      message: 'You already submitted a rating for this ticker today.'
    };
  }

  const sheet = getOrCreateSheet_(
    stockSS,
    APP_CFG.SHEETS.STOCK_RATINGS,
    APP_CFG.HEADERS.STOCK_RATINGS
  );

  const now = now_();

  appendByHeader_(sheet, APP_CFG.HEADERS.STOCK_RATINGS, {
    Timestamp: timestamp_(now),
    Date: dateKey_(now),
    Card_ID: student.rawCardId || student.cardId,
    Student_Name: student.name,
    Ticker: ticker,
    Rating: rating,
    Target_Price: targetPrice,
    Reason: reason,
    Check_Date: '',
    End_Of_Day_Price: '',
    'Accuracy_%': '',
    Reward_Status: 'Pending',
    Reward_Amount: 0
  });

  return {
    ok: true,
    message: 'Rating submitted.',
    snapshot: getFastStudentSnapshot_(student.cardId, {
      ratings: true
    })
  };
}

function ratingSubmittedToday_(ss, cardId, ticker) {
  const sheet = ss.getSheetByName(APP_CFG.SHEETS.STOCK_RATINGS);

  if (!sheet || sheet.getLastRow() < 2) {
    return false;
  }

  const table = getTable_(sheet, ['Timestamp', 'Card_ID']);
  const targetCard = normalizeCardId_(cardId);
  const targetTicker = normalizeTicker_(ticker);
  const today = dateKey_(now_());

  return table.rows.some(function(r) {
    const rowCard = normalizeCardId_(getVal_(r, ['Card_ID', 'Card ID']));
    const rowTicker = normalizeTicker_(getVal_(r, ['Ticker']));
    const rowDate =
      cleanString_(getVal_(r, ['Date'])) ||
      cleanString_(getVal_(r, ['Timestamp'])).slice(0, 10);

    return rowCard === targetCard && rowTicker === targetTicker && rowDate === today;
  });
}

function safeResponse_(value) {
  try {
    return JSON.parse(JSON.stringify(value, function(key, val) {
      if (val instanceof Date) {
        return Utilities.formatDate(val, APP_CFG.TZ, 'yyyy-MM-dd HH:mm:ss');
      }

      if (typeof val === 'undefined') {
        return '';
      }

      if (val === null) {
        return '';
      }

      return val;
    }));
  } catch (err) {
    return {
      ok: false,
      message: 'Could not serialize server response: ' + err.message
    };
  }
}