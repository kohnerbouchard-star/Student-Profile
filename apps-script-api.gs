/**
 * Permissioned Apps Script backend scaffold for the Classroom Economy frontend.
 * Deploy this as a Web App, then paste the Web App URL into app.js as API_URL.
 * All write actions are session-checked and locked before touching Google Sheets.
 */
const SPREADSHEET_ID = 'PASTE_YOUR_MASTER_SPREADSHEET_ID_HERE';
const SESSION_TTL_SECONDS = 6 * 60 * 60;
const ADMIN_CARD_IDS = []; // Optional: ['teacher-card-id']

const PERMISSIONS = {
  STUDENT: ['STORE_PURCHASE', 'STOCK_TRADE', 'ANALYST_RATING'],
  READ_ONLY: []
};

const SHEETS = {
  students: 'Students',
  store: 'Store_Items',
  transactions: 'Transactions',
  attendance: 'Attendance_Log',
  portfolio: 'Stock_Portfolio',
  market: 'Stock_Market',
  ratings: 'Stock_Ratings',
  queue: 'WebApp_Action_Queue',
  news: 'Stock_News',
  financials: 'Stock_Financials'
};

function doPost(e) {
  try {
    const body = JSON.parse((e.postData && e.postData.contents) || '{}');
    if (body.action === 'LOGIN') return json_(handleLogin_(body));

    const session = requireSession_(body.sessionToken);
    requirePermission_(session, body.action);

    return withLock_(function () {
if (body.action === 'STORE_PURCHASE') return json_(handleStorePurchase_(session, body.payload || {}));
      if (body.action === 'STOCK_TRADE') return json_(handleStockTrade_(session, body.payload || {}));
      if (body.action === 'ANALYST_RATING') return json_(handleAnalystRating_(session, body.payload || {}));
      return json_({ ok: false, message: 'Unknown action.' });
    });
  } catch (err) {
    return json_({ ok: false, message: err.message });
  }
}

function handleLogin_(body) {
  const cardId = normalizeCardId_(body.cardId);
  if (!cardId) return { ok: false, message: 'Missing Card ID.' };

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const student = findStudent_(ss, cardId);
  if (!student) return { ok: false, message: 'Card ID not found.' };
  if (String(student.Active || 'Yes').toLowerCase() === 'no') return { ok: false, message: 'This Card ID is inactive.' };

  const role = ADMIN_CARD_IDS.map(normalizeCardId_).includes(cardId) ? 'STUDENT' : 'STUDENT';
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put('session:' + token, JSON.stringify({ cardId: cardId, role: role }), SESSION_TTL_SECONDS);

  return {
    ok: true,
    sessionToken: token,
    cardId: cardId,
    role: role,
    permissions: PERMISSIONS[role],
    snapshot: getStudentSnapshot_(ss, cardId)
  };
}

function requireSession_(token) {
  if (!token) throw new Error('Missing session token. Log in again.');
  const raw = CacheService.getScriptCache().get('session:' + token);
  if (!raw) throw new Error('Session expired. Log in again.');
  return JSON.parse(raw);
}

function requirePermission_(session, action) {
  const allowed = PERMISSIONS[session.role] || [];
  if (!allowed.includes(action)) throw new Error('You do not have permission to perform this action.');
}


function handleStorePurchase_(session, payload) {
  if (!payload.itemId || !payload.qty) throw new Error('Missing item or quantity.');

  // Fast safe mode: queue the request. Connect this to your existing store purchase function when ready.
  appendQueue_(SpreadsheetApp.openById(SPREADSHEET_ID), session, 'STORE_PURCHASE', payload, 'Submitted');
  return { ok: true, message: 'Purchase request submitted.' };

  // Later: replace the queue-only behavior above with your existing locked purchase function.
}

function handleStockTrade_(session, payload) {
  if (!payload.ticker || !payload.tradeAction || !payload.shares) throw new Error('Missing trade fields.');
  appendQueue_(SpreadsheetApp.openById(SPREADSHEET_ID), session, 'STOCK_TRADE', payload, 'Submitted');
  return { ok: true, message: 'Trade request submitted.' };
}

function handleAnalystRating_(session, payload) {
  if (!payload.ticker || !payload.rating || !payload.targetPrice || !payload.reason) throw new Error('Missing rating fields.');
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  appendByHeader_(getOrCreateSheet_(ss, SHEETS.ratings, ['Timestamp','Card_ID','Ticker','Rating','Target_Price','Reason','Status']), {
    Timestamp: new Date(), Card_ID: session.cardId, Ticker: payload.ticker, Rating: payload.rating,
    Target_Price: payload.targetPrice, Reason: payload.reason, Status: 'Submitted'
  });
  appendQueue_(ss, session, 'ANALYST_RATING', payload, 'Submitted');
  return { ok: true, message: 'Rating submitted.', snapshot: getStudentSnapshot_(ss, session.cardId) };
}

function appendQueue_(ss, session, action, payload, status) {
  appendByHeader_(getOrCreateSheet_(ss, SHEETS.queue, ['Timestamp','Card_ID','Role','Action','Payload_JSON','Status']), {
    Timestamp: new Date(), Card_ID: session.cardId, Role: session.role, Action: action,
    Payload_JSON: JSON.stringify(payload || {}), Status: status || 'Submitted'
  });
}

function getStudentSnapshot_(ss, cardId) {
  return {
    students: sheetObjectsSafe_(findSheet_(ss, [SHEETS.students, 'Imported_Students']), 3).filter(r => normalizeCardId_(r.Card_ID) === cardId),
    storeItems: sheetObjectsSafe_(findSheet_(ss, [SHEETS.store, 'Imported_Store']), 3).filter(r => String(r.Active || 'Yes').toLowerCase() !== 'no'),
    market: sheetObjectsSafe_(findSheet_(ss, [SHEETS.market, 'Imported_Stock_Market']), 1).filter(r => String(r.Active || 'Yes').toLowerCase() !== 'no'),
    transactions: sheetObjectsSafe_(findSheet_(ss, [SHEETS.transactions, 'Imported_Transactions']), 3).filter(r => normalizeCardId_(r.Card_ID) === cardId),
    attendance: sheetObjectsSafe_(findSheet_(ss, [SHEETS.attendance, 'Imported_Attendance']), 3).filter(r => normalizeCardId_(r.Card_ID) === cardId),
    portfolio: sheetObjectsSafe_(findSheet_(ss, [SHEETS.portfolio, 'Imported_Stock_Portfolio']), 1).filter(r => normalizeCardId_(r.Card_ID) === cardId),
    ratings: sheetObjectsSafe_(findSheet_(ss, [SHEETS.ratings, 'Imported_Stock_Ratings']), 1).filter(r => normalizeCardId_(r.Card_ID) === cardId),
    news: sheetObjectsSafe_(findSheet_(ss, [SHEETS.news, 'Imported_Stock_News']), 1),
    financials: sheetObjectsSafe_(findSheet_(ss, [SHEETS.financials, 'Imported_Stock_Financials']), 1)
  };
}

function findStudent_(ss, cardId) {
  const rows = sheetObjectsSafe_(findSheet_(ss, [SHEETS.students, 'Imported_Students']), 3);
  return rows.find(r => normalizeCardId_(r.Card_ID) === cardId);
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('System busy. Try again.');
  try { return fn(); } finally { lock.releaseLock(); }
}

function findSheet_(ss, names) {
  for (var i = 0; i < names.length; i++) {
    var sh = ss.getSheetByName(names[i]);
    if (sh) return sh;
  }
  return null;
}

function getOrCreateSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function appendByHeader_(sheet, obj) {
  var headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0].map(String);
  var row = headers.map(function(h) { return obj[h] !== undefined ? obj[h] : ''; });
  sheet.appendRow(row);
}

function sheetObjectsSafe_(sheet, headerRow) {
  if (!sheet) return [];
  var values = sheet.getDataRange().getValues();
  if (values.length < headerRow) return [];
  var headers = values[headerRow - 1].map(String);
  return values.slice(headerRow).filter(function(row) { return row.some(function(v) { return v !== ''; }); }).map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) { if (h) obj[h] = row[i]; });
    return obj;
  });
}

function normalizeCardId_(value) {
  return String(value || '').trim().replace(/\.0$/, '').toLowerCase();
}

function today_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
