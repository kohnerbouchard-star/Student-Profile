/****************************************************
 * API TEST LOGGER
 *
 * Purpose:
 * - Test the same API actions your GitHub frontend uses.
 * - Log every test result to an Api_Test_Log sheet.
 * - Avoid accidental real writes unless explicitly enabled.
 *
 * Required existing functions from your project:
 * - apiRouter(body)
 * - safeResponse_(value)
 * - now_()
 * - timestamp_(date)
 * - dateKey_(date)
 * - getMasterSS_()
 * - getOrCreateSheet_(ss, sheetName, headers)
 * - appendByHeader_(sheet, headers, rowObject)
 ****************************************************/

const API_TEST_CFG = {
  LOG_SHEET_NAME: 'Api_Test_Log',

  HEADERS: [
    'Timestamp',
    'Date',
    'Test_Name',
    'Action',
    'Ok',
    'Message',
    'Duration_MS',
    'Request_JSON',
    'Response_JSON',
    'Error',
    'Notes'
  ],

  SCRIPT_PROPS: {
    TEST_CARD_ID: 'TEST_CARD_ID',
    TEST_ITEM_ID: 'TEST_ITEM_ID',
    TEST_ITEM_NAME: 'TEST_ITEM_NAME',
    TEST_TICKER: 'TEST_TICKER',
    TEST_ENABLE_WRITES: 'TEST_ENABLE_WRITES'
  }
};


/****************************************************
 * MAIN TESTS TO RUN
 ****************************************************/

/**
 * Safe test.
 * This only tests:
 * - LOGIN
 * - GET_SNAPSHOT
 * - LOGOUT
 *
 * Run this first.
 */
function testApiReadOnlyFlow() {
  const testName = 'READ_ONLY_FLOW';
  const cardId = getRequiredTestProp_('TEST_CARD_ID');

  let token = '';

  const loginResult = runApiTestStep_(testName, {
    action: 'LOGIN',
    accessCode: cardId
  });

  if (!loginResult.ok || !loginResult.token) {
    throw new Error('Login failed. Check Api_Test_Log for details.');
  }

  token = loginResult.token;

  runApiTestStep_(testName, {
    action: 'GET_SNAPSHOT',
    token: token
  });

  runApiTestStep_(testName, {
    action: 'LOGOUT',
    token: token
  });

  Logger.log('Read-only API test complete. Check Api_Test_Log.');
}


/**
 * Full test.
 * This can create real writes:
 * - STORE_PURCHASE
 * - STOCK_TRADE
 * - SUBMIT_RATING
 * - USE_ITEM
 *
 * It only runs if Script Property TEST_ENABLE_WRITES = YES.
 */
function testApiFullWriteFlow() {
  const writesEnabled = getTestProp_('TEST_ENABLE_WRITES');

  if (String(writesEnabled).toUpperCase() !== 'YES') {
    throw new Error(
      'Write tests are disabled. Set Script Property TEST_ENABLE_WRITES to YES only when you are ready to create real test rows.'
    );
  }

  const testName = 'FULL_WRITE_FLOW';

  const cardId = getRequiredTestProp_('TEST_CARD_ID');
  const itemId = getRequiredTestProp_('TEST_ITEM_ID');
  const itemName = getTestProp_('TEST_ITEM_NAME') || itemId;
  const ticker = getRequiredTestProp_('TEST_TICKER');

  let token = '';

  const loginResult = runApiTestStep_(testName, {
    action: 'LOGIN',
    accessCode: cardId
  });

  if (!loginResult.ok || !loginResult.token) {
    throw new Error('Login failed. Check Api_Test_Log for details.');
  }

  token = loginResult.token;

  runApiTestStep_(testName, {
    action: 'GET_SNAPSHOT',
    token: token
  });

  runApiTestStep_(testName, {
    action: 'STORE_PURCHASE',
    token: token,
    payload: {
      itemId: itemId,
      quantity: 1
    }
  });

  runApiTestStep_(testName, {
    action: 'USE_ITEM',
    token: token,
    payload: {
      itemId: itemId,
      itemName: itemName,
      quantity: 1,
      note: 'Testing item-use request from api-test-logger.gs'
    }
  });

  runApiTestStep_(testName, {
    action: 'STOCK_TRADE',
    token: token,
    payload: {
      action: 'BUY',
      ticker: ticker,
      shares: 1
    }
  });

  runApiTestStep_(testName, {
    action: 'SUBMIT_RATING',
    token: token,
    payload: {
      ticker: ticker,
      rating: 'HOLD',
      targetPrice: 100,
      reason: 'Testing rating submission from api-test-logger.gs'
    }
  });

  runApiTestStep_(testName, {
    action: 'GET_SNAPSHOT',
    token: token
  });

  runApiTestStep_(testName, {
    action: 'LOGOUT',
    token: token
  });

  Logger.log('Full write API test complete. Check Api_Test_Log.');
}


/**
 * Tests one action manually.
 * Edit the request object inside this function as needed.
 */
function testApiSingleAction() {
  const request = {
    action: 'LOGIN',
    accessCode: getRequiredTestProp_('TEST_CARD_ID')
  };

  const result = runApiTestStep_('SINGLE_ACTION_TEST', request);

  Logger.log(JSON.stringify(result, null, 2));
}


/****************************************************
 * CORE TEST RUNNER
 ****************************************************/

function runApiTestStep_(testName, request) {
  const startedAt = new Date();
  const action = String(request && request.action ? request.action : '').toUpperCase();

  let result;
  let errorText = '';

  try {
    result = apiRouter(request);

    return result;

  } catch (err) {
    errorText = err && err.stack ? err.stack : String(err);

    result = {
      ok: false,
      message: err && err.message ? err.message : String(err)
    };

    return result;

  } finally {
    const endedAt = new Date();
    const durationMs = endedAt.getTime() - startedAt.getTime();

    try {
      logApiTestResult_({
        timestamp: startedAt,
        testName: testName,
        action: action,
        ok: result && result.ok === true,
        message: result && result.message ? result.message : '',
        durationMs: durationMs,
        request: redactTestRequest_(request),
        response: redactTestResponse_(result),
        error: errorText,
        notes: buildTestNotes_(action, result)
      });
    } catch (logErr) {
      console.error('Failed to write Api_Test_Log:', logErr);
    }
  }
}


/****************************************************
 * LOGGING
 ****************************************************/

function logApiTestResult_(entry) {
  const ss = getMasterSS_();

  const sheet = getOrCreateSheet_(
    ss,
    API_TEST_CFG.LOG_SHEET_NAME,
    API_TEST_CFG.HEADERS
  );

  appendByHeader_(sheet, API_TEST_CFG.HEADERS, {
    Timestamp: timestamp_(entry.timestamp),
    Date: dateKey_(entry.timestamp),
    Test_Name: entry.testName,
    Action: entry.action,
    Ok: entry.ok ? 'TRUE' : 'FALSE',
    Message: entry.message || '',
    Duration_MS: entry.durationMs,
    Request_JSON: safeJsonStringify_(entry.request),
    Response_JSON: safeJsonStringify_(entry.response),
    Error: entry.error || '',
    Notes: entry.notes || ''
  });
}


function buildTestNotes_(action, result) {
  if (!result) return 'No result returned.';

  if (result.ok !== true) {
    return 'Failed action: ' + action;
  }

  if (action === 'LOGIN') {
    return result.token ? 'Login returned token.' : 'Login ok but no token returned.';
  }

  if (action === 'GET_SNAPSHOT') {
    const snapshot = result.snapshot || {};

    return [
      'Snapshot counts',
      'store=' + countArray_(snapshot.store),
      'transactions=' + countArray_(snapshot.transactions),
      'inventory=' + countArray_(snapshot.inventory),
      'market=' + countArray_(snapshot.market),
      'portfolio=' + countArray_(snapshot.portfolio),
      'ratings=' + countArray_(snapshot.ratings)
    ].join(' | ');
  }

  return 'Action completed.';
}


function countArray_(value) {
  return Array.isArray(value) ? value.length : 0;
}


/****************************************************
 * REDACTION / SAFE JSON
 ****************************************************/

function redactTestRequest_(request) {
  const copy = deepCloneForLog_(request || {});

  if (copy.token) {
    copy.token = maskToken_(copy.token);
  }

  if (copy.accessCode) {
    copy.accessCode = maskCardId_(copy.accessCode);
  }

  if (copy.cardId) {
    copy.cardId = maskCardId_(copy.cardId);
  }

  return copy;
}


function redactTestResponse_(response) {
  const copy = deepCloneForLog_(response || {});

  if (copy.token) {
    copy.token = maskToken_(copy.token);
  }

  /**
   * Keep the log readable.
   * Snapshot can be huge, so replace arrays with counts.
   */
  if (copy.snapshot) {
    copy.snapshot = summarizeSnapshotForLog_(copy.snapshot);
  }

  return copy;
}


function summarizeSnapshotForLog_(snapshot) {
  return {
    hasProfile: !!snapshot.profile,
    storeCount: countArray_(snapshot.store),
    transactionCount: countArray_(snapshot.transactions),
    inventoryCount: countArray_(snapshot.inventory),
    marketCount: countArray_(snapshot.market),
    portfolioCount: countArray_(snapshot.portfolio),
    ratingCount: countArray_(snapshot.ratings)
  };
}


function deepCloneForLog_(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (err) {
    return {
      unserializable: true,
      message: String(err)
    };
  }
}


function safeJsonStringify_(value) {
  try {
    return JSON.stringify(value);
  } catch (err) {
    return JSON.stringify({
      error: 'Could not stringify value',
      message: String(err)
    });
  }
}


function maskToken_(token) {
  const text = String(token || '');

  if (text.length <= 8) {
    return '***';
  }

  return text.slice(0, 4) + '...' + text.slice(-4);
}


function maskCardId_(cardId) {
  const text = String(cardId || '');

  if (text.length <= 4) {
    return '***';
  }

  return text.slice(0, 2) + '***' + text.slice(-2);
}


/****************************************************
 * SCRIPT PROPERTY HELPERS
 ****************************************************/

function getTestProp_(key) {
  return PropertiesService
    .getScriptProperties()
    .getProperty(key);
}


function getRequiredTestProp_(key) {
  const value = getTestProp_(key);

  if (!value) {
    throw new Error(
      'Missing Script Property: ' +
      key +
      '. Add it in Project Settings → Script Properties.'
    );
  }

  return value;
}


/****************************************************
 * SETUP HELPERS
 ****************************************************/

/**
 * Run this once to create the Api_Test_Log sheet.
 */
function setupApiTestLogSheet() {
  const ss = getMasterSS_();

  getOrCreateSheet_(
    ss,
    API_TEST_CFG.LOG_SHEET_NAME,
    API_TEST_CFG.HEADERS
  );

  Logger.log('Api_Test_Log sheet is ready.');
}


/**
 * Optional helper.
 * Shows what test properties you still need to add.
 */
function checkApiTestSetup() {
  const required = [
    'TEST_CARD_ID'
  ];

  const optional = [
    'TEST_ITEM_ID',
    'TEST_ITEM_NAME',
    'TEST_TICKER',
    'TEST_ENABLE_WRITES'
  ];

  const missingRequired = required.filter(function(key) {
    return !getTestProp_(key);
  });

  const missingOptional = optional.filter(function(key) {
    return !getTestProp_(key);
  });

  Logger.log('Missing required properties: ' + JSON.stringify(missingRequired));
  Logger.log('Missing optional properties: ' + JSON.stringify(missingOptional));
  Logger.log('TEST_ENABLE_WRITES must equal YES before write tests run.');
}
function testRouterUseItemAction() {
  const login = apiRouter({
    action: 'LOGIN',
    accessCode: PropertiesService
      .getScriptProperties()
      .getProperty('TEST_CARD_ID')
  });

  Logger.log('LOGIN RESULT:');
  Logger.log(JSON.stringify(login, null, 2));

  if (!login.ok || !login.token) {
    throw new Error('Login failed. Check TEST_CARD_ID.');
  }

  const result = apiRouter({
    action: 'USE_ITEM',
    token: login.token,
    payload: {
      itemId: PropertiesService
        .getScriptProperties()
        .getProperty('TEST_ITEM_ID'),
      itemName: PropertiesService
        .getScriptProperties()
        .getProperty('TEST_ITEM_NAME'),
      quantity: 1,
      note: 'Testing USE_ITEM through apiRouter.'
    }
  });

  Logger.log('USE_ITEM RESULT:');
  Logger.log(JSON.stringify(result, null, 2));
}