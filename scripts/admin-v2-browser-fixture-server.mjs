import { createReadStream, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");

export const ADMIN_V2_FIXTURE_GAME_ID = "10000000-0000-4000-8000-000000000001";
export const ADMIN_V2_FIXTURE_OPAQUE_GAME_ID = "phase1reviewgame0001";
export const ADMIN_V2_FIXTURE_ADMIN_ID = "20000000-0000-4000-8000-000000000002";
export const ADMIN_V2_FIXTURE_MARKET_ASSET_ID = "a1000000-0000-4000-8000-000000000001";
export const ADMIN_V2_FIXTURE_MARKET_NO_HISTORY_ASSET_ID = "a2000000-0000-4000-8000-000000000002";
export const ADMIN_V2_FIXTURE_CSRF = "C".repeat(43);
export const ADMIN_V2_FIXTURE_LONG_ADMIN_NAME =
  "Dr. Alexandria Montgomery-Rivera — International Economics Program Administrator";
export const ADMIN_V2_FIXTURE_LONG_GAME_NAME =
  "Northreach Intercontinental Cooperative Classroom Economy — Semester Four Extended Cohort";
export const ADMIN_V2_FIXTURE_LONG_PLAYER_NAME =
  "Avery Jean-Baptiste-Wojciechowski — Cooperative Markets Research Fellowship";
export const ADMIN_V2_RAW_BACKEND_DIAGNOSTIC =
  "SELECT * FROM private.staff_users; SUPABASE_SERVICE_ROLE_KEY; service_role; backend/supabase/functions/admin-api/index.ts:99";

export const ADMIN_V2_FIXTURE_PERMISSIONS = Object.freeze([
  "account.read",
  "audit.read",
  "attendance.manage",
  "business.manage",
  "contracts.manage",
  "economy.adjust",
  "game.create",
  "game.read",
  "game.switch",
  "game.update",
  "inventory.redeem",
  "market.manage",
  "marketplace.moderate",
  "messaging.moderate",
  "players.manage",
  "progression.review",
  "settings.manage",
  "store.manage",
  "world.manage",
]);

const MIME_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
});
const VERCEL_REPORT_ONLY_CSP = "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; img-src 'self' data: blob: https:; media-src 'self'; font-src 'self' data:; form-action 'self' https://*.supabase.co; manifest-src 'self'; worker-src 'self' blob:; require-trusted-types-for 'script'; trusted-types econovaria";

function fixtureGame(gameId = ADMIN_V2_FIXTURE_GAME_ID) {
  return {
    id: gameId,
    gameSessionId: gameId,
    ownerId: ADMIN_V2_FIXTURE_ADMIN_ID,
    name: ADMIN_V2_FIXTURE_LONG_GAME_NAME,
    title: ADMIN_V2_FIXTURE_LONG_GAME_NAME,
    status: "active",
    gameCode: "NORTH7",
    joinCode: "NORTH7",
  };
}

function fixtureUser() {
  return {
    id: ADMIN_V2_FIXTURE_ADMIN_ID,
    email: "alexandria.admin@example.test",
    displayName: ADMIN_V2_FIXTURE_LONG_ADMIN_NAME,
    role: "game_admin",
  };
}

function permissionsForScenario(scenario) {
  if (scenario === "permission") {
    return ADMIN_V2_FIXTURE_PERMISSIONS.filter((permission) => permission !== "game.read");
  }
  if (scenario === "planned-permission") {
    return ADMIN_V2_FIXTURE_PERMISSIONS.filter((permission) => permission !== "marketplace.moderate");
  }
  if (scenario === "store-permission") {
    return ADMIN_V2_FIXTURE_PERMISSIONS.filter((permission) => permission !== "store.manage");
  }
  if (scenario === "market-permission") {
    return ADMIN_V2_FIXTURE_PERMISSIONS.filter((permission) => permission !== "market.manage");
  }
  return [...ADMIN_V2_FIXTURE_PERMISSIONS];
}

function sessionTimes({ expired = false } = {}) {
  const direction = expired ? -1 : 1;
  return {
    expiresAt: new Date(Date.now() + direction * 60 * 60 * 1000).toISOString(),
    absoluteExpiresAt: new Date(Date.now() + direction * 8 * 60 * 60 * 1000).toISOString(),
  };
}

export function createAdminV2FixtureSession(scenario = "ready") {
  const expired = new Set([
    "expired",
    "revoked",
    "security-version-invalid",
  ]).has(scenario);
  const gameId = scenario === "legacy-handoff"
    ? ADMIN_V2_FIXTURE_OPAQUE_GAME_ID
    : ADMIN_V2_FIXTURE_GAME_ID;
  return {
    authenticated: true,
    ...sessionTimes({ expired }),
    assuranceLevel: "aal2",
    mfaRequired: true,
    user: fixtureUser(),
    csrfToken: ADMIN_V2_FIXTURE_CSRF,
    activeGameSessions: [fixtureGame(gameId)],
    permissions: permissionsForScenario(scenario),
    roles: ["game_admin"],
    adminRole: "game_admin",
    refreshedAt: new Date().toISOString(),
  };
}

function responseEnvelope(data, requestId) {
  return {
    data,
    error: null,
    meta: {
      requestId,
      fixture: "admin-v2-phase1",
    },
  };
}

function dashboardData({ empty = false, gameId = ADMIN_V2_FIXTURE_GAME_ID } = {}) {
  return {
    game: fixtureGame(gameId),
    totalPlayers: empty ? 0 : 32,
    attendanceDate: "2026-08-06",
    attendanceLocked: false,
    attendanceCounts: empty
      ? { present: 0, late: 0, absent: 0, excused: 0, total: 0 }
      : { present: 24, late: 3, absent: 4, excused: 1, total: 32 },
    attendanceSummary: empty
      ? { presentCount: 0, lateCount: 0, absentCount: 0, excusedCount: 0, activePlayerCount: 0 }
      : { presentCount: 24, lateCount: 3, absentCount: 4, excusedCount: 1, activePlayerCount: 32 },
    attendance: empty
      ? []
      : [
        {
          id: "30000000-0000-4000-8000-000000000003",
          playerId: "40000000-0000-4000-8000-000000000004",
          displayName: ADMIN_V2_FIXTURE_LONG_PLAYER_NAME,
          rosterLabel: "Research cohort A",
          status: "present",
          clockedInAt: "2026-08-06T08:01:00.000Z",
          source: "scanner",
        },
      ],
    leaderboardBasis: "net-worth",
    leaderboard: empty
      ? []
      : [
        {
          id: "40000000-0000-4000-8000-000000000004",
          playerId: "40000000-0000-4000-8000-000000000004",
          rank: 1,
          displayName: ADMIN_V2_FIXTURE_LONG_PLAYER_NAME,
          netWorth: 12850.75,
          cashBalance: 4250.25,
          currencyCode: "ECO",
          online: true,
        },
        {
          id: "50000000-0000-4000-8000-000000000005",
          playerId: "50000000-0000-4000-8000-000000000005",
          rank: 2,
          displayName: "Jordan Kim",
          netWorth: 11040,
          cashBalance: 3900,
          currencyCode: "ECO",
          online: false,
        },
      ],
    contracts: empty
      ? []
      : [
        {
          id: "60000000-0000-4000-8000-000000000006",
          ownerId: ADMIN_V2_FIXTURE_ADMIN_ID,
          title: "Regional Supply Chain Resilience Briefing",
          description: "Prepare an evidence-backed response to the current logistics disruption.",
          status: "active",
          category: "World Economy",
          deadlineAt: "2026-08-14T15:00:00.000Z",
          submittedCount: 14,
          completedCount: 9,
          targeting: {
            playerId: "40000000-0000-4000-8000-000000000004",
            cohort: "All active players",
          },
        },
      ],
    notifications: empty
      ? []
      : [
        {
          id: "70000000-0000-4000-8000-000000000007",
          title: "Attendance review recommended",
          description: "Four players have not checked in.",
          type: "attendance",
          priority: "medium",
          read: false,
          createdAt: "2026-08-06T08:30:00.000Z",
        },
      ],
    notificationCount: empty ? 0 : 2,
  };
}

function notificationsData({ empty = false } = {}) {
  return {
    notifications: empty
      ? []
      : [
        {
          id: "70000000-0000-4000-8000-000000000007",
          ownerId: ADMIN_V2_FIXTURE_ADMIN_ID,
          title: "Attendance review recommended",
          message: "Four players have not checked in.",
          type: "attendance",
          priority: "medium",
          read: false,
          createdAt: "2026-08-06T08:30:00.000Z",
        },
        {
          id: "80000000-0000-4000-8000-000000000008",
          title: "Contract submissions ready",
          message: "Nine submissions are ready for review.",
          type: "contracts",
          priority: "normal",
          read: false,
          createdAt: "2026-08-06T08:22:00.000Z",
        },
      ],
    notificationCount: empty ? 0 : 2,
    notificationPreferences: { inConsole: true },
    implementationStatus: "available",
  };
}

function fixtureStoreItems({ empty = false, many = false } = {}) {
  if (empty) return [];
  const items = [
    {
      id: "90000000-0000-4000-8000-000000000009",
      itemKey: "beta-nort-sensor-board",
      key: "beta-nort-sensor-board",
      name: "Northreach sensor board",
      description: "Precision control board for classroom production systems.",
      category: "Components",
      status: "active",
      visibility: "visible",
      price: 45,
      currencyCode: "NRC",
      stockQuantity: 18,
      sortOrder: 10,
      purchaseStats: { purchaseCount: 12, unitsSold: 15, revenue: 675 },
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-06T00:00:00.000Z",
    },
    {
      id: "91000000-0000-4000-8000-000000000010",
      itemKey: "classroom-transit-pass",
      key: "classroom-transit-pass",
      name: "교실 지역 간 협력 연구를 위한 매우 긴 맞춤형 교통 이용권",
      description: "A custom classroom item without persisted artwork.",
      category: "Classroom services",
      status: "active",
      visibility: "visible",
      price: 1250.5,
      currencyCode: "YRC",
      stockQuantity: 3,
      sortOrder: 20,
      purchaseStats: { purchaseCount: 2, unitsSold: 2, revenue: 2501 },
      createdAt: "2026-08-02T00:00:00.000Z",
      updatedAt: "2026-08-06T00:00:00.000Z",
    },
    {
      id: "92000000-0000-4000-8000-000000000011",
      itemKey: "archived-field-kit",
      key: "archived-field-kit",
      name: "Archived field kit",
      description: "Retained for historical Store records.",
      category: "Equipment",
      status: "archived",
      visibility: "hidden",
      price: 80,
      currencyCode: "THD",
      stockQuantity: 0,
      sortOrder: 30,
      purchaseStats: { purchaseCount: 0, unitsSold: 0, revenue: 0 },
      createdAt: "2026-08-03T00:00:00.000Z",
      updatedAt: "2026-08-06T00:00:00.000Z",
    },
  ];
  if (many) {
    for (let index = items.length; index < 52; index += 1) {
      items.push({
        id: `93000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        itemKey: `classroom-item-${index + 1}`,
        key: `classroom-item-${index + 1}`,
        name: `Classroom Store item ${index + 1}`,
        description: "Custom classroom Store inventory.",
        category: index % 2 ? "Supplies" : "Services",
        status: "active",
        visibility: "visible",
        price: index + 10,
        currencyCode: index % 2 ? "ELD" : "NRC",
        stockQuantity: index % 7,
        sortOrder: (index + 1) * 10,
        purchaseStats: { purchaseCount: index, unitsSold: index, revenue: index * (index + 10) },
        createdAt: "2026-08-03T00:00:00.000Z",
        updatedAt: "2026-08-06T00:00:00.000Z",
      });
    }
  }
  return items;
}

function storeData(items) {
  return { storeItems: items, items };
}

function fixtureMarketAssets({ empty = false, many = false } = {}) {
  if (empty) return [];
  const assets = [
    {
      id: ADMIN_V2_FIXTURE_MARKET_ASSET_ID,
      assetId: ADMIN_V2_FIXTURE_MARKET_ASSET_ID,
      symbol: "NRCX",
      ticker: "NRCX",
      name: "Northreach Intercontinental Renewable Infrastructure and Cooperative Exchange Holdings",
      companyName: "Northreach Intercontinental Renewable Infrastructure and Cooperative Exchange Holdings",
      type: "stock",
      assetType: "stock",
      sector: "Renewable infrastructure, cooperative logistics, and intercontinental classroom systems",
      countryCode: "KR",
      description: "A long-horizon infrastructure issuer used to exercise responsive supervisory layouts.",
      price: 185.25,
      currentPrice: 185.25,
      previousClose: 172.5,
      open: 174.2,
      high: 188.9,
      low: 171.75,
      change: 12.75,
      changePct: 7.3913043478,
      marketCap: 9876543210123.45,
      beta: 1.42,
      volatility: 0.37,
      chartHistory: [],
      financials: {
        revenueGrowth: 0.18,
        profitMargin: 0.23,
        debtLevel: 0.31,
        cashReserves: 0.81,
        innovationScore: 0.94,
        supplyChainRisk: 0.28,
        politicalExposure: 0.12,
        commodityExposure: 0.44,
      },
      fundamentals: {
        revenueGrowth: 0.18,
        profitMargin: 0.23,
        debtLevel: 0.31,
        cashReserves: 0.81,
        innovationScore: 0.94,
        supplyChainRisk: 0.28,
        politicalExposure: 0.12,
        commodityExposure: 0.44,
      },
      isActive: true,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-07T03:00:00.000Z",
    },
    {
      id: ADMIN_V2_FIXTURE_MARKET_NO_HISTORY_ASSET_ID,
      assetId: ADMIN_V2_FIXTURE_MARKET_NO_HISTORY_ASSET_ID,
      symbol: "HANUL",
      ticker: "HANUL",
      name: "한울 지역 공동체의 초소형 정밀 부품 및 순환 경제 연구 기업",
      companyName: "한울 지역 공동체의 초소형 정밀 부품 및 순환 경제 연구 기업",
      type: "stock",
      assetType: "stock",
      sector: "초정밀 순환 경제 연구",
      countryCode: "KR",
      description: "매우 작은 가격과 큰 음의 변동을 안전하게 표시하는 한국어 종목입니다.",
      price: 0.000004,
      currentPrice: 0.000004,
      previousClose: 0.000032,
      open: 0.00003,
      high: 0.000035,
      low: 0.000003,
      change: -0.000028,
      changePct: -87.5,
      marketCap: 125000,
      beta: 2.75,
      volatility: 0.99,
      chartHistory: [],
      financials: {},
      fundamentals: {},
      isActive: true,
      createdAt: "2026-08-02T00:00:00.000Z",
      updatedAt: "2026-08-07T03:00:00.000Z",
    },
    {
      id: "a3000000-0000-4000-8000-000000000003",
      assetId: "a3000000-0000-4000-8000-000000000003",
      symbol: "FLAT",
      ticker: "FLAT",
      name: "Stable classroom reserve instrument",
      companyName: "Stable classroom reserve instrument",
      type: "stock",
      assetType: "stock",
      sector: "Reserves",
      countryCode: { malformed: true },
      description: { diagnostic: ADMIN_V2_RAW_BACKEND_DIAGNOSTIC },
      price: 9876543210.12,
      currentPrice: 9876543210.12,
      previousClose: 9876543210.12,
      open: 9876543210.12,
      high: 9876543210.12,
      low: 9876543210.12,
      change: 0,
      changePct: 0,
      marketCap: "not-a-number",
      beta: ["malformed"],
      volatility: { malformed: true },
      chartHistory: "malformed-history",
      financials: {
        revenueGrowth: ADMIN_V2_RAW_BACKEND_DIAGNOSTIC,
        profitMargin: null,
        debtLevel: { malformed: true },
      },
      fundamentals: {
        revenueGrowth: ADMIN_V2_RAW_BACKEND_DIAGNOSTIC,
        profitMargin: null,
        debtLevel: { malformed: true },
      },
      isActive: true,
      createdAt: "not-a-date",
      updatedAt: null,
    },
  ];

  if (many) {
    for (let index = assets.length; index < 52; index += 1) {
      const sequence = index + 1;
      const positive = index % 3 === 0;
      const negative = index % 3 === 1;
      const previousClose = 20 + index;
      const changePct = positive ? 48.75 : negative ? -42.5 : 0;
      const currentPrice = previousClose * (1 + changePct / 100);
      const id = `a4000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
      assets.push({
        id,
        assetId: id,
        symbol: `M${String(sequence).padStart(3, "0")}`,
        ticker: `M${String(sequence).padStart(3, "0")}`,
        name: `Classroom listed instrument ${sequence}`,
        companyName: `Classroom listed instrument ${sequence}`,
        type: "stock",
        assetType: "stock",
        sector: index % 2 ? "Services" : "Manufacturing",
        countryCode: index % 2 ? "KR" : "NZ",
        description: "Scale fixture for the Admin Market directory.",
        price: currentPrice,
        currentPrice,
        previousClose,
        open: previousClose,
        high: Math.max(previousClose, currentPrice),
        low: Math.min(previousClose, currentPrice),
        change: currentPrice - previousClose,
        changePct,
        marketCap: currentPrice * (10_000_000 + index),
        beta: 0.5 + index / 100,
        volatility: 0.1 + index / 1_000,
        chartHistory: [],
        financials: {},
        fundamentals: {},
        isActive: true,
        createdAt: "2026-08-03T00:00:00.000Z",
        updatedAt: "2026-08-07T03:00:00.000Z",
      });
    }
  }
  return assets;
}

function fixtureMarketTrades({ empty = false } = {}) {
  if (empty) return [];
  return [
    {
      id: "b1000000-0000-4000-8000-000000000001",
      tradeId: "b1000000-0000-4000-8000-000000000001",
      playerId: "b2000000-0000-4000-8000-000000000002",
      assetId: ADMIN_V2_FIXTURE_MARKET_ASSET_ID,
      symbol: "NRCX",
      ticker: "NRCX",
      side: "buy",
      quantity: 1250000,
      price: 185.25,
      executionPrice: 185.25,
      grossValue: 231562500,
      createdAt: "2026-08-07T02:58:00.000Z",
      assetName: "Northreach Intercontinental Renewable Infrastructure and Cooperative Exchange Holdings",
    },
    {
      id: "b3000000-0000-4000-8000-000000000003",
      tradeId: "b3000000-0000-4000-8000-000000000003",
      playerId: "b4000000-0000-4000-8000-000000000004",
      assetId: ADMIN_V2_FIXTURE_MARKET_NO_HISTORY_ASSET_ID,
      symbol: "HANUL",
      ticker: "HANUL",
      side: "sell",
      quantity: 500000000,
      price: 0.000004,
      executionPrice: 0.000004,
      grossValue: 2000,
      createdAt: "2026-08-07T02:56:00.000Z",
      assetName: "한울 지역 공동체의 초소형 정밀 부품 및 순환 경제 연구 기업",
    },
  ];
}

function fixtureMarketEvents({ empty = false } = {}) {
  if (empty) return [];
  return [
    {
      id: "c1000000-0000-4000-8000-000000000001",
      eventId: "c1000000-0000-4000-8000-000000000001",
      headline: "Regional infrastructure demand expands",
      title: "Regional infrastructure demand expands",
      explanation: "Public classroom procurement increased demand across infrastructure issuers.",
      description: "Public classroom procurement increased demand across infrastructure issuers.",
      category: "macro",
      sentiment: "positive",
      source: "World simulation",
      magnitude: 0.72,
      volatilityImpact: 0.18,
      active: true,
      status: "active",
      createdAt: "2026-08-07T02:45:00.000Z",
      updatedAt: "2026-08-07T02:45:00.000Z",
    },
    {
      id: "c2000000-0000-4000-8000-000000000002",
      eventId: "c2000000-0000-4000-8000-000000000002",
      headline: "정밀 부품 공급망 변동성 확대",
      title: "정밀 부품 공급망 변동성 확대",
      explanation: "공급망 변동이 초정밀 부품 분야의 가격 위험을 높였습니다.",
      description: "공급망 변동이 초정밀 부품 분야의 가격 위험을 높였습니다.",
      category: "supply-chain",
      sentiment: "negative",
      source: "World simulation",
      magnitude: -0.84,
      volatilityImpact: 0.91,
      active: false,
      status: "recent",
      createdAt: "2026-08-07T01:30:00.000Z",
      updatedAt: "2026-08-07T01:30:00.000Z",
    },
  ];
}

function fixtureMarketChart(assetId) {
  if (assetId === ADMIN_V2_FIXTURE_MARKET_NO_HISTORY_ASSET_ID) return [];
  if (assetId !== ADMIN_V2_FIXTURE_MARKET_ASSET_ID) return [];
  return [
    { time: "2026-08-07T02:05:00.000Z", timestamp: "2026-08-07T02:05:00.000Z", open: 171, high: 174, low: 170.5, close: 173, volume: 925000, changePct: 1.17 },
    { time: "2026-08-07T02:15:00.000Z", timestamp: "2026-08-07T02:15:00.000Z", open: 173, high: 176.5, low: 172.5, close: 176, volume: 1150000, changePct: 1.73 },
    { time: "2026-08-07T02:25:00.000Z", timestamp: "2026-08-07T02:25:00.000Z", open: 176, high: 179, low: 175.5, close: 178.5, volume: 1310000, changePct: 1.42 },
    { time: "2026-08-07T02:35:00.000Z", timestamp: "2026-08-07T02:35:00.000Z", open: 178.5, high: 182, low: 177.75, close: 181.25, volume: 1600000, changePct: 1.54 },
    { time: "2026-08-07T02:45:00.000Z", timestamp: "2026-08-07T02:45:00.000Z", open: 181.25, high: 184, low: 180, close: 183.5, volume: 1925000, changePct: 1.24 },
    { time: "2026-08-07T02:55:00.000Z", timestamp: "2026-08-07T02:55:00.000Z", open: 183.5, high: 188.9, low: 182.75, close: 185.25, volume: 2250000, changePct: 0.95 },
  ];
}

function parseCookies(header = "") {
  return Object.fromEntries(String(header)
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf("=");
      if (separator < 0) return [decodeURIComponent(part), ""];
      return [
        decodeURIComponent(part.slice(0, separator)),
        decodeURIComponent(part.slice(separator + 1)),
      ];
    }));
}

function sendJson(response, status, payload, requestId = "", extraHeaders = {}) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "cache-control": "private, no-store",
    "content-length": Buffer.byteLength(body),
    "content-type": "application/json; charset=utf-8",
    ...(requestId ? { "x-request-id": requestId } : {}),
    ...extraHeaders,
  });
  response.end(body);
}

function sendRawFailure(response, requestId = "admin-v2-fixture-failure") {
  // A malformed successful transport response exercises the same safe failed
  // state without Chromium itself emitting a network-status console error. The
  // intentionally unsafe body must still be consumed and discarded by the API
  // adapter rather than reaching the UI.
  response.writeHead(200, {
    "cache-control": "private, no-store",
    "content-length": Buffer.byteLength(ADMIN_V2_RAW_BACKEND_DIAGNOSTIC),
    "content-type": "text/plain; charset=utf-8",
    "x-request-id": requestId,
  });
  response.end(ADMIN_V2_RAW_BACKEND_DIAGNOSTIC);
}

function sendFailure(response, status, code, {
  requestId = `admin-v2-fixture-${status}`,
  retryable = false,
  retryAfter = "",
} = {}) {
  sendJson(response, status, {
    error: {
      code,
      message: ADMIN_V2_RAW_BACKEND_DIAGNOSTIC,
      details: ADMIN_V2_RAW_BACKEND_DIAGNOSTIC,
      retryable,
      requestId,
    },
    requestId,
    diagnostic: ADMIN_V2_RAW_BACKEND_DIAGNOSTIC,
  }, requestId, {
    "x-fixture-error-code": code,
    ...(retryAfter ? { "retry-after": retryAfter } : {}),
  });
}

function delayForResponse(milliseconds, response) {
  return new Promise((resolve) => {
    const timeout = setTimeout(done, milliseconds);
    function done() {
      clearTimeout(timeout);
      response.removeListener("close", done);
      resolve();
    }
    response.once("close", done);
  });
}

function runtimeConfigSource(origin) {
  return `window.__ECONOVARIA_RUNTIME_CONFIG__ = Object.freeze(${JSON.stringify({
    environment: "development",
    projectRef: "localdevelopment0000",
    supabaseUrl: origin,
    apiProxyUrl: origin,
    supabasePublishableKey: "sb_publishable_admin_v2_browser_fixture",
  })});\n`;
}

function sendHtml(response, body) {
  response.writeHead(200, {
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
    "content-type": "text/html; charset=utf-8",
  });
  response.end(body);
}

function signInFixtureSource(reason = "") {
  const safeReason = String(reason || "").replace(/[^a-z0-9-]/gi, "");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Administrator sign in</title></head><body><main><h1>Administrator sign in</h1><p data-auth-reason="${safeReason}">Session boundary fixture</p></main></body></html>`;
}

function legacyHandoffFixtureSource() {
  return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Existing Admin</title></head><body><main><h1>Existing Admin fixture target</h1></main></body></html>";
}

function safeStaticPath(repositoryRoot, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (_error) {
    return null;
  }
  if (decoded === "/") decoded = "/index.html";
  if (decoded.endsWith("/")) decoded += "index.html";
  const candidate = path.resolve(repositoryRoot, `.${decoded}`);
  return candidate.startsWith(`${repositoryRoot}${path.sep}`) ? candidate : null;
}

function serveStatic(request, response, repositoryRoot, pathname) {
  const filePath = safeStaticPath(repositoryRoot, pathname);
  if (!filePath) {
    response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    response.end("Invalid path");
    return;
  }

  let stats;
  try {
    stats = statSync(filePath);
  } catch (_error) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  if (!stats.isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const headers = {
    "cache-control": "no-store",
    "content-length": stats.size,
    "content-type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    "content-security-policy-report-only": VERCEL_REPORT_ONLY_CSP,
    "x-content-type-options": "nosniff",
  };
  response.writeHead(200, headers);
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
}

function requestRecord(request, scenario, runId, pathname, search = "") {
  return Object.freeze({
    method: request.method,
    pathname,
    search: String(search || ""),
    scenario,
    runId,
    apikey: String(request.headers.apikey || ""),
    authorization: String(request.headers.authorization || ""),
    deviceId: String(request.headers["x-econovaria-device-id"] || ""),
    gameId: String(request.headers["x-econovaria-game-id"] || ""),
    csrfToken: String(request.headers["x-econovaria-csrf-token"] || ""),
    idempotencyKey: String(request.headers["idempotency-key"] || ""),
    contentType: String(request.headers["content-type"] || ""),
  });
}

export async function startAdminV2FixtureServer({
  host = "127.0.0.1",
  port = 0,
  repositoryRoot = REPOSITORY_ROOT,
} = {}) {
  const requests = [];
  const requestCounts = new Map();
  const storeItemsByRun = new Map();
  let origin = "";

  const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url || "/", origin || `http://${host}`);
    const cookies = parseCookies(request.headers.cookie);
    const scenario = String(cookies["admin-v2-scenario"] || "ready");
    const runId = String(cookies["admin-v2-run"] || "unscoped");

    if (
      requestUrl.pathname === "/"
      && requestUrl.searchParams.get("mode") === "admin"
      && scenario !== "ready"
    ) {
      sendHtml(response, signInFixtureSource(requestUrl.searchParams.get("reason")));
      return;
    }

    if (requestUrl.pathname === "/admin/" && scenario === "legacy-handoff") {
      sendHtml(response, legacyHandoffFixtureSource());
      return;
    }

    if (requestUrl.pathname === "/runtime-config.env.js") {
      const body = runtimeConfigSource(origin);
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-length": Buffer.byteLength(body),
        "content-type": "application/javascript; charset=utf-8",
      });
      response.end(body);
      return;
    }

    const webSessionPrefix = "/functions/v1/web-session-api";
    if (requestUrl.pathname === `${webSessionPrefix}/status`) {
      requests.push(requestRecord(request, scenario, runId, "/session/status"));
      if (scenario === "session-validating") {
        await delayForResponse(650, response);
        if (response.destroyed) return;
      }
      const statusFailures = {
        unauthenticated: [401, "auth_required"],
        expired: [401, "session_expired"],
        revoked: [401, "staff_session_revoked"],
        "security-version-invalid": [401, "staff_session_security_version_invalid"],
      };
      if (statusFailures[scenario]) {
        const [status, code] = statusFailures[scenario];
        sendFailure(response, status, code, { requestId: `admin-v2-${scenario}-status` });
        return;
      }
      const session = createAdminV2FixtureSession(scenario);
      sendJson(response, 200, {
        ok: true,
        session: {
          authenticated: true,
          expiresAt: session.expiresAt,
          absoluteExpiresAt: session.absoluteExpiresAt,
          assuranceLevel: session.assuranceLevel,
          mfaRequired: session.mfaRequired,
        },
        user: session.user,
        activeGameSessions: session.activeGameSessions,
        csrfToken: session.csrfToken,
      });
      return;
    }

    const bffPrefix = `${webSessionPrefix}/proxy`;
    if (!requestUrl.pathname.startsWith(bffPrefix)) {
      serveStatic(request, response, repositoryRoot, requestUrl.pathname);
      return;
    }

    const upstreamPath = requestUrl.pathname.slice(bffPrefix.length) || "/";
    requests.push(requestRecord(request, scenario, runId, upstreamPath, requestUrl.search));
    const countKey = `${runId}:${upstreamPath}`;
    const requestCount = (requestCounts.get(countKey) || 0) + 1;
    requestCounts.set(countKey, requestCount);

    if (upstreamPath === "/session/bootstrap") {
      if (scenario === "session-validating") {
        await delayForResponse(350, response);
        if (response.destroyed) return;
      }
      const gameId = scenario === "legacy-handoff"
        ? ADMIN_V2_FIXTURE_OPAQUE_GAME_ID
        : ADMIN_V2_FIXTURE_GAME_ID;
      sendJson(response, 200, responseEnvelope({
        admin: fixtureUser(),
        activeGame: fixtureGame(gameId),
        games: [fixtureGame(gameId)],
        permissions: permissionsForScenario(scenario),
        roles: ["game_admin"],
        adminRole: "game_admin",
      }, "admin-v2-bootstrap"));
      return;
    }

    const gameId = scenario === "legacy-handoff"
      ? ADMIN_V2_FIXTURE_OPAQUE_GAME_ID
      : ADMIN_V2_FIXTURE_GAME_ID;
    const overviewPath = `/games/${gameId}/dashboard`;
    const storePath = `/games/${gameId}/store/items`;
    const marketAssetsPath = `/games/${gameId}/market/assets`;
    const marketTradesPath = `/games/${gameId}/market/trades/recent`;
    const marketEventsPath = `/games/${gameId}/market/events`;
    const marketAssetMatch = upstreamPath.match(
      new RegExp(`^${marketAssetsPath}/([^/]+)/(profile|chart|financials)$`),
    );
    const isMarketRead = upstreamPath === marketAssetsPath
      || upstreamPath === marketTradesPath
      || upstreamPath === marketEventsPath
      || Boolean(marketAssetMatch);
    const isOverviewRead = upstreamPath === overviewPath
      || upstreamPath === "/games"
      || upstreamPath === "/notifications"
      || upstreamPath === storePath
      || isMarketRead;

    const storeItemMatch = upstreamPath.match(new RegExp(`^${storePath}/([^/]+)$`));
    const isStoreMutation = request.method === "POST" && upstreamPath === storePath
      || ["PATCH", "PUT", "DELETE"].includes(request.method || "") && Boolean(storeItemMatch);

    if ((!isOverviewRead || request.method !== "GET") && !isStoreMutation) {
      sendJson(response, 404, responseEnvelope(null, "admin-v2-unknown-route"));
      return;
    }

    if (isStoreMutation) {
      if (
        request.headers["x-econovaria-csrf-token"] !== ADMIN_V2_FIXTURE_CSRF
        || !String(request.headers["idempotency-key"] || "").trim()
      ) {
        sendFailure(response, 403, "CSRF_OR_IDEMPOTENCY_REQUIRED", {
          requestId: "admin-v2-store-mutation-boundary",
        });
        return;
      }
      if (scenario === "store-mutation-failed" || scenario === "store-mutation-aal2") {
        sendFailure(
          response,
          scenario === "store-mutation-aal2" ? 403 : 503,
          scenario === "store-mutation-aal2" ? "MFA_REQUIRED" : "UPSTREAM_UNAVAILABLE",
          { requestId: "admin-v2-store-mutation-failed", retryable: scenario !== "store-mutation-aal2" },
        );
        return;
      }
      let body = {};
      try {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      } catch (_error) {
        sendFailure(response, 400, "INVALID_REQUEST", { requestId: "admin-v2-store-invalid-json" });
        return;
      }
      const current = storeItemsByRun.get(runId)
        || fixtureStoreItems({ many: scenario === "store-many" });
      let item;
      if (request.method === "POST") {
        item = {
          id: "94000000-0000-4000-8000-000000000099",
          itemKey: String(body.itemKey || "created-classroom-item"),
          key: String(body.itemKey || "created-classroom-item"),
          name: String(body.name || "Created classroom item"),
          description: String(body.description || ""),
          category: String(body.category || "General"),
          price: Number(body.price || 0),
          currencyCode: String(body.currencyCode || "NRC"),
          stockQuantity: Number(body.stockQuantity || 0),
          status: String(body.status || "active"),
          visibility: String(body.visibility || "visible"),
          sortOrder: Number(body.sortOrder || 0),
          purchaseStats: { purchaseCount: 0, unitsSold: 0, revenue: 0 },
          createdAt: "2026-08-07T00:00:00.000Z",
          updatedAt: "2026-08-07T00:00:00.000Z",
        };
        current.push(item);
      } else {
        const itemId = decodeURIComponent(storeItemMatch[1]);
        item = current.find((candidate) => candidate.id === itemId);
        if (!item) {
          sendFailure(response, 404, "STORE_ITEM_NOT_FOUND", { requestId: "admin-v2-store-missing" });
          return;
        }
        if (request.method === "DELETE") {
          Object.assign(item, { status: "archived", visibility: "hidden", updatedAt: "2026-08-07T00:00:00.000Z" });
        } else {
          Object.assign(item, body, { updatedAt: "2026-08-07T00:00:00.000Z" });
        }
      }
      storeItemsByRun.set(runId, current);
      sendJson(response, request.method === "POST" ? 201 : 200, { ok: true, item }, "admin-v2-store-mutation");
      return;
    }

    if (scenario === "loading" || scenario === "store-loading" && upstreamPath === storePath) {
      await delayForResponse(2_500, response);
      if (response.destroyed) return;
    }

    if (scenario === "market-loading" && isMarketRead) {
      await delayForResponse(2_500, response);
      if (response.destroyed) return;
    }

    if (scenario === "stale" && requestCount > 1) {
      await delayForResponse(250, response);
      if (response.destroyed) return;
    }

    if (scenario === "store-stale" && upstreamPath === storePath && requestCount > 1) {
      await delayForResponse(250, response);
      if (response.destroyed) return;
      sendRawFailure(response, "admin-v2-store-stale");
      return;
    }

    if (scenario === "store-failed" && upstreamPath === storePath) {
      sendRawFailure(response, "admin-v2-store-failed");
      return;
    }

    if (scenario === "market-stale" && upstreamPath === marketAssetsPath && requestCount > 1) {
      await delayForResponse(250, response);
      if (response.destroyed) return;
      sendRawFailure(response, "admin-v2-market-stale");
      return;
    }

    if (scenario === "market-failed" && upstreamPath === marketAssetsPath && requestCount === 1) {
      sendRawFailure(response, "admin-v2-market-failed");
      return;
    }

    if (
      upstreamPath === overviewPath
      && (scenario === "failed" || (scenario === "stale" && requestCount > 1))
    ) {
      sendRawFailure(response, `admin-v2-${scenario}-dashboard`);
      return;
    }

    const overviewFailure = {
      "aal2-required": [403, "MFA_REQUIRED", false, ""],
      "api-401": [401, "SESSION_EXPIRED", false, ""],
      "permission-403": [403, "PERMISSION_DENIED", false, ""],
      "rate-limited-429": [429, "RATE_LIMIT_EXCEEDED", true, "7"],
      "retryable-5xx": [503, "UPSTREAM_UNAVAILABLE", true, ""],
    }[scenario];
    if (overviewFailure) {
      const [status, code, retryable, retryAfter] = overviewFailure;
      sendFailure(response, status, code, {
        requestId: `admin-v2-${scenario}`,
        retryable,
        retryAfter,
      });
      return;
    }

    const empty = scenario === "empty";
    if (upstreamPath === overviewPath) {
      sendJson(response, 200, responseEnvelope(dashboardData({ empty, gameId }), "admin-v2-dashboard"));
      return;
    }
    if (upstreamPath === "/games") {
      sendJson(response, 200, responseEnvelope({ games: [fixtureGame()] }, "admin-v2-games"));
      return;
    }
    if (upstreamPath === "/notifications") {
      sendJson(response, 200, responseEnvelope(notificationsData({ empty }), "admin-v2-notifications"));
      return;
    }
    if (upstreamPath === storePath) {
      if (!storeItemsByRun.has(runId)) {
        const initialItems = fixtureStoreItems({
          empty: empty || scenario === "store-empty",
          many: scenario === "store-many",
        });
        storeItemsByRun.set(runId, scenario === "store-one" ? initialItems.slice(0, 1) : initialItems);
      }
      sendJson(response, 200, responseEnvelope(storeData(storeItemsByRun.get(runId)), "admin-v2-store"));
      return;
    }
    if (upstreamPath === marketAssetsPath) {
      const assets = fixtureMarketAssets({
        empty: scenario === "market-empty",
        many: scenario === "market-many",
      });
      const selected = scenario === "market-one" ? assets.slice(0, 1) : assets;
      sendJson(response, 200, responseEnvelope({
        assets: selected,
        marketplaceSecurities: selected,
      }, "admin-v2-market-assets"));
      return;
    }
    if (upstreamPath === marketTradesPath) {
      const trades = fixtureMarketTrades({ empty: scenario === "market-empty" });
      sendJson(response, 200, responseEnvelope({
        trades,
        marketplaceTrades: trades,
      }, "admin-v2-market-trades"));
      return;
    }
    if (upstreamPath === marketEventsPath) {
      const events = fixtureMarketEvents({ empty: scenario === "market-empty" });
      sendJson(response, 200, responseEnvelope({
        events,
        marketEvents: events,
        news: events,
      }, "admin-v2-market-events"));
      return;
    }
    if (marketAssetMatch) {
      const assetId = decodeURIComponent(marketAssetMatch[1]);
      const resource = marketAssetMatch[2];
      const asset = fixtureMarketAssets().find((candidate) => candidate.id === assetId);
      if (!asset) {
        sendFailure(response, 404, "ASSET_NOT_FOUND", {
          requestId: "admin-v2-market-asset-missing",
        });
        return;
      }
      if (resource === "profile") {
        sendJson(response, 200, responseEnvelope({ asset, profile: asset }, "admin-v2-market-profile"));
        return;
      }
      if (resource === "chart") {
        const candles = fixtureMarketChart(assetId);
        sendJson(response, 200, responseEnvelope({ candles, chart: candles }, "admin-v2-market-chart"));
        return;
      }
      sendJson(response, 200, responseEnvelope({
        assetId,
        financials: asset.financials || {},
        fundamentals: asset.fundamentals || {},
      }, "admin-v2-market-financials"));
      return;
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Admin v2 fixture server did not expose a TCP address.");
  }
  origin = `http://${host}:${address.port}`;

  return Object.freeze({
    origin,
    route: `${origin}/admin/v2.html?game=${ADMIN_V2_FIXTURE_GAME_ID}#overview`,
    requestsFor(runId) {
      return requests.filter((entry) => entry.runId === runId);
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
        server.closeAllConnections?.();
      });
    },
  });
}

async function runFixtureServerCli() {
  const requestedPort = Number(process.env.ADMIN_V2_FIXTURE_PORT || 4318);
  const fixture = await startAdminV2FixtureServer({
    port: Number.isSafeInteger(requestedPort) && requestedPort > 0 ? requestedPort : 4318,
  });
  process.stdout.write(`Admin v2 fixture: ${fixture.route}\n`);

  let closing = false;
  async function close() {
    if (closing) return;
    closing = true;
    await fixture.close().catch(() => {});
    process.exit(0);
  }
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  await runFixtureServerCli();
}
