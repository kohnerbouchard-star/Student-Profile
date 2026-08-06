const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const IDENTIFIER_KEY_PATTERN = /^(?:id|uuid|.*Id|.*_id|owner.*|staff.*|playerId|gameId|contractId|storeItemId|ledgerEntryId)$/i;

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function firstArray(...values) {
  return values.find((value) => Array.isArray(value));
}

function safeText(value, maximum = 500) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text || UUID_PATTERN.test(text)) return null;
  return text.slice(0, maximum);
}

function safeNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function safeInteger(value) {
  const numeric = safeNumber(value);
  return Number.isSafeInteger(numeric) ? numeric : null;
}

function safeBoolean(value) {
  return typeof value === "boolean" ? value : null;
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

/**
 * Copies display data while stripping identifier-shaped keys and strings that
 * contain UUID values.
 * This is for whitelisted nested presentation payloads such as contract rewards;
 * top-level records are normalized by explicit field lists below.
 */
export function sanitizeOverviewDisplayValue(value, depth = 0) {
  if (depth > 5 || value === undefined || typeof value === "function" || typeof value === "symbol") return undefined;
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") return safeText(value, 1_000) ?? undefined;

  if (Array.isArray(value)) {
    return value
      .slice(0, 100)
      .map((item) => sanitizeOverviewDisplayValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }

  if (!isRecord(value)) return undefined;
  const result = {};
  Object.entries(value).slice(0, 100).forEach(([key, item]) => {
    if (IDENTIFIER_KEY_PATTERN.test(key)) return;
    const safeValue = sanitizeOverviewDisplayValue(item, depth + 1);
    if (safeValue !== undefined) result[key] = safeValue;
  });
  return result;
}

function unwrapEnvelope(value, aliases = []) {
  let current = value;
  for (let depth = 0; depth < 5 && isRecord(current); depth += 1) {
    const alias = aliases.find((key) => isRecord(current[key]));
    if (alias) {
      current = current[alias];
      continue;
    }
    if (isRecord(current.model)) {
      current = current.model;
      continue;
    }
    if (isRecord(current.data?.model)) {
      current = current.data.model;
      continue;
    }
    if (isRecord(current.data)) {
      current = current.data;
      continue;
    }
    if (isRecord(current.payload)) {
      current = current.payload;
      continue;
    }
    if (isRecord(current.result)) {
      current = current.result;
      continue;
    }
    break;
  }
  return isRecord(current) ? current : null;
}

function readSettledPanel(resources, aliases) {
  const containers = [resources?.panels, resources].filter(isRecord);
  let candidate;
  for (const container of containers) {
    const key = aliases.find((alias) => container[alias] !== undefined);
    if (key) {
      candidate = container[key];
      break;
    }
  }
  if (candidate === undefined || candidate === null) return Object.freeze({ available: false, value: null });
  if (candidate.status === "rejected") return Object.freeze({ available: false, value: null });
  if (candidate.status === "fulfilled") candidate = candidate.value;
  return Object.freeze({ available: true, value: candidate });
}

function normalizeGame(game) {
  if (!isRecord(game)) return null;
  return compactObject({
    name: safeText(firstDefined(game.name, game.title), 160),
    status: safeText(game.status, 64),
    joinCode: safeText(firstDefined(game.joinCode, game.gameCode, game.code), 128),
    gameCode: safeText(firstDefined(game.gameCode, game.joinCode, game.code), 128),
    joinCodeStatus: safeText(game.joinCodeStatus, 64),
    createdAt: safeText(game.createdAt, 80),
    updatedAt: safeText(game.updatedAt, 80),
  });
}

function normalizeLeaderboardRow(row) {
  if (!isRecord(row)) return null;
  const breakdown = isRecord(row.netWorthBreakdown) ? row.netWorthBreakdown : {};
  return compactObject({
    rank: safeInteger(row.rank),
    name: safeText(firstDefined(row.name, row.displayName), 160),
    displayName: safeText(firstDefined(row.displayName, row.name), 160),
    rosterLabel: safeText(row.rosterLabel, 160),
    status: safeText(row.status, 64),
    sessionStatus: safeText(row.sessionStatus, 64),
    online: safeBoolean(row.online),
    lastActiveAt: safeText(row.lastActiveAt, 80),
    balance: safeNumber(row.balance),
    cashBalance: safeNumber(row.cashBalance),
    stockMarketValue: safeNumber(row.stockMarketValue),
    inventoryMarketValue: safeNumber(row.inventoryMarketValue),
    netWorth: safeNumber(row.netWorth),
    netWorthBreakdown: compactObject({
      cash: safeNumber(breakdown.cash),
      stocks: safeNumber(breakdown.stocks),
      inventory: safeNumber(breakdown.inventory),
    }),
    overallScore: safeNumber(row.overallScore),
    overallScoreStatus: safeText(row.overallScoreStatus, 64),
    scoreFormulaVersion: safeText(row.scoreFormulaVersion, 80),
    currencyCode: safeText(row.currencyCode, 24),
    countryCode: safeText(row.countryCode, 24),
    countryName: safeText(row.countryName, 120),
    location: safeText(row.location, 160),
    flagged: safeBoolean(row.flagged),
    flagCount: safeInteger(row.flagCount),
  });
}

function normalizeAttendanceRow(row) {
  if (!isRecord(row)) return null;
  const player = isRecord(row.player) ? row.player : {};
  return compactObject({
    displayName: safeText(firstDefined(row.displayName, row.name, player.displayName), 160),
    name: safeText(firstDefined(row.name, row.displayName, player.displayName), 160),
    rosterLabel: safeText(firstDefined(row.rosterLabel, player.rosterLabel), 160),
    playerStatus: safeText(player.status, 64),
    attendanceDate: safeText(row.attendanceDate, 40),
    status: safeText(row.status, 64),
    clockedInAt: safeText(row.clockedInAt, 80),
    scannedAt: safeText(row.scannedAt, 80),
    source: safeText(row.source, 80),
    rewardAmount: safeNumber(row.rewardAmount),
    rewardCurrencyCode: safeText(row.rewardCurrencyCode, 24),
    note: safeText(row.note, 500),
    correctedAt: safeText(row.correctedAt, 80),
  });
}

function normalizeAttendanceReward(row) {
  if (!isRecord(row)) return null;
  return compactObject({
    displayName: safeText(row.displayName, 160),
    attendanceDate: safeText(row.attendanceDate, 40),
    amount: safeNumber(row.amount),
    currencyCode: safeText(row.currencyCode, 24),
    createdAt: safeText(row.createdAt, 80),
  });
}

function countFrom(...values) {
  for (const value of values) {
    const numeric = safeInteger(value);
    if (numeric !== null) return numeric;
  }
  return null;
}

function amountFrom(...values) {
  for (const value of values) {
    const numeric = safeNumber(value);
    if (numeric !== null) return numeric;
  }
  return null;
}

function latestAttendanceScan(rows) {
  if (!Array.isArray(rows)) return null;
  let latest = null;
  let latestTime = Number.NEGATIVE_INFINITY;
  rows.forEach((row) => {
    const timestamp = Date.parse(row.scannedAt || row.clockedInAt || "");
    if (Number.isFinite(timestamp) && timestamp > latestTime) {
      latest = row;
      latestTime = timestamp;
    }
  });
  return latest;
}

function normalizeAttendance(source) {
  const summary = isRecord(source.attendanceSummary) ? source.attendanceSummary : {};
  const counts = isRecord(source.attendanceCounts) ? source.attendanceCounts : {};
  const statusCounts = isRecord(source.attendanceStatusCounts) ? source.attendanceStatusCounts : {};
  const rawRows = firstArray(source.attendance, source.attendanceRows);
  const rawRewards = firstArray(source.attendanceLedger, source.attendanceRewards);
  const rows = rawRows?.map(normalizeAttendanceRow).filter(Boolean) ?? null;
  const rewards = rawRewards?.map(normalizeAttendanceReward).filter(Boolean) ?? null;
  const present = countFrom(counts.present, statusCounts.present, summary.presentCount);
  const late = countFrom(counts.late, statusCounts.late, summary.lateCount);
  const absent = countFrom(counts.absent, statusCounts.absent, summary.absentCount);
  const excused = countFrom(counts.excused, statusCounts.excused, summary.excusedCount);
  const totalPlayers = countFrom(source.totalPlayers, summary.activePlayerCount, counts.total, statusCounts.total);

  return compactObject({
    rows,
    rewards,
    summary: compactObject({
      presentCount: present,
      lateCount: late,
      absentCount: absent,
      excusedCount: excused,
      scannedCount: countFrom(summary.scannedCount),
      missingCount: countFrom(summary.missingCount),
      activePlayerCount: totalPlayers,
      rewardsIssuedCount: countFrom(summary.rewardsIssuedCount, source.rewardsIssuedToday),
      rewardsIssuedTotal: amountFrom(summary.rewardsIssuedTotal, source.rewardsIssuedTodayAmount),
    }),
    counts: compactObject({ present, late, absent, excused, total: totalPlayers }),
    totalPlayers,
    attendanceDate: safeText(source.attendanceDate, 40),
    locked: safeBoolean(firstDefined(source.attendanceLocked, source.attendanceLock?.locked)),
    lock: sanitizeOverviewDisplayValue(source.attendanceLock),
    latestScan: latestAttendanceScan(rows),
  });
}

function normalizeContract(row) {
  if (!isRecord(row)) return null;
  return compactObject({
    key: safeText(firstDefined(row.key, row.contractKey), 160),
    title: safeText(row.title, 240),
    description: safeText(row.description, 2_000),
    instructions: safeText(row.instructions, 4_000),
    category: safeText(row.category, 120),
    status: safeText(row.status, 64),
    visibility: safeText(row.visibility, 64),
    targeting: sanitizeOverviewDisplayValue(firstDefined(row.targeting, row.targetingPayload)),
    requirements: sanitizeOverviewDisplayValue(firstDefined(row.requirements, row.requirementsPayload)),
    rewards: sanitizeOverviewDisplayValue(firstDefined(row.rewards, row.rewardPayload, row.reward)),
    materials: sanitizeOverviewDisplayValue(row.materials),
    submissionRequirements: sanitizeOverviewDisplayValue(row.submissionRequirements),
    completionMode: safeText(row.completionMode, 80),
    publishedAt: safeText(row.publishedAt, 80),
    deadlineAt: safeText(row.deadlineAt, 80),
    expiresAt: safeText(row.expiresAt, 80),
    progressCount: safeInteger(row.progressCount),
    submittedCount: safeInteger(row.submittedCount),
    completedCount: safeInteger(row.completedCount),
    rewardIssuedCount: safeInteger(row.rewardIssuedCount),
    createdAt: safeText(row.createdAt, 80),
    updatedAt: safeText(row.updatedAt, 80),
  });
}

function normalizeNotification(row) {
  if (!isRecord(row)) return null;
  return compactObject({
    title: safeText(firstDefined(row.title, row.label), 240),
    label: safeText(firstDefined(row.label, row.title), 240),
    description: safeText(firstDefined(row.description, row.message), 2_000),
    message: safeText(firstDefined(row.message, row.description), 2_000),
    type: safeText(row.type, 80),
    status: safeText(row.status, 64),
    priority: safeText(row.priority, 64),
    read: safeBoolean(row.read),
    createdAt: safeText(firstDefined(row.createdAt, row.time), 80),
  });
}

function normalizeStoreItem(row) {
  if (!isRecord(row)) return null;
  const purchaseStats = isRecord(row.purchaseStats) ? row.purchaseStats : {};
  return compactObject({
    key: safeText(firstDefined(row.key, row.itemKey), 160),
    name: safeText(firstDefined(row.name, row.title), 240),
    title: safeText(firstDefined(row.title, row.name), 240),
    description: safeText(row.description, 2_000),
    category: safeText(row.category, 120),
    price: safeNumber(row.price),
    currencyCode: safeText(row.currencyCode, 24),
    stockQuantity: safeInteger(firstDefined(row.stockQuantity, row.stock)),
    stock: safeInteger(firstDefined(row.stock, row.stockQuantity)),
    status: safeText(row.status, 64),
    visibility: safeText(row.visibility, 64),
    sortOrder: safeNumber(row.sortOrder),
    purchaseStats: compactObject({
      purchaseCount: safeInteger(purchaseStats.purchaseCount),
      unitsSold: safeInteger(purchaseStats.unitsSold),
      revenue: safeNumber(purchaseStats.revenue),
    }),
    createdAt: safeText(row.createdAt, 80),
    updatedAt: safeText(row.updatedAt, 80),
  });
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function emptyCollectionState(value) {
  return Array.isArray(value) ? value.length === 0 : null;
}

/**
 * Produces the Overview-only presentation model from the four settled API reads.
 * Missing/failed panels remain null; authoritative empty arrays remain empty.
 */
export function normalizeOverviewReadModel(resources = {}) {
  const dashboardPanel = readSettledPanel(resources, ["dashboard", "overview", "Overview"]);
  const gamesPanel = readSettledPanel(resources, ["games", "Games"]);
  const notificationsPanel = readSettledPanel(resources, ["notifications", "adminNotifications", "AdminNotifications"]);
  const storePanel = readSettledPanel(resources, ["store", "Store"]);

  const dashboard = unwrapEnvelope(dashboardPanel.value, ["Overview", "overview", "dashboard"]);
  const gamesSource = unwrapEnvelope(gamesPanel.value, ["Games", "games"]);
  const notificationsSource = unwrapEnvelope(notificationsPanel.value, ["AdminNotifications", "adminNotifications"]);
  const storeSource = unwrapEnvelope(storePanel.value, ["Store", "store"]);

  const game = normalizeGame(dashboard?.game);
  const rawGames = gamesSource ? firstArray(gamesSource.games, gamesSource.activeGameSessions, gamesSource.gameSessions) : undefined;
  const games = rawGames?.map(normalizeGame).filter(Boolean) ?? null;
  const rawLeaderboard = dashboard ? firstArray(dashboard.leaderboard, dashboard.topPlayers) : undefined;
  const leaderboard = rawLeaderboard?.map(normalizeLeaderboardRow).filter(Boolean) ?? null;
  const rawContracts = dashboard ? firstArray(dashboard.contracts, dashboard.assignments, dashboard.activeContracts) : undefined;
  const contracts = rawContracts?.map(normalizeContract).filter(Boolean) ?? null;

  const dashboardNotifications = dashboard ? firstArray(dashboard.notifications, dashboard.alerts) : undefined;
  const panelNotifications = notificationsSource
    ? firstArray(notificationsSource.notifications, notificationsSource.alerts)
    : undefined;
  const authoritativeNotifications = panelNotifications ?? dashboardNotifications;
  const notifications = authoritativeNotifications?.map(normalizeNotification).filter(Boolean) ?? null;

  const rawStoreItems = storeSource ? firstArray(storeSource.storeItems, storeSource.items) : undefined;
  const storeItems = rawStoreItems?.map(normalizeStoreItem).filter(Boolean) ?? null;
  const attendance = dashboard ? normalizeAttendance(dashboard) : null;
  const notificationCount = countFrom(
    notificationsSource?.notificationCount,
    dashboard?.notificationCount,
  );

  const emptyPanels = {
    attendance: emptyCollectionState(attendance?.rows),
    leaderboard: emptyCollectionState(leaderboard),
    contracts: emptyCollectionState(contracts),
    notifications: emptyCollectionState(notifications),
    store: emptyCollectionState(storeItems),
    games: emptyCollectionState(games),
  };
  const contentCollections = [attendance?.rows, leaderboard, contracts, notifications, storeItems];
  const isEmpty = contentCollections.every(Array.isArray)
    && contentCollections.every((collection) => collection.length === 0);

  return deepFreeze({
    game,
    games,
    attendance,
    leaderboard,
    leaderboardBasis: safeText(dashboard?.leaderboardBasis, 80),
    overallScoreStatus: safeText(dashboard?.overallScoreStatus, 80),
    contracts,
    notifications,
    notificationCount,
    notificationPreferences: sanitizeOverviewDisplayValue(notificationsSource?.notificationPreferences),
    notificationImplementationStatus: safeText(notificationsSource?.implementationStatus, 80),
    storeItems,
    emptyPanels,
    isEmpty,
    availablePanels: {
      dashboard: dashboardPanel.available,
      games: gamesPanel.available,
      notifications: notificationsPanel.available,
      store: storePanel.available,
    },
  });
}
