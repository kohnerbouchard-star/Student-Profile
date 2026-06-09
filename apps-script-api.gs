/**
 * Apps Script backend scaffold for the static Classroom Economy front end.
 * Deploy this as a Web App, then paste its URL into app.js as API_URL.
 * Keep all Sheet writes inside LockService to avoid multi-user collisions.
 */
const SPREADSHEET_ID = 'PASTE_YOUR_SPREADSHEET_ID_HERE';

function doGet(e) {
  const action = e.parameter.action || 'bootstrap';
  if (action === 'bootstrap') return json_(getBootstrapData_());
  return json_({ ok: false, message: 'Unknown GET action.' });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return json_({ ok:false, message:'System busy. Try again.' });
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    if (body.action === 'STORE_PURCHASE') return json_(handleStorePurchase_(body));
    if (body.action === 'STOCK_TRADE') return json_(handleStockTrade_(body));
    if (body.action === 'ANALYST_RATING') return json_(handleAnalystRating_(body));
    return json_({ ok:false, message:'Unknown POST action.' });
  } catch (err) {
    return json_({ ok:false, message: err.message });
  } finally {
    lock.releaseLock();
  }
}

function getBootstrapData_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  return {
    ok: true,
    students: sheetObjects_(ss.getSheetByName('Imported_Students'), 3),
    storeItems: sheetObjects_(ss.getSheetByName('Imported_Store'), 3),
    market: sheetObjects_(ss.getSheetByName('Imported_Stock_Market'), 1),
    transactions: sheetObjects_(ss.getSheetByName('Imported_Transactions'), 3),
    attendance: sheetObjects_(ss.getSheetByName('Imported_Attendance'), 3),
    portfolio: sheetObjects_(ss.getSheetByName('Imported_Stock_Portfolio'), 1),
    news: sheetObjects_(ss.getSheetByName('Imported_Stock_News'), 1),
    financials: sheetObjects_(ss.getSheetByName('Imported_Stock_Financials'), 1),
  };
}

function handleStorePurchase_(body) {
  // Replace this adapter with your existing purchase function if needed.
  // Required body: { cardId, itemId, qty }
  if (!body.cardId || !body.itemId || !body.qty) return { ok:false, message:'Missing cardId, itemId, or qty.' };
  // TODO: validate student, inventory, price, balance, then append to Transactions.
  return { ok:true, message:'Store purchase endpoint reached.' };
}

function handleStockTrade_(body) {
  // Required body: { cardId, ticker, tradeAction, shares }
  if (!body.cardId || !body.ticker || !body.tradeAction || !body.shares) return { ok:false, message:'Missing trade fields.' };
  // TODO: validate and update balance/portfolio/transactions.
  return { ok:true, message:'Stock trade endpoint reached.' };
}

function handleAnalystRating_(body) {
  // Required body: { cardId, ticker, rating, targetPrice, reason }
  if (!body.cardId || !body.ticker || !body.rating || !body.targetPrice || !body.reason) return { ok:false, message:'Missing rating fields.' };
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Imported_Stock_Ratings') || ss.insertSheet('Imported_Stock_Ratings');
  sheet.appendRow([new Date(), body.cardId, body.ticker, body.rating, body.targetPrice, body.reason, 'Submitted']);
  return { ok:true, message:'Rating submitted.' };
}

function sheetObjects_(sheet, headerRow) {
  const values = sheet.getDataRange().getValues();
  const headers = values[headerRow - 1].map(String);
  return values.slice(headerRow).filter(row => row.some(v => v !== '')).map(row => {
    const obj = {};
    headers.forEach((h, i) => { if (h) obj[h] = row[i]; });
    return obj;
  });
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
