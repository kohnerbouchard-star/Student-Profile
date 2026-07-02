/* Eco Novaria Admin Overview Terminal Package v47
   Scope: Overview page + collapsible left-side terminal menu.
   No backend calls. No GitHub dependency.

   v47 layout:
   Header
   Actions
   Attendance
   Leaderboard + Active Assignments

   Removed:
   - status row
   - duplicate attendance scanner button
*/

window.Econovaria = window.Econovaria || {};
window.Econovaria.features = window.Econovaria.features || {};
window.Econovaria.features.adminOverviewTerminal = window.Econovaria.features.adminOverviewTerminal || {};

(function initAdminOverviewTerminal() {
  /*
   * Runtime architecture:
   * - data helpers normalize mock/session state
   * - render helpers return HTML strings
   * - one delegated event layer handles interactions
   * - public API is exposed at window.Econovaria.features.adminOverviewTerminal
   */
  const STYLE_ID = "admin-overview-terminal-style-v47";
  const NAV_ITEMS = [
    { id: "Overview", label: "Overview", iconKey: "overview" },
    { id: "Attendance", label: "Attendance", iconKey: "attendance" },
    { id: "Players", label: "Players", iconKey: "players" },
    { id: "Assignments", label: "Contracts", iconKey: "contracts" },
    { id: "Store", label: "Store", iconKey: "store" },
    { id: "Market", label: "Marketplace", iconKey: "market" },
    { id: "Settings", label: "Settings", iconKey: "settings" },
    { id: "Logs", label: "Logs", iconKey: "logs" }
  ];

  const PLAYER_ASSET_IMAGE_BY_TITLE = {
    "Harbor kiosk": "https://img.magnific.com/free-photo/street-market-night_23-2151604422.jpg",
    "Cold-chain resale stand": "https://img.magnific.com/free-photo/portrait-supermarket-deli-worker-with-frozen-fish-ice-ready-sale_342744-1069.jpg",
    "Northreach storage unit": "https://img.magnific.com/free-photo/logistic-center-concept-with-storage-units_23-2148902600.jpg",
    "Crescent Bay micro-lot": "https://img.magnific.com/free-photo/view-land-plot-real-estate-business-development_23-2149916725.jpg",
    "Campus snack route": "https://img.magnific.com/free-photo/young-people-enjoying-street-food_23-2151525828.jpg"
  };

  const PLAYER_ASSET_IMAGE_FALLBACK_BY_CATEGORY = {
    "Businesses": PLAYER_ASSET_IMAGE_BY_TITLE["Harbor kiosk"],
    "Real Estate": PLAYER_ASSET_IMAGE_BY_TITLE["Northreach storage unit"]
  };

  function getPlayerAssetImageUrl(asset) {
    const title = String(asset?.title || "");
    const category = String(asset?.category || "");
    return PLAYER_ASSET_IMAGE_BY_TITLE[title] || PLAYER_ASSET_IMAGE_FALLBACK_BY_CATEGORY[category] || "";
  }

  function escapeHtml(value) {
    if (typeof sanitize === "function") return sanitize(value);
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getStaffSession() {
    return window.state?.staffSession || window.currentSession?.staffSession || null;
  }

  function getSelectedGame(staffSession) {
    if (!staffSession?.selectedGameSessionId) return null;
    return (staffSession.activeGameSessions || [])
      .find((session) => session.id === staffSession.selectedGameSessionId) || null;
  }

  function getSampleLeaderboardPlayers() {
    const names = [
      "Mina Park", "Daniel Lee", "Alex Kim", "Yuna Choi", "Chris Han",
      "Sora Jung", "Jinwoo Seo", "Hana Moon", "Theo Kwon", "Nari Lim",
      "Evan Cho", "Iris Shin", "Noah Baek", "Maya Ryu", "Leo Kang",
      "Aria Nam", "Jun Park", "Grace Han", "Minseo Choi", "Kai Lee",
      "Lina Hong", "Owen Kim", "Sienna Yoo", "Dylan Jang", "Eun Lee",
      "Rina Song", "Jasper Ko", "Mira Ahn", "Tae Yun", "Clara Bae"
    ];
    const locations = ["Northreach", "Yrethia", "Solvend", "Eldoran", "Thaloris", "Valerion", "Syndalis", "Kaivora", "Orinth", "Dravik"];
    const activity = ["online", "20 mins ago", "2 days ago", "online", "3 hours ago", "45 mins ago", "online", "1 day ago", "28 mins ago", "4 days ago"];

    return names.map((name, index) => {
      const rank = index + 1;
      const netWorthValue = Math.max(1850, 12850 - (index * 315) + ((index % 4) * 70));
      const cashValue = Math.max(300, Math.round(netWorthValue * (0.16 + ((index % 5) * 0.018))));
      const score = Math.max(58, 96 - Math.round(index * 1.15));
      return {
        rank,
        name,
        location: locations[index % locations.length],
        meta: activity[index % activity.length],
        lastActive: activity[index % activity.length],
        netWorth: netWorthValue.toLocaleString("en-US"),
        cash: cashValue.toLocaleString("en-US"),
        portfolioValue: Math.max(0, netWorthValue - cashValue).toLocaleString("en-US"),
        accessCode: `PLR-${String(2300 + rank).padStart(4, "0")}`,
        overallScore: score,
        flag: rank === 3 ? "Access review" : rank === 12 ? "Low activity" : rank === 24 ? "Balance review" : ""
      };
    });
  }

  function getOverviewModel(counts = {}) {
    const staffSession = counts.staffSession || getStaffSession();
    const selectedGame = getSelectedGame(staffSession);

    return {
      adminName: staffSession?.staffDisplayName || "Kohner",
      gameName: selectedGame?.name || "Test game",
      gameCode: selectedGame?.joinCode || selectedGame?.gameCode || "X7K92A",
      gameStatus: selectedGame?.status || "live",
      notificationCount: 4,
      notifications: [
        { tone: "bad", label: "2 players need codes" },
        { tone: "warn", label: "3 absent today" },
        { tone: "purple", label: "Store item out" }
      ],
      attendanceStatusCounts: {
        total: 30,
        present: 24,
        pending: 3,
        absent: 3
      },
      attendanceSummary: {
        rewardsIssued: 14,
        latestScan: "Mina Park · Late · 08:42"
      },
      leaderboard: getSampleLeaderboardPlayers(),
      assignments: [
        { title: "Market Reflection", meta: "Deadline: Friday · Contracts", reward: "10.00" },
        { title: "Forecast Challenge", meta: "Deadline: Today · Simulation", reward: "15.00" },
        { title: "Store Budget Task", meta: "Deadline: Monday · Contracts", reward: "8.00" }
      ],
      attendance: [
        { student: "Mina Park", status: "Late", time: "08:42:11", reward: "+4.00", tone: "warn" },
        { student: "Daniel Lee", status: "On time", time: "08:05:22", reward: "+10.00", tone: "good" },
        { student: "Alex Kim", status: "Absent", time: "—", reward: "0.00", tone: "bad" }
      ],
      clock: new Date(),
      ...(counts.overviewModel || {})
    };
  }

  function toneClass(tone) {
    if (tone === "good") return "is-good";
    if (tone === "bad") return "is-bad";
    if (tone === "warn") return "is-warn";
    if (tone === "purple") return "is-purple";
    if (tone === "amber") return "is-amber";
    return "is-cyan";
  }

  function bellIcon() {
    return `
      <svg class="admin-terminal-bell-icon" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M11 22H21L19.5 19.6V14.2C19.5 11.6 18.1 9.8 16 9.8C13.9 9.8 12.5 11.6 12.5 14.2V19.6L11 22Z" />
        <path d="M14.2 23.7C14.6 24.7 15.2 25.2 16 25.2C16.8 25.2 17.4 24.7 17.8 23.7" />
        <path d="M7.2 12.5C8.1 9.2 10.3 6.8 13.4 5.8" class="pulse" />
        <path d="M24.8 12.5C23.9 9.2 21.7 6.8 18.6 5.8" class="pulse" />
      </svg>`;
  }

  function getAdminInitials(name) {
    const parts = String(name || "K").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "K";
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
  }
