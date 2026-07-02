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
  function renderNotifications(model) {
    const notifications = Array.isArray(model.notifications) ? model.notifications : [];
    const count = Number(model.notificationCount ?? notifications.length) || 0;
    return `
      <div class="admin-terminal-bell-drawer" data-admin-terminal-bell-drawer tabindex="-1" hidden>
        <div class="admin-terminal-drawer-head">
          <div>
            <span>Alerts</span>
            <strong>${escapeHtml(count)} Active</strong>
          </div>
          <small>System notices</small>
        </div>
        <div class="admin-terminal-notice-list">
          ${notifications.length ? notifications.map((item) => `
            <article class="admin-terminal-notice ${toneClass(item.tone)}">
              <span aria-hidden="true"></span>
              <div>
                <strong>${escapeHtml(item.label)}</strong>
                <small>${escapeHtml(item.meta || "Needs review")}</small>
              </div>
            </article>
          `).join("") : `
            <article class="admin-terminal-notice is-good">
              <span aria-hidden="true"></span>
              <div>
                <strong>No active alerts</strong>
                <small>Everything is clear</small>
              </div>
            </article>
          `}
        </div>
        <button class="admin-terminal-drawer-action" type="button" data-admin-terminal-action="open-admin-notifications">
          View more
          <i aria-hidden="true">↗</i>
        </button>
      </div>`;
  }
  function renderAdminUserMenu(model) {
    const staffSession = getStaffSession();
    const selectedGame = getSelectedGame(staffSession) || {
      name: model.gameName,
      joinCode: model.gameCode,
      status: model.gameStatus
    };
    const rawGames = Array.isArray(staffSession?.activeGameSessions) && staffSession.activeGameSessions.length
      ? staffSession.activeGameSessions
      : [
          selectedGame,
          { name: "Market Simulation Lab", joinCode: "MKT-204", status: "draft" },
          { name: "Period 4 Practice Economy", joinCode: "P4E-881", status: "paused" }
        ];
    const games = rawGames
      .filter(Boolean)
      .slice(0, 4);
    const roleLabel =
      staffSession?.staffRole ||
      staffSession?.role ||
      model.adminRole ||
      "Teacher Admin";
    const emailLabel =
      staffSession?.staffEmail ||
      staffSession?.email ||
      model.adminEmail ||
      "admin@econovaria.local";
    const selectedGameId = staffSession?.selectedGameSessionId || selectedGame?.id || "";
    const selectedGameCode = selectedGame?.joinCode || selectedGame?.gameCode || model.gameCode || "—";
    return `
      <div class="admin-terminal-user-menu" data-admin-terminal-user-menu tabindex="-1" hidden>
        <header class="admin-terminal-user-menu-head">
          <span class="admin-terminal-user-menu-avatar">${escapeHtml(getAdminInitials(model.adminName))}</span>
          <div>
            <small>Signed in as</small>
            <strong>${escapeHtml(model.adminName || "Admin")}</strong>
            <em>${escapeHtml(roleLabel)}</em>
          </div>
          <i aria-hidden="true"></i>
        </header>
        <section class="admin-terminal-user-menu-current" aria-label="Current game">
          <span>Current Game</span>
          <strong>${escapeHtml(selectedGame?.name || model.gameName || "No game selected")}</strong>
          <div>
            <small>Code ${escapeHtml(selectedGameCode)}</small>
            <small>${escapeHtml(selectedGame?.status || model.gameStatus || "live")}</small>
          </div>
        </section>
        <section class="admin-terminal-user-menu-section" aria-label="Games">
          <div class="admin-terminal-user-menu-section-title">
            <span>Games</span>
            <button type="button" data-admin-terminal-action="open-admin-games">Manage</button>
          </div>
          <div class="admin-terminal-user-game-list">
            ${games.map((game) => {
              const code = game.joinCode || game.gameCode || "—";
              const isCurrent =
                (game.id && selectedGameId && game.id === selectedGameId) ||
                code === selectedGameCode ||
                game.name === selectedGame?.name;
              return `
                <button
                  type="button"
                  class="admin-terminal-user-game${isCurrent ? " is-current" : ""}"
                  data-admin-terminal-action="switch-admin-game"
                  data-game-id="${escapeHtml(game.id || "")}"
                  data-game-code="${escapeHtml(code)}"
                  data-game-name="${escapeHtml(game.name || "Untitled game")}"
                  data-game-status="${escapeHtml(game.status || "live")}"
                >
                  <span>${escapeHtml(game.name || "Untitled game")}</span>
                  <small>${escapeHtml(code)} · ${escapeHtml(game.status || "live")}</small>
                </button>
              `;
            }).join("")}
          </div>
        </section>
        <section class="admin-terminal-user-menu-grid" aria-label="Account options">
          <button type="button" data-admin-terminal-action="open-admin-profile">
            <strong>Profile</strong>
            <small>${escapeHtml(emailLabel)}</small>
          </button>
          <button type="button" data-admin-terminal-action="open-admin-settings">
            <strong>Settings</strong>
            <small>Display, sound, preferences</small>
          </button>
          <button type="button" data-admin-terminal-action="open-admin-notifications">
            <strong>Notifications</strong>
            <small>Alerts, inbox, delivery</small>
          </button>
          <button type="button" data-admin-terminal-action="open-admin-security">
            <strong>Security</strong>
            <small>Sessions and access</small>
          </button>
          <button type="button" data-admin-terminal-action="open-admin-help">
            <strong>Help</strong>
            <small>Guides and support</small>
          </button>
          <button type="button" class="is-danger" data-admin-terminal-action="sign-out-admin">
            <strong>Sign Out</strong>
            <small>End admin session</small>
          </button>
        </section>
      </div>`;
  }
  function renderNavIcon(iconKey) {
    const normalizedKey = String(iconKey || "overview").toLowerCase();
    const icons = {
      overview: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" style="fill:currentColor;stroke:none" focusable="false" aria-hidden="true"><g width="100%" height="100%" transform="matrix(1,0,0,1,0,0)"><path d="M23.121,9.069,15.536,1.483a5.008,5.008,0,0,0-7.072,0L.879,9.069A2.978,2.978,0,0,0,0,11.19v9.817a3,3,0,0,0,3,3H21a3,3,0,0,0,3-3V11.19A2.978,2.978,0,0,0,23.121,9.069ZM15,22.007H9V18.073a3,3,0,0,1,6,0Zm7-1a1,1,0,0,1-1,1H17V18.073a5,5,0,0,0-10,0v3.934H3a1,1,0,0,1-1-1V11.19a1.008,1.008,0,0,1,.293-.707L9.878,2.9a3.008,3.008,0,0,1,4.244,0l7.585,7.586A1.008,1.008,0,0,1,22,11.19Z" fill="currentColor" fill-opacity="1" stroke="none" stroke-opacity="1"/></g></svg>`,
      attendance: `<svg viewBox="0 0 682.66669 682.66669" fill="currentColor" stroke="none" style="fill:currentColor;stroke:none" focusable="false" aria-hidden="true"><g width="100%" height="100%" transform="matrix(1,0,0,1,0,0)"><defs id="defs2143"><clipPath clipPathUnits="userSpaceOnUse" id="clipPath2153"><path d="M 0,512 H 512 V 0 H 0 Z" id="path2151" fill="currentColor" fill-opacity="1" stroke="none" stroke-opacity="1"/></clipPath></defs><g id="g2145" transform="matrix(1.3333333,0,0,-1.3333333,0,682.66667)"><g id="g2147"><g id="g2149" clip-path="url(#clipPath2153)"><g id="g2155" transform="translate(320.1211,106)"><path d="m 0,0 h -305.121 v 360 h 420 V 114.879" style="stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 10; stroke-dasharray: none;" id="path2157" fill="none" fill-opacity="1" stroke="currentColor" stroke-opacity="1" data-original-stroke-color="#000000ff" stroke-width="30" data-original-stroke-width="30"/></g><g id="g2159" transform="translate(497,136)"><path d="m 0,0 c 0,-49.706 -40.294,-90 -90,-90 -49.706,0 -90,40.294 -90,90 0,49.706 40.294,90 90,90 C -40.294,90 0,49.706 0,0 Z" style="stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 10; stroke-dasharray: none;" id="path2161" fill="none" fill-opacity="1" stroke="currentColor" stroke-opacity="1" data-original-stroke-color="#000000ff" stroke-width="30" data-original-stroke-width="30"/></g><g id="g2163" transform="translate(452,136)"><path d="M 0,0 H -45 V 45" style="stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 10; stroke-dasharray: none;" id="path2165" fill="none" fill-opacity="1" stroke="currentColor" stroke-opacity="1" data-original-stroke-color="#000000ff" stroke-width="30" data-original-stroke-width="30"/></g><g id="g2167" transform="translate(60,316)"><path d="M 0,0 H 90" style="stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 10; stroke-dasharray: none;" id="path2169" fill="none" fill-opacity="1" stroke="currentColor" stroke-opacity="1" data-original-stroke-color="#000000ff" stroke-width="30" data-original-stroke-width="30"/></g><g id="g2171" transform="translate(180,316)"><path d="M 0,0 H 90" style="stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 10; stroke-dasharray: none;" id="path2173" fill="none" fill-opacity="1" stroke="currentColor" stroke-opacity="1" data-original-stroke-color="#000000ff" stroke-width="30" data-original-stroke-width="30"/></g><g id="g2175" transform="translate(300,316)"><path d="M 0,0 H 90" style="stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 10; stroke-dasharray: none;" id="path2177" fill="none" fill-opacity="1" stroke="currentColor" stroke-opacity="1" data-original-stroke-color="#000000ff" stroke-width="30" data-original-stroke-width="30"/></g><g id="g2179" transform="translate(180,256)"><path d="M 0,0 H 90" style="stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 10; stroke-dasharray: none;" id="path2181" fill="none" fill-opacity="1" stroke="currentColor" stroke-opacity="1" data-original-stroke-color="#000000ff" stroke-width="30" data-original-stroke-width="30"/></g><g id="g2183" transform="translate(60,256)"><path d="M 0,0 H 90" style="stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 10; stroke-dasharray: none;" id="path2185" fill="none" fill-opacity="1" stroke="currentColor" stroke-opacity="1" data-original-stroke-color="#000000ff" stroke-width="30" data-original-stroke-width="30"/></g><g id="g2187" transform="translate(60,196)"><path d="M 0,0 H 90" style="stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 10; stroke-dasharray: none;" id="path2189" fill="none" fill-opacity="1" stroke="currentColor" stroke-opacity="1" data-original-stroke-color="#000000ff" stroke-width="30" data-original-stroke-width="30"/></g><g id="g2191" transform="translate(180,196)"><path d="M 0,0 H 90" style="stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 10; stroke-dasharray: none;" id="path2193" fill="none" fill-opacity="1" stroke="currentColor" stroke-opacity="1" data-original-stroke-color="#000000ff" stroke-width="30" data-original-stroke-width="30"/></g><g id="g2195" transform="translate(375,466)"><path d="M 0,0 V -60 H -300 V 0" style="stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 10; stroke-dasharray: none;" id="path2197" fill="none" fill-opacity="1" stroke="currentColor" stroke-opacity="1" data-original-stroke-color="#000000ff" stroke-width="30" data-original-stroke-width="30"/></g></g></g></g></g></svg>`,
      players: `<svg viewBox="0 0 512 512" fill="currentColor" stroke="none" style="fill:currentColor;stroke:none" focusable="false" aria-hidden="true"><g width="100%" height="100%" transform="matrix(1,0,0,1,0,0)"><g><g><path d="M256.76,103.95c-38.69,0-70.16,33.25-70.16,74.13c0,40.87,31.47,74.12,70.16,74.12s70.16-33.25,70.16-74.12&#10;&#9;&#9;&#9;C326.92,137.2,295.45,103.95,256.76,103.95z M256.76,222.2c-22.15,0-40.16-19.79-40.16-44.12c0-24.33,18.01-44.13,40.16-44.13&#10;&#9;&#9;&#9;s40.16,19.8,40.16,44.13C296.92,202.41,278.91,222.2,256.76,222.2z" fill="currentColor" fill-opacity="1" stroke="none" stroke-opacity="1"/></g></g><g><g><path d="M406.15,113.92h-0.48c-33.56,0.28-60.62,29.29-60.33,64.66c0.29,35.2,27.56,63.65,60.91,63.65h0.48&#10;&#9;&#9;&#9;c16.45-0.14,31.81-7.07,43.24-19.52c11.16-12.17,17.23-28.2,17.09-45.14C466.77,142.37,439.5,113.92,406.15,113.92z&#10;&#9;&#9;&#9; M427.86,202.42c-5.74,6.26-13.33,9.74-21.38,9.81h-0.23c-16.91,0-30.76-15.15-30.91-33.9c-0.16-18.83,13.56-34.27,30.58-34.41&#10;&#9;&#9;&#9;h0.23c16.91,0,30.76,15.16,30.91,33.9C437.14,187.14,433.87,195.88,427.86,202.42z" fill="currentColor" fill-opacity="1" stroke="none" stroke-opacity="1"/></g></g><g><g><path d="M421.7,249.73h-31c-23.85,0-45.57,9.3-61.72,24.46c-15.72-9.3-34.03-14.64-53.58-14.64h-37.29&#10;&#9;&#9;&#9;c-19.93,0-38.59,5.55-54.5,15.18c-16.22-15.48-38.17-25-62.31-25h-31c-49.79,0-90.3,40.51-90.3,90.3v38.23h132.54v29.79h248.43&#10;&#9;&#9;&#9;v-29.79H512v-38.23C512,290.24,471.49,249.73,421.7,249.73z M133.89,348.26H30v-8.23c0-33.25,27.05-60.3,60.3-60.3h31&#10;&#9;&#9;&#9;c14.8,0,28.37,5.36,38.88,14.25C146.61,308.82,137.22,327.54,133.89,348.26z M350.97,378.05H300.4h-88.8h-49.06v-12.93&#10;&#9;&#9;&#9;c0-5.79,0.66-11.44,1.9-16.86c2.43-10.64,7.12-20.44,13.53-28.85c6.37-8.37,14.45-15.37,23.72-20.48&#10;&#9;&#9;&#9;c10.81-5.98,23.23-9.38,36.42-9.38h37.29c12.73,0,24.72,3.16,35.25,8.74c9.26,4.9,17.39,11.68,23.87,19.82&#10;&#9;&#9;&#9;c6.94,8.7,11.99,18.95,14.55,30.15c1.24,5.42,1.9,11.07,1.9,16.86V378.05z M482,348.26H379.62c-3.39-21.05-13.03-40.04-26.94-55&#10;&#9;&#9;&#9;c10.38-8.46,23.62-13.53,38.02-13.53h31c33.25,0,60.3,27.05,60.3,60.3V348.26z" fill="currentColor" fill-opacity="1" stroke="none" stroke-opacity="1"/></g></g><g><g><path d="M105.75,113.92h-0.48c-33.56,0.28-60.62,29.29-60.33,64.66c0.29,35.2,27.56,63.65,60.91,63.65h0.48&#10;&#9;&#9;&#9;c16.45-0.14,31.81-7.07,43.24-19.52c11.16-12.17,17.23-28.2,17.09-45.14C166.37,142.37,139.1,113.92,105.75,113.92z&#10;&#9;&#9;&#9; M127.46,202.42c-5.74,6.26-13.33,9.74-21.38,9.81h-0.23c-16.91,0-30.76-15.15-30.91-33.9c-0.16-18.83,13.56-34.27,30.58-34.41&#10;&#9;&#9;&#9;h0.23c16.91,0,30.76,15.16,30.91,33.9C136.74,187.14,133.47,195.88,127.46,202.42z" fill="currentColor" fill-opacity="1" stroke="none" stroke-opacity="1"/></g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g></g></svg>`,
      contracts: `<svg viewBox="0 0 48 48" fill="currentColor" stroke="none" style="fill:currentColor;stroke:none" focusable="false" aria-hidden="true"><g width="100%" height="100%" transform="matrix(1,0,0,1,0,0)"><path d="M40,45H8a1,1,0,0,1-1-1V4A1,1,0,0,1,8,3H35a.99941.99941,0,0,1,.76807.35986l5,6A.99931.99931,0,0,1,41,10V44A1,1,0,0,1,40,45ZM9,43H39V10.36182L34.53174,5H9Z" fill="currentColor" fill-opacity="1" stroke="none" stroke-opacity="1"/><path d="M31,39.875A.87481.87481,0,0,1,30.125,39V28a.875.875,0,0,1,1.75,0V39A.87481.87481,0,0,1,31,39.875Z" fill="currentColor" fill-opacity="1" stroke="none" stroke-opacity="1"/><path d="M31,34.375a3.168,3.168,0,0,1-3.3501-2.9375A3.168,3.168,0,0,1,31,28.5a3.168,3.168,0,0,1,3.3501,2.9375.875.875,0,0,1-1.75,0c0-.64355-.73291-1.1875-1.6001-1.1875s-1.6001.54395-1.6001,1.1875S30.13281,32.625,31,32.625a.875.875,0,0,1,0,1.75Z" fill="currentColor" fill-opacity="1" stroke="none" stroke-opacity="1"/><path d="M31,38.5a3.168,3.168,0,0,1-3.3501-2.9375.875.875,0,0,1,1.75,0c0,.64355.73291,1.1875,1.6001,1.1875s1.6001-.544,1.6001-1.1875S31.86719,34.375,31,34.375a.875.875,0,0,1,0-1.75,3.168,3.168,0,0,1,3.3501,2.9375A3.168,3.168,0,0,1,31,38.5Z" fill="currentColor" fill-opacity="1" stroke="none" stroke-opacity="1"/><path d="M22,39H14a1,1,0,0,1,0-2h8a1,1,0,0,1,0,2Z" fill="currentColor" fill-opacity="1" stroke="none" stroke-opacity="1"/><path d="M34,25H14a1,1,0,0,1,0-2H34a1,1,0,0,1,0,2Z" fill="currentColor" fill-opacity="1" stroke="none" stroke-opacity="1"/><path d="M34,16H14a1,1,0,0,1,0-2H34a1,1,0,0,1,0,2Z" fill="currentColor" fill-opacity="1" stroke="none" stroke-opacity="1"/><path d="M34,20.5H14a1,1,0,0,1,0-2H34a1,1,0,0,1,0,2Z" fill="currentColor" fill-opacity="1" stroke="none" stroke-opacity="1"/><path d="M24,11.5H14a1,1,0,0,1,0-2H24a1,1,0,0,1,0,2Z" fill="currentColor" fill-opacity="1" stroke="none" stroke-opacity="1"/><path d="M40,12H34a1,1,0,0,1-1-1V4a1,1,0,0,1,2,0v6h5a1,1,0,0,1,0,2Z" fill="currentColor" fill-opacity="1" stroke="none" stroke-opacity="1"/></g></svg>`,
      store: `<svg viewBox="0 0 483 483" fill="currentColor" stroke="none" style="fill:currentColor;stroke:none" focusable="false" aria-hidden="true"><g width="100%" height="100%" transform="matrix(1,0,0,1,0,0)"><g><path d="m449.373 0h-415.746l-29.289 151.019c-.43 21.543 9.012 41.334 24.162 54.524v277.457h426v-277.458c15.15-13.189 24.592-32.982 24.162-54.524zm-85.873 453h-75v-126h75zm61 0h-31v-156h-135v156h-200v-231.94c26.505 6.782 56.199-4.331 71.919-25.158 27.389 35.936 83.727 35.909 111.081-.033 27.383 35.968 83.712 35.953 111.081 0 15.711 20.84 45.409 31.981 71.919 25.191zm-16.378-260c-22.354 0-40.541-18.187-40.541-40.541h-30c-2.233 53.796-78.868 53.754-81.081 0h-30c-2.233 53.796-78.868 53.754-81.081 0h-30c-2.078 52.996-77.314 54.093-81.06 1.33l24.009-123.789h366.265l24.008 123.79c-.704 21.741-18.61 39.21-40.519 39.21z" fill="currentColor" fill-opacity="1" stroke="none" stroke-opacity="1"/><path d="m88.5 400h140v-134h-140zm30-104h80v74h-80z" fill="currentColor" fill-opacity="1" stroke="none" stroke-opacity="1"/></g></g></svg>`,
      market: `<svg viewBox="0 0 682.66669 682.66669" fill="currentColor" stroke="none" style="fill:currentColor;stroke:none" focusable="false" aria-hidden="true"><g width="100%" height="100%" transform="matrix(1,0,0,1,0,0)"><defs id="defs13"><clipPath clipPathUnits="userSpaceOnUse" id="clipPath23"><path d="M 0,512 H 512 V 0 H 0 Z" id="path21" fill="currentColor" fill-opacity="1" stroke="none" stroke-opacity="1"/></clipPath></defs><g id="g15" transform="matrix(1.3333333,0,0,-1.3333333,0,682.66667)"><g id="g17"><g id="g19" clip-path="url(#clipPath23)"><g id="g25" transform="translate(15,293.0803)"><path d="M 0,0 115.672,-56.826 228.846,28.061 343.602,-0.635 482,137.774" style="stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 10; stroke-dasharray: none;" id="path27" fill="none" fill-opacity="1" stroke="currentColor" stroke-opacity="1" data-original-stroke-color="#000000ff" stroke-width="30" data-original-stroke-width="30"/></g><g id="g29" transform="translate(377,196)"><path d="M 0,0 -120,30 -240,-60 -362,0 v -181 h 482 v 301 z" style="stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 10; stroke-dasharray: none;" id="path31" fill="none" fill-opacity="1" stroke="currentColor" stroke-opacity="1" data-original-stroke-color="#000000ff" stroke-width="30" data-original-stroke-width="30"/></g><g id="g33" transform="translate(437,436)"><path d="M 0,0 H 60 V -60" style="stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 10; stroke-dasharray: none;" id="path35" fill="none" fill-opacity="1" stroke="currentColor" stroke-opacity="1" data-original-stroke-color="#000000ff" stroke-width="30" data-original-stroke-width="30"/></g><g id="g37" transform="translate(107,376)"><path d="M 0,0 C 0,-16.569 13.432,-30 30,-30 46.568,-30 60,-16.569 60,0 60,16.569 46.568,30 30,30 13.432,30 0,43.431 0,60 0,76.569 13.432,90 30,90 46.568,90 60,76.569 60,60" style="stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 10; stroke-dasharray: none;" id="path39" fill="none" fill-opacity="1" stroke="currentColor" stroke-opacity="1" data-original-stroke-color="#000000ff" stroke-width="30" data-original-stroke-width="30"/></g><g id="g41" transform="translate(137,512)"><path d="M 0,0 V -45.999" style="stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 10; stroke-dasharray: none;" id="path43" fill="none" fill-opacity="1" stroke="currentColor" stroke-opacity="1" data-original-stroke-color="#000000ff" stroke-width="30" data-original-stroke-width="30"/></g><g id="g45" transform="translate(137,346)"><path d="M 0,0 V -45" style="stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 10; stroke-dasharray: none;" id="path47" fill="none" fill-opacity="1" stroke="currentColor" stroke-opacity="1" data-original-stroke-color="#000000ff" stroke-width="30" data-original-stroke-width="30"/></g><g id="g49" transform="translate(137,15)"><path d="M 0,0 V 121" style="stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 10; stroke-dasharray: none;" id="path51" fill="none" fill-opacity="1" stroke="currentColor" stroke-opacity="1" data-original-stroke-color="#000000ff" stroke-width="30" data-original-stroke-width="30"/></g><g id="g53" transform="translate(257,15)"><path d="M 0,0 V 211" style="stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 10; stroke-dasharray: none;" id="path55" fill="none" fill-opacity="1" stroke="currentColor" stroke-opacity="1" data-original-stroke-color="#000000ff" stroke-width="30" data-original-stroke-width="30"/></g><g id="g57" transform="translate(377,15)"><path d="M 0,0 V 181" style="stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 10; stroke-dasharray: none;" id="path59" fill="none" fill-opacity="1" stroke="currentColor" stroke-opacity="1" data-original-stroke-color="#000000ff" stroke-width="30" data-original-stroke-width="30"/></g></g></g></g></g></svg>`,
      settings: `<svg viewBox="0 0 512 512" fill="currentColor" stroke="none" style="fill:currentColor;stroke:none" focusable="false" aria-hidden="true"><g width="100%" height="100%" transform="matrix(1,0,0,1,0,0)"><g><g><path d="M511.956,308.447L512,206.865l-65.97-7.239c-3.584-12.1-8.323-23.822-14.165-35.037l42.198-52.531l-71.812-71.845&#10;&#9;&#9;&#9;L350.48,81.765c-11.115-6.041-22.751-10.987-34.783-14.783L308.378,0.02H206.797l-7.21,65.973&#10;&#9;&#9;&#9;c-11.988,3.556-23.608,8.248-34.726,14.021L112.386,37.75l-71.938,71.72l41.484,51.825c-6.058,11.109-11.02,22.741-14.831,34.763&#10;&#9;&#9;&#9;l-66.968,7.232L0,304.871l65.963,7.295c3.573,12.101,8.301,23.826,14.135,35.049L37.856,399.71l71.751,71.907l51.807-41.507&#10;&#9;&#9;&#9;c11.112,6.052,22.744,11.008,34.769,14.815l7.261,66.966l101.582,0.089l7.266-65.967c12.1-3.578,23.826-8.312,35.043-14.149&#10;&#9;&#9;&#9;l52.513,42.22l71.876-71.783l-41.529-51.788c6.046-11.112,10.997-22.747,14.8-34.777L511.956,308.447z M429.69,399.983&#10;&#9;&#9;&#9;l-32.106,32.065l-47.292-38.024l-9.344,5.54c-14.549,8.625-30.24,14.951-46.64,18.802l-10.782,2.531l-6.579,59.713l-45.377-0.039&#10;&#9;&#9;&#9;l-6.538-60.297l-10.521-2.694c-16.307-4.175-31.871-10.816-46.257-19.737l-9.414-5.837l-46.901,37.577l-32.05-32.119&#10;&#9;&#9;&#9;l38.043-47.274l-5.536-9.347c-8.621-14.557-14.941-30.252-18.782-46.648l-2.526-10.784l-59.711-6.604l0.06-45.376l60.3-6.511&#10;&#9;&#9;&#9;l2.699-10.521c4.18-16.302,10.826-31.863,19.756-46.248l5.842-9.411l-37.557-46.917l32.135-32.037l47.258,38.064l9.349-5.533&#10;&#9;&#9;&#9;c14.467-8.56,30.07-14.851,46.375-18.694l10.779-2.541l6.526-59.719h45.375l6.591,60.294l10.523,2.685&#10;&#9;&#9;&#9;c16.315,4.161,31.885,10.788,46.275,19.694l9.418,5.829l46.868-37.616l32.078,32.093l-38.002,47.307l5.544,9.342&#10;&#9;&#9;&#9;c8.63,14.543,14.963,30.232,18.822,46.632l2.537,10.781l59.716,6.552l-0.02,45.377l-60.296,6.564l-2.689,10.522&#10;&#9;&#9;&#9;c-4.168,16.313-10.802,31.879-19.715,46.266l-5.834,9.416L429.69,399.983z" fill="currentColor" fill-opacity="1" stroke="none" stroke-opacity="1"/></g></g><g><g><path d="M256.021,148.577c-59.221,0-107.402,48.181-107.402,107.402s48.18,107.402,107.402,107.402&#10;&#9;&#9;&#9;c59.222,0,107.402-48.181,107.402-107.402S315.243,148.577,256.021,148.577z M256.021,332.038c-41.939,0-76.06-34.121-76.06-76.06&#10;&#9;&#9;&#9;c0-41.939,34.12-76.06,76.06-76.06c41.94,0,76.06,34.121,76.06,76.06C332.081,297.917,297.961,332.038,256.021,332.038z" fill="currentColor" fill-opacity="1" stroke="none" stroke-opacity="1"/></g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g></g></svg>`,
      logs: `<svg viewBox="-30 0 512 512" fill="currentColor" stroke="none" style="fill:currentColor;stroke:none" focusable="false" aria-hidden="true"><g width="100%" height="100%" transform="matrix(1,0,0,1,0,0)"><g id="surface1"><path d="M 75.546875 175.417969 L 255.546875 175.417969 L 255.546875 205.417969 L 75.546875 205.417969 Z M 75.546875 175.417969 " style="fill-rule: nonzero;" fill="currentColor" fill-opacity="1" stroke="none" stroke-opacity="1"/><path d="M 75.546875 236.417969 L 255.546875 236.417969 L 255.546875 266.417969 L 75.546875 266.417969 Z M 75.546875 236.417969 " style="fill-rule: nonzero;" fill="currentColor" fill-opacity="1" stroke="none" stroke-opacity="1"/><path d="M 75.546875 297.417969 L 210.421875 297.417969 L 210.421875 327.417969 L 75.546875 327.417969 Z M 75.546875 297.417969 " style="fill-rule: nonzero;" fill="currentColor" fill-opacity="1" stroke="none" stroke-opacity="1"/><path d="M 339.839844 287.328125 C 336.898438 287.328125 333.980469 287.441406 331.089844 287.671875 L 331.089844 0 L 93.53125 0 L 0 93.519531 L 0 444.28125 L 236.761719 444.28125 C 254.039062 484.089844 293.738281 512 339.839844 512 C 401.78125 512 452.179688 461.609375 452.179688 399.671875 C 452.179688 337.730469 401.78125 287.328125 339.839844 287.328125 Z M 339.839844 482 C 310.871094 482 285.351562 466.960938 270.679688 444.28125 C 264.871094 435.320312 260.761719 425.171875 258.808594 414.28125 C 257.949219 409.53125 257.511719 404.648438 257.511719 399.671875 C 257.511719 368.269531 275.171875 340.921875 301.089844 327.039062 C 310.199219 322.148438 320.339844 318.929688 331.089844 317.800781 C 333.96875 317.488281 336.890625 317.328125 339.839844 317.328125 C 385.238281 317.328125 422.179688 354.269531 422.179688 399.671875 C 422.179688 445.070312 385.238281 482 339.839844 482 Z M 98.003906 37.945312 L 98.003906 98 L 37.949219 98 Z M 30 414.28125 L 30 128 L 128.003906 128 L 128.003906 30 L 301.089844 30 L 301.089844 294.21875 C 258.179688 310.039062 227.511719 351.339844 227.511719 399.671875 C 227.511719 404.621094 227.828125 409.5 228.460938 414.28125 Z M 30 414.28125 " style="fill-rule: nonzero;" fill="currentColor" fill-opacity="1" stroke="none" stroke-opacity="1"/><path d="M 354.839844 384.671875 L 354.839844 340.871094 L 324.839844 340.871094 L 324.839844 414.671875 L 383.179688 414.671875 L 383.179688 384.671875 Z M 354.839844 384.671875 " style="fill-rule: nonzero;" fill="currentColor" fill-opacity="1" stroke="none" stroke-opacity="1"/></g></g></svg>`
    };
    return icons[normalizedKey] || icons.overview;
  }
  function renderLeftMenu(model, activeSection = "Overview") {
    return `
      <aside class="admin-terminal-left-menu" aria-label="Admin terminal menu">
        <div class="admin-terminal-menu-top">
          <div class="admin-terminal-brand">
            <span class="admin-terminal-brand-mark" aria-hidden="true">
              <svg viewBox="0 0 56 56" class="admin-terminal-logo-svg">
                <circle cx="28" cy="28" r="25"></circle>
                <path d="M28 7 L45 17 L45 39 L28 49 L11 39 L11 17 Z"></path>
                <ellipse cx="28" cy="28" rx="11" ry="17"></ellipse>
                <line x1="28" y1="11" x2="28" y2="45"></line>
                <path d="M18 23 Q28 19 38 23"></path>
                <path d="M18 33 Q28 37 38 33"></path>
                <path class="logo-e" d="M21 21 L21 35 L33 35 M21 28 L31 28 M21 21 L33 21"></path>
                <circle class="orbit-dot" cx="45" cy="28" r="2.4"></circle>
              </svg>
            </span>
            <div class="admin-terminal-brand-copy">
              <strong>Admin</strong>
              <small>Terminal</small>
            </div>
          </div>
        </div>
        <nav class="admin-terminal-nav" aria-label="Admin sections">
          ${NAV_ITEMS.map((item) => `
            <button
              class="admin-terminal-nav-item${item.id === activeSection ? " active" : ""}"
              type="button"
              data-admin-section="${escapeHtml(item.id)}"
              title="${escapeHtml(item.label)}"
              aria-label="${escapeHtml(item.label)}"
              aria-pressed="${String(item.id === activeSection)}"
            >
              <span class="admin-terminal-nav-icon admin-terminal-nav-icon--${escapeHtml(item.iconKey || "overview")}" aria-hidden="true">${renderNavIcon(item.iconKey)}</span>
              <strong>${escapeHtml(item.label)}</strong>
            </button>
          `).join("")}
        </nav>
        <div class="admin-terminal-side-code">
          <button
            class="admin-terminal-side-code-compact"
            type="button"
            aria-label="Share game code ${escapeHtml(model.gameCode)}"
            title="Share game code"
            aria-expanded="false"
            data-admin-terminal-action="share-game-code"
            data-admin-terminal-share-button
            data-game-code="${escapeHtml(model.gameCode)}"
            data-game-name="${escapeHtml(model.gameName)}"
            data-game-status="${escapeHtml(model.gameStatus)}"
          >
            <span class="admin-terminal-share-arrow" aria-hidden="true">↗</span>
          </button>
          <div class="admin-terminal-side-code-expanded">
            <span>Code</span>
            <strong>${escapeHtml(model.gameCode)}</strong>
            <small>${escapeHtml(model.gameName)} · ${escapeHtml(model.gameStatus)}</small>
          </div>
        </div>
      </aside>`;
  }
  function renderQuickActions() {
    const actions = [
      { iconKey: "attendance", label: "Scan Attendance", sub: "Open scanner", action: "scan-attendance", tone: "is-amber" },
      { iconKey: "contracts", label: "Add Contract", sub: "Contract + reward", action: "add-contract", tone: "is-cyan" },
      { iconKey: "players", label: "Add Player", sub: "ID + access", action: "add-player", tone: "is-good" },
      { iconKey: "store", label: "Add Store Item", sub: "Price + stock", action: "add-store-item", tone: "is-purple" }
    ];
    return `
      <section class="admin-terminal-quick-actions" aria-label="Quick actions">
        <header>
          <span>Actions</span>
          <small>primary admin tools</small>
        </header>
        <div class="admin-terminal-action-grid">
          ${actions.map((action) => `
            <button class="admin-terminal-action ${action.tone}" type="button" data-admin-terminal-action="${escapeHtml(action.action)}">
              <span class="admin-terminal-action-rail" aria-hidden="true"></span>
              <span class="admin-terminal-action-mark" aria-hidden="true">${renderNavIcon(action.iconKey)}</span>
              <span class="admin-terminal-action-copy">
                <strong>${escapeHtml(action.label)}</strong>
                <small>${escapeHtml(action.sub)}</small>
              </span>
              <span class="admin-terminal-action-arrow" aria-hidden="true">↗</span>
            </button>
          `).join("")}
        </div>
      </section>`;
  }
  function renderLeaderboard(players) {
    return `
      <section class="admin-terminal-panel">
        <header class="admin-terminal-panel-header">
          <div>
            <span>Leaderboard</span>
            <h3>Class standings</h3>
          </div>
          <button class="admin-terminal-card-view-button" type="button" data-admin-terminal-action="view-leaderboard">View</button>
        </header>
        <div class="admin-terminal-list">
          ${players.slice(0, 5).map((player) => {
            const isFirst = Number(player.rank) === 1;
            const netWorth = player.netWorth || player.network || player.balance || player.meta || "—";
            const overallScore = player.overallScore ?? player.score ?? player.rating ?? "—";
            return `
              <article
                class="admin-terminal-row admin-terminal-clickable-row${isFirst ? " is-first-place" : ""}"
                role="button"
                tabindex="0"
                data-admin-terminal-action="open-player-profile"
                data-player-rank="${escapeHtml(player.rank)}"
                data-player-name="${escapeHtml(player.name)}"
                data-player-meta="${escapeHtml(player.meta)}"
                data-player-net-worth="${escapeHtml(netWorth)}"
                data-player-overall="${escapeHtml(overallScore)}"
              >
                <span class="admin-terminal-rank">${escapeHtml(player.rank)}</span>
                <div>
                  <strong class="admin-terminal-player-name">
                    ${escapeHtml(player.name)}
                    ${isFirst ? `<i class="admin-terminal-name-crown" aria-hidden="true">♛</i>` : ""}
                  </strong>
                  <small>${escapeHtml(player.meta)}</small>
                </div>
                <div class="admin-terminal-leaderboard-metrics">
                  <span><small>Net worth</small><strong>${renderPlayerCurrencyAmount(netWorth, player)}</strong></span>
                  <span><small>Overall</small><strong>${escapeHtml(overallScore)}</strong></span>
                </div>
              </article>`;
          }).join("")}
        </div>
      </section>`;
  }
  function renderAssignments(assignments) {
    return `
      <section class="admin-terminal-panel admin-terminal-panel-contracts">
        <header class="admin-terminal-panel-header">
          <div>
            <span>Work</span>
            <h3>Active contracts</h3>
          </div>
          <button class="admin-terminal-card-view-button" type="button" data-admin-terminal-action="see-more-contracts">View</button>
        </header>
        <div class="admin-terminal-list">
          ${assignments.slice(0, 3).map((assignment) => {
            const reward = assignment.reward || assignment.money || assignment.value || assignment.status || "—";
            return `
              <article
                class="admin-terminal-row admin-terminal-assignment-row admin-terminal-clickable-row"
                role="button"
                tabindex="0"
                data-admin-terminal-action="open-contract-profile"
                data-contract-title="${escapeHtml(assignment.title)}"
                data-contract-meta="${escapeHtml(assignment.meta)}"
                data-contract-reward="${escapeHtml(reward)}"
              >
                <div>
                  <strong>${escapeHtml(assignment.title)}</strong>
                  <small>${escapeHtml(assignment.meta)}</small>
                </div>
                <span class="admin-terminal-assignment-reward">${renderCurrencyAmount(reward, "NRC")}</span>
              </article>`;
          }).join("")}
        </div>
        <button class="admin-terminal-minor-button" type="button" data-admin-terminal-action="manage-contracts">MANAGE</button>
      </section>`;
  }
  function readStableHash(value) {
    const text = String(value ?? "player");
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash >>> 0);
  }
  function makeSixDigitPlayerId(value, fallbackSeed) {
    const explicitDigits = String(value ?? "").replace(/\D/g, "").slice(-6);
    if (explicitDigits) return explicitDigits.padStart(6, "0").slice(-6);
    return String(readStableHash(fallbackSeed) % 1000000).padStart(6, "0");
  }
  function makeSciIdSerial(seed, playerIdSeed) {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let hash = readStableHash(seed);
    let prefix = "";
    for (let index = 0; index < 6; index += 1) {
      prefix += alphabet[hash % alphabet.length];
      hash = Math.floor(hash / alphabet.length) + readStableHash(`${seed}:${index}`);
    }
    return `${prefix}${makeSixDigitPlayerId(playerIdSeed, seed)}`;
  }
  function formatSciIdLastActiveTime(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const normalized = raw.toLowerCase();
    if (normalized.includes("yesterday")) return "YESTERDAY";
    if (normalized.includes("today")) return "TODAY";
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      const now = new Date();
      const sameYear = parsed.getFullYear() === now.getFullYear();
      const sameMonth = parsed.getMonth() === now.getMonth();
      const sameDate = parsed.getDate() === now.getDate();
      const oneDayMs = 24 * 60 * 60 * 1000;
      const yesterday = new Date(now.getTime() - oneDayMs);
      const wasYesterday =
        parsed.getFullYear() === yesterday.getFullYear() &&
        parsed.getMonth() === yesterday.getMonth() &&
        parsed.getDate() === yesterday.getDate();
      const timeText = parsed.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit"
      }).toUpperCase();
      if (sameYear && sameMonth && sameDate) return timeText;
      if (wasYesterday) return `YESTERDAY ${timeText}`;
      const dateText = parsed.toLocaleDateString([], {
        month: "short",
        day: "numeric"
      }).toUpperCase();
      return `${dateText} ${timeText}`;
    }
    return raw.toUpperCase();
  }
  function readSciIdSessionStatus(record, fallbackValue = "") {
    const source = record && typeof record === "object" ? record : {};
    const activityStatus = source.activity && typeof source.activity === "object" ? source.activity : null;
    const activityLabel = String(activityStatus?.label || "").trim();
    const statusText = String(
      source.sessionStatus ||
      source.onlineStatus ||
      source.attendanceStatus ||
      source.status ||
      source.meta ||
      fallbackValue ||
      record ||
      ""
    ).trim();
    const normalized = `${activityLabel} ${statusText}`.toLowerCase();
    const isSignedOut =
      normalized.includes("offline") ||
      normalized.includes("last active") ||
      normalized.includes("signed out") ||
      normalized.includes("signed-out") ||
      normalized.includes("logged out") ||
      normalized.includes("logged-out") ||
      normalized.includes("inactive") ||
      normalized.includes("suspended") ||
      normalized.includes("pending") ||
      normalized.includes("disabled") ||
      normalized.includes("absent");
    const isSignedIn =
      !isSignedOut && (
        activityStatus?.tone === "is-now" ||
        /^online\s+now$/i.test(activityLabel) ||
        /^online$/i.test(statusText) ||
        normalized.includes("online now") ||
        normalized.includes("checked in") ||
        normalized.includes("checked-in") ||
        normalized.includes("checked_in") ||
        normalized.includes("signed in") ||
        normalized.includes("signed-in") ||
        normalized.includes("signed_in") ||
        normalized === "active" ||
        normalized === "present" ||
        normalized.includes("active today")
      );
    return isSignedIn
      ? {
          caption: "Status",
          label: "ONLINE",
          stateClass: "is-active-session"
        }
      : {
          caption: "Status",
          label: "OFFLINE",
          stateClass: "is-offline-session"
        };
  }
  function getPlayerActivityStatus(player = {}, metaValue = "", index = 0) {
    const source = player && typeof player === "object" ? player : {};
    const rawStatus = String(
      source.sessionStatus ||
      source.onlineStatus ||
      source.status ||
      source.meta ||
      metaValue ||
      ""
    ).trim();
    const normalized = rawStatus.toLowerCase();
    const explicitLastActive =
      source.lastActiveAt ||
      source.lastSeenAt ||
      source.lastActivityAt ||
      source.lastLoginAt ||
      source.updatedAt ||
      source.lastActive ||
      source.lastSeen ||
      "";
    const formatMinutes = (minutes) => {
      const rounded = Math.max(1, Math.round(Number(minutes) || 0));
      return rounded === 1 ? "1 minute ago" : `${rounded} minutes ago`;
    };
    const formatDays = (days) => {
      const rounded = Math.max(1, Math.round(Number(days) || 0));
      return rounded === 1 ? "1 day ago" : `${rounded} days ago`;
    };
    const explicitText = String(explicitLastActive || "").trim().toLowerCase();
    const minuteMatch = explicitText.match(/(\d+)\s*(?:min|mins|minute|minutes)\s*ago/);
    if (minuteMatch) {
      const minutes = Number(minuteMatch[1]);
      if (minutes <= 0) return { label: "Online Now", tone: "is-now" };
      if (minutes <= 60) return { label: `Last Active ${formatMinutes(minutes).replace("minutes", "mins").replace("minute", "min")}`, tone: "is-recent" };
      if (minutes < 1440) return { label: `Last Active ${formatMinutes(minutes).replace("minutes", "mins").replace("minute", "min")}`, tone: "is-away" };
      return { label: `Last Active ${formatDays(minutes / 1440)}`, tone: "is-stale" };
    }
    const hourMatch = explicitText.match(/(\d+)\s*(?:hr|hrs|hour|hours)\s*ago/);
    if (hourMatch) {
      const hours = Number(hourMatch[1]);
      return hours < 1
        ? { label: "Last Active 59 mins ago", tone: "is-recent" }
        : hours < 24
          ? { label: `Last Active ${hours === 1 ? "1 hour ago" : `${hours} hours ago`}`, tone: "is-away" }
          : { label: `Last Active ${formatDays(hours / 24)}`, tone: "is-stale" };
    }
    const dayMatch = explicitText.match(/(\d+)\s*(?:day|days)\s*ago/);
    if (dayMatch) {
      const days = Number(dayMatch[1]);
      return { label: `Last Active ${formatDays(days)}`, tone: "is-stale" };
    }
    const parsedDate = explicitLastActive ? new Date(explicitLastActive) : null;
    if (parsedDate && Number.isFinite(parsedDate.getTime())) {
      const diffMinutes = Math.max(0, Math.round((Date.now() - parsedDate.getTime()) / 60000));
      if (diffMinutes <= 5) return { label: "Online Now", tone: "is-now" };
      if (diffMinutes <= 60) return { label: `Last Active ${formatMinutes(diffMinutes).replace("minutes", "mins").replace("minute", "min")}`, tone: "is-recent" };
      if (diffMinutes < 1440) {
        const hours = Math.max(1, Math.round(diffMinutes / 60));
        return { label: `Last Active ${hours === 1 ? "1 hour ago" : `${hours} hours ago`}`, tone: "is-away" };
      }
      return { label: `Last Active ${formatDays(diffMinutes / 1440)}`, tone: "is-stale" };
    }
    if (normalized.includes("online") || normalized.includes("active today") || normalized.includes("checked in") || normalized.includes("signed in")) {
      return { label: "Online Now", tone: "is-now" };
    }
    if (normalized.includes("within hour") || normalized.includes("past hour") || normalized.includes("recent")) {
      return { label: "Last Active 20 mins ago", tone: "is-recent" };
    }
    if (normalized.includes("yesterday")) {
      return { label: "Last Active 1 day ago", tone: "is-stale" };
    }
    if (normalized.includes("offline") || normalized.includes("inactive") || normalized.includes("signed out") || normalized.includes("absent")) {
      return { label: "Last Active 2 days ago", tone: "is-stale" };
    }
    return index % 3 === 0
      ? { label: "Online Now", tone: "is-now" }
      : index % 3 === 1
        ? { label: "Last Active 20 mins ago", tone: "is-recent" }
        : { label: "Last Active 2 days ago", tone: "is-stale" };
  }
  function formatPlayerStatusPillLabel(activity = {}) {
    const rawLabel = String(activity?.label || "Offline").trim();
    if (!rawLabel) return "OFFLINE";
    if (/^online\s+now$/i.test(rawLabel)) return "ONLINE";
    if (/^offline$/i.test(rawLabel)) return "OFFLINE";
    return rawLabel.toUpperCase();
  }
  function formatInlinePlayerStatusLabel(activity = {}) {
    const rawLabel = String(activity?.label || "Offline").trim();
    if (!rawLabel) return "Offline";
    if (/^online\s+now$/i.test(rawLabel)) return "Online";
    if (/^offline$/i.test(rawLabel)) return "Offline";
    return rawLabel
      .replace(/mins/gi, "mins")
      .replace(/ago/gi, "ago")
      .replace(/([a-z])/g, (m) => m.toUpperCase())
      .replace(/Mins/g, "mins")
      .replace(/Ago/g, "ago");
  }
  function renderDashboardPlayerProfileModal(player = {}) {
    const name = player.name || "Player";
    const rank = player.rank || "—";
    const meta = player.meta || "Active Today";
    const netWorth = player.netWorth || "—";
    const overall = player.overall || "—";
    const locationPool = ["Northreach", "Yrethia", "Thaloris", "Solvend", "Eldoran"];
    const rankNumber = Number(rank);
    const location = player.location || locationPool[(Number.isFinite(rankNumber) ? Math.max(rankNumber - 1, 0) : 0) % locationPool.length];
    const avatarCode = String(name).slice(0, 1).toUpperCase() || "P";
    const playerId = makeSixDigitPlayerId(player.playerId, `${name}:${rank}`);
    const sciId = makeSciIdSerial(`${name}:${rank}:${overall}`, playerId);
    const readMoneyNumber = (value) => {
      const numeric = Number(String(value || "").replace(/[^0-9.-]/g, ""));
      return Number.isFinite(numeric) ? numeric : 0;
    };
    const formatMoney = (value) => Math.round(value).toLocaleString("en-US");
    const netWorthNumber = readMoneyNumber(netWorth);
    const cashValue = player.cash || formatMoney(Math.max(Math.round(netWorthNumber * 0.19), 0));
    const portfolioValue = player.portfolioValue || formatMoney(Math.max(netWorthNumber - readMoneyNumber(cashValue), 0));
    const positionsHeld = player.positionsHeld || (Number.isFinite(rankNumber) ? Math.max(3, Math.min(9, rankNumber + 2)) : 6);
    const sessionStatus = readSciIdSessionStatus(player, meta);
    return renderModalShell({
      id: "dashboard-player-profile",
      tone: "cyan",
      eyebrow: "Player profile",
      title: name,
      body: `
        <style>
          .admin-terminal-sci-id-avatar-block{position:relative;}
          .admin-terminal-sci-id-avatar{overflow:visible!important;}
        </style>
        <section class="admin-terminal-sci-id-shell is-dashboard-id">
          <video class="admin-terminal-sci-id-video" autoplay muted loop playsinline preload="auto" aria-hidden="true">
            <source src="./assets/videos/id-background.mp4" type="video/mp4" />
          </video>
          <div class="admin-terminal-sci-id-card">
            <button class="admin-terminal-sci-id-close" type="button" data-admin-terminal-modal-close aria-label="Close ID card" title="Close">×</button>
            <header class="admin-terminal-sci-id-top">
              <div>
                <span>Eco Novaria Citizen ID</span>
                <strong>${escapeHtml(name)}</strong>
                <small class="admin-terminal-sci-id-serial">ID: ${escapeHtml(sciId)}</small>
              </div>
            </header>
            <div class="admin-terminal-sci-id-rail" aria-label="ID quick actions">
              <button type="button" aria-label="Player information" title="Player information"><img class="admin-terminal-sci-id-rail-icon" src="./assets/icons/player-info.svg" alt="" aria-hidden="true" /></button>
              <button type="button" aria-label="Player settings" title="Player settings"><img class="admin-terminal-sci-id-rail-icon" src="./assets/icons/player-configure.svg" alt="" aria-hidden="true" /></button>
            </div>
            <div class="admin-terminal-sci-id-mounted-readouts" aria-label="Player ID data">
              <div class="admin-terminal-sci-id-rank-badge">
                <small>Rank</small>
                <strong>#${escapeHtml(rank)}</strong>
              </div>
              <div class="admin-terminal-sci-id-top-readout is-status ${sessionStatus.stateClass}">
                <small>${escapeHtml(sessionStatus.caption)}</small>
                <span class="admin-terminal-sci-id-status-value"><i aria-hidden="true"></i><strong>${escapeHtml(sessionStatus.label)}</strong></span>
              </div>
              <div class="admin-terminal-sci-id-top-readout is-nationality">
                <small>Location</small>
                <strong>${escapeHtml(location)}</strong>
              </div>
              <div class="admin-terminal-sci-id-bottom-strip" aria-label="Player financial summary">
                <div class="admin-terminal-sci-id-bottom-readout is-net-worth">
                  <small>Net Worth</small>
                  <strong>${renderPlayerCurrencyAmount(netWorth, { ...player, location })}</strong>
                </div>
              </div>
            </div>
            <div class="admin-terminal-sci-id-body">
              <aside class="admin-terminal-sci-id-avatar-block">
                <div class="admin-terminal-sci-id-avatar" data-admin-terminal-avatar-frame>
                  <img data-admin-terminal-avatar-image alt="" hidden />
                  <span>${escapeHtml(avatarCode)}</span>
                  <i aria-hidden="true"></i>
                  <button class="admin-terminal-sci-id-avatar-edit" type="button" data-admin-terminal-action="change-sci-avatar" aria-label="Change avatar picture" title="Change avatar picture">✎</button>
                  <input type="file" accept="image/*" data-admin-terminal-avatar-input hidden />
                </div>
              </aside>
              <main class="admin-terminal-sci-id-data" aria-hidden="true"></main>
            </div>
          </div>
        </section>`,
      footer: ``
    });
  }
  function getSelectedTerminalPlayer(model, rank) {
    const players = getTerminalPlayerRows(model);
    const targetRank = rank ?? model?.selectedPlayerRank ?? (players[0] ? players[0].rank : 1);
    return players.find((player) => String(player.rank) === String(targetRank)) || players[0] || {
      rank: 1,
      name: "Player",
      location: "—",
      accessCode: "—",
      netWorth: "0.00",
      cash: "0.00",
      portfolioValue: "0.00",
      session: { label: "OFFLINE" },
      lastActive: "—",
      overall: "—",
      meta: "offline",
      flag: ""
    };
  }
  function renderPlayerOpsModalShell({ id, eyebrow, title, subtitle = "", body, footer = "", tone = "cyan" }) {
    return renderModalShell({
      id,
      tone,
      eyebrow,
      title,
      backdropClass: "is-player-ops-backdrop",
      modalClass: "is-player-ops-frame",
      body: `
        <style>
          .admin-terminal-modal-backdrop.is-player-ops-backdrop{padding:18px!important;place-items:center!important;}
          .admin-terminal-modal.is-player-ops-frame{width:min(860px,calc(100vw - 36px))!important;height:min(590px,calc(100vh - 36px))!important;max-width:none!important;max-height:none!important;aspect-ratio:auto!important;overflow:visible!important;}
          .admin-terminal-modal.is-player-ops-frame .admin-terminal-modal-body{position:absolute!important;inset:0!important;display:block!important;overflow:visible!important;padding:0!important;}
          .admin-terminal-player-ops-modal{box-sizing:border-box!important;width:100%!important;height:100%!important;min-height:0!important;max-height:none!important;display:grid!important;grid-template-rows:auto minmax(0,1fr) auto!important;overflow:hidden!important;padding:24px!important;}
          .admin-terminal-player-ops-modal.is-amber{border-color:rgba(255,196,121,.34)!important;}
          .admin-terminal-player-ops-modal.is-red{border-color:rgba(255,119,119,.34)!important;}
          .admin-terminal-player-ops-close{top:10px!important;right:10px!important;width:32px!important;height:32px!important;font-size:17px!important;}
          .admin-terminal-player-ops-head{min-height:0!important;padding:0 48px 12px 0!important;border-bottom:1px solid rgba(0,212,255,.14)!important;}
          .admin-terminal-player-ops-head span{font-size:8px!important;letter-spacing:.11em!important;}
          .admin-terminal-player-ops-head strong{margin-top:3px!important;font-size:23px!important;letter-spacing:-.065em!important;line-height:1!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;}
          .admin-terminal-player-ops-head small{display:block!important;margin-top:4px!important;max-width:none!important;font-size:9px!important;line-height:1.22!important;color:rgba(190,205,207,.82)!important;}
          .admin-terminal-player-ops-body{display:grid!important;align-content:start!important;gap:10px!important;min-height:0!important;overflow:auto!important;padding:14px 8px 2px 0!important;scrollbar-width:thin!important;}
          .admin-terminal-player-ops-grid{display:grid!important;gap:7px!important;min-width:0!important;}
          .admin-terminal-player-ops-grid.is-two{grid-template-columns:repeat(2,minmax(0,1fr))!important;}
          .admin-terminal-player-ops-grid.is-three{grid-template-columns:repeat(3,minmax(0,1fr))!important;}
          .admin-terminal-player-ops-grid.is-four{grid-template-columns:repeat(2,minmax(0,1fr))!important;}
          .admin-terminal-player-ops-panel{position:relative!important;min-width:0!important;min-height:0!important;padding:12px!important;border-color:rgba(0,212,255,.16)!important;background:linear-gradient(180deg,rgba(0,212,255,.045),rgba(2,10,20,.56))!important;}
          .admin-terminal-player-ops-modal.is-amber .admin-terminal-player-ops-panel{border-color:rgba(255,196,121,.18)!important;background:linear-gradient(180deg,rgba(255,196,121,.055),rgba(2,10,20,.56))!important;}
          .admin-terminal-player-ops-modal.is-red .admin-terminal-player-ops-panel{border-color:rgba(255,119,119,.20)!important;background:linear-gradient(180deg,rgba(255,119,119,.060),rgba(2,10,20,.56))!important;}
          .admin-terminal-player-ops-panel b{display:inline-grid!important;place-items:center!important;min-height:15px!important;margin-bottom:4px!important;padding:0 6px!important;color:rgba(10,18,24,.92)!important;background:rgba(157,236,250,.88)!important;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace!important;font-size:7px!important;font-weight:950!important;letter-spacing:.08em!important;text-transform:uppercase!important;border-radius:999px!important;}
          .admin-terminal-player-ops-modal.is-amber .admin-terminal-player-ops-panel b{background:rgba(255,196,121,.92)!important;}
          .admin-terminal-player-ops-modal.is-red .admin-terminal-player-ops-panel b{background:rgba(255,119,119,.92)!important;}
          .admin-terminal-player-ops-panel span,.admin-terminal-player-ops-field span{font-size:7.5px!important;letter-spacing:.09em!important;}
          .admin-terminal-player-ops-panel strong{display:block!important;margin-top:4px!important;font-size:17px!important;letter-spacing:-.04em!important;line-height:1.03!important;overflow-wrap:anywhere!important;}
          .admin-terminal-player-ops-panel p{margin-top:4px!important;font-size:8.5px!important;line-height:1.18!important;color:rgba(183,197,200,.78)!important;}
          .admin-terminal-player-ops-form-grid{display:grid!important;gap:7px!important;min-width:0!important;}
          .admin-terminal-player-ops-form-grid.is-two{grid-template-columns:repeat(2,minmax(0,1fr))!important;}
          .admin-terminal-player-ops-form-grid.is-three{grid-template-columns:repeat(3,minmax(0,1fr))!important;}
          .admin-terminal-player-ops-form-grid.is-four{grid-template-columns:repeat(2,minmax(0,1fr))!important;}
          .admin-terminal-player-ops-field{display:grid!important;gap:4px!important;min-width:0!important;}
          .admin-terminal-player-ops-field.is-block{grid-column:1 / -1!important;}
          .admin-terminal-player-ops-field input,.admin-terminal-player-ops-field select{height:32px!important;padding:0 8px!important;font-size:9px!important;}
          .admin-terminal-player-ops-field textarea{height:64px!important;min-height:64px!important;max-height:96px!important;padding:8px!important;font-size:9px!important;resize:none!important;overflow:auto!important;}
          .admin-terminal-player-ops-note{display:grid!important;gap:4px!important;padding:10px 12px!important;border:1px solid rgba(0,212,255,.12)!important;background:rgba(0,212,255,.025)!important;color:rgba(183,197,200,.80)!important;font-size:9px!important;line-height:1.22!important;}
          .admin-terminal-player-ops-note strong{color:rgba(244,251,252,.95)!important;font-size:10px!important;font-weight:950!important;letter-spacing:-.02em!important;}
          .admin-terminal-player-ops-footer{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(130px,1fr))!important;gap:9px!important;margin-top:10px!important;padding-top:12px!important;border-top:1px solid rgba(0,212,255,.12)!important;}
          .admin-terminal-player-ops-footer button{min-height:36px!important;padding:7px 9px!important;font-size:8.5px!important;}
          .admin-terminal-player-ops-footer button.is-danger{color:rgba(255,235,235,.96)!important;border-color:rgba(255,119,119,.38)!important;background:rgba(255,119,119,.10)!important;}
          .admin-terminal-player-chat-thread{display:grid!important;gap:8px!important;max-height:128px!important;overflow:auto!important;padding:12px!important;border:1px solid rgba(0,212,255,.14)!important;background:rgba(2,10,20,.50)!important;}
          .admin-terminal-player-chat-bubble{display:grid!important;gap:3px!important;max-width:84%!important;padding:8px 9px!important;border:1px solid rgba(0,212,255,.14)!important;background:rgba(0,212,255,.045)!important;}
          .admin-terminal-player-chat-bubble.is-admin{justify-self:end!important;border-color:rgba(101,245,169,.18)!important;background:rgba(101,245,169,.055)!important;}
          .admin-terminal-player-chat-bubble.is-player{justify-self:start!important;}
          .admin-terminal-player-chat-bubble small{color:rgba(157,236,250,.76)!important;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace!important;font-size:8px!important;font-weight:950!important;letter-spacing:.08em!important;text-transform:uppercase!important;}
          .admin-terminal-player-chat-bubble p{margin:0!important;color:rgba(244,251,252,.88)!important;font-size:9px!important;line-height:1.22!important;}
          @media(max-width:620px){.admin-terminal-modal-backdrop.is-player-ops-backdrop{padding:10px!important;}.admin-terminal-modal.is-player-ops-frame{width:calc(100vw - 20px)!important;height:calc(100vh - 20px)!important;}.admin-terminal-player-ops-modal{padding:16px!important;}.admin-terminal-player-ops-grid.is-two,.admin-terminal-player-ops-grid.is-three,.admin-terminal-player-ops-grid.is-four,.admin-terminal-player-ops-form-grid,.admin-terminal-player-ops-form-grid.is-two,.admin-terminal-player-ops-form-grid.is-three,.admin-terminal-player-ops-form-grid.is-four{grid-template-columns:1fr!important;}.admin-terminal-player-ops-head strong{font-size:20px!important;white-space:normal!important;}.admin-terminal-player-ops-footer{grid-template-columns:1fr!important;}.admin-terminal-player-chat-thread{max-height:150px!important;}}
        </style>
        <section class="admin-terminal-player-ops-modal is-${escapeHtml(tone)}">
          <button class="admin-terminal-player-ops-close" type="button" data-admin-terminal-modal-close aria-label="Close popup" title="Close">×</button>
          <header class="admin-terminal-player-ops-head">
            <span>${escapeHtml(eyebrow)}</span>
            <strong>${escapeHtml(title)}</strong>
            <small>${escapeHtml(subtitle)}</small>
          </header>
          <div class="admin-terminal-player-ops-body">
            ${body}
          </div>
          ${footer ? `<footer class="admin-terminal-player-ops-footer">${footer}</footer>` : ""}
        </section>`,
      footer: ``
    });
  }
  function renderResetPlayerCodeModal(player = {}) {
    const suggested = `PLR-${String(player.rank || 0).padStart(2, "0")}${String(player.name || "PX").replace(/[^A-Z0-9]/gi, "").slice(0, 2).toUpperCase()}`;
    return renderPlayerOpsModalShell({
      id: 'player-reset-code',
      eyebrow: 'Access control',
      title: 'Reset player code',
      subtitle: `Issue a replacement sign-in code for ${player.name || 'this player'} and document how the old code should be retired.`,
      tone: 'cyan',
      body: `
        <div class="admin-terminal-player-ops-grid is-three">
          <section class="admin-terminal-player-ops-panel">
            <b>Current code</b>
            <span>Existing access</span>
            <strong>${escapeHtml(player.accessCode || '—')}</strong>
            <p>Current sign-in credential tied to this player profile.</p>
          </section>
          <section class="admin-terminal-player-ops-panel">
            <b>Replacement</b>
            <span>Suggested code</span>
            <strong>${escapeHtml(suggested)}</strong>
            <p>Prototype suggestion built from roster rank and player name for quick recovery.</p>
          </section>
          <section class="admin-terminal-player-ops-panel">
            <b>Player</b>
            <span>Account target</span>
            <strong>${escapeHtml(player.name || 'Player')}</strong>
            <p>${escapeHtml(player.location || '—')} · Rank #${escapeHtml(player.rank || '—')} · ${escapeHtml(player.session?.label || 'ACTIVE')}</p>
          </section>
        </div>
        <div class="admin-terminal-player-ops-form-grid is-two">
          <label class="admin-terminal-player-ops-field">
            <span>Replacement code</span>
            <input type="text" value="${escapeHtml(suggested)}" />
          </label>
          <label class="admin-terminal-player-ops-field">
            <span>When does it take effect?</span>
            <select><option>Immediately</option><option>After next login</option><option>After teacher review</option></select>
          </label>
        </div>
        <div class="admin-terminal-player-ops-form-grid is-three">
          <label class="admin-terminal-player-ops-field">
            <span>Notify player</span>
            <select><option>Show new code in admin only</option><option>Send new code by direct message</option><option>Teacher shares code manually</option></select>
          </label>
          <label class="admin-terminal-player-ops-field">
            <span>Effective date</span>
            <input type="date" value="2026-06-26" />
          </label>
          <label class="admin-terminal-player-ops-field">
            <span>Reason</span>
            <select><option>Lost code</option><option>Shared code concern</option><option>Duplicate import</option><option>Teacher-requested reset</option></select>
          </label>
        </div>
        <label class="admin-terminal-player-ops-field is-block">
          <span>Admin note</span>
          <textarea rows="4" placeholder="Explain why the code is being reset and any follow-up the teacher should take."></textarea>
        </label>
        <div class="admin-terminal-player-ops-note"><strong>Reset workflow</strong><span>The old code should become unusable after the reset state is applied. Use direct message only if you want the player to receive the replacement inside the admin support thread.</span></div>`,
      footer: `
        <button type="button" data-admin-terminal-modal-close>Cancel</button>
        <button type="button" data-admin-terminal-action="confirm-player-code-reset">Reset code</button>`
    });
  }
function renderAdjustPlayerBalanceModal(player = {}) {
    return renderPlayerOpsModalShell({
      id: 'player-adjust-balance',
      eyebrow: 'Ledger adjustment',
      title: 'Adjust player balance',
      subtitle: `Apply an admin correction or manual payout for ${player.name || 'this player'}. Keep the reason clear so the adjustment can be audited later.`,
      tone: 'amber',
      body: `
        <div class="admin-terminal-player-ops-grid is-three">
          <section class="admin-terminal-player-ops-panel">
            <b>Checking</b>
            <span>Spendable cash</span>
            <strong>${renderPlayerCurrencyAmount(player.cash || '—', player)}</strong>
            <p>Available liquid funds before the adjustment is applied.</p>
          </section>
          <section class="admin-terminal-player-ops-panel">
            <b>Portfolio</b>
            <span>Holdings value</span>
            <strong>${renderPlayerCurrencyAmount(player.portfolioValue || '—', player)}</strong>
            <p>Value held in stocks and other tracked positions.</p>
          </section>
          <section class="admin-terminal-player-ops-panel">
            <b>Net worth</b>
            <span>Total position</span>
            <strong>${renderPlayerCurrencyAmount(player.netWorth || '—', player)}</strong>
            <p>Context only. This helps the teacher judge the size of the adjustment.</p>
          </section>
        </div>
        <div class="admin-terminal-player-ops-form-grid is-four">
          <label class="admin-terminal-player-ops-field">
            <span>Adjustment type</span>
            <select><option>Credit player</option><option>Debit player</option><option>Set exact checking balance</option></select>
          </label>
          <label class="admin-terminal-player-ops-field">
            <span>Amount</span>
            <input type="text" placeholder="0.00" />
          </label>
          <label class="admin-terminal-player-ops-field">
            <span>Value unit</span>
            <select><option>Standard Credits</option><option>Player local currency</option></select>
          </label>
          <label class="admin-terminal-player-ops-field">
            <span>Reason category</span>
            <select><option>Manual correction</option><option>Contract payout</option><option>Attendance payout</option><option>Penalty</option><option>Teacher-issued bonus</option></select>
          </label>
        </div>
        <div class="admin-terminal-player-ops-form-grid is-three">
          <label class="admin-terminal-player-ops-field">
            <span>Effective date</span>
            <input type="date" value="2026-06-26" />
          </label>
          <label class="admin-terminal-player-ops-field">
            <span>Visibility</span>
            <select><option>Show in player ledger</option><option>Admin-only correction</option></select>
          </label>
          <label class="admin-terminal-player-ops-field">
            <span>Updated by</span>
            <input type="text" value="Admin" />
          </label>
        </div>
        <label class="admin-terminal-player-ops-field is-block">
          <span>Ledger note</span>
          <textarea rows="5" placeholder="Write the reason for the adjustment, what source justified it, and whether the player should expect follow-up."></textarea>
        </label>
        <div class="admin-terminal-player-ops-note"><strong>Good audit trail</strong><span>Keep notes specific. A clear note is more useful than the raw amount when a teacher needs to review a disputed payout later.</span></div>`,
      footer: `
        <button type="button" data-admin-terminal-modal-close>Cancel</button>
        <button type="button" data-admin-terminal-action="confirm-player-balance-adjustment">Save ledger adjustment</button>`
    });
  }
function renderFlagPlayerAccountModal(player = {}) {
    return renderPlayerOpsModalShell({
      id: 'player-flag-account',
      eyebrow: 'Account review',
      title: 'Flag player account',
      subtitle: `Create an internal review state for ${player.name || 'this player'}. This is an admin workflow and should not act like an automatic punishment.`,
      tone: 'red',
      body: `
        <div class="admin-terminal-player-ops-grid is-three">
          <section class="admin-terminal-player-ops-panel">
            <b>Current state</b>
            <span>Existing review flag</span>
            <strong>${escapeHtml(player.flag || 'Clear')}</strong>
            <p>Current account-review status before any new action is applied.</p>
          </section>
          <section class="admin-terminal-player-ops-panel">
            <b>Activity</b>
            <span>Last active</span>
            <strong>${escapeHtml(player.lastActive || '—')}</strong>
            <p>${escapeHtml(player.session?.label || 'OFFLINE')} · ${escapeHtml(player.location || '—')}</p>
          </section>
          <section class="admin-terminal-player-ops-panel">
            <b>Target</b>
            <span>Player account</span>
            <strong>${escapeHtml(player.name || 'Player')}</strong>
            <p>Rank #${escapeHtml(player.rank || '—')} · Access ${escapeHtml(player.accessCode || '—')}</p>
          </section>
        </div>
        <div class="admin-terminal-player-ops-form-grid is-four">
          <label class="admin-terminal-player-ops-field">
            <span>Flag level</span>
            <select><option>Watch</option><option>Warning</option><option>Urgent review</option><option>Temporarily locked</option></select>
          </label>
          <label class="admin-terminal-player-ops-field">
            <span>Reason</span>
            <select><option>Behavior review</option><option>Access concern</option><option>Ledger concern</option><option>Gameplay issue</option><option>Other</option></select>
          </label>
          <label class="admin-terminal-player-ops-field">
            <span>Review date</span>
            <input type="date" value="2026-06-26" />
          </label>
          <label class="admin-terminal-player-ops-field">
            <span>Restriction</span>
            <select><option>No restriction</option><option>Require teacher review</option><option>Pause transactions</option><option>Lock login</option></select>
          </label>
        </div>
        <div class="admin-terminal-player-ops-form-grid is-two">
          <label class="admin-terminal-player-ops-field">
            <span>Reviewed by</span>
            <input type="text" value="Admin" />
          </label>
          <label class="admin-terminal-player-ops-field">
            <span>Player follow-up</span>
            <select><option>No message yet</option><option>Message player after save</option><option>Teacher will follow up manually</option></select>
          </label>
        </div>
        <label class="admin-terminal-player-ops-field is-block">
          <span>Review note</span>
          <textarea rows="5" placeholder="Explain the issue, what should be reviewed, and what the next step should be."></textarea>
        </label>
        <div class="admin-terminal-player-ops-note"><strong>Admin-only review</strong><span>Use this to track concerns, not to silently erase access without context. If the player needs an explanation, send it from the direct-message popup separately.</span></div>`,
      footer: `
        <button type="button" data-admin-terminal-modal-close>Cancel</button>
        <button type="button" data-admin-terminal-action="confirm-player-flag">Apply account flag</button>`
    });
  }
function renderPlayerSettingsModal(player = {}) {
    const playerId = `PLR-${String(player.rank || 0).padStart(3, "0")}`;
    const suggestedAccess = player.accessCode || `PX-${String(player.rank || 0).padStart(2, "0")}`;
    return renderPlayerOpsModalShell({
      id: 'player-settings-editor',
      eyebrow: 'Player settings',
      title: 'Edit player profile',
      subtitle: `Edit player identity, access, and participation status for ${player.name || 'this player'}. This does not change balances, loans, portfolio holdings, or account ledger data.`,
      tone: 'cyan',
      body: `
        <div class="admin-terminal-player-ops-grid is-three">
          <section class="admin-terminal-player-ops-panel">
            <b>Identity</b>
            <span>Display name</span>
            <strong>${escapeHtml(player.name || 'Player')}</strong>
            <p>Name shown in roster, leaderboard, and admin review surfaces.</p>
          </section>
          <section class="admin-terminal-player-ops-panel">
            <b>ID</b>
            <span>Player ID</span>
            <strong>${escapeHtml(playerId)}</strong>
            <p>Stable classroom/game identifier. Change only if duplicate or imported incorrectly.</p>
          </section>
          <section class="admin-terminal-player-ops-panel">
            <b>Status</b>
            <span>Participation</span>
            <strong>${escapeHtml(player.session?.label || 'ACTIVE')}</strong>
            <p>Suspend a player to block login without deleting historical records.</p>
          </section>
        </div>
        <div class="admin-terminal-player-ops-form-grid is-two">
          <label class="admin-terminal-player-ops-field">
            <span>Player name</span>
            <input type="text" value="${escapeHtml(player.name || '')}" />
          </label>
          <label class="admin-terminal-player-ops-field">
            <span>Player ID</span>
            <input type="text" value="${escapeHtml(playerId)}" />
          </label>
        </div>
        <div class="admin-terminal-player-ops-form-grid is-three">
          <label class="admin-terminal-player-ops-field">
            <span>Access code</span>
            <input type="text" value="${escapeHtml(suggestedAccess)}" />
          </label>
          <label class="admin-terminal-player-ops-field">
            <span>Player status</span>
            <select><option>Active</option><option>Suspended</option><option>Archived</option></select>
          </label>
          <label class="admin-terminal-player-ops-field">
            <span>Country assignment</span>
            <input type="text" value="${escapeHtml(player.location || '')}" />
          </label>
        </div>
        <label class="admin-terminal-player-ops-field is-block">
          <span>Admin note</span>
          <textarea rows="4" placeholder="Optional note explaining the profile/access change. This is admin-only."></textarea>
        </label>
        <div class="admin-terminal-player-ops-note"><strong>Danger zone</strong><span>Deleting a player should be treated as permanent in the prototype. In production, prefer archive/suspend so classroom history remains intact.</span></div>`,
      footer: `
        <button type="button" data-admin-terminal-modal-close>Cancel</button>
        <button type="button" data-admin-terminal-action="confirm-player-settings-save">Save settings</button>
        <button type="button" class="is-danger" data-admin-terminal-action="confirm-player-delete">Delete player</button>`
    });
  }
  function renderPlayerDirectMessageModal(player = {}) {
    return renderPlayerOpsModalShell({
      id: 'player-direct-message',
      eyebrow: 'Direct message',
      title: 'Admin to player chat',
      subtitle: `Use a private 1:1 support line with ${player.name || 'this player'} for help, corrections, and admin follow-up. This is a direct conversation, not a public classroom thread.`,
      tone: 'cyan',
      body: `
        <div class="admin-terminal-player-chat-thread" aria-label="Direct message thread">
          <article class="admin-terminal-player-chat-bubble is-player">
            <small>${escapeHtml(player.name || 'Player')} · 08:42</small>
            <p>Can you check why my latest contract payout has not shown up yet?</p>
          </article>
          <article class="admin-terminal-player-chat-bubble is-admin">
            <small>Admin · 08:45</small>
            <p>I am reviewing the ledger now. I will message you here when it is updated.</p>
          </article>
        </div>
        <div class="admin-terminal-player-ops-form-grid is-two">
          <label class="admin-terminal-player-ops-field">
            <span>Message type</span>
            <select><option>Support reply</option><option>Reminder</option><option>Gameplay clarification</option><option>Teacher note</option></select>
          </label>
          <label class="admin-terminal-player-ops-field">
            <span>Visibility</span>
            <select><option>Visible to player</option><option>Save as admin draft</option></select>
          </label>
        </div>
        <label class="admin-terminal-player-ops-field is-block">
          <span>Message</span>
          <textarea rows="6" placeholder="Write a direct message to the player..."></textarea>
        </label>`,
      footer: `
        <button type="button" data-admin-terminal-modal-close>Cancel</button>
        <button type="button" data-admin-terminal-action="confirm-player-message-send">Send message</button>`
    });
  }
  function renderDashboardContractProfileModal(contract = {}) {
    const title = contract.title || "Contract";
    const meta = contract.meta || "No deadline set";
    const reward = contract.reward || "—";
    const status = contract.status || "Active";
    const objective = contract.objective || "No objective supplied.";
    const deadline = contract.deadline || meta;
    const submissions = contract.submissions || "0 / 0";
    const progress = contract.progress || "0";
    const locations = contract.locations || "All countries";
    const payoutType = contract.payoutType || "Cash reward";
    const evidence = contract.evidence || "Evidence requirement pending.";
    const instructions = contract.instructions || "Student instructions pending.";
    const successCriteria = contract.successCriteria || "Acceptance criteria pending.";
    const teacherNote = contract.teacherNote || "No internal review note.";
    const owner = contract.owner || "Admin";
    const category = contract.category || "Contract";
    const difficulty = contract.difficulty || "Standard";
    return renderModalShell({
      id: "dashboard-contract-profile",
      tone: "cyan",
      eyebrow: "Contract detail",
      title,
      modalClass: "admin-terminal-contract-profile-modal-v467",
      body: `
        <section class="admin-terminal-dashboard-profile is-contract admin-terminal-contract-profile-v467">
          <div class="admin-terminal-dashboard-contract-mark">▣</div>
          <div class="admin-terminal-dashboard-profile-main">
            <span>${escapeHtml(category)} · ${escapeHtml(status)}</span>
            <h3>${escapeHtml(title)}</h3>
            <p>${escapeHtml(objective)}</p>
          </div>
          <div class="admin-terminal-dashboard-profile-grid admin-terminal-contract-profile-grid-v467 admin-terminal-contract-profile-grid-v495">
            <span><small>Reward</small><strong>${escapeHtml(reward)} NRC</strong></span>
            <span><small>Status</small><strong>${escapeHtml(status)}</strong></span>
            <span><small>Deadline</small><strong>${escapeHtml(deadline)}</strong></span>
            <span><small>Submissions</small><strong>${escapeHtml(submissions)}</strong></span>
            <span><small>Progress</small><strong>${escapeHtml(progress)}%</strong></span>
          </div>
          <div class="admin-terminal-contract-context-v467 admin-terminal-contract-context-v494 admin-terminal-contract-context-v495">
            <span>Contract setup</span>
            <dl>
              <div><dt>Audience</dt><dd>${escapeHtml(locations)}</dd></div>
              <div><dt>Submission</dt><dd>${escapeHtml(evidence)}</dd></div>
            </dl>
          </div>
          <section class="admin-terminal-contract-writing-detail-v494 admin-terminal-contract-writing-detail-v495">
            <article>
              <span>Student instructions</span>
              <p>${escapeHtml(instructions)}</p>
            </article>
            <article>
              <span>Submission requirement</span>
              <p>${escapeHtml(evidence)}</p>
            </article>
          </section>
          <div class="admin-terminal-dashboard-contract-preview">
            <span>Student view</span>
            <strong>${escapeHtml(title)}</strong>
            <small>Reward: ${escapeHtml(reward)} NRC · ${escapeHtml(deadline)}</small>
            <button type="button">Accept contract</button>
          </div>
          <div class="admin-terminal-dashboard-profile-actions">
            <button
              type="button"
              data-admin-terminal-action="review-contract-submissions"
              data-contract-title="${escapeHtml(title)}"
              data-contract-meta="${escapeHtml(meta)}"
              data-contract-reward="${escapeHtml(reward)}"
              data-contract-status="${escapeHtml(status)}"
              data-contract-objective="${escapeHtml(objective)}"
              data-contract-deadline="${escapeHtml(deadline)}"
              data-contract-submissions="${escapeHtml(submissions)}"
              data-contract-progress="${escapeHtml(progress)}"
              data-contract-locations="${escapeHtml(locations)}"
              data-contract-payout="${escapeHtml(payoutType)}"
              data-contract-evidence="${escapeHtml(evidence)}"
              data-contract-instructions="${escapeHtml(instructions)}"
              data-contract-success="${escapeHtml(successCriteria)}"
              data-contract-review-note="${escapeHtml(teacherNote)}"
              data-contract-owner="${escapeHtml(owner)}"
              data-contract-category="${escapeHtml(category)}"
              data-contract-difficulty="${escapeHtml(difficulty)}"
            >Review submissions</button>
            <button type="button" class="is-secondary" data-admin-terminal-modal-close>Close</button>
          </div>
        </section>`,
      footer: ``
    });
  }
  function getContractSubmissionReviewRows(contract = {}) {
    const title = contract.title || "Contract";
    const evidence = contract.evidence || "Evidence submission";
    const reward = contract.reward || "—";
    return [
      {
        id: "SUB-1004",
        player: "Ari Kim",
        country: "Northreach",
        status: "Pending Review",
        submittedAt: "Today 14:20",
        evidence: evidence,
        summary: `Submitted evidence for ${title} with a short written justification and supporting screenshot.`,
        before: "No submission recorded",
        after: "Evidence received · awaiting admin decision",
        message: `Re: ${title} / SUB-1004\n\nI am messaging you about this specific contract submission. Please check the linked contract and update the evidence if needed.`
      },
      {
        id: "SUB-1003",
        player: "Mina Park",
        country: "Yrethia",
        status: "Pending Review",
        submittedAt: "Today 13:45",
        evidence: evidence,
        summary: `Completed the ${title} response but left one calculation note unclear.`,
        before: "Draft in progress",
        after: `Submitted for ${reward} NRC review`,
        message: `Re: ${title} / SUB-1003\n\nThis message is linked to your contract submission. I need you to clarify the calculation before I can approve it.`
      },
      {
        id: "SUB-1002",
        player: "Daniel Choi",
        country: "Solvend",
        status: "Needs Message",
        submittedAt: "Yesterday 16:10",
        evidence: "Partial evidence",
        summary: `Submission is missing the required context for ${title}.`,
        before: "65% progress",
        after: "Partial submission · response needed",
        message: `Re: ${title} / SUB-1002\n\nThis is linked to the contract submission that needs more evidence. Please add the missing context and resubmit.`
      },
      {
        id: "SUB-1001",
        player: "Elena Ruiz",
        country: "Kaivora",
        status: "Ready",
        submittedAt: "Yesterday 11:30",
        evidence: evidence,
        summary: `Clean submission with complete evidence and explanation for ${title}.`,
        before: "Assigned",
        after: "Complete submission received",
        message: `Re: ${title} / SUB-1001\n\nThis message is linked to your completed contract submission. I am following up on the item referenced in the review queue.`
      }
    ];
  }
  function renderContractSubmissionReviewModal(contract = {}) {
    const title = contract.title || "Contract";
    const submissions = contract.submissions || "0 pending";
    const deadline = contract.deadline || "No deadline";
    const reward = contract.reward || "—";
    const rows = getContractSubmissionReviewRows(contract);
    return renderModalShell({
      id: "contract-submission-review",
      tone: "cyan",
      eyebrow: "Submission review",
      title: `${title} submissions`,
      modalClass: "admin-terminal-contract-submissions-modal-v470",
      body: `
        <section class="admin-terminal-contract-submissions-v470">
          <header class="admin-terminal-contract-submissions-summary-v470">
            <div>
              <span>Linked contract</span>
              <strong>${escapeHtml(title)}</strong>
              <small>${escapeHtml(deadline)} · ${escapeHtml(submissions)} · ${escapeHtml(reward)} NRC reward</small>
            </div>
            <b>${escapeHtml(rows.length)} players</b>
          </header>
          <div class="admin-terminal-contract-submissions-review-groups-v471">
            <section class="admin-terminal-contract-submissions-group-v471" data-contract-submissions-group="unreviewed">
              <header>
                <div>
                  <span>Unreviewed</span>
                  <strong>Needs decision</strong>
                </div>
                <b data-contract-submissions-count="unreviewed">${rows.length}</b>
              </header>
              <p class="admin-terminal-contract-submissions-empty-v471" data-contract-submissions-empty="unreviewed" hidden>No unreviewed submissions remain for this contract.</p>
              <div class="admin-terminal-contract-submissions-list-v470" data-contract-submissions-list="unreviewed">
                ${rows.map((submission) => `
                  <article
                    class="admin-terminal-contract-submission-card-v470"
                    data-contract-submission-card
                    data-submission-id="${escapeHtml(submission.id)}"
                    data-submission-player="${escapeHtml(submission.player)}"
                    data-submission-country="${escapeHtml(submission.country)}"
                    data-submission-evidence="${escapeHtml(submission.evidence)}"
                    data-submission-summary="${escapeHtml(submission.summary)}"
                    data-submission-before="${escapeHtml(submission.before)}"
                    data-submission-after="${escapeHtml(submission.after)}"
                    data-submission-submitted-at="${escapeHtml(submission.submittedAt)}"
                  >
                    <header>
                      <div>
                        <span>${escapeHtml(submission.id)} · ${escapeHtml(submission.country)}</span>
                        <strong>${escapeHtml(submission.player)}</strong>
                        <small>${escapeHtml(submission.submittedAt)}</small>
                      </div>
                      <b data-contract-submission-state>${escapeHtml(submission.status)}</b>
                    </header>
                    <p>${escapeHtml(submission.summary)}</p>
                    <dl>
                      <div><dt>Evidence</dt><dd>${escapeHtml(submission.evidence)}</dd></div>
                      <div><dt>Before</dt><dd>${escapeHtml(submission.before)}</dd></div>
                      <div><dt>After</dt><dd>${escapeHtml(submission.after)}</dd></div>
                    </dl>
                    <footer>
                      <button type="button" data-admin-terminal-action="contract-submission-accept" data-submission-id="${escapeHtml(submission.id)}" data-submission-player="${escapeHtml(submission.player)}" data-contract-title="${escapeHtml(title)}">Accept Contract</button>
                      <button type="button" class="is-warn" data-admin-terminal-action="contract-submission-reject" data-submission-id="${escapeHtml(submission.id)}" data-submission-player="${escapeHtml(submission.player)}" data-contract-title="${escapeHtml(title)}">Reject Contract</button>
                      <button
                        type="button"
                        class="is-secondary"
                        data-admin-terminal-action="contract-submission-message"
                        data-submission-id="${escapeHtml(submission.id)}"
                        data-submission-player="${escapeHtml(submission.player)}"
                        data-submission-country="${escapeHtml(submission.country)}"
                        data-contract-title="${escapeHtml(title)}"
                        data-contract-evidence="${escapeHtml(submission.evidence)}"
                        data-contract-message="${escapeHtml(submission.message)}"
                      >Message</button>
                    </footer>
                  </article>
                `).join("")}
              </div>
            </section>
            <section class="admin-terminal-contract-submissions-group-v471 is-reviewed" data-contract-submissions-group="reviewed">
              <header>
                <div>
                  <span>Reviewed</span>
                  <strong>Decision recorded</strong>
                </div>
                <b data-contract-submissions-count="reviewed">0</b>
              </header>
              <p class="admin-terminal-contract-submissions-empty-v471" data-contract-submissions-empty="reviewed">Accepted and rejected submissions will move here after confirmation.</p>
              <div class="admin-terminal-contract-submissions-list-v470" data-contract-submissions-list="reviewed"></div>
            </section>
          </div>
        </section>`
    });
  }
  function renderContractSubmissionMessageModalFromAction(action) {
    const player = action.dataset.submissionPlayer || "Player";
    const title = action.dataset.contractTitle || "Contract";
    const submissionId = action.dataset.submissionId || "Submission";
    const country = action.dataset.submissionCountry || "—";
    const evidence = action.dataset.contractEvidence || "Evidence item";
    const message = action.dataset.contractMessage || `Re: ${title} / ${submissionId}\n\nThis message is linked to your contract submission.`;
    return renderModalShell({
      id: "contract-submission-message",
      tone: "cyan",
      eyebrow: "Player Messages · Admin",
      title: `Message ${player}`,
      modalClass: "admin-terminal-contract-message-modal-v473",
      body: `
        <section class="admin-terminal-contract-message-v473">
          <div class="admin-terminal-contract-message-thread-v473">
            <div>
              <span>Thread</span>
              <strong>Player Messages</strong>
              <small>From Admin · To ${escapeHtml(player)}</small>
            </div>
            <b>Linked</b>
          </div>
          <div class="admin-terminal-contract-message-link-v473">
            <span>Referenced submission</span>
            <strong>${escapeHtml(title)}</strong>
            <small>${escapeHtml(submissionId)} · ${escapeHtml(country)} · ${escapeHtml(evidence)}</small>
          </div>
          <label class="admin-terminal-contract-message-field-v473">
            <span>Message body</span>
            <textarea rows="8">${escapeHtml(message)}</textarea>
          </label>
          <footer class="admin-terminal-contract-message-actions-v473">
            <button type="button" data-admin-terminal-modal-close>Cancel</button>
            <button type="button" data-admin-terminal-action="confirm-contract-submission-message" data-submission-player="${escapeHtml(player)}" data-contract-title="${escapeHtml(title)}">Send message</button>
          </footer>
        </section>`,
      footer: ``
    });
  }
  function getAttendanceStatusCounts(model) {
    const fallback = { total: 28, present: 24, late: 3, absent: 1 };
    const explicit = model?.attendanceStatusCounts || model?.attendanceCounts || model?.statusCounts;
    const rows = Array.isArray(model?.attendance) ? model.attendance : [];
    const totalPlayers = Number(model?.totalPlayers ?? model?.playerCount ?? explicit?.total ?? fallback.total) || fallback.total;
    if (explicit && typeof explicit === "object") {
      const present = Number(explicit.present ?? explicit.checkedIn ?? explicit.active ?? fallback.present) || 0;
      const late = Number(explicit.late ?? explicit.pending ?? explicit.waiting ?? fallback.late) || 0;
      const absent = Number(explicit.absent ?? explicit.missing ?? fallback.absent) || 0;
      const total = Number(explicit.total ?? totalPlayers ?? (present + late + absent)) || totalPlayers;
      return normalizeAttendanceCounts({ total, present, late, absent }, model, rows);
    }
    const rowCounts = rows.reduce((acc, row) => {
      const status = String(row.status || row.attendanceStatus || "").toLowerCase();
      if (["on time", "present", "checked in", "checked-in", "checked_in", "active"].includes(status)) acc.present += 1;
      else if (["late", "pending", "waiting"].includes(status)) acc.late += 1;
      else if (["absent", "missing", "offline"].includes(status)) acc.absent += 1;
      else acc.late += 1;
      return acc;
    }, { total: rows.length, present: 0, late: 0, absent: 0 });
    const hasRosterSizedRows = rows.length >= totalPlayers || rows.length >= 8;
    const baseCounts = hasRosterSizedRows
      ? { total: rows.length, present: rowCounts.present, late: rowCounts.late, absent: rowCounts.absent }
      : fallback;
    return normalizeAttendanceCounts({ ...baseCounts, total: totalPlayers || baseCounts.total }, model, rows);
  }
  function normalizeAttendanceCounts(counts, model, rows) {
    const total = Math.max(Number(counts.total) || 0, 0);
    const present = Math.max(Number(counts.present) || 0, 0);
    const late = Math.max(Number(counts.late ?? counts.pending) || 0, 0);
    const absent = Math.max(Number(counts.absent) || Math.max(total - present - late, 0), 0);
    const attendanceRate = total ? Math.round((present / total) * 100) : 0;
    const latestRow = rows.find((row) => row.student || row.name || row.status || row.time) || null;
    const rewardsIssued = rows.reduce((sum, row) => {
      const reward = String(row.reward || "").replace(/[^\d.-]/g, "");
      const value = Number(reward);
      return Number.isFinite(value) ? sum + value : sum;
    }, 0);
    const latestScan = model?.attendanceSummary?.latestScan
      || (latestRow
        ? `${latestRow.student || latestRow.name || "Player"} · ${latestRow.status || "Scanned"}${latestRow.time ? ` · ${latestRow.time}` : ""}`
        : "No scans yet");
    return {
      total,
      present,
      late,
      absent,
      attendanceRate,
      rewardsIssued: Number(model?.attendanceSummary?.rewardsIssued ?? rewardsIssued) || 0,
      latestScan
    };
  }
  function renderAttendance(model) {
    const counts = getAttendanceStatusCounts(model);
    return `
      <section class="admin-terminal-attendance" aria-label="Attendance summary">
        <div class="admin-terminal-attendance-head">
          <div>
            <span class="admin-terminal-section-kicker">Attendance</span>
            <h3>Status overview</h3>
          </div>
          <button class="admin-terminal-card-view-button" type="button" data-admin-terminal-action="view-attendance">View</button>
        </div>
        <div class="admin-terminal-attendance-body">
          <div class="admin-terminal-attendance-total">
            <strong>${escapeHtml(counts.total)}</strong>
            <span>Total players</span>
          </div>
          <div class="admin-terminal-attendance-rate">
            <strong>${escapeHtml(counts.attendanceRate)}%</strong>
            <span>Present rate</span>
          </div>
          <div class="admin-terminal-attendance-status-grid" aria-label="Player status counts">
            <span class="is-good"><strong>${escapeHtml(counts.present)}</strong><small>Present</small></span>
            <span class="is-warn"><strong>${escapeHtml(counts.late)}</strong><small>Late</small></span>
            <span class="is-bad"><strong>${escapeHtml(counts.absent)}</strong><small>Absent</small></span>
          </div>
        </div>
        <div class="admin-terminal-attendance-detail-grid">
          <span class="is-wide"><strong>${escapeHtml(counts.latestScan)}</strong><small>Latest scan</small></span>
          <span><strong>${renderCurrencyAmount(counts.rewardsIssued, "NRC")}</strong><small>Attendance rewards today</small></span>
        </div>
      </section>`;
  }
  function renderModalShell({ id, tone = "cyan", eyebrow, title, body, footer, backdropClass = "", modalClass = "" }) {
    const extraBackdropClass = backdropClass ? ` ${escapeHtml(backdropClass)}` : "";
    const extraModalClass = modalClass ? ` ${escapeHtml(modalClass)}` : "";
    return `
      <div class="admin-terminal-modal-backdrop${extraBackdropClass}" data-admin-terminal-modal-backdrop data-modal-id="${escapeHtml(id)}">
        <section class="admin-terminal-modal is-${escapeHtml(tone)}${extraModalClass}" role="dialog" aria-modal="true" aria-labelledby="${escapeHtml(id)}-title">
          <header class="admin-terminal-modal-head">
            <div>
              <span>${escapeHtml(eyebrow)}</span>
              <h3 id="${escapeHtml(id)}-title">${escapeHtml(title)}</h3>
            </div>
            <button class="admin-terminal-modal-close admin-terminal-modal-top-close-v474" type="button" aria-label="Close popup" title="Close" data-admin-terminal-modal-close>×</button>
          </header>
          <div class="admin-terminal-modal-body">
            ${body}
          </div>
          ${footer ? `<footer class="admin-terminal-modal-footer">${footer}</footer>` : ""}
        </section>
      </div>`;
  }
  function renderAttendanceScannerModal(model) {
    const counts = getAttendanceStatusCounts(model);
    const recent = Array.isArray(model.attendance) ? model.attendance.slice(0, 3) : [];
    return renderModalShell({
      id: "attendance-scanner",
      tone: "amber",
      eyebrow: "Attendance scanner",
      title: "Scan attendance",
      body: `
        <div class="admin-terminal-scanner-video-container" data-admin-terminal-scanner-console data-scan-mode="auto">
          <video class="admin-terminal-scanner-video" autoplay muted loop playsinline preload="auto" aria-hidden="true">
            <source src="./assets/videos/scanner-background.mp4" type="video/mp4" />
          </video>
          <input class="admin-terminal-scanner-hidden-input" data-admin-terminal-auto-scan-input type="text" autocomplete="off" inputmode="text" aria-label="Auto scanner capture input" />
          <header class="admin-terminal-video-topbar">
            <div class="admin-terminal-video-mode">
              <span class="admin-terminal-mode-dot" aria-hidden="true"></span>
              <div>
                <strong>Attendance Scanner</strong>
                <small><span data-admin-terminal-mode-label>Auto</span> · <span data-admin-terminal-scanner-state>Armed</span></small>
              </div>
            </div>
            <div class="admin-terminal-topbar-controls">
              <div class="admin-terminal-scan-mode-tabs" role="group" aria-label="Scanner input mode">
                <button type="button" data-admin-terminal-set-mode="auto" aria-pressed="true" onclick="window.Econovaria?.features?.adminOverviewTerminal?.setScannerMode?.('auto')">Auto</button>
                <button type="button" data-admin-terminal-set-mode="manual" aria-pressed="false" onclick="window.Econovaria?.features?.adminOverviewTerminal?.setScannerMode?.('manual')">Manual</button>
              </div>
              <button class="admin-terminal-hud-close" type="button" data-admin-terminal-modal-close aria-label="Close scanner">
                <span>Close</span>
                <b aria-hidden="true">×</b>
              </button>
            </div>
          </header>
          <section class="admin-terminal-video-last-scan" data-admin-terminal-last-scan-card>
            <div class="admin-terminal-last-scan-empty" data-admin-terminal-last-scan-empty>
              <span>Last scanned</span>
              <strong>Ready</strong>
              <small>Scan a player code. The result appears here.</small>
            </div>
            <div class="admin-terminal-last-scan-result" data-admin-terminal-last-scan-result hidden>
              <div class="admin-terminal-scan-player-block">
                <div>
                  <span>Last scanned</span>
                  <strong data-admin-terminal-last-scan-player>—</strong>
                  <small data-admin-terminal-last-scan-time>—</small>
                </div>
              </div>
              <div class="admin-terminal-last-scan-meta">
                <span class="is-status is-present" data-admin-terminal-last-scan-status>Present</span>
                <span class="is-reward" data-admin-terminal-last-scan-reward>0.00</span>
              </div>
            </div>
          </section>
          <section class="admin-terminal-auto-capture-panel" data-admin-terminal-auto-panel>
            <span class="admin-terminal-scanner-dot" aria-hidden="true"></span>
            <div>
              <strong>Listening</strong>
              <small>Auto-submit is active.</small>
            </div>
            <button type="button" data-admin-terminal-action="mock-start-scanner">Refocus</button>
          </section>
          <section class="admin-terminal-manual-entry-panel" data-admin-terminal-manual-panel hidden>
            <div>
              <strong>Manual entry</strong>
              <small>Fallback mode</small>
            </div>
            <div class="admin-terminal-scanner-input-row">
              <input id="adminTerminalScannerInput" data-admin-terminal-manual-scan-input type="text" autocomplete="off" inputmode="text" placeholder="Player ID / access code" />
              <button type="button" data-admin-terminal-action="mock-confirm-scan">Submit</button>
            </div>
          </section>
          <footer class="admin-terminal-scanner-video-stats">
            <span class="is-good"><small>Present</small><strong>${escapeHtml(counts.present)}</strong></span>
            <span class="is-warn"><small>Late</small><strong>${escapeHtml(counts.late)}</strong></span>
            <span class="is-bad"><small>Absent</small><strong>${escapeHtml(counts.absent)}</strong></span>
          </footer>
        </div>`,
      footer: ``
    });
  }
  function renderAddContractModal(model) {
    return renderModalShell({
      id: "add-contract",
      title: "Add Contract",
      eyebrow: "Teacher command",
      body: `
        <div class="admin-terminal-contract-container" data-admin-terminal-contract-console data-reward-mode="cash">
          <video class="admin-terminal-contract-video" autoplay muted loop playsinline preload="auto" aria-hidden="true">
            <source src="./assets/videos/contract-background.mp4" type="video/mp4" />
          </video>
          <header class="admin-terminal-contract-topbar">
            <div class="admin-terminal-contract-title-block">
              <span class="admin-terminal-mode-dot" aria-hidden="true"></span>
              <div>
                <strong>Create Contract</strong>
                <small>Assignment + reward setup</small>
              </div>
            </div>
            <button class="admin-terminal-hud-close" type="button" data-admin-terminal-modal-close aria-label="Close add contract">
              <span>Close</span>
              <b aria-hidden="true">×</b>
            </button>
          </header>
          <form class="admin-terminal-contract-form" data-admin-terminal-contract-form>
            <section class="admin-terminal-contract-main">
              <section class="admin-terminal-contract-writing-v494 admin-terminal-contract-writing-v495" aria-label="Contract writing fields">
                <label class="admin-terminal-field is-title">
                  <span>Contract title</span>
                  <input type="text" name="title" data-admin-terminal-contract-title placeholder="Example: Market Analysis Brief" autocomplete="off" />
                </label>
                <label class="admin-terminal-field is-wide">
                  <span>Objective</span>
                  <input type="text" name="objective" data-admin-terminal-contract-objective placeholder="What should the student complete?" autocomplete="off" />
                </label>
                <label class="admin-terminal-field is-wide">
                  <span>Instructions</span>
                  <textarea name="instructions" rows="4" data-admin-terminal-contract-instructions placeholder="Write the exact instructions students will see."></textarea>
                </label>
                <label class="admin-terminal-field is-wide">
                  <span>Submission requirement</span>
                  <textarea name="evidence" rows="3" data-admin-terminal-contract-evidence placeholder="What should students turn in or prove?"></textarea>
                </label>
              </section>
              <div class="admin-terminal-contract-grid is-four">
                <label class="admin-terminal-field">
                  <span>Deadline</span>
                  <input type="datetime-local" name="deadline" data-admin-terminal-contract-deadline />
                </label>
                <label class="admin-terminal-field">
                  <span>Qty offered</span>
                  <input type="number" name="quantity" min="1" step="1" value="1" data-admin-terminal-contract-quantity />
                </label>
                <label class="admin-terminal-field">
                  <span>Qty scope</span>
                  <select name="quantityScope" data-admin-terminal-contract-quantity-scope>
                    <option value="total">Total pool</option>
                    <option value="per_location">Per selected country</option>
                  </select>
                </label>
                <div class="admin-terminal-field admin-terminal-location-field" data-admin-terminal-location-field>
                  <span>Location</span>
                  <button type="button" class="admin-terminal-location-toggle" data-admin-terminal-location-toggle aria-expanded="false">
                    <strong data-admin-terminal-location-summary>All countries</strong>
                    <b aria-hidden="true">⌄</b>
                  </button>
                  <div class="admin-terminal-location-menu" data-admin-terminal-location-menu hidden>
                    <label><input type="checkbox" value="all" data-admin-terminal-contract-location checked /> All countries</label>
                    <label><input type="checkbox" value="NORTHREACH" data-admin-terminal-contract-location /> Northreach</label>
                    <label><input type="checkbox" value="YRETHIA" data-admin-terminal-contract-location /> Yrethia</label>
                    <label><input type="checkbox" value="THALORIS" data-admin-terminal-contract-location /> Thaloris</label>
                    <label><input type="checkbox" value="SOLVEND" data-admin-terminal-contract-location /> Solvend</label>
                    <label><input type="checkbox" value="ELDORAN" data-admin-terminal-contract-location /> Eldoran</label>
                    <label><input type="checkbox" value="VALERION" data-admin-terminal-contract-location /> Valerion</label>
                    <label><input type="checkbox" value="LUMENOR" data-admin-terminal-contract-location /> Lumenor</label>
                    <label><input type="checkbox" value="XALVORIA" data-admin-terminal-contract-location /> Xalvoria</label>
                    <label><input type="checkbox" value="DRAVENLOK" data-admin-terminal-contract-location /> Dravenlok</label>
                    <label><input type="checkbox" value="SYNDALIS" data-admin-terminal-contract-location /> Syndalis</label>
                  </div>
                </div>
              </div>
              <div class="admin-terminal-contract-grid is-review-v495">
                <label class="admin-terminal-field">
                  <span>Review type</span>
                  <select name="reviewType" data-admin-terminal-contract-review-type>
                    <option value="teacher">Teacher review</option>
                    <option value="auto">Auto-complete</option>
                  </select>
                </label>
                <label class="admin-terminal-field">
                  <span>Post setting</span>
                  <select name="postSetting" data-admin-terminal-contract-post-setting>
                    <option value="now">Post now</option>
                    <option value="scheduled">Schedule post</option>
                    <option value="draft">Save as draft</option>
                  </select>
                </label>
              </div>
              <details class="admin-terminal-contract-advanced-v495">
                <summary>Advanced options</summary>
                <div class="admin-terminal-contract-grid is-authoring-meta-v494 is-advanced-v495">
                  <label class="admin-terminal-field">
                    <span>Category</span>
                    <select name="category" data-admin-terminal-contract-category>
                      <option value="contracts">Contracts</option>
                      <option value="simulation">Simulation</option>
                      <option value="writing">Writing</option>
                      <option value="research">Research</option>
                    </select>
                  </label>
                  <label class="admin-terminal-field">
                    <span>Difficulty</span>
                    <select name="difficulty" data-admin-terminal-contract-difficulty>
                      <option value="Standard">Standard</option>
                      <option value="Advanced">Advanced</option>
                      <option value="Quick task">Quick task</option>
                      <option value="Major contract">Major contract</option>
                    </select>
                  </label>
                  <label class="admin-terminal-field is-wide">
                    <span>Internal note</span>
                    <textarea name="reviewNote" rows="2" data-admin-terminal-contract-review-note placeholder="Optional note for the reviewer. Not shown to players."></textarea>
                  </label>
                </div>
              </details>
              <label class="admin-terminal-field" data-admin-terminal-scheduled-post-panel hidden>
                <span>Post at</span>
                <input type="datetime-local" name="postAt" data-admin-terminal-contract-post-at />
              </label>
            </section>
            <aside class="admin-terminal-contract-reward">
              <div class="admin-terminal-reward-add-top" role="group" aria-label="Choose reward type to add">
                <button type="button" data-admin-terminal-action="stage-cash-reward" aria-pressed="true">+ Cash</button>
                <button type="button" data-admin-terminal-action="stage-item-reward" aria-pressed="false">+ Item</button>
              </div>
              <div class="admin-terminal-reward-stage" data-admin-terminal-reward-stage data-reward-kind="cash">
                <div class="admin-terminal-reward-stage-row is-cash" data-admin-terminal-reward-stage-cash>
                  <label>
                    <span>Cash amount</span>
                    <input type="number" min="0" step="1" placeholder="10" data-admin-terminal-stage-cash />
                  </label>
                  <button type="button" data-admin-terminal-action="confirm-staged-reward">Add</button>
                </div>
                <div class="admin-terminal-reward-stage-row is-item" data-admin-terminal-reward-stage-item hidden>
                  <label>
                    <span>Item</span>
                    <select data-admin-terminal-stage-item>
                      <option value="homework_pass">Homework Pass</option>
                      <option value="late_pass">Late Pass</option>
                      <option value="seat_swap">Seat Swap</option>
                      <option value="music_request">Class Music Request</option>
                      <option value="bonus_hint">Bonus Hint</option>
                      <option value="quiz_reroll">Quiz Reroll</option>
                      <option value="supply_pack">Supply Pack</option>
                      <option value="team_bonus">Team Bonus Token</option>
                      <option value="market_tip">Market Tip</option>
                      <option value="mystery_box">Mystery Box</option>
                    </select>
                  </label>
                  <label>
                    <span>Qty</span>
                    <input type="number" min="1" step="1" value="1" data-admin-terminal-stage-item-quantity />
                  </label>
                  <button type="button" data-admin-terminal-action="confirm-staged-reward">Add</button>
                </div>
              </div>
              <div class="admin-terminal-selected-rewards">
                <span>Reward per completion</span>
                <p>Paid to each player after each successful contract completion.</p>
                <div class="admin-terminal-contract-reward-list" data-admin-terminal-contract-rewards-list>
                  <p class="admin-terminal-selected-rewards-empty" data-admin-terminal-selected-rewards-empty>No rewards added yet.</p>
                </div>
              </div>
              <div class="admin-terminal-contract-actions">
                <button type="button" data-admin-terminal-action="mock-preview-contract">Preview</button>
                <button type="submit" data-admin-terminal-action="mock-save-contract">Save Contract</button>
              </div>
            </aside>
          </form>
          <section class="admin-terminal-contract-preview" data-admin-terminal-contract-preview>
            <span>Preview</span>
            <strong>Market Analysis Brief</strong>
            <small>Reward: 10.00 · Deadline: not set</small>
          </section>
        </div>`,
      footer: ``
    });
  }
  function closeTerminalPreviewOverlay() {
    document.querySelectorAll("[data-admin-terminal-player-side-preview]").forEach((node) => node.remove());
  }
  function openTerminalPreviewOverlay(html) {
    const root = getModalRoot();
    const modal = root.querySelector(".admin-terminal-modal");
    if (!modal) return;
    closeTerminalPreviewOverlay();
    modal.insertAdjacentHTML("beforeend", html);
    const overlay = modal.querySelector("[data-admin-terminal-player-side-preview]");
    overlay?.querySelector("[data-admin-terminal-preview-close]")?.focus?.();
    overlay?.addEventListener("click", (event) => {
      const closeHit = event.target?.closest?.("[data-admin-terminal-preview-close]");
      const backdropHit = event.target?.matches?.("[data-admin-terminal-preview-overlay-backdrop]");
      if (!closeHit && !backdropHit) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      closeTerminalPreviewOverlay();
    }, true);
  }
  function readStoreItemDraft(root) {
    if (!root) return {};
    const priceValue = root.querySelector("[data-admin-terminal-store-price]")?.value?.trim();
    const pricingMode = root.querySelector("[data-admin-terminal-store-pricing-mode]")?.value || "Fixed price";
    const stockMode = root.querySelector("[data-admin-terminal-store-stock-mode]")?.value || "Unlimited";
    const stockQuantity = root.querySelector("[data-admin-terminal-store-stock-quantity]")?.value?.trim();
    const countryStockInputs = Array.from(root.querySelectorAll("[data-admin-terminal-store-country-stock]"));
    const countryStockTotal = countryStockInputs.reduce((total, input) => total + (Number(input.value) || 0), 0);
    const stockedCountryCount = countryStockInputs.filter((input) => Number(input.value) > 0).length;
    const countryStockText = `${countryStockTotal} total · ${stockedCountryCount}/${countryStockInputs.length} countries stocked`;
    return {
      itemName: root.querySelector("[data-admin-terminal-store-name]")?.value?.trim() || "New item",
      description: root.querySelector("[data-admin-terminal-store-description]")?.value?.trim() || "Player-facing item description will appear here.",
      category: readSelectedOptionText(root.querySelector("[data-admin-terminal-store-category]"), "Consumable"),
      itemType: readSelectedOptionText(root.querySelector("[data-admin-terminal-store-type]"), "One-time use"),
      sourceLabel: "Teacher custom item",
      price: priceValue !== "" && priceValue != null ? priceValue : "10",
      currency: readSelectedOptionText(root.querySelector("[data-admin-terminal-store-currency]"), "NRC"),
      pricingMode: readSelectedOptionText(root.querySelector("[data-admin-terminal-store-pricing-mode]"), pricingMode),
      stockText: stockMode === "Country" ? countryStockText : stockMode === "Limited" ? `${stockQuantity || "Quantity required"} available` : "Unlimited stock",
      status: readSelectedOptionText(root.querySelector("[data-admin-terminal-store-status]"), "Active"),
      visibility: readSelectedOptionText(root.querySelector("[data-admin-terminal-store-visibility]"), "All players"),
      restock: readSelectedOptionText(root.querySelector("[data-admin-terminal-store-restock]"), "Manual restock"),
      fulfillment: readSelectedOptionText(root.querySelector("[data-admin-terminal-store-fulfillment]"), "Add to inventory"),
      usageRule: readSelectedOptionText(root.querySelector("[data-admin-terminal-store-usage]"), "Player redeems manually")
    };
  }
  function renderStorePlayerListingPreview(draft) {
    const itemName = draft.itemName || "New item";
    const description = draft.description || "Player-facing item description will appear here.";
    const category = draft.category || "Consumable";
    const itemType = draft.itemType || "One-time use";
    const price = draft.price || "10";
    const currency = draft.currency || "NRC";
    const stockText = draft.stockText || "Unlimited stock";
    const pricingMode = draft.pricingMode || "Fixed price";
    const status = draft.status || "Active";
    const visibility = draft.visibility || "All players";
    const fulfillment = draft.fulfillment || "Add to inventory";
    const usageRule = draft.usageRule || "Player redeems manually";
    const isUnavailable = status === "Draft" || status === "Hidden" || status === "Sold out";
    return `
      <div class="admin-terminal-player-side-preview" data-admin-terminal-player-side-preview>
        <div class="admin-terminal-preview-overlay-backdrop" data-admin-terminal-preview-overlay-backdrop></div>
        <article class="admin-terminal-player-side-panel is-store-listing" role="dialog" aria-modal="true" aria-label="Player-side store listing preview">
          <header class="admin-terminal-player-side-head">
            <div>
              <span>Player-side preview</span>
              <strong>Store listing</strong>
            </div>
            <button type="button" data-admin-terminal-preview-close aria-label="Close player-side preview">×</button>
          </header>
          <section class="admin-terminal-player-store-card">
            <div class="admin-terminal-player-store-card-top">
              <span>${escapeHtml(category)}</span>
              <small>${escapeHtml(itemType)}</small>
            </div>
            <h3>${escapeHtml(itemName)}</h3>
            <p>${escapeHtml(description)}</p>
            <div class="admin-terminal-player-store-meta">
              <span><small>Price</small><strong>${escapeHtml(price)} ${escapeHtml(currency)}</strong></span>
              <span><small>Pricing</small><strong>${escapeHtml(pricingMode)}</strong></span>
              <span><small>Stock</small><strong>${escapeHtml(stockText)}</strong></span>
            </div>
            <div class="admin-terminal-player-store-fulfillment">
              <small>Fulfillment</small>
              <strong>${escapeHtml(fulfillment)}</strong>
            </div>
            <div class="admin-terminal-player-store-fulfillment">
              <small>Usage / Visibility</small>
              <strong>${escapeHtml(usageRule)} · ${escapeHtml(visibility)}</strong>
            </div>
            <button type="button" ${isUnavailable ? "disabled" : ""}>${isUnavailable ? escapeHtml(status) : "Buy item"}</button>
          </section>
        </article>
      </div>`;
  }
  function readPlayerDraft(root) {
    if (!root) return {};
    const playerIdMode = root.querySelector("[data-admin-terminal-player-id-mode]")?.value || "auto";
    const manualPlayerId = root.querySelector("[data-admin-terminal-player-manual-id]")?.value?.trim();
    const accessCodeMode = root.querySelector("[data-admin-terminal-player-access-code-mode]")?.value || "auto";
    const manualAccessCode = root.querySelector("[data-admin-terminal-player-manual-access-code]")?.value?.trim();
    return {
      displayName: root.querySelector("[data-admin-terminal-player-display-name]")?.value?.trim() || "New player",
      rosterLabel: root.querySelector("[data-admin-terminal-player-roster-label]")?.value?.trim() || "optional",
      status: readSelectedOptionText(root.querySelector("[data-admin-terminal-player-status]"), "Active"),
      playerIdText: playerIdMode === "manual" ? (manualPlayerId || "Manual ID required") : "Generated after create",
      startingLocation: readSelectedOptionText(root.querySelector("[data-admin-terminal-player-starting-location]"), "Randomized"),
      accessText: accessCodeMode === "manual"
        ? (manualAccessCode || "Manual code required")
        : accessCodeMode === "none"
          ? "No code yet"
          : "Generated after save"
    };
  }
  function renderPlayerSideProfilePreview(draft) {
    const displayName = draft.displayName || "New player";
    const rosterLabel = draft.rosterLabel || "optional";
    const status = draft.status || "Active";
    const playerIdText = draft.playerIdText || "Generated after create";
    const startingLocation = draft.startingLocation || "Randomized";
    const accessText = draft.accessText || "Generated after save";
    const avatarCode = String(displayName).slice(0, 1).toUpperCase() || "P";
    const playerId = makeSixDigitPlayerId(playerIdText, `${displayName}:${rosterLabel}`);
    const sciId = makeSciIdSerial(`${displayName}:${rosterLabel}:${status}`, playerId);
    const cashValue = "0.00";
    const portfolioValue = "0.00";
    const positionsHeld = "0";
    const netWorth = "0.00";
    const rank = "—";
    const sessionStatus = readSciIdSessionStatus(draft, status);
    return `
      <div class="admin-terminal-player-side-preview" data-admin-terminal-player-side-preview>
        <div class="admin-terminal-preview-overlay-backdrop" data-admin-terminal-preview-overlay-backdrop></div>
        <article class="admin-terminal-player-side-panel is-player-profile is-sci-id-preview" role="dialog" aria-modal="true" aria-label="Sci-fi player ID preview">
          <header class="admin-terminal-player-side-head">
            <div>
              <span>Player-side preview</span>
              <strong>Sci-Fi ID card</strong>
            </div>
            <button type="button" data-admin-terminal-preview-close aria-label="Close player-side preview">×</button>
          </header>
          <section class="admin-terminal-sci-id-shell is-preview-id">
            <video class="admin-terminal-sci-id-video" autoplay muted loop playsinline preload="auto" aria-hidden="true">
              <source src="./assets/videos/id-background.mp4" type="video/mp4" />
            </video>
            <div class="admin-terminal-sci-id-card">
              <button class="admin-terminal-sci-id-close" type="button" data-admin-terminal-preview-close aria-label="Close ID card" title="Close">×</button>
              <header class="admin-terminal-sci-id-top">
                <div>
                  <span>Eco Novaria Citizen ID</span>
                  <strong>${escapeHtml(displayName)}</strong>
                  <small class="admin-terminal-sci-id-serial">ID: ${escapeHtml(sciId)}</small>
                </div>
              </header>
              <div class="admin-terminal-sci-id-rail" aria-label="ID quick actions">
                <button type="button" aria-label="Player information" title="Player information"><img class="admin-terminal-sci-id-rail-icon" src="./assets/icons/player-info.svg" alt="" aria-hidden="true" /></button>
                <button type="button" aria-label="Player settings" title="Player settings"><img class="admin-terminal-sci-id-rail-icon" src="./assets/icons/player-configure.svg" alt="" aria-hidden="true" /></button>
              </div>
              <div class="admin-terminal-sci-id-mounted-readouts" aria-label="Player ID data">
                <div class="admin-terminal-sci-id-rank-badge">
                  <small>Rank</small>
                  <strong>#${escapeHtml(rank)}</strong>
                </div>
                <div class="admin-terminal-sci-id-top-readout is-status ${sessionStatus.stateClass}">
                  <small>${escapeHtml(sessionStatus.caption)}</small>
                <span class="admin-terminal-sci-id-status-value"><i aria-hidden="true"></i><strong>${escapeHtml(sessionStatus.label)}</strong></span>
                </div>
                <div class="admin-terminal-sci-id-top-readout is-nationality">
                  <small>Location</small>
                  <strong>${escapeHtml(startingLocation)}</strong>
                </div>
              <div class="admin-terminal-sci-id-bottom-strip" aria-label="Player financial summary">
                <div class="admin-terminal-sci-id-bottom-readout is-net-worth">
                  <small>Net Worth</small>
                  <strong>${renderPlayerCurrencyAmount(netWorth, { ...player, location })}</strong>
                </div>
              </div>
              </div>
              <div class="admin-terminal-sci-id-body">
                <aside class="admin-terminal-sci-id-avatar-block">
                  <div class="admin-terminal-sci-id-avatar" data-admin-terminal-avatar-frame>
                    <img data-admin-terminal-avatar-image alt="" hidden />
                    <span>${escapeHtml(avatarCode)}</span>
                    <i aria-hidden="true"></i>
                    <button class="admin-terminal-sci-id-avatar-edit" type="button" data-admin-terminal-action="change-sci-avatar" aria-label="Change avatar picture" title="Change avatar picture">✎</button>
                    <input type="file" accept="image/*" data-admin-terminal-avatar-input hidden />
                  </div>
                </aside>
                <main class="admin-terminal-sci-id-data" aria-hidden="true"></main>
              </div>
            </div>
          </section>
        </article>
      </div>`;
  }
  function readContractDraft(root) {
    if (!root) return {};
    const title = root.querySelector("[data-admin-terminal-contract-title]")?.value?.trim() || "Market Analysis Brief";
    const objective = root.querySelector("[data-admin-terminal-contract-objective]")?.value?.trim() || "Objective will appear here for students.";
    const instructions = root.querySelector("[data-admin-terminal-contract-instructions]")?.value?.trim() || "Contract instructions will appear here for students.";
    const evidence = root.querySelector("[data-admin-terminal-contract-evidence]")?.value?.trim() || "Submission requirement pending.";
    const successCriteria = root.querySelector("[data-admin-terminal-contract-success]")?.value?.trim() || "Acceptance criteria pending.";
    const reviewNote = root.querySelector("[data-admin-terminal-contract-review-note]")?.value?.trim() || "No internal review note.";
    const category = readSelectedOptionText(root.querySelector("[data-admin-terminal-contract-category]"), "Contracts");
    const difficulty = readSelectedOptionText(root.querySelector("[data-admin-terminal-contract-difficulty]"), "Standard");
    const evidenceType = readSelectedOptionText(root.querySelector("[data-admin-terminal-contract-evidence-type]"), "Written response");
    const deadlineValue = root.querySelector("[data-admin-terminal-contract-deadline]")?.value;
    const quantity = root.querySelector("[data-admin-terminal-contract-quantity]")?.value?.trim() || "1";
    const quantityScope = root.querySelector("[data-admin-terminal-contract-quantity-scope]")?.value || "total";
    const postSetting = root.querySelector("[data-admin-terminal-contract-post-setting]")?.value || "now";
    const postAtValue = root.querySelector("[data-admin-terminal-contract-post-at]")?.value;
    const reward = readContractReward(root);
    const locationText = readContractLocationText(root);
    const deadlineText = formatContractDateTime(deadlineValue);
    const postText = postSetting === "scheduled"
      ? `Posts ${formatContractDateTime(postAtValue)}`
      : postSetting === "draft"
        ? "Draft only"
        : "Available now";
    const quantityText = quantityScope === "per_location"
      ? `${quantity} per selected country`
      : `${quantity} total available`;
    return {
      title,
      objective,
      instructions,
      evidence,
      successCriteria,
      reviewNote,
      category,
      difficulty,
      evidenceType,
      deadlineText,
      reward,
      locationText,
      quantityText,
      postText,
      isDraft: postSetting === "draft"
    };
  }
  function renderContractPlayerListingPreview(draft) {
    const title = draft.title || "Market Analysis Brief";
    const metaParts = [
      draft.deadlineText && draft.deadlineText !== "not set" ? `Deadline: ${draft.deadlineText}` : "Deadline: not set",
      draft.category || "Contracts"
    ];
    const meta = draft.meta || metaParts.filter(Boolean).join(" · ");
    const reward = draft.reward || "No reward";
    const locationText = draft.locationText || "All countries";
    const quantityText = draft.quantityText || "1 total available";
    const postText = draft.postText || "Available now";
    const objective = draft.objective || "Objective will appear here for students.";
    const instructions = draft.instructions || "Contract instructions will appear here for students.";
    const evidence = draft.evidence || "Submission requirement pending.";
    const successCriteria = draft.successCriteria || "Acceptance criteria pending.";
    const evidenceType = draft.evidenceType || "Written response";
    const isDraft = Boolean(draft.isDraft);
    return `
      <div class="admin-terminal-player-side-preview" data-admin-terminal-player-side-preview>
        <div class="admin-terminal-preview-overlay-backdrop" data-admin-terminal-preview-overlay-backdrop></div>
        <article class="admin-terminal-player-side-panel is-contract-listing is-active-contract-view" role="dialog" aria-modal="true" aria-label="Active contract preview">
          <header class="admin-terminal-player-side-head">
            <div>
              <span>Preview</span>
              <strong>Active contract view</strong>
            </div>
            <button type="button" data-admin-terminal-preview-close aria-label="Close contract preview">×</button>
          </header>
          <section class="admin-terminal-dashboard-profile is-contract is-preview-contract">
            <div class="admin-terminal-dashboard-contract-mark">▣</div>
            <div class="admin-terminal-dashboard-profile-main">
              <span>Player-side contract listing</span>
              <h3>${escapeHtml(title)}</h3>
              <p>${escapeHtml(meta)}</p>
            </div>
            <div class="admin-terminal-dashboard-profile-grid">
              <span><small>Reward</small><strong>${escapeHtml(reward)}</strong></span>
              <span><small>Visibility</small><strong>${escapeHtml(isDraft ? "Draft" : postText)}</strong></span>
              <span><small>Availability</small><strong>${escapeHtml(isDraft ? "Not posted" : "Open")}</strong></span>
              <span><small>Evidence</small><strong>${escapeHtml(evidenceType)}</strong></span>
            </div>
            <div class="admin-terminal-preview-contract-brief-v494">
              <span>Objective</span>
              <p>${escapeHtml(objective)}</p>
              <span>Instructions</span>
              <p>${escapeHtml(instructions)}</p>
              <span>Submission</span>
              <p>${escapeHtml(evidence)}</p>
              <span>Accept if</span>
              <p>${escapeHtml(successCriteria)}</p>
            </div>
            <div class="admin-terminal-dashboard-contract-preview">
              <span>Student view</span>
              <strong>${escapeHtml(title)}</strong>
              <small>Reward: ${escapeHtml(reward)} · ${escapeHtml(meta)}</small>
              <p class="admin-terminal-dashboard-contract-instructions">${escapeHtml(instructions)}</p>
              <div class="admin-terminal-dashboard-contract-subgrid">
                <span><small>Location</small><strong>${escapeHtml(locationText)}</strong></span>
                <span><small>Quantity</small><strong>${escapeHtml(quantityText)}</strong></span>
              </div>
              <button type="button" ${isDraft ? "disabled" : ""}>${isDraft ? "Draft" : "Accept contract"}</button>
            </div>
          </section>
        </article>
      </div>`;
  }
  function renderAddStoreItemModal(model = {}) {
    const editItem = model?.__storeEditItem || null;
    const isEditMode = Boolean(editItem);
    const selectIfStoreValue = (actual, expected) => String(actual || "").toLowerCase() === String(expected || "").toLowerCase() ? " selected" : "";
    const editName = editItem?.name || "";
    const editDescription = editItem?.description || "";
    const editCategory = editItem?.category || "Consumable";
    const editType = editItem?.itemType || "One-time use";
    const editStatus = editItem?.status || "Active";
    const editPrice = editItem?.price || "";
    const editCurrency = editItem?.currency || "NRC";
    const editPricingMode = editItem?.pricingMode || "Fixed price";
    const editStockMode = editItem?.stockMode || "Unlimited";
    const editStockQuantity = editItem?.stockQuantity || "";
    const editRestock = editItem?.restock || "Manual restock";
    const editVisibility = editItem?.visibility || "All players";
    const editFulfillment = editItem?.fulfillment || "Add to inventory";
    const editUsage = editItem?.usageRule || "Player redeems manually";
    const modalEyebrow = isEditMode ? "Edit custom store item" : "Custom store item";
    const modalTitle = isEditMode ? "Edit Custom Item" : "Add Custom Item";
    const modeTitle = isEditMode ? "Edit Custom Item" : "Create Custom Item";
    const modeMeta = isEditMode ? "Teacher-created · editable · system-safe" : "Teacher-created · economy-safe · optional";
    const itemNameLabel = isEditMode ? "Custom item name" : "Custom item name";
    const submitLabel = isEditMode ? "Save Changes" : "Create Custom Item";
    return renderModalShell({
      id: isEditMode ? "edit-store-item" : "add-store-item",
      tone: "purple",
      eyebrow: modalEyebrow,
      title: modalTitle,
      body: `
        <div class="admin-terminal-store-container" data-admin-terminal-store-console data-admin-terminal-store-edit-mode="${isEditMode ? "true" : "false"}">
          <video class="admin-terminal-store-video" autoplay muted loop playsinline preload="auto" aria-hidden="true">
            <source src="./assets/videos/store-background.mp4" type="video/mp4" />
          </video>
          <header class="admin-terminal-store-topbar">
            <div class="admin-terminal-store-title-block">
              <span class="admin-terminal-mode-dot" aria-hidden="true"></span>
              <div>
                <strong>${escapeHtml(modeTitle)}</strong>
                <small>${escapeHtml(modeMeta)}</small>
              </div>
            </div>
            <button class="admin-terminal-hud-close" type="button" data-admin-terminal-modal-close aria-label="Close store item editor">
              <span>Close</span>
              <b aria-hidden="true">×</b>
            </button>
          </header>
          <form class="admin-terminal-store-form is-catalog-v479" data-admin-terminal-store-form>
            <section class="admin-terminal-store-main">
              <div class="admin-terminal-store-settings-head">
                <span>Item identity</span>
                <small>${escapeHtml(isEditMode ? "Update this teacher-created item. System-seeded Store items remain locked." : "Create a teacher-controlled item. System-seeded Store items are visible but protected from editing.")}</small>
              </div>
              <label class="admin-terminal-field is-title">
                <span>${escapeHtml(itemNameLabel)}</span>
                <input type="text" name="itemName" data-admin-terminal-store-name placeholder="Example: Workshop Access Pass" value="${escapeHtml(editName)}" autocomplete="off" />
              </label>
              <label class="admin-terminal-field">
                <span>Player-facing description</span>
                <textarea name="description" rows="3" data-admin-terminal-store-description placeholder="What does this teacher-created item do, and when should players buy it?">${escapeHtml(editDescription)}</textarea>
              </label>
              <section class="admin-terminal-store-source-lock-v481" aria-label="Custom item source policy">
                <span>Catalog source</span>
                <strong>Teacher custom item</strong>
                <small>System-seeded materials, equipment, and consumables are view-only in this console so the game economy cannot be broken accidentally.</small>
              </section>
              <div class="admin-terminal-store-grid is-identity-v479">
                <label class="admin-terminal-field">
                  <span>Catalog class</span>
                  <select name="category" data-admin-terminal-store-category>
                    <option value="Material"${selectIfStoreValue(editCategory, "Material")}>Material</option>
                    <option value="Equipment"${selectIfStoreValue(editCategory, "Equipment")}>Equipment</option>
                    <option value="Consumable"${selectIfStoreValue(editCategory, "Consumable")}>Consumable</option>
                  </select>
                </label>
                <label class="admin-terminal-field">
                  <span>Item type</span>
                  <select name="itemType" data-admin-terminal-store-type>
                    <option value="Crafting input"${selectIfStoreValue(editType, "Crafting input")}>Crafting input</option>
                    <option value="Reusable tool"${selectIfStoreValue(editType, "Reusable tool")}>Reusable tool</option>
                    <option value="One-time use"${selectIfStoreValue(editType, "One-time use")}>One-time use</option>
                    <option value="Access pass"${selectIfStoreValue(editType, "Access pass")}>Access pass</option>
                    <option value="Service token"${selectIfStoreValue(editType, "Service token")}>Service token</option>
                    <option value="Contract unlock"${selectIfStoreValue(editType, "Contract unlock")}>Contract unlock</option>
                  </select>
                </label>
                <label class="admin-terminal-field">
                  <span>Status</span>
                  <select name="status" data-admin-terminal-store-status>
                    <option value="Active"${selectIfStoreValue(editStatus, "Active")}>Active</option>
                    <option value="Draft"${selectIfStoreValue(editStatus, "Draft")}>Draft</option>
                    <option value="Hidden"${selectIfStoreValue(editStatus, "Hidden")}>Hidden</option>
                    <option value="Low Stock"${selectIfStoreValue(editStatus, "Low Stock")}>Low Stock</option>
                    <option value="Sold out"${selectIfStoreValue(editStatus, "Sold out")}>Sold out</option>
                    <option value="Restricted"${selectIfStoreValue(editStatus, "Restricted")}>Restricted</option>
                  </select>
                </label>
              </div>
              <div class="admin-terminal-store-settings-head">
                <span>Pricing and availability</span>
                <small>Set the custom item price and availability. System items stay backend controlled.</small>
              </div>
              <div class="admin-terminal-store-grid is-pricing-v479">
                <label class="admin-terminal-field">
                  <span>Price</span>
                  <input type="number" min="0" step="1" name="price" data-admin-terminal-store-price placeholder="10" value="${escapeHtml(editPrice)}" inputmode="numeric" />
                </label>
                <label class="admin-terminal-field">
                  <span>Currency</span>
                  <select name="currency" data-admin-terminal-store-currency>
                    <option value="NRC"${selectIfStoreValue(editCurrency, "NRC")}>NRC</option>
                    <option value="Steam Bucks"${selectIfStoreValue(editCurrency, "Steam Bucks")}>Steam Bucks</option>
                    <option value="Credits"${selectIfStoreValue(editCurrency, "Credits")}>Credits</option>
                  </select>
                </label>
                <label class="admin-terminal-field">
                  <span>Pricing mode</span>
                  <select name="pricingMode" data-admin-terminal-store-pricing-mode>
                    <option value="Fixed price"${selectIfStoreValue(editPricingMode, "Fixed price")}>Fixed price</option>
                    <option value="Economy-linked"${selectIfStoreValue(editPricingMode, "Economy-linked")}>Variable by country</option>
                  </select>
                </label>
                <label class="admin-terminal-field">
                  <span>Stock mode</span>
                  <select name="stockMode" data-admin-terminal-store-stock-mode>
                    <option value="Unlimited"${selectIfStoreValue(editStockMode, "Unlimited")}>Unlimited across all countries</option>
                    <option value="Limited"${selectIfStoreValue(editStockMode, "Limited")}>Shared global quantity</option>
                    <option value="Country"${selectIfStoreValue(editStockMode, "Country")}>Different stock by country</option>
                  </select>
                </label>
                <label class="admin-terminal-field" data-admin-terminal-store-stock-quantity-panel hidden>
                  <span>Quantity</span>
                  <input type="number" min="1" step="1" name="stockQuantity" data-admin-terminal-store-stock-quantity placeholder="25" value="${escapeHtml(editStockQuantity)}" inputmode="numeric" />
                </label>
                <section class="admin-terminal-store-country-panel-v480" data-admin-terminal-store-country-stock-panel hidden>
                  <header>
                    <span>Country stock allocation</span>
                    <small>Set local available units. Countries with 0 stock can show as sold out while other countries stay available.</small>
                  </header>
                  <div class="admin-terminal-store-country-grid-v480">
                    ${["Northreach", "Yrethia", "Solvend", "Eldoran", "Thaloris", "Valerion", "Syndalis", "Kaivora", "Orinth", "Dravik"].map((country, countryIndex) => `
                      <label class="admin-terminal-field is-country-stock-v480">
                        <span>${country}</span>
                        <input type="number" min="0" step="1" value="${countryIndex < 3 ? 10 : countryIndex < 7 ? 5 : 2}" data-admin-terminal-store-country-stock="${country}" inputmode="numeric" />
                      </label>`).join("")}
                  </div>
                </section>
                <label class="admin-terminal-field">
                  <span>Restock cadence</span>
                  <select name="restock" data-admin-terminal-store-restock>
                    <option value="Manual restock"${selectIfStoreValue(editRestock, "Manual restock")}>Manual restock</option>
                    <option value="Daily restock"${selectIfStoreValue(editRestock, "Daily restock")}>Daily restock</option>
                    <option value="Weekly restock"${selectIfStoreValue(editRestock, "Weekly restock")}>Weekly restock</option>
                    <option value="Per class cycle"${selectIfStoreValue(editRestock, "Per class cycle")}>Per class cycle</option>
                    <option value="Never restock"${selectIfStoreValue(editRestock, "Never restock")}>Never restock</option>
                  </select>
                </label>
                <label class="admin-terminal-field">
                  <span>Visibility</span>
                  <select name="visibility" data-admin-terminal-store-visibility>
                    <option value="All players"${selectIfStoreValue(editVisibility, "All players")}>All players</option>
                    <option value="Selected locations"${selectIfStoreValue(editVisibility, "Selected locations")}>Selected locations</option>
                    <option value="Unlocked by contract"${selectIfStoreValue(editVisibility, "Unlocked by contract")}>Unlocked by contract</option>
                    <option value="Admin release only"${selectIfStoreValue(editVisibility, "Admin release only")}>Admin release only</option>
                  </select>
                </label>
              </div>
              <div class="admin-terminal-store-settings-head">
                <span>Fulfillment rules</span>
                <small>Decide what happens after purchase and how the item can be used.</small>
              </div>
              <div class="admin-terminal-store-grid is-rules">
                <label class="admin-terminal-field">
                  <span>Fulfillment</span>
                  <select name="fulfillment" data-admin-terminal-store-fulfillment>
                    <option value="Add to inventory"${selectIfStoreValue(editFulfillment, "Add to inventory")}>Add to inventory</option>
                    <option value="Add equipment record"${selectIfStoreValue(editFulfillment, "Add equipment record")}>Add equipment record</option>
                    <option value="Auto-consume on purchase"${selectIfStoreValue(editFulfillment, "Auto-consume on purchase")}>Auto-consume on purchase</option>
                    <option value="Manual redemption"${selectIfStoreValue(editFulfillment, "Manual redemption")}>Manual redemption</option>
                    <option value="Admin approval required"${selectIfStoreValue(editFulfillment, "Admin approval required")}>Admin approval required</option>
                  </select>
                </label>
                <label class="admin-terminal-field">
                  <span>Usage rule</span>
                  <select name="usage" data-admin-terminal-store-usage>
                    <option value="Player redeems manually"${selectIfStoreValue(editUsage, "Player redeems manually")}>Player redeems manually</option>
                    <option value="Auto applies once"${selectIfStoreValue(editUsage, "Auto applies once")}>Auto applies once</option>
                    <option value="Reusable until removed"${selectIfStoreValue(editUsage, "Reusable until removed")}>Reusable until removed</option>
                    <option value="Requires admin confirmation"${selectIfStoreValue(editUsage, "Requires admin confirmation")}>Requires admin confirmation</option>
                  </select>
                </label>
              </div>
            </section>
            <aside class="admin-terminal-store-preview">
              <div class="admin-terminal-store-preview-head">
                <span>${escapeHtml(isEditMode ? "Edit item preview" : "Custom item preview")}</span>
                <strong data-admin-terminal-store-preview-name>New item</strong>
              </div>
              <div class="admin-terminal-store-preview-card" data-admin-terminal-store-summary>
                <span>Catalog setup</span>
                <strong>New item</strong>
                <small>Custom · Consumable · One-time use · 10 NRC · Unlimited stock</small>
              </div>
              <div class="admin-terminal-store-preview-grid">
                <div class="admin-terminal-store-preview-item">
                  <span>Price</span>
                  <strong data-admin-terminal-store-preview-price>10 NRC</strong>
                </div>
                <div class="admin-terminal-store-preview-item">
                  <span>Pricing</span>
                  <strong data-admin-terminal-store-preview-pricing>Fixed price</strong>
                </div>
                <div class="admin-terminal-store-preview-item">
                  <span>Stock</span>
                  <strong data-admin-terminal-store-preview-stock>Unlimited</strong>
                </div>
                <div class="admin-terminal-store-preview-item">
                  <span>Status</span>
                  <strong data-admin-terminal-store-preview-status>Active</strong>
                </div>
              </div>
              <div class="admin-terminal-store-preview-note">
                <span>Fulfillment</span>
                <small data-admin-terminal-store-preview-note>Purchased item is added to the player inventory.</small>
              </div>
              <div class="admin-terminal-store-actions">
                <button type="button" class="is-secondary" data-admin-terminal-action="preview-store-player-listing">Preview Player View</button>
                <button type="submit" data-admin-terminal-action="mock-save-store-item">${escapeHtml(submitLabel)}</button>
              </div>
            </aside>
          </form>
        </div>`,
      footer: ``
    });
  }
  function syncStoreItemPanels(root) {
    if (!root) return;
    const stockMode = root.querySelector("[data-admin-terminal-store-stock-mode]")?.value || "Unlimited";
    const quantityPanel = root.querySelector("[data-admin-terminal-store-stock-quantity-panel]");
    const countryPanel = root.querySelector("[data-admin-terminal-store-country-stock-panel]");
    if (quantityPanel) {
      quantityPanel.hidden = stockMode !== "Limited";
      quantityPanel.style.display = stockMode === "Limited" ? "grid" : "none";
    }
    if (countryPanel) {
      countryPanel.hidden = stockMode !== "Country";
      countryPanel.style.display = stockMode === "Country" ? "grid" : "none";
    }
  }
  function updateStoreItemPreview() {
    const root = document.querySelector("[data-admin-terminal-store-console]");
    if (!root) return;
    syncStoreItemPanels(root);
    const itemName = root.querySelector("[data-admin-terminal-store-name]")?.value?.trim() || "New item";
    const category = readSelectedOptionText(root.querySelector("[data-admin-terminal-store-category]"), "Consumable");
    const itemType = readSelectedOptionText(root.querySelector("[data-admin-terminal-store-type]"), "One-time use");
    const priceValue = root.querySelector("[data-admin-terminal-store-price]")?.value?.trim();
    const price = priceValue !== "" && priceValue != null ? priceValue : "10";
    const currency = readSelectedOptionText(root.querySelector("[data-admin-terminal-store-currency]"), "NRC");
    const pricingMode = readSelectedOptionText(root.querySelector("[data-admin-terminal-store-pricing-mode]"), "Fixed price");
    const stockMode = root.querySelector("[data-admin-terminal-store-stock-mode]")?.value || "Unlimited";
    const stockQuantity = root.querySelector("[data-admin-terminal-store-stock-quantity]")?.value?.trim();
    const countryStockInputs = Array.from(root.querySelectorAll("[data-admin-terminal-store-country-stock]"));
    const countryStockTotal = countryStockInputs.reduce((total, input) => total + (Number(input.value) || 0), 0);
    const stockedCountryCount = countryStockInputs.filter((input) => Number(input.value) > 0).length;
    const stockText = stockMode === "Country"
      ? `${countryStockTotal} total · ${stockedCountryCount}/${countryStockInputs.length} countries stocked`
      : stockMode === "Limited" ? `${stockQuantity || "Quantity required"} available` : "Unlimited";
    const status = readSelectedOptionText(root.querySelector("[data-admin-terminal-store-status]"), "Active");
    const fulfillment = readSelectedOptionText(root.querySelector("[data-admin-terminal-store-fulfillment]"), "Add to inventory");
    const usageRule = readSelectedOptionText(root.querySelector("[data-admin-terminal-store-usage]"), "Player redeems manually");
    const visibility = readSelectedOptionText(root.querySelector("[data-admin-terminal-store-visibility]"), "All players");
    const previewName = root.querySelector("[data-admin-terminal-store-preview-name]");
    const summary = root.querySelector("[data-admin-terminal-store-summary]");
    const previewPrice = root.querySelector("[data-admin-terminal-store-preview-price]");
    const previewStock = root.querySelector("[data-admin-terminal-store-preview-stock]");
    const previewPricing = root.querySelector("[data-admin-terminal-store-preview-pricing]");
    const previewStatus = root.querySelector("[data-admin-terminal-store-preview-status]");
    const previewNote = root.querySelector("[data-admin-terminal-store-preview-note]");
    if (previewName) previewName.textContent = itemName;
    if (previewPrice) previewPrice.textContent = pricingMode === "Economy-linked" ? `${price} ${currency} base` : `${price} ${currency}`;
    if (previewPricing) previewPricing.textContent = pricingMode;
    if (previewStock) previewStock.textContent = stockText;
    if (previewStatus) previewStatus.textContent = status;
    if (previewNote) {
      previewNote.textContent = fulfillment === "Admin approval required"
        ? `Purchase requires admin approval. ${usageRule}. ${visibility}.`
        : fulfillment === "Auto-consume on purchase"
          ? `Purchase applies immediately. ${usageRule}. ${visibility}.`
          : fulfillment === "Manual redemption"
            ? `Item is granted, then redeemed manually. ${usageRule}. ${visibility}.`
            : `${fulfillment}. ${usageRule}. ${visibility}.`;
    }
    if (summary) {
      const titleNode = summary.querySelector("strong");
      const metaNode = summary.querySelector("small");
      if (titleNode) titleNode.textContent = itemName;
      if (metaNode) metaNode.textContent = `Custom · ${category} · ${itemType} · ${pricingMode} · ${price} ${currency} · ${stockText}`;
    }
  }
  function bindStoreItemModalControls(root) {
    const storeRoot = root?.querySelector?.("[data-admin-terminal-store-console]");
    if (!storeRoot) return;
    root.querySelector(".admin-terminal-modal")?.classList.add("is-store-modal");
    if (storeRoot.dataset.controlsBound === "true") return;
    storeRoot.dataset.controlsBound = "true";
    storeRoot.addEventListener("input", updateStoreItemPreview, true);
    storeRoot.addEventListener("change", updateStoreItemPreview, true);
    root.addEventListener("click", (event) => {
      const previewAction = event.target?.closest?.('[data-admin-terminal-action="preview-store-player-listing"]');
      if (!previewAction || !storeRoot.contains(previewAction)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      updateStoreItemPreview();
      openTerminalPreviewOverlay(renderStorePlayerListingPreview(readStoreItemDraft(storeRoot)));
    }, true);
    const form = storeRoot.querySelector("[data-admin-terminal-store-form]");
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopPropagation();
      updateStoreItemPreview();
      const itemName = storeRoot.querySelector("[data-admin-terminal-store-name]")?.value?.trim();
      const stockMode = storeRoot.querySelector("[data-admin-terminal-store-stock-mode]")?.value || "Unlimited";
      const stockQuantity = storeRoot.querySelector("[data-admin-terminal-store-stock-quantity]")?.value?.trim();
      if (!itemName) {
        storeRoot.querySelector("[data-admin-terminal-store-name]")?.focus?.();
        if (typeof showGlobalStatus === "function") showGlobalStatus("warn", "Item name is required.");
        return;
      }
      if (stockMode === "Limited" && (!stockQuantity || Number(stockQuantity) <= 0)) {
        storeRoot.querySelector("[data-admin-terminal-store-stock-quantity]")?.focus?.();
        if (typeof showGlobalStatus === "function") showGlobalStatus("warn", "Limited stock requires a quantity.");
        return;
      }
      if (stockMode === "Country") {
        const countryInputs = Array.from(storeRoot.querySelectorAll("[data-admin-terminal-store-country-stock]"));
        const totalCountryStock = countryInputs.reduce((total, input) => total + (Number(input.value) || 0), 0);
        if (totalCountryStock <= 0) {
          countryInputs[0]?.focus?.();
          if (typeof showGlobalStatus === "function") showGlobalStatus("warn", "Country stock requires at least one stocked country.");
          return;
        }
      }
      if (typeof showGlobalStatus === "function") showGlobalStatus("ok", storeRoot.dataset.adminTerminalStoreEditMode === "true" ? "Custom store item changes saved locally. Backend update pending." : "Custom store item saved locally. System items remain protected.");
    });
    updateStoreItemPreview();
    window.requestAnimationFrame(() => {
      storeRoot.querySelector("[data-admin-terminal-store-name]")?.focus?.();
    });
  }
  function renderAddPlayerModal(model) {
    return renderModalShell({
      title: "Add Player",
      eyebrow: "Roster command",
      body: `
        <div class="admin-terminal-player-container" data-admin-terminal-player-console>
          <video class="admin-terminal-player-video" autoplay muted loop playsinline preload="auto" aria-hidden="true">
            <source src="./assets/videos/player-background.mp4" type="video/mp4" />
          </video>
          <header class="admin-terminal-player-topbar">
            <div class="admin-terminal-player-title-block">
              <span class="admin-terminal-mode-dot" aria-hidden="true"></span>
              <div>
                <strong>Create Player</strong>
                <small>Roster profile + access setup</small>
              </div>
            </div>
            <button class="admin-terminal-hud-close is-player-top-close" type="button" data-admin-terminal-modal-close aria-label="Close add player">
              <span>Close</span>
              <b aria-hidden="true">×</b>
            </button>
          </header>
          <form class="admin-terminal-player-form" data-admin-terminal-player-form>
            <section class="admin-terminal-player-main">
              <label class="admin-terminal-field is-title">
                <span>Display name</span>
                <input type="text" name="displayName" data-admin-terminal-player-display-name placeholder="Example: Mina Park" autocomplete="off" />
              </label>
              <label class="admin-terminal-field">
                <span>Roster label</span>
                <input type="text" name="rosterLabel" data-admin-terminal-player-roster-label placeholder="Example: G10-A / #12 / Team Orion" autocomplete="off" />
              </label>
              <div class="admin-terminal-player-settings-head">
                <span>Player settings</span>
                <small>Auto-generated values can be overridden manually.</small>
              </div>
              <div class="admin-terminal-player-grid is-settings">
                <label class="admin-terminal-field is-player-status">
                  <span>Status</span>
                  <select name="status" data-admin-terminal-player-status>
                    <option value="active">Active</option>
                    <option value="pending">Pending</option>
                    <option value="inactive">Inactive</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </label>
                <label class="admin-terminal-field is-player-id-mode">
                  <span>Player ID</span>
                  <select name="playerIdMode" data-admin-terminal-player-id-mode>
                    <option value="auto">Auto-generate</option>
                    <option value="manual">Manual entry</option>
                  </select>
                </label>
                <label class="admin-terminal-field is-player-manual-id" data-admin-terminal-player-id-manual-panel hidden>
                  <span>Manual Player ID</span>
                  <input type="text" name="manualPlayerId" data-admin-terminal-player-manual-id placeholder="Example: P-1024" autocomplete="off" />
                </label>
                <label class="admin-terminal-field is-player-access-mode">
                  <span>Access code</span>
                  <select name="accessCodeMode" data-admin-terminal-player-access-code-mode>
                    <option value="auto">Auto-generate</option>
                    <option value="manual">Manual entry</option>
                    <option value="none">Create later</option>
                  </select>
                </label>
                <label class="admin-terminal-field is-player-manual-access" data-admin-terminal-player-access-code-manual-panel hidden>
                  <span>Manual access code</span>
                  <input type="text" name="manualAccessCode" data-admin-terminal-player-manual-access-code placeholder="Example: ORION-204" autocomplete="off" />
                </label>
                <label class="admin-terminal-field is-player-location">
                  <span>Starting location</span>
                  <select name="startingLocation" data-admin-terminal-player-starting-location>
                    <option value="random">Randomized</option>
                    <option value="NORTHREACH">Northreach</option>
                    <option value="YRETHIA">Yrethia</option>
                    <option value="THALORIS">Thaloris</option>
                    <option value="SOLVEND">Solvend</option>
                    <option value="ELDORAN">Eldoran</option>
                    <option value="VALERION">Valerion</option>
                    <option value="LUMENOR">Lumenor</option>
                    <option value="XALVORIA">Xalvoria</option>
                    <option value="DRAVENLOK">Dravenlok</option>
                    <option value="SYNDALIS">Syndalis</option>
                  </select>
                </label>
              </div>
              <label class="admin-terminal-field">
                <span>Notes</span>
                <textarea name="notes" rows="4" data-admin-terminal-player-notes placeholder="Optional teacher-only note for this roster entry. Backend field pending."></textarea>
              </label>
            </section>
            <aside class="admin-terminal-player-access is-setup-preview">
              <div class="admin-terminal-player-access-head">
                <span>Setup preview</span>
                <strong data-admin-terminal-player-preview-name>New player</strong>
              </div>
              <div class="admin-terminal-player-preview-card" data-admin-terminal-player-summary>
                <span>Live setup</span>
                <strong>New player</strong>
                <small>Roster: optional · Status: Active · Player ID: Auto-generated · Start: Randomized · Access: Generated after save</small>
              </div>
              <div class="admin-terminal-player-preview-grid">
                <div class="admin-terminal-player-preview-item">
                  <span>Status</span>
                  <strong data-admin-terminal-player-preview-status>Active</strong>
                </div>
                <div class="admin-terminal-player-preview-item">
                  <span>Player ID</span>
                  <strong data-admin-terminal-player-preview-id>Auto-generated</strong>
                </div>
                <div class="admin-terminal-player-preview-item">
                  <span>Starting location</span>
                  <strong data-admin-terminal-player-preview-location>Randomized</strong>
                </div>
                <div class="admin-terminal-player-preview-item">
                  <span>Access code</span>
                  <strong data-admin-terminal-player-preview-access>Generated after save</strong>
                </div>
              </div>
              <div class="admin-terminal-player-preview-note">
                <span>Result</span>
                <small data-admin-terminal-player-preview-note>This player will be created with the selected setup. Manual values override generated values.</small>
              </div>
              <div class="admin-terminal-player-actions is-visible-actions">
                <button type="button" class="is-secondary" data-admin-terminal-action="preview-player-side-profile">Preview</button>
                <button type="submit" data-admin-terminal-action="mock-save-player">Create Player</button>
              </div>
            </aside>
          </form>
        </div>`,
      footer: ``
    });
  }
  function getActiveScannerInput() {
    const consoleRoot = document.querySelector("[data-admin-terminal-scanner-console]");
    if (!consoleRoot) return null;
    const isManual = consoleRoot.dataset.scanMode === "manual";
    return isManual
      ? consoleRoot.querySelector("[data-admin-terminal-manual-scan-input]")
      : consoleRoot.querySelector("[data-admin-terminal-auto-scan-input]");
  }
  function focusActiveScannerInput() {
    const input = getActiveScannerInput();
    window.requestAnimationFrame(() => input?.focus?.());
  }
  function setScannerMode(mode) {
    const consoleRoot = document.querySelector("[data-admin-terminal-scanner-console]");
    if (!consoleRoot) return;
    const nextMode = mode === "manual" ? "manual" : "auto";
    const autoPanel = consoleRoot.querySelector("[data-admin-terminal-auto-panel]");
    const manualPanel = consoleRoot.querySelector("[data-admin-terminal-manual-panel]");
    const modeLabel = consoleRoot.querySelector("[data-admin-terminal-mode-label]");
    const state = consoleRoot.querySelector("[data-admin-terminal-scanner-state]");
    const autoInput = consoleRoot.querySelector("[data-admin-terminal-auto-scan-input]");
    const manualInput = consoleRoot.querySelector("[data-admin-terminal-manual-scan-input]");
    const autoButton = consoleRoot.querySelector('[data-admin-terminal-set-mode="auto"]');
    const manualButton = consoleRoot.querySelector('[data-admin-terminal-set-mode="manual"]');
    consoleRoot.dataset.scanMode = nextMode;
    if (autoButton) autoButton.setAttribute("aria-pressed", nextMode === "auto" ? "true" : "false");
    if (manualButton) manualButton.setAttribute("aria-pressed", nextMode === "manual" ? "true" : "false");
    if (autoPanel) {
      autoPanel.hidden = nextMode !== "auto";
      autoPanel.style.display = nextMode === "auto" ? "grid" : "none";
      autoPanel.setAttribute("aria-hidden", nextMode === "auto" ? "false" : "true");
    }
    if (manualPanel) {
      manualPanel.hidden = nextMode !== "manual";
      manualPanel.style.display = nextMode === "manual" ? "grid" : "none";
      manualPanel.setAttribute("aria-hidden", nextMode === "manual" ? "false" : "true");
    }
    if (modeLabel) modeLabel.textContent = nextMode === "manual" ? "Manual" : "Auto";
    if (state) {
      state.textContent = nextMode === "manual" ? "Manual input ready" : "Armed";
      state.classList.remove("is-captured");
    }
    window.clearTimeout(window.Econovaria.features.adminOverviewTerminal.scannerAutoSubmitTimer);
    window.requestAnimationFrame(() => {
      if (nextMode === "manual") manualInput?.focus?.();
      else autoInput?.focus?.();
    });
  }
  function scheduleAutoScannerCapture(input) {
    if (!input) return;
    window.clearTimeout(window.Econovaria.features.adminOverviewTerminal.scannerAutoSubmitTimer);
    const raw = String(input.value || "").trim();
    if (!raw) return;
    window.Econovaria.features.adminOverviewTerminal.scannerAutoSubmitTimer = window.setTimeout(() => {
      if (String(input.value || "").trim()) handleMockScannerCapture("auto");
    }, 420);
  }
  function handleMockScannerCapture(source = "confirm") {
    const consoleRoot = document.querySelector("[data-admin-terminal-scanner-console]");
    const input = getActiveScannerInput();
    const state = document.querySelector("[data-admin-terminal-scanner-state]");
    const empty = document.querySelector("[data-admin-terminal-last-scan-empty]");
    const result = document.querySelector("[data-admin-terminal-last-scan-result]");
    const player = result?.querySelector("[data-admin-terminal-last-scan-player]");
    const targetLabel = document.querySelector(".admin-terminal-hud-top-right [data-admin-terminal-last-scan-player]");
    const timeNode = document.querySelector("[data-admin-terminal-last-scan-time]");
    const status = document.querySelector("[data-admin-terminal-last-scan-status]");
    const reward = document.querySelector("[data-admin-terminal-last-scan-reward]");
    const raw = String(input?.value || "").trim();
    if (!raw && source !== "rearm") {
      focusActiveScannerInput();
      if (typeof showGlobalStatus === "function") showGlobalStatus("warn", "Scanner is armed. No code entered yet.");
      return;
    }
    const code = raw || "SCANNED-PLAYER";
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const nextStatus = "Present";
    const nextReward = "1.00";
    if (state) {
      state.textContent = "Scan captured";
      state.classList.add("is-captured");
    }
    if (empty) empty.hidden = true;
    if (result) result.hidden = false;
    if (player) player.textContent = code;
    if (targetLabel) targetLabel.textContent = code;
    if (timeNode) timeNode.textContent = `Scanned ${time}`;
    if (status) {
      status.textContent = nextStatus;
      status.className = "is-status is-present";
    }
    if (reward) reward.textContent = nextReward;
    if (input) {
      input.value = "";
      input.focus();
    }
    if (consoleRoot) {
      window.setTimeout(() => {
        const currentState = consoleRoot.querySelector("[data-admin-terminal-scanner-state]");
        if (currentState) {
          currentState.classList.remove("is-captured");
          currentState.textContent = consoleRoot.dataset.scanMode === "manual" ? "Manual input ready" : "Awaiting scan";
        }
        focusActiveScannerInput();
      }, 900);
    }
    if (typeof showGlobalStatus === "function") {
      const label = source === "auto" ? "Auto-submitted scan" : source === "enter" ? "Scan submitted from Enter key" : "Scan submitted";
      showGlobalStatus("warn", `${label}. Backend wiring pending.`);
    }
  }
  function getModalRoot() {
    let root = document.querySelector("[data-admin-terminal-modal-root]");
    if (!root) {
      root = document.createElement("div");
      root.setAttribute("data-admin-terminal-modal-root", "");
      document.body.appendChild(root);
    }
    return root;
  }
  function closeTerminalModal() {
    const root = document.querySelector("[data-admin-terminal-modal-root]");
    if (!root) return;
    const topModal = root.lastElementChild;
    if (topModal) {
      topModal.remove();
    } else {
      root.innerHTML = "";
    }
    if (!root.children.length) {
      document.documentElement.classList.remove("admin-terminal-modal-open");
    }
  }
  function closeAllTerminalModals() {
    const root = document.querySelector("[data-admin-terminal-modal-root]");
    if (!root) return;
    root.innerHTML = "";
    document.documentElement.classList.remove("admin-terminal-modal-open");
  }
    function bindScannerModalControls(root) {
    const scanner = root?.querySelector?.("[data-admin-terminal-scanner-console]");
    if (!scanner) return;
    if (scanner.dataset.controlsBound === "true") return;
    scanner.dataset.controlsBound = "true";
    root.addEventListener("click", (event) => {
      const modalClose = event.target?.closest?.("[data-admin-terminal-modal-close]");
      const modalBackdrop = event.target?.matches?.("[data-admin-terminal-modal-backdrop]");
      const action = event.target?.closest?.("[data-admin-terminal-action]");
      if (modalClose || modalBackdrop) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        closeTerminalModal();
        return;
      }
      if (!action || !scanner.contains(action)) return;
      const actionName = action.dataset.adminTerminalAction;
      if (actionName === "mock-confirm-scan") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        handleMockScannerCapture("confirm");
        return;
      }
      if (actionName === "mock-start-scanner") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        focusActiveScannerInput();
        const state = scanner.querySelector("[data-admin-terminal-scanner-state]");
        if (state) {
          state.classList.remove("is-captured");
          state.textContent = scanner.dataset.scanMode === "manual" ? "Manual input ready" : "Armed";
        }
        if (typeof showGlobalStatus === "function") showGlobalStatus("warn", "Scanner focus restored. Backend wiring pending.");
      }
    }, true);
    root.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      if (!event.target?.matches?.("[data-admin-terminal-auto-scan-input], [data-admin-terminal-manual-scan-input]")) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      handleMockScannerCapture("enter");
    }, true);
    setScannerMode(scanner.dataset.scanMode === "manual" ? "manual" : "auto");
  }
  function normalizeTerminalPageSection(section) {
    const value = String(section || "").trim();
    if (value === "Players") return "Players";
    if (value === "Attendance") return "Attendance";
    if (value === "Assignments" || value === "Contracts") return "Assignments";
    if (value === "Store") return "Store";
    if (value === "Market" || value === "Stock Market") return "Market";
    if (value === "Settings") return "Settings";
    if (value === "Logs" || value === "Activity") return "Logs";
    if (value === "AdminProfile") return "AdminProfile";
    if (value === "AdminSettings") return "AdminSettings";
    if (value === "AdminNotifications") return "AdminNotifications";
    if (value === "AdminSecurity") return "AdminSecurity";
    if (value === "AdminHelp") return "AdminHelp";
    if (value === "AdminGames") return "AdminGames";
    return "Overview";
  }
  function getPlayerDisplayTitle(rank, location) {
    const podiumTitles = {
      1: "Global Exchange Champion",
      2: "Strategic Capital Regent",
      3: "World Trade Vanguard"
    };
    if (podiumTitles[Number(rank)]) return podiumTitles[Number(rank)];
    const locationTitles = {
      Northreach: "Arctic Resource Master",
      Yrethia: "Maritime Commerce Admiral",
      Solvend: "Quantum Market Engineer",
      Eldoran: "Supply Chain Custodian",
      Thaloris: "Frontier Port Champion",
      Valerion: "Capital Growth Architect",
      Syndalis: "Signal Exchange Operative",
      Kaivora: "Frontier Expansion Pioneer",
      Orinth: "Skyborne Ledger Steward",
      Dravik: "Industrial Forge Baron"
    };
    return locationTitles[String(location || '').trim()] || 'Emerging Market Magnate';
  }
  function getTerminalPlayerRows(model) {
    const leaderboard = Array.isArray(model?.leaderboard) ? model.leaderboard : [];
    return leaderboard.map((player, index) => {
      const rank = player.rank || index + 1;
      const name = player.name || `Player ${rank}`;
      const meta = player.meta || (index % 3 === 0 ? "active today" : index % 3 === 1 ? "active yesterday" : "offline");
      const session = readSciIdSessionStatus(player, meta);
      const netWorth = player.netWorth || player.network || player.balance || "0.00";
      const numericNetWorth = Number(String(netWorth).replace(/[^0-9.-]/g, "")) || 0;
      const cash = player.cash || Math.max(300, Math.round(numericNetWorth * 0.19)).toLocaleString("en-US");
      const portfolioValue = player.portfolioValue || Math.max(0, Math.round(numericNetWorth * 0.81)).toLocaleString("en-US");
      const location = player.location || ["Northreach", "Yrethia", "Solvend", "Eldoran", "Thaloris"][index % 5];
      const playerTitle = player.playerTitle || player.titleBadge || getPlayerDisplayTitle(rank, location);
      const activity = getPlayerActivityStatus(player, meta, index);
      const lastActive = activity.label;
      const accessCode = player.accessCode || `PLR-${String(2300 + Number(rank)).padStart(4, "0")}`;
      const flag = player.flag || player.flagReason || player.reviewFlag || (player.isFlagged || player.flagged ? "Flagged" : "") || (index === 2 ? "Access review" : index === 4 ? "Low activity" : "");
      return {
        ...player,
        rank,
        name,
        meta,
        session,
        netWorth,
        cash,
        portfolioValue,
        location,
        playerTitle,
        lastActive,
        activity,
        accessCode,
        flag,
        overall: player.overallScore ?? player.overall ?? player.score ?? "—"
      };
    });
  }
  function renderPlayersPageHeader(model) {
    return `
      <header class="admin-terminal-top admin-terminal-page-top">
        <div>
          <span>Roster / player operations</span>
          <h2>Players</h2>
          <p>Use the roster as the control surface. Open a row to inspect the full player record.</p>
        </div>
        <div class="admin-terminal-top-actions">
          <button class="admin-terminal-bell" type="button" aria-label="Alerts" data-admin-terminal-bell>
            ${bellIcon()}
            ${model.notificationCount ? `<small>${escapeHtml(model.notificationCount)}</small>` : ""}
          </button>
          <button class="admin-terminal-user-button" type="button" aria-label="Open admin profile menu" aria-expanded="false" data-admin-terminal-user>
            <span class="admin-terminal-avatar">${escapeHtml(getAdminInitials(model.adminName))}</span>
            <i aria-hidden="true"></i>
          </button>
          ${renderNotifications(model)}
          ${renderAdminUserMenu(model)}
        </div>
      </header>`;
  }
  const PLAYER_QUICK_ACTION_ICONS = Object.freeze({
    "open-player-profile": "./assets/icons/player-id.svg",
    "adjust-player-balance": "./assets/icons/adjust-balance.svg",
    "player-settings": "./assets/icons/player-settings.svg",
    "message-player": "./assets/icons/message-player.svg"
  });
  function renderPlayerQuickActionButton(action, rank, label, fallbackText, extraAttrs = "") {
    const iconSrc = PLAYER_QUICK_ACTION_ICONS[action];
    const iconMarkup = iconSrc
      ? `<img src="${escapeHtml(iconSrc)}" alt="" aria-hidden="true" loading="lazy" />`
      : escapeHtml(fallbackText);
    return `<button type="button" data-admin-terminal-action="${escapeHtml(action)}" data-player-rank="${escapeHtml(rank)}" ${extraAttrs} aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"><b aria-hidden="true">${iconMarkup}</b><span>${escapeHtml(label)}</span></button>`;
  }
  function renderPlayersAccordionDetail(player) {
    const checkingBalance = readCurrencyNumber(player.cash) ?? 0;
    const savingsBalance = checkingBalance * 0.25;
    const combinedCash = (checkingBalance + savingsBalance).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    const activity = player.activity || getPlayerActivityStatus(player, player.meta, Number(player.rank || 1) - 1);
    return `
      <section class="admin-terminal-player-accordion-detail admin-terminal-player-dossier-v296" aria-label="${escapeHtml(player.name)} player details">
        <div class="admin-terminal-player-dossier-topline-v296">
          <div class="admin-terminal-player-dossier-identity">
            <div>
              <small>Player record</small>
              <strong>${escapeHtml(player.name)}</strong>
              <p>${escapeHtml(player.playerTitle || "Player profile")} · ${escapeHtml(player.location)}</p>
            </div>
          </div>
          <dl class="admin-terminal-player-dossier-metrics-v296" aria-label="Expanded player metrics">
            <div>
              <dt>Net Worth</dt>
              <dd>${renderPlayerCurrencyAmount(player.netWorth, player)}</dd>
            </div>
            <div>
              <dt>Cash</dt>
              <dd>${renderPlayerCurrencyAmount(combinedCash, player)}</dd>
            </div>
            <div class="admin-terminal-player-dossier-access-v300 admin-terminal-player-dossier-access-v303">
              <dt>Access Code</dt>
              <dd>${escapeHtml(player.accessCode)}</dd>
            </div>
          </dl>
        </div>
        ${renderPlayerHoldingsPanel(player)}
      </section>`;
  }
  function renderPlayersRosterRow(player, selectedRank = null) {
    const activity = player.activity || getPlayerActivityStatus(player, player.meta, Number(player.rank || 1) - 1);
    const isOnline = activity.tone === "is-now";
    const tone = isOnline ? "is-online" : "is-offline";
    const inlineStatusIndicator = isOnline ? `<i aria-hidden="true"></i>` : "";
    const isExpanded = String(player.rank) === String(selectedRank ?? "");
    const checkingBalance = readCurrencyNumber(player.cash) ?? 0;
    const savingsBalance = checkingBalance * 0.25;
    const combinedCash = (checkingBalance + savingsBalance).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return `
      <article class="admin-terminal-player-row admin-terminal-player-accordion-row admin-terminal-player-table-row-v296 ${tone} ${escapeHtml(activity.tone)} ${isExpanded ? "is-selected is-expanded" : ""}">
        <div class="admin-terminal-player-row-shell admin-terminal-player-table-shell-v296">
          <button
            type="button"
            class="admin-terminal-player-row-main admin-terminal-player-row-toggle admin-terminal-player-table-toggle-v296"
            data-admin-terminal-action="select-player-panel"
            data-player-rank="${escapeHtml(player.rank)}"
            aria-expanded="${isExpanded ? "true" : "false"}"
          >
            <span class="admin-terminal-player-rank admin-terminal-player-table-rank-v295">#${escapeHtml(player.rank)}</span>
            <span class="admin-terminal-player-identity admin-terminal-player-table-identity-v295">
              <strong><span>${escapeHtml(player.name)}</span><span class="admin-terminal-player-inline-status ${escapeHtml(activity.tone)}">${inlineStatusIndicator}<b>${escapeHtml(formatInlinePlayerStatusLabel(activity))}</b></span></strong>
              <span class="admin-terminal-player-identity-meta">
                <small>${escapeHtml(player.playerTitle || player.location)} · ${escapeHtml(player.location)}</small>
              </span>
            </span>
            <span class="admin-terminal-player-table-metric-v295 admin-terminal-player-table-metric-v296">
              <small>Net Worth</small>
              <strong>${renderPlayerCurrencyAmount(player.netWorth, player)}</strong>
            </span>
            <span class="admin-terminal-player-table-metric-v295 admin-terminal-player-table-metric-v296">
              <small>Cash</small>
              <strong>${renderPlayerCurrencyAmount(combinedCash, player)}</strong>
            </span>
            <span class="admin-terminal-player-chevron" aria-hidden="true">⌄</span>
          </button>
          <div class="admin-terminal-player-row-actions admin-terminal-player-row-quick-actions admin-terminal-player-table-actions-v296" aria-label="Quick actions for ${escapeHtml(player.name)}">
            ${renderPlayerQuickActionButton("open-player-profile", player.rank, "Open ID Card", "ID", `data-player-name="${escapeHtml(player.name)}" data-player-meta="${escapeHtml(player.meta)}" data-player-net-worth="${escapeHtml(player.netWorth)}" data-player-overall="${escapeHtml(player.overall)}"`)}
            ${renderPlayerQuickActionButton("adjust-player-balance", player.rank, "Adjust Balance", "$+")}
            ${renderPlayerQuickActionButton("player-settings", player.rank, "Player Settings", "⚙")}
            ${renderPlayerQuickActionButton("message-player", player.rank, "Message Player", "✉")}
          </div>
        </div>
        ${isExpanded ? renderPlayersAccordionDetail(player) : ""}
      </article>`;
  }
  function getPlayerFilterSlug(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "all";
  }
  function normalizePlayerRosterStatusFilter(value) {
    const normalized = String(value || "all").trim().toLowerCase();
    return ["all", "online", "offline", "flagged"].includes(normalized) ? normalized : "all";
  }
  function isPlayerOnlineForRosterFilter(player = {}) {
    const sessionLabel = String(player?.session?.label || "").trim().toUpperCase();
    const activityTone = String(player?.activity?.tone || "").trim().toLowerCase();
    return sessionLabel === "ONLINE" || activityTone === "is-now";
  }
  function isPlayerFlaggedForRosterFilter(player = {}) {
    return Boolean(player?.flag || player?.flagReason || player?.reviewFlag || player?.isFlagged || player?.flagged);
  }
  function filterPlayersByRosterStatus(players = [], statusFilter = "all") {
    const normalized = normalizePlayerRosterStatusFilter(statusFilter);
    if (normalized === "online") return players.filter((player) => isPlayerOnlineForRosterFilter(player));
    if (normalized === "offline") return players.filter((player) => !isPlayerOnlineForRosterFilter(player));
    if (normalized === "flagged") return players.filter((player) => isPlayerFlaggedForRosterFilter(player));
    return players;
  }
  function normalizePlayersRosterSearch(value) {
    return String(value || "").trim().toLowerCase();
  }
  function getPlayerRosterSearchText(player = {}) {
    return [
      player.name,
      player.rank ? `#${player.rank}` : "",
      player.playerId,
      player.id,
      player.sciId,
      player.location,
      player.country,
      player.playerTitle,
      player.titleBadge,
      player.meta,
      player.lastActive,
      player.session?.label,
      player.flag,
      player.flagReason,
      player.reviewFlag
    ]
      .filter((value) => value !== null && value !== undefined && String(value).trim())
      .join(" ")
      .toLowerCase();
  }
  function filterPlayersByRosterSearch(players = [], searchValue = "") {
    const query = normalizePlayersRosterSearch(searchValue);
    if (!query) return players;
    const terms = query.split(/\s+/).filter(Boolean);
    return players.filter((player) => {
      const haystack = getPlayerRosterSearchText(player);
      return terms.every((term) => haystack.includes(term));
    });
  }
  function filterPlayersForRoster(players = [], statusFilter = "all", searchValue = "") {
    return filterPlayersByRosterSearch(filterPlayersByRosterStatus(players, statusFilter), searchValue);
  }
  function getPlayerHoldingsData(player) {
    const rank = Number(player?.rank || 1) || 1;
    const readMoney = (value) => Number(String(value || "").replace(/[^0-9.-]/g, "")) || 0;
    const baseCash = Math.max(300, readMoney(player?.cash) || 1200);
    const currencyCatalog = getAdminTerminalCurrencyCatalog()
      .filter((currency) => currency.code !== "SC")
      .map((currency) => ({
        ...currency,
        country: String(currency.name || currency.code).replace(/\s+(Credit|Crown|Dinar|Volt|Ducat|Lira|Mark|Note|Vek)$/i, "")
      }));
    const hasFullHoldings = rank <= 4;
    const hasPartialHoldings = rank >= 5 && rank <= 12;
    const hasEmptyHoldings = rank >= 13;
    const currencyMultiplier = hasFullHoldings ? 1.45 : hasPartialHoldings ? .82 : .28;
    const currencies = currencyCatalog.map((currency, index) => ({
      category: "Currencies",
      code: currency.code,
      country: currency.country,
      name: currency.name,
      symbolKey: currency.symbolKey,
      value: Math.max(0, Math.round((baseCash / (index + 2)) * currencyMultiplier * (0.35 + ((rank + index) % 4) * 0.10))).toLocaleString()
    }));
    const loans = hasEmptyHoldings ? [] : hasFullHoldings ? [
      { category: "Loans", label: "Operating loan", amount: `${Math.max(350, rank * 275).toLocaleString()}`, origin: "Northreach", currency: "NRC", note: "Due in 12 days · 8.6% APR" },
      { category: "Loans", label: "Asset credit", amount: `${Math.max(240, rank * 180).toLocaleString()}`, origin: "Valerion", currency: "VAL", note: "Secured by holdings · 7.9% APR" },
      { category: "Loans", label: "Inventory financing", amount: `${Math.max(160, rank * 120).toLocaleString()}`, origin: "Eldoran", currency: "ELD", note: "Auto-debit weekly · 9.4% APR" }
    ] : [
      { category: "Loans", label: "Operating loan", amount: `${Math.max(220, rank * 185).toLocaleString()}`, origin: "Yrethia", currency: "YRC", note: "Due in 9 days · 8.9% APR" }
    ];
    const inventoryFull = [
      { category: "Consumable", type: "Intel", title: "Market intel token", quantity: 4, unitValue: 85, status: "Usable", source: "Store reward", tradable: true, usable: true, locked: false, meta: "Consumable · 4 owned", note: "Use to reveal one market signal before allocation.", image: "https://img.magnific.com/free-vector/cool-neon-server-processing-unit-cloud-storage-database_39422-619.jpg" },
      { category: "Consumable", type: "Research", title: "Priority research voucher", quantity: 1, unitValue: 140, status: "Usable", source: "Contract reward", tradable: true, usable: true, locked: false, meta: "Consumable · 1 owned", note: "Accelerates one research action or forecast request.", image: "https://img.magnific.com/free-vector/artificial-intelligence-isometric-composition-with-flowchart-silicon-chip-server-equipment-with-smartphone-house_1284-56583.jpg" },
      { category: "Access", type: "Credential", title: "RFID access card", quantity: 1, unitValue: 60, status: "Assigned", source: "Admin issued", tradable: false, usable: true, locked: true, meta: "Access · assigned", note: "Required for attendance scans and secure-area actions.", image: "https://img.magnific.com/free-vector/purple-microchip-memory-chip-3d-illustration-cartoon-drawing-equipment-programing-information-storage-3d-style-white-background-modern-technology-engineering-programming-concept_778687-1653.jpg" },
      { category: "Equipment", type: "Scanner", title: "Portable scanner rig", quantity: 1, unitValue: 320, status: "Active", source: "Equipment grant", tradable: false, usable: true, locked: false, meta: "Equipment · calibrated", note: "Enables field scans and inventory verification events.", image: "https://img.magnific.com/free-vector/game-futuristic-boxes-future-technology-chests_107791-18260.jpg" },
      { category: "Materials", type: "Trade good", title: "Composite alloy crate", quantity: 3, unitValue: 115, status: "Tradable", source: "Market purchase", tradable: true, usable: false, locked: false, meta: "Materials · 3 crates", note: "Can be sold or used as input for production contracts.", image: "https://img.magnific.com/free-vector/game-futuristic-boxes-future-technology-chests_107791-18088.jpg" },
      { category: "Equipment", type: "Storage", title: "Secure storage cube", quantity: 2, unitValue: 95, status: "Held", source: "Reward inventory", tradable: true, usable: false, locked: false, meta: "Equipment · 2 units", note: "Inventory container with moderate resale value.", image: "https://img.magnific.com/free-vector/3d-glass-cube-box-vector-isolated-transparent-background-crear-black-white-realistic-geometric-block-with-reflection-glossy-acrylic-object-design-polygon-set-glassy-futuristic-art-icon_107791-21841.jpg" }
    ];
    const inventoryPartial = [
      { category: "Consumable", type: "Intel", title: "Market intel token", quantity: 1, unitValue: 85, status: "Usable", source: "Store reward", tradable: true, usable: true, locked: false, meta: "Consumable · 1 owned", note: "Use to reveal one market signal before allocation.", image: "https://img.magnific.com/free-vector/cool-neon-server-processing-unit-cloud-storage-database_39422-619.jpg" },
      { category: "Access", type: "Credential", title: "RFID access card", quantity: 1, unitValue: 60, status: "Assigned", source: "Admin issued", tradable: false, usable: true, locked: true, meta: "Access · assigned", note: "Required for attendance scans and secure-area actions.", image: "https://img.magnific.com/free-vector/purple-microchip-memory-chip-3d-illustration-cartoon-drawing-equipment-programing-information-storage-3d-style-white-background-modern-technology-engineering-programming-concept_778687-1653.jpg" }
    ];
    const assetsFull = [
      { category: "Businesses", title: "Harbor kiosk", meta: "Business · cashflow +220.00/day" },
      { category: "Businesses", title: "Cold-chain resale stand", meta: "Business · margin 14%" },
      { category: "Real Estate", title: "Northreach storage unit", meta: "Real estate · collateral eligible" },
      { category: "Real Estate", title: "Crescent Bay micro-lot", meta: "Real estate · appreciation watch" }
    ];
    const assetsPartial = [
      { category: "Businesses", title: "Campus snack route", meta: "Business · cashflow +65.00/day" },
    ];
    const stocksFull = [
      { category: "Energy", symbol: "NRG", title: "Northreach Grid", value: "2,410.00", meta: "Energy · 18 shares" },
      { category: "Transport", symbol: "SBL", title: "Sable Logistics", value: "1,840.00", meta: "Transport · 12 shares" },
      { category: "Tech", symbol: "AUR", title: "Aurora Systems", value: "3,220.00", meta: "Tech · 9 shares" },
      { category: "Materials", symbol: "CRB", title: "Crescent Commodities", value: "1,115.00", meta: "Materials · 15 shares" },
      { category: "Finance", symbol: "VBF", title: "Valerion Bank Fund", value: "940.00", meta: "Finance · 6 shares" }
    ];
    const stocksPartial = [
      { category: "Transport", symbol: "SBL", title: "Sable Logistics", value: "760.00", meta: "Transport · 5 shares" },
      { category: "Materials", symbol: "CRB", title: "Crescent Commodities", value: "420.00", meta: "Materials · 6 shares" }
    ];
    const logsFull = [
      { category: "Trade", type: "portfolio", severity: "Info", impact: "Financial", date: "2026-06-26", time: "09:42", title: "Portfolio rebalance", detail: "Bought 3 shares of Aurora Systems.", item: "Aurora Systems", actor: player?.name || "Player", source: "Player terminal", eventId: `PL-${String(rank).padStart(2, "0")}-1042`, before: "6 shares", after: "9 shares", price: "-240.00" },
      { category: "Inventory", type: "inventory", severity: "Info", impact: "Inventory", date: "2026-06-26", time: "09:18", title: "Inventory used", detail: "Market intel token consumed for research.", item: "Market intel token", actor: player?.name || "Player", source: "Inventory action", eventId: `PL-${String(rank).padStart(2, "0")}-1018`, before: "4 units", after: "3 units", price: "0.00" },
      { category: "Financial", type: "liability", severity: "Review", impact: "Debt", date: "2026-06-26", time: "08:57", title: "Loan update", detail: "Operating loan balance recalculated.", item: "Operating loan", actor: "System", source: "Liability engine", eventId: `PL-${String(rank).padStart(2, "0")}-0957`, before: "Previous balance", after: "Updated balance", price: "0.00" },
      { category: "Access", type: "security", severity: "Info", impact: "Session", date: "2026-06-26", time: "08:05", title: "Login", detail: "Player entered simulation from roster session.", item: "Roster session", actor: player?.name || "Player", source: "Login page", eventId: `PL-${String(rank).padStart(2, "0")}-0905`, before: "Offline", after: "Online", price: "0.00" },
      { category: "Attendance", type: "attendance", severity: "Info", impact: "Reward", date: "2026-06-25", time: "15:52", title: "Attendance reward", detail: "On-time scan issued daily attendance reward.", item: "RFID access card", actor: "Scanner", source: "Attendance terminal", eventId: `PL-${String(rank).padStart(2, "0")}-0852`, before: "Unscanned", after: "Present", price: "+25.00" },
      { category: "Contract", type: "contract", severity: "Info", impact: "Progress", date: "2026-06-25", time: "15:40", title: "Contract progress", detail: "Submitted partial evidence for logistics contract.", item: "Logistics contract", actor: player?.name || "Player", source: "Contract console", eventId: `PL-${String(rank).padStart(2, "0")}-0840`, before: "40%", after: "65%", price: "0.00" },
      { category: "Asset", type: "finance", severity: "Info", impact: "Income", date: "2026-06-25", time: "15:30", title: "Business income posted", detail: "Harbor kiosk generated daily cashflow.", item: "Harbor kiosk", actor: "System", source: "Business income job", eventId: `PL-${String(rank).padStart(2, "0")}-0830`, before: "Pending", after: "Posted", price: "+220.00" },
      { category: "Admin", type: "admin", severity: "Review", impact: "Adjustment", date: "2026-06-25", time: "14:12", title: "Admin note added", detail: "Admin flagged portfolio explanation for review.", item: "Portfolio explanation", actor: "Admin", source: "Player drawer", eventId: `PL-${String(rank).padStart(2, "0")}-0712`, before: "No note", after: "Review note", price: "0.00" }
    ];
    const logsPartial = [
      { category: "Access", type: "security", severity: "Info", impact: "Session", date: "2026-06-26", time: "08:05", title: "Login", detail: "Player entered simulation from roster session.", item: "Roster session", actor: player?.name || "Player", source: "Login page", eventId: `PL-${String(rank).padStart(2, "0")}-0905`, before: "Offline", after: "Online", price: "0.00" },
      { category: "Trade", type: "portfolio", severity: "Info", impact: "Financial", date: "2026-06-25", time: "13:15", title: "Stock purchase", detail: "Bought Sable Logistics position.", item: "Sable Logistics", actor: player?.name || "Player", source: "Player terminal", eventId: `PL-${String(rank).padStart(2, "0")}-0615`, before: "0 shares", after: "5 shares", price: "-145.00" },
      { category: "Attendance", type: "attendance", severity: "Info", impact: "Reward", date: "2026-06-25", time: "08:01", title: "Attendance scan", detail: "Player scanned in on time.", item: "RFID access card", actor: "Scanner", source: "Attendance terminal", eventId: `PL-${String(rank).padStart(2, "0")}-0501`, before: "Unscanned", after: "Present", price: "+25.00" }
    ];
    return {
      currencies,
      loans,
      inventory: hasEmptyHoldings ? [] : hasFullHoldings ? inventoryFull : inventoryPartial,
      assets: hasEmptyHoldings ? [] : hasFullHoldings ? assetsFull : assetsPartial,
      stocks: hasEmptyHoldings ? [] : hasFullHoldings ? stocksFull : stocksPartial,
      logs: hasEmptyHoldings ? [] : hasFullHoldings ? logsFull : logsPartial
    };
  }
  function renderPlayerTabs(labels, group, active = "All") {
    return `<div class="admin-terminal-player-v240-tabs" role="tablist" aria-label="${escapeHtml(group)} filters">${labels.map((label) => {
      const category = getPlayerFilterSlug(label);
      return `<button type="button" class="${label === active ? "active" : ""}" data-admin-terminal-action="filter-player-panel" data-player-filter-group="${escapeHtml(group)}" data-player-filter-category="${escapeHtml(category)}">${escapeHtml(label)}</button>`;
    }).join("")}</div>`;
  }
  function renderPlayerEmptyState(message, group = "") {
    return `<article class="admin-terminal-player-v244-empty" data-filter-empty="${escapeHtml(group)}">${escapeHtml(message)}</article>`;
  }
  function renderPlayerFilterEmptyState(message, group = "") {
    return `<article class="admin-terminal-player-v244-empty is-filter-empty" hidden data-filter-empty="${escapeHtml(group)}">${escapeHtml(message)}</article>`;
  }
  function renderPlayerPortfolioDiversification(stocks, player = {}) {
    const parsePortfolioMoney = (value) => Number(String(value || "").replace(/[^0-9.-]/g, "")) || 0;
    if (!Array.isArray(stocks) || !stocks.length) {
      return `
        <div class="admin-terminal-player-v240-portfolio-chart is-empty" aria-label="Portfolio diversification unavailable">
          <div class="admin-terminal-player-v240-portfolio-empty">No positions to chart yet.</div>
        </div>`;
    }
    const grouped = new Map();
    stocks.forEach((stock) => {
      const category = String(stock.category || 'Other');
      const value = parsePortfolioMoney(stock.value || 0);
      const current = grouped.get(category) || { category, value: 0, count: 0 };
      current.value += value;
      current.count += 1;
      grouped.set(category, current);
    });
    const palette = {
      Energy: '#7dff8a',
      Transport: '#3fd6ff',
      Tech: '#00eaff',
      Materials: '#ffd44d',
      Finance: '#ff5cf4',
      Other: '#c8f7ff'
    };
    const entries = Array.from(grouped.values()).sort((a, b) => b.value - a.value);
    const total = entries.reduce((sum, entry) => sum + entry.value, 0) || 1;
    const domesticMeta = getPlayerBankCurrencyMeta(player);
    const renderPortfolioLegendAmount = (value) => {
      const converted = convertAdminTerminalCurrencyAmount(value, 'SC', domesticMeta.code);
      const amount = converted.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return `<em class="admin-terminal-player-v240-portfolio-value"><b>${escapeHtml(amount)}</b><i>${escapeHtml(domesticMeta.code)}</i></em>`;
    };
    const lead = entries[0];
    const leadPercent = Math.round((lead.value / total) * 100);
    return `
      <div class="admin-terminal-player-v240-portfolio-chart is-fullwidth" aria-label="Portfolio diversification allocation table">
        <div class="admin-terminal-player-v240-portfolio-meta">
          <header>
            <small>Current portfolio concentration</small>
            <span>${entries.length} categories · Largest: ${escapeHtml(lead.category)} · Top weight: ${leadPercent}%</span>
          </header>
          <div class="admin-terminal-player-v240-portfolio-allocation-head" aria-hidden="true">
            <span>Category</span>
            <span>Weight</span>
            <span>Value</span>
          </div>
          <ul class="admin-terminal-player-v240-portfolio-legend">
            ${entries.map((entry) => {
              const percent = Math.round((entry.value / total) * 100);
              const swatch = palette[entry.category] || palette.Other;
              return `<li style="--swatch:${swatch};--weight:${percent}%">
                <div class="admin-terminal-player-v240-portfolio-legend-main">
                  <i></i>
                  <div class="admin-terminal-player-v240-portfolio-legend-copy">
                    <span>${escapeHtml(entry.category)}</span>
                    <small>${escapeHtml(String(entry.count))} holding${entry.count === 1 ? '' : 's'}</small>
                  </div>
                </div>
                <b>${percent}%</b>
                ${renderPortfolioLegendAmount(entry.value)}
                <div class="admin-terminal-player-v240-portfolio-bar" aria-hidden="true"><span></span></div>
              </li>`;
            }).join('')}
          </ul>
        </div>
      </div>`;
  }
  const ECONOVARIA_CURRENCY_SYMBOL_KEYS = Object.freeze({
    NRC: "saturn",
    YRC: "neptune",
    THD: "arsenic",
    SLV: "jupiter",
    ELD: "alumen",
    VAL: "gold",
    LUM: "lapis_lazuli",
    SYN: "alcali",
    XAL: "lead",
    DRV: "ferrum"
  });
  const ECONOVARIA_CURRENCY_ICON_ASSET_PATHS = Object.freeze({"saturn":"./assets/icons/currency-saturn.svg","neptune":"./assets/icons/currency-neptune.svg","arsenic":"./assets/icons/currency-arsenic.svg","jupiter":"./assets/icons/currency-jupiter.svg","alumen":"./assets/icons/currency-alumen.svg","gold":"./assets/icons/currency-gold.svg","lapis_lazuli":"./assets/icons/currency-lapis_lazuli.svg","alcali":"./assets/icons/currency-alcali.svg","lead":"./assets/icons/currency-lead.svg","ferrum":"./assets/icons/currency-ferrum.svg"});
  function getCurrencySymbolKey(currencyCode) {
    return ECONOVARIA_CURRENCY_SYMBOL_KEYS[String(currencyCode || "").trim().toUpperCase()] || "";
  }
  const ADMIN_TERMINAL_COUNTRY_CURRENCY_META = Object.freeze({
    NORTHREACH: { code: "NRC", name: "Northreach Credit", symbolKey: "saturn", rate: 1.25 },
    YRETHIA: { code: "YRC", name: "Yrethian Crown", symbolKey: "neptune", rate: 0.84 },
    THALORIS: { code: "THD", name: "Thaloris Dinar", symbolKey: "arsenic", rate: 2.10 },
    SOLVEND: { code: "SLV", name: "Solvend Volt", symbolKey: "jupiter", rate: 0.72 },
    ELDORAN: { code: "ELD", name: "Eldoran Ducat", symbolKey: "alumen", rate: 1.05 },
    VALERION: { code: "VAL", name: "Valerion Lira", symbolKey: "gold", rate: 0.68 },
    LUMENOR: { code: "LUM", name: "Lumenor Mark", symbolKey: "lapis_lazuli", rate: 1.40 },
    KAIVORA: { code: "LUM", name: "Lumenor Mark", symbolKey: "lapis_lazuli", rate: 1.40 },
    SYNDALIS: { code: "SYN", name: "Syndalis Note", symbolKey: "alcali", rate: 3.20 },
    XALVORIA: { code: "XAL", name: "Xalvorian Lira", symbolKey: "lead", rate: 1.85 },
    ORINTH: { code: "XAL", name: "Xalvorian Lira", symbolKey: "lead", rate: 1.85 },
    DRAVENLOK: { code: "DRV", name: "Dravenlok Vek", symbolKey: "ferrum", rate: 2.65 },
    DRAVIK: { code: "DRV", name: "Dravenlok Vek", symbolKey: "ferrum", rate: 2.65 }
  });
  function getAdminTerminalCurrencyCatalog() {
    const seen = new Set();
    const list = [{ code: "SC", name: "Standard Credits", symbolKey: "", rate: 1 }];
    Object.values(ADMIN_TERMINAL_COUNTRY_CURRENCY_META).forEach((meta) => {
      const code = String(meta?.code || "").toUpperCase();
      if (!code || seen.has(code)) return;
      seen.add(code);
      list.push(meta);
    });
    return list;
  }
  function getAdminTerminalCurrencyMetaByCode(code) {
    const normalized = String(code || "SC").trim().toUpperCase();
    const catalog = getAdminTerminalCurrencyCatalog();
    return catalog.find((meta) => meta.code === normalized) || catalog[0];
  }
  function convertAdminTerminalCurrencyAmount(amount, fromCode, toCode) {
    const numeric = readCurrencyNumber(amount) ?? 0;
    const fromMeta = getAdminTerminalCurrencyMetaByCode(fromCode);
    const toMeta = getAdminTerminalCurrencyMetaByCode(toCode);
    const fromRate = Number(fromMeta?.rate) || 1;
    const toRate = Number(toMeta?.rate) || 1;
    return (numeric / fromRate) * toRate;
  }
  function renderBankCurrencySelectOptions(selectedCode = "SC") {
    const selected = String(selectedCode || "SC").toUpperCase();
    return getAdminTerminalCurrencyCatalog().map((meta) => {
      const code = String(meta.code || "SC").toUpperCase();
      return `<option value="${escapeHtml(code)}" ${code === selected ? "selected" : ""}>${escapeHtml(code)} · ${escapeHtml(meta.name || code)}</option>`;
    }).join("");
  }
  function renderBankCalculatorOutput(amount, currencyCode) {
    const meta = getAdminTerminalCurrencyMetaByCode(currencyCode);
    const numeric = Number(amount || 0);
    const formatted = numeric.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (meta.code === "SC") return `<em class="admin-terminal-bank-local-amount"><b>$${escapeHtml(formatted)}</b><i>SC</i></em>`;
    return renderBankLocalPreviewAmount(numeric, meta);
  }
  function renderBankCurrencyCalculator(player = {}) {
    const playerCurrencyMeta = getPlayerBankCurrencyMeta(player);
    const defaultAmount = 100;
    const defaultOutput = convertAdminTerminalCurrencyAmount(defaultAmount, "SC", playerCurrencyMeta.code);
    return `
          <section class="admin-terminal-bank-calculator" data-admin-bank-currency-calculator aria-label="Currency calculator">
            <header>
              <small>Currency Calculator</small>
            </header>
            <div class="admin-terminal-bank-calculator-grid">
              <label>From
                <select data-bank-calc-field data-bank-calc-from>${renderBankCurrencySelectOptions("SC")}</select>
              </label>
              <label>Amount
                <input type="number" inputmode="decimal" min="0" step="0.01" value="100.00" data-bank-calc-field data-bank-calc-amount>
              </label>
              <label>To
                <select data-bank-calc-field data-bank-calc-to>${renderBankCurrencySelectOptions(playerCurrencyMeta.code)}</select>
              </label>
              <div class="admin-terminal-bank-calculator-output">
                <small>Output</small>
                <output data-bank-calc-output>${renderBankCalculatorOutput(defaultOutput, playerCurrencyMeta.code)}</output>
              </div>
            </div>
          </section>`;
  }
  function updateAdminTerminalBankCalculator(target) {
    const root = target?.closest?.("[data-admin-bank-currency-calculator]") || target;
    if (!root?.querySelector) return;
    const fromCode = root.querySelector("[data-bank-calc-from]")?.value || "SC";
    const toCode = root.querySelector("[data-bank-calc-to]")?.value || "SC";
    const amount = root.querySelector("[data-bank-calc-amount]")?.value || "0";
    const output = root.querySelector("[data-bank-calc-output]");
    if (!output) return;
    const converted = convertAdminTerminalCurrencyAmount(amount, fromCode, toCode);
    output.innerHTML = renderBankCalculatorOutput(converted, toCode);
  }
  function getPlayerBankCurrencyMeta(player = {}) {
    const rawCountry = String(player.countryCode || player.country || player.location || "Northreach")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return ADMIN_TERMINAL_COUNTRY_CURRENCY_META[rawCountry] || ADMIN_TERMINAL_COUNTRY_CURRENCY_META.NORTHREACH;
  }
  function renderBankCurrencySymbol(symbolKey) {
    const src = ECONOVARIA_CURRENCY_ICON_ASSET_PATHS[String(symbolKey || "")] || "";
    if (!src) return "";
    return `<img class="admin-terminal-bank-currency-symbol" src="${escapeHtml(src)}" alt="" aria-hidden="true" loading="lazy">`;
  }
  function convertStandardCreditsToBankCurrency(value, currencyMeta) {
    const numeric = readCurrencyNumber(value) ?? 0;
    return numeric * (Number(currencyMeta?.rate) || 1);
  }
  function renderBankLocalPreviewAmount(value, currencyMeta) {
    const numeric = Number(value || 0);
    const amount = numeric.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `<em class="admin-terminal-bank-local-amount">${renderBankCurrencySymbol(currencyMeta.symbolKey)}<b>${escapeHtml(amount)}</b><i>${escapeHtml(currencyMeta.code)}</i></em>`;
  }
  function readCurrencyNumber(value) {
    const numeric = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(numeric) ? numeric : null;
  }
  function formatCurrencyNumber(value) {
    const raw = String(value ?? "").trim();
    if (!raw || raw === "—") return "—";
    const numeric = readCurrencyNumber(raw);
    if (numeric === null) return raw;
    const absAmount = Math.abs(numeric).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return numeric < 0 ? `-$${absAmount}` : `$${absAmount}`;
  }
  function getPlayerCurrencyCode(player = {}) {
    return getPlayerBankCurrencyMeta(player).code;
  }
  function renderCurrencyAmountBySymbolKey(value, symbolKey) {
    const amount = formatCurrencyNumber(value);
    if (amount === "—") return `<em class="admin-terminal-currency-amount is-empty"><b class="admin-terminal-currency-number">—</b></em>`;
    return `<em class="admin-terminal-currency-amount is-dollar"><b class="admin-terminal-currency-number">${escapeHtml(amount)}</b></em>`;
  }
  function renderCurrencyAmount(value, currencyCode) {
    return renderCurrencyAmountBySymbolKey(value, "");
  }
  function renderSignedCurrencyAmount(value, currencyCode = "USD") {
    const raw = String(value ?? "").trim();
    if (!raw || raw === "—") return `<em class="admin-terminal-currency-amount is-empty"><b class="admin-terminal-currency-number">—</b></em>`;
    const numeric = readCurrencyNumber(raw);
    if (numeric === null) return escapeHtml(raw);
    const absAmount = Math.abs(numeric).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const sign = numeric < 0 || raw.includes("-") ? "-$" : numeric > 0 || raw.includes("+") ? "+$" : "$";
    const tone = numeric < 0 || raw.includes("-") ? "is-negative is-signed-negative" : numeric > 0 || raw.includes("+") ? "is-positive is-signed-positive" : "is-neutral";
    return `<em class="admin-terminal-currency-amount is-dollar ${tone}"><b class="admin-terminal-currency-sign">${escapeHtml(sign)}</b><b class="admin-terminal-currency-number">${escapeHtml(absAmount)}</b></em>`;
  }
  function renderCurrencySymbolForMeta(meta = {}) {
    const code = String(meta?.code || "SC").toUpperCase();
    if (code === "SC") return `<u aria-hidden="true">$</u>`;
    return renderBankCurrencySymbol(meta.symbolKey);
  }
  function renderPlayerCurrencyAmount(value, player = {}, fromCode = "SC") {
    const raw = String(value ?? "").trim();
    if (!raw || raw === "—") return `<em class="admin-terminal-currency-single-amount is-empty"><b>—</b></em>`;
    const domesticMeta = getPlayerBankCurrencyMeta(player);
    const numeric = readCurrencyNumber(value);
    if (numeric === null) return escapeHtml(raw);
    const converted = convertAdminTerminalCurrencyAmount(numeric, fromCode, domesticMeta.code);
    const amount = converted.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `<em class="admin-terminal-currency-single-amount">${renderCurrencySymbolForMeta(domesticMeta)}<b>${escapeHtml(amount)}</b><i>${escapeHtml(domesticMeta.code)}</i></em>`;
  }
  function renderPlayerCurrencyReserveAmount(value, player = {}, fromCode = "SC") {
    const raw = String(value ?? "").trim();
    if (!raw || raw === "—") return `<em class="admin-terminal-currency-dual-amount is-empty"><span class="admin-terminal-currency-primary"><b>—</b></span></em>`;
    const originalMeta = getAdminTerminalCurrencyMetaByCode(fromCode);
    const domesticMeta = getPlayerBankCurrencyMeta(player);
    const originalNumeric = readCurrencyNumber(value);
    if (originalNumeric === null) return escapeHtml(raw);
    const normalized = convertAdminTerminalCurrencyAmount(originalNumeric, originalMeta.code, domesticMeta.code);
    const originalAmount = originalNumeric.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const normalizedAmount = normalized.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `<em class="admin-terminal-currency-dual-amount"><span class="admin-terminal-currency-primary">${renderCurrencySymbolForMeta(originalMeta)}<b>${escapeHtml(originalAmount)}</b><i>${escapeHtml(originalMeta.code)}</i></span><small><u aria-hidden="true">≈</u>${renderCurrencySymbolForMeta(domesticMeta)}<b>${escapeHtml(normalizedAmount)}</b><i>${escapeHtml(domesticMeta.code)}</i></small></em>`;
  }
  function renderSignedPlayerCurrencyAmount(value, player = {}, fromCode = "SC") {
    const numeric = readCurrencyNumber(value);
    if (numeric === null) return escapeHtml(String(value ?? "—"));
    const domesticMeta = getPlayerBankCurrencyMeta(player);
    const converted = convertAdminTerminalCurrencyAmount(numeric, fromCode, domesticMeta.code);
    const absAmount = Math.abs(converted).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const sign = converted < 0 ? "−" : converted > 0 ? "+" : "";
    const tone = converted < 0 ? "is-negative is-signed-negative" : converted > 0 ? "is-positive is-signed-positive" : "is-neutral";
    return `<em class="admin-terminal-currency-single-amount ${tone}">${renderCurrencySymbolForMeta(domesticMeta)}<b>${escapeHtml(sign)}${escapeHtml(absAmount)}</b><i>${escapeHtml(domesticMeta.code)}</i></em>`;
  }
  function renderPlayerHoldingsPanel(player) {
    const data = getPlayerHoldingsData(player);
    const checkingAccountBalance = player.cash || "0";
    const savingsAccountBalance = ((readCurrencyNumber(checkingAccountBalance) ?? 0) * 0.25).toFixed(2);
    const domesticMeta = getPlayerBankCurrencyMeta(player);
    const readMoney = (value) => readCurrencyNumber(value) ?? 0;
    const businessAssets = data.assets.filter((asset) => String(asset.category).toLowerCase() === "businesses");
    const realEstateAssets = data.assets.filter((asset) => String(asset.category).toLowerCase() === "real estate");
    const recentLogs = data.logs.slice(0, 8);
    const checkingApy = `${(1.2 + (Number(player.rank || 1) % 4) * 0.35).toFixed(2)}% APY`;
    const savingsApy = `${(3.4 + (Number(player.rank || 1) % 5) * 0.25).toFixed(2)}% APY`;
    const liabilityLocationRates = Object.freeze({
      NORTHREACH: { label: "Northreach", baseRate: 5.25, volatility: "+0.35" },
      YRETHIA: { label: "Yrethia", baseRate: 6.10, volatility: "+0.55" },
      SOLVEND: { label: "Solvend", baseRate: 4.90, volatility: "+0.20" },
      ELDORAN: { label: "Eldoran", baseRate: 6.85, volatility: "+0.70" },
      THALORIS: { label: "Thaloris", baseRate: 7.35, volatility: "+0.90" },
      VALERION: { label: "Valerion", baseRate: 5.80, volatility: "+0.45" },
      SYNDALIS: { label: "Syndalis", baseRate: 8.25, volatility: "+1.10" },
      KAIVORA: { label: "Kaivora", baseRate: 5.65, volatility: "+0.40" },
      ORINTH: { label: "Orinth", baseRate: 6.55, volatility: "+0.65" },
      DRAVIK: { label: "Dravik", baseRate: 7.70, volatility: "+0.85" }
    });
    const normalizeLiabilityLocation = (value) => String(value || "Northreach")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    const formatLiabilityNumber = (value) => Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const renderLiabilityMoney = (value, code = domesticMeta.code) => `<em class="admin-terminal-player-liability-money-v452"><b>${escapeHtml(formatLiabilityNumber(value))}</b><i>${escapeHtml(String(code || domesticMeta.code).toUpperCase())}</i></em>`;
    const buildLiabilityPaymentHistory = (loan, metrics, index) => {
      const weeks = [3, 2, 1];
      return weeks.map((weekOffset, historyIndex) => {
        const isLate = metrics.lateFees > 0 && historyIndex === 1;
        const payment = Math.max(0, metrics.weeklyMinimum * (isLate ? .92 : 1));
        const interest = Math.max(0, payment * (.20 + historyIndex * .025));
        const principal = Math.max(0, payment - interest - (isLate ? metrics.lateFees / Math.max(1, metrics.lateCount) : 0));
        const day = String(Math.max(1, 26 - weekOffset * 7 - index)).padStart(2, "0");
        return {
          date: `2026-06-${day}`,
          status: isLate ? "Late" : "Paid",
          principal,
          interest,
          fee: isLate ? metrics.lateFees / Math.max(1, metrics.lateCount) : 0
        };
      });
    };
    const buildLiabilityMetrics = (loan, index) => {
      const rank = Number(player.rank || 1) || 1;
      const localCode = String(loan.currency || domesticMeta.code || "SC").toUpperCase();
      const remainingPrincipal = convertAdminTerminalCurrencyAmount(loan.amount, "SC", localCode);
      const locationKey = normalizeLiabilityLocation(loan.origin);
      const locationRate = liabilityLocationRates[locationKey] || liabilityLocationRates.NORTHREACH;
      const statedApr = Number(String(loan.apr || loan.note || "").match(/([0-9.]+)%\s*APR/i)?.[1] || 0);
      const riskSpread = Math.max(2.1, Number.isFinite(statedApr) && statedApr > 0 ? statedApr - locationRate.baseRate : 2.9 + index * .35);
      const rateAdjustment = ((rank + index) % 4) * .15;
      const locationVolatility = Math.abs(Number(locationRate.volatility || 0)) || .35;
      const variableApr = Number((locationRate.baseRate + riskSpread + rateAdjustment).toFixed(2));
      const aprFloor = Number(Math.max(0, locationRate.baseRate + riskSpread - locationVolatility).toFixed(2));
      const aprCeiling = Number((locationRate.baseRate + riskSpread + locationVolatility + .45).toFixed(2));
      const aprRangeWidth = Math.max(.01, aprCeiling - aprFloor);
      const aprRangePosition = Math.min(100, Math.max(0, ((variableApr - aprFloor) / aprRangeWidth) * 100));
      const aprBandLabel = aprRangePosition < 34 ? "Lower band" : aprRangePosition < 67 ? "Mid band" : "Upper band";
      const termWeeks = Number(loan.termWeeks || 12 + index * 4 + (rank % 3) * 2);
      const paidPeriods = Math.min(termWeeks - 1, Number(loan.periodsPaid || Math.max(2, Math.round(termWeeks * (.30 + ((rank + index) % 4) * .06)))));
      const periodsRemaining = Math.max(1, termWeeks - paidPeriods);
      const originalPrincipal = Number(loan.principal || Math.max(remainingPrincipal, remainingPrincipal * (1 + (paidPeriods / Math.max(1, termWeeks)) * .72)));
      const principalPaid = Math.max(0, originalPrincipal - remainingPrincipal);
      const weeklyRate = variableApr / 100 / 52;
      const basePayment = remainingPrincipal / periodsRemaining;
      const weeklyInterest = remainingPrincipal * weeklyRate;
      const weeklyMinimum = Math.max(0, basePayment + weeklyInterest);
      const interestPaid = Math.max(0, (originalPrincipal + remainingPrincipal) / 2 * weeklyRate * paidPeriods);
      const lateCount = Number(loan.lateCount ?? ((rank + index) % 3 === 0 ? 1 : 0));
      const lateFees = Math.max(0, lateCount * Math.max(6, weeklyMinimum * .10));
      const projectedInterest = Math.max(0, (remainingPrincipal / 2) * weeklyRate * periodsRemaining);
      const remainingToPay = remainingPrincipal + projectedInterest + lateFees;
      const domesticRemaining = convertAdminTerminalCurrencyAmount(remainingPrincipal, localCode, domesticMeta.code);
      const domesticWeeklyMinimum = convertAdminTerminalCurrencyAmount(weeklyMinimum, localCode, domesticMeta.code);
      const domesticLateFees = convertAdminTerminalCurrencyAmount(lateFees, localCode, domesticMeta.code);
      const metrics = {
        ...loan,
        index,
        localCode,
        locationRate,
        variableApr,
        aprFloor,
        aprCeiling,
        aprRangePosition,
        aprBandLabel,
        locationVolatility,
        riskSpread,
        rateAdjustment,
        termWeeks,
        paidPeriods,
        periodsRemaining,
        originalPrincipal,
        principalPaid,
        interestPaid,
        remainingPrincipal,
        remainingToPay,
        weeklyMinimum,
        lateCount,
        lateFees,
        domesticRemaining,
        domesticWeeklyMinimum,
        domesticLateFees,
        progressPercent: Math.min(100, Math.max(0, (paidPeriods / Math.max(1, termWeeks)) * 100))
      };
      metrics.paymentHistory = buildLiabilityPaymentHistory(loan, metrics, index);
      return metrics;
    };
    const liabilityDetails = data.loans.map(buildLiabilityMetrics);
    const totalLoanAmount = liabilityDetails.reduce((sum, loan) => sum + loan.domesticRemaining, 0);
    const totalWeeklyMinimum = liabilityDetails.reduce((sum, loan) => sum + loan.domesticWeeklyMinimum, 0);
    const totalLateFees = liabilityDetails.reduce((sum, loan) => sum + loan.domesticLateFees, 0);
    const totalRemainingToPay = liabilityDetails.reduce((sum, loan) => sum + convertAdminTerminalCurrencyAmount(loan.remainingToPay, loan.localCode, domesticMeta.code), 0);
    const weightedDebtApr = liabilityDetails.length ? liabilityDetails.reduce((sum, loan) => sum + loan.variableApr * loan.domesticRemaining, 0) / Math.max(1, totalLoanAmount) : 0;
    const weightedAprFloor = liabilityDetails.length ? liabilityDetails.reduce((sum, loan) => sum + loan.aprFloor * loan.domesticRemaining, 0) / Math.max(1, totalLoanAmount) : 0;
    const weightedAprCeiling = liabilityDetails.length ? liabilityDetails.reduce((sum, loan) => sum + loan.aprCeiling * loan.domesticRemaining, 0) / Math.max(1, totalLoanAmount) : 0;
    const debtApr = liabilityDetails.length ? `${weightedDebtApr.toFixed(2)}% APR` : "0.00% APR";
    const debtAprRange = liabilityDetails.length ? `${weightedAprFloor.toFixed(2)}–${weightedAprCeiling.toFixed(2)}% range` : "0.00–0.00% range";
    const aprRangeSpread = Math.max(0.01, weightedAprCeiling - weightedAprFloor);
    const weightedAprPosition = liabilityDetails.length ? Math.min(100, Math.max(0, ((weightedDebtApr - weightedAprFloor) / aprRangeSpread) * 100)) : 0;
    const lateLiabilityCount = liabilityDetails.filter((loan) => Number(loan.lateFees || 0) > 0 || Number(loan.lateCount || 0) > 0).length;
    const weightedAprBandLabel = weightedAprPosition < 34 ? "Lower band" : weightedAprPosition < 67 ? "Mid band" : "Upper band";
    const stockDetails = data.stocks.map((stock, index) => {
      const value = readMoney(stock.value);
      const sharesMatch = String(stock.meta || "").match(/(\d+)\s+shares?/i);
      const shares = Number(stock.shares || sharesMatch?.[1] || (index + 3));
      const avgPrice = Number(stock.avgPrice || Math.max(8, (value / Math.max(1, shares)) * (0.86 + (index % 3) * 0.04)));
      const currentPrice = Number(stock.currentPrice || Math.max(8, value / Math.max(1, shares)));
      const gainValue = (currentPrice - avgPrice) * shares;
      const gainPct = avgPrice ? ((currentPrice - avgPrice) / avgPrice) * 100 : 0;
      const country = stock.country || ["Northreach", "Yrethia", "Solvend", "Eldoran", "Valerion"][index % 5];
      return { ...stock, shares, avgPrice, currentPrice, gainValue, gainPct, country };
    });
    const totalPortfolioValue = stockDetails.reduce((sum, stock) => sum + readMoney(stock.value), 0);
    const totalUnrealized = stockDetails.reduce((sum, stock) => sum + Number(stock.gainValue || 0), 0);
    const totalCashflow = data.assets.reduce((sum, asset, index) => {
      const cashflowMatch = String(asset.meta || "").match(/cashflow\s*\+?([0-9,.]+)/i);
      return sum + Number(String(cashflowMatch?.[1] || (asset.category === "Businesses" ? 65 + index * 35 : asset.category === "Real Estate" ? 24 + index * 16 : 0)).replace(/,/g, ""));
    }, 0);
    const currencyEntries = data.currencies.map((currency) => ({
      type: "currency",
      category: "Currency Reserve",
      title: currency.name,
      label: currency.code,
      value: currency.value,
      note: `${currency.country} reserve balance`,
      symbolKey: currency.symbolKey
    }));
    const inventoryDetails = data.inventory.map((item, index) => {
      const quantity = Math.max(1, Number(item.quantity || item.qty || String(item.meta || "").match(/(\d+)\s+owned/i)?.[1] || 1));
      const unitValue = Number(item.unitValue || item.pricePaid || Math.max(25, (index + 1) * 40 + Number(player.rank || 1) * 5));
      const totalValue = Number(item.totalValue || Math.max(0, unitValue * quantity));
      const statusText = item.status || (item.locked ? "Locked" : item.usable ? "Usable" : item.tradable ? "Tradable" : "Held");
      const normalizedCategory = String(item.category || "Inventory").replace(/s$/i, "");
      return {
        ...item,
        index,
        quantity,
        unitValue,
        totalValue,
        statusText,
        normalizedCategory,
        typeLabel: item.type || normalizedCategory,
        sourceLabel: item.source || "Player inventory",
        image: item.image || "https://img.magnific.com/free-vector/game-futuristic-boxes-future-technology-chests_107791-18260.jpg"
      };
    });
    const inventoryUnitCount = inventoryDetails.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const inventoryTotalValue = inventoryDetails.reduce((sum, item) => sum + Number(item.totalValue || 0), 0);
    const usableInventoryCount = inventoryDetails.filter((item) => item.usable || /usable|active|assigned/i.test(item.statusText)).length;
    const tradableInventoryCount = inventoryDetails.filter((item) => item.tradable || /tradable/i.test(item.statusText)).length;
    const lockedInventoryCount = inventoryDetails.filter((item) => item.locked || /locked|assigned/i.test(item.statusText)).length;
    const inventoryCategoryCounts = inventoryDetails.reduce((map, item) => {
      const key = item.normalizedCategory || "Inventory";
      map[key] = (map[key] || 0) + Number(item.quantity || 0);
      return map;
    }, {});
    const largestInventoryCategory = Object.entries(inventoryCategoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "None";
    const normalizePlayerLogType = (entry) => String(entry.type || entry.category || "activity")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "activity";
    const playerLogToneMap = Object.freeze({
      security: "security",
      access: "security",
      attendance: "attendance",
      inventory: "inventory",
      store: "inventory",
      contract: "contract",
      contracts: "contract",
      finance: "finance",
      financial: "finance",
      portfolio: "finance",
      trade: "finance",
      liability: "liability",
      liabilities: "liability",
      admin: "admin",
      settings: "admin"
    });
    const buildPlayerAuditLog = (entry, index) => {
      const typeKey = normalizePlayerLogType(entry);
      const tone = playerLogToneMap[typeKey] || playerLogToneMap[String(entry.category || "").toLowerCase()] || "activity";
      const priceValue = readMoney(entry.price || entry.amount || 0);
      const hasCashImpact = Math.abs(priceValue) > 0;
      const severity = entry.severity || (tone === "liability" || tone === "admin" ? "Review" : "Info");
      const eventId = entry.eventId || `PL-${String(player.id || player.rank || "00").replace(/[^0-9A-Za-z]/g, "").slice(-4) || "0000"}-${String(index + 1).padStart(3, "0")}`;
      return {
        ...entry,
        index,
        typeKey,
        tone,
        severity,
        eventId,
        priceValue,
        hasCashImpact,
        actor: entry.actor || player.name || "Player",
        source: entry.source || "Player record",
        location: entry.location || player.location || "Simulation",
        item: entry.item || String(entry.detail || "").replace(/^(Bought|Player entered|Market intel token consumed for|Operating loan balance|Harbor kiosk generated|Submitted partial evidence for)\s*/i, "").replace(/\.$/, "") || "—",
        before: entry.before || "—",
        after: entry.after || "—",
        impactLabel: entry.impact || (hasCashImpact ? "Financial" : tone === "inventory" ? "Inventory" : tone === "attendance" ? "Attendance" : "Record"),
        exchangeContext: entry.exchangeContext || entry.context || `${entry.actor || player.name || "Player"} triggered this ${String(entry.category || entry.type || "activity").toLowerCase()} event through ${entry.source || "the player record"}. The record moved from ${entry.before || "—"} to ${entry.after || "—"}.`
      };
    };
    const playerLogDetails = recentLogs.map(buildPlayerAuditLog);
    const manualPlayerLogCount = playerLogDetails.filter((entry) => !/^system$/i.test(entry.actor || "") && !/^scanner$/i.test(entry.actor || "")).length;
    const financialPlayerLogCount = playerLogDetails.filter((entry) => entry.hasCashImpact || ["finance", "liability"].includes(entry.tone)).length;
    const inventoryPlayerLogCount = playerLogDetails.filter((entry) => entry.tone === "inventory").length;
    const reviewPlayerLogCount = playerLogDetails.filter((entry) => /review|warning|attention|high/i.test(entry.severity || "")).length;
    const selectedPlayerLog = playerLogDetails[0] || {
      eventId: "—",
      title: "No selected event",
      detail: "No player actions recorded yet.",
      date: "—",
      time: "—",
      tone: "activity",
      severity: "Empty",
      actor: "—",
      source: "—",
      location: player.location || "—",
      item: "—",
      before: "—",
      after: "—",
      impactLabel: "None",
      priceValue: 0,
      hasCashImpact: false
    };
    const renderPlayerLogMetric = (label, value, note, tone = "") => `
      <article class="admin-terminal-player-log-metric-v463 ${tone ? `is-${tone}` : ""}">
        <small>${escapeHtml(label)}</small>
        <strong>${escapeHtml(String(value))}</strong>
        <span>${escapeHtml(note)}</span>
      </article>`;
    const renderPlayerLogImpact = (entry) => entry.hasCashImpact
      ? `<strong class="${entry.priceValue >= 0 ? "is-signed-positive" : "is-signed-negative"}">${renderSignedPlayerCurrencyAmount(entry.priceValue, player)}</strong>`
      : `<span>${escapeHtml(entry.impactLabel || "No cash impact")}</span>`;
    const renderPlayerAuditLogRow = (entry) => `
      <article class="admin-terminal-player-audit-log-row-v463 is-${escapeHtml(entry.tone)}" data-player-log-type="${escapeHtml(entry.tone)}" data-player-log-id="${escapeHtml(entry.eventId)}">
        <time datetime="${escapeHtml(`${entry.date || ""}T${entry.time || "00:00"}`)}"><span>${escapeHtml(entry.date || "—")}</span><b>${escapeHtml(entry.time || "—")}</b></time>
        <i>${escapeHtml(String(entry.category || entry.typeKey || "Activity"))}</i>
        <div>
          <strong>${escapeHtml(entry.title || "Player action")}</strong>
          <span>${escapeHtml(entry.detail || "No detail provided.")}</span>
          <small>${escapeHtml(entry.eventId)} · ${escapeHtml(entry.actor)} via ${escapeHtml(entry.source)}</small>
        </div>
        <mark class="is-${escapeHtml(String(entry.severity || "info").toLowerCase())}">${escapeHtml(entry.severity || "Info")}</mark>
        <em>${renderPlayerLogImpact(entry)}</em>
        <button type="button" data-admin-terminal-action="open-player-log-detail">View</button>
      </article>`;
    const renderPlayerLogDetail = (entry) => `
      <aside class="admin-terminal-player-log-detail-v463 is-${escapeHtml(entry.tone)}" aria-label="Selected player log detail">
        <header>
          <span>Selected event</span>
          <strong>${escapeHtml(entry.title || "Player action")}</strong>
          <em>${escapeHtml(entry.eventId || "—")}</em>
        </header>
        <p>${escapeHtml(entry.detail || "No detail provided.")}</p>
        <dl>
          <div><dt>Time</dt><dd>${escapeHtml(entry.date || "—")} · ${escapeHtml(entry.time || "—")}</dd></div>
          <div><dt>Actor</dt><dd>${escapeHtml(entry.actor || "—")}</dd></div>
          <div><dt>Source</dt><dd>${escapeHtml(entry.source || "—")}</dd></div>
          <div><dt>Location</dt><dd>${escapeHtml(entry.location || "—")}</dd></div>
          <div><dt>Interacted item</dt><dd>${escapeHtml(entry.item || "—")}</dd></div>
          <div><dt>Impact</dt><dd>${renderPlayerLogImpact(entry)}</dd></div>
        </dl>
        <section aria-label="Before and after values">
          <article><span>Before</span><b>${escapeHtml(entry.before || "—")}</b></article>
          <article><span>After</span><b>${escapeHtml(entry.after || "—")}</b></article>
        </section>
        <footer>
          <button type="button" data-admin-terminal-action="copy-player-log-id">Copy ID</button>
          <button type="button" data-admin-terminal-action="flag-player-log-event">Flag</button>
        </footer>
      </aside>`;
    const renderDrawerTabButton = (key, label, active = false) => `
      <button type="button" class="${active ? "active" : ""}" data-admin-terminal-action="select-player-drawer-tab" data-player-drawer-tab="${escapeHtml(key)}" role="tab" aria-selected="${active ? "true" : "false"}">${escapeHtml(label)}</button>`;
    const renderRateChip = (label, value, tone = "") => {
      const normalizedLabel = String(label || "").toLowerCase();
      const normalizedValue = String(value || "").toLowerCase();
      const rateTone = normalizedLabel.includes("apr") || normalizedValue.includes("apr")
        ? "is-apr"
        : normalizedLabel.includes("apy") || normalizedValue.includes("apy") || normalizedLabel.includes("yield")
          ? "is-apy"
          : "";
      return `<em class="admin-terminal-player-rate-chip-v303 ${tone} ${rateTone}"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></em>`;
    };
    const renderMoneyRiskRows = () => `
      <div class="admin-terminal-player-account-stack-v301 admin-terminal-player-money-risk-v303">
        <article class="admin-terminal-player-account-row-v301 admin-terminal-player-account-row-v303">
          <div><small>Checking</small><strong>${renderPlayerCurrencyAmount(checkingAccountBalance, player)}</strong></div>
          ${renderRateChip("Yield", checkingApy)}
        </article>
        <article class="admin-terminal-player-account-row-v301 admin-terminal-player-account-row-v303">
          <div><small>Savings</small><strong>${renderPlayerCurrencyAmount(savingsAccountBalance, player)}</strong></div>
          ${renderRateChip("Yield", savingsApy)}
        </article>
        <article class="admin-terminal-player-account-row-v301 admin-terminal-player-account-row-v303 ${data.loans.length ? "is-warning" : ""}">
          <div><small>Debt</small><strong>${data.loans.length ? renderPlayerCurrencyAmount(totalLoanAmount, player, domesticMeta.code) : "None"}</strong><span>${data.loans.length ? "Outstanding loan exposure" : "No loan records"}</span></div>
          ${renderRateChip("Rate", debtApr, data.loans.length ? "is-warning" : "")}
        </article>
      </div>`;
    const renderHoldingSummaryIcon = (type) => {
      const icons = {
        stocks: './assets/icons/holding-stock-shares.svg',
        businesses: './assets/icons/holding-businesses.svg',
        realEstate: './assets/icons/holding-real-estate.svg'
      };
      const src = icons[type] || icons.stocks;
      const alt = type === 'stocks' ? 'Stock shares' : type === 'businesses' ? 'Businesses' : 'Real estate';
      return `<img src="${src}" alt="${alt}">`;
    };
    const renderCompactList = (items, emptyMessage, renderItem) => items.length ? items.map(renderItem).join("") : renderPlayerEmptyState(emptyMessage);
    const formatSigned = (value) => {
      const numeric = Number(value || 0);
      const sign = numeric > 0 ? "+" : numeric < 0 ? "−" : "";
      return `${sign}$${Math.abs(numeric).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };
    const formatPct = (value) => `${Number(value || 0) >= 0 ? "+" : ""}${Number(value || 0).toFixed(1)}%`;
    const buildExposureEntries = (items, key) => {
      const grouped = new Map();
      items.forEach((item) => {
        const label = String(item[key] || "Other");
        const current = grouped.get(label) || { label, value: 0 };
        current.value += readMoney(item.value);
        grouped.set(label, current);
      });
      const total = Array.from(grouped.values()).reduce((sum, entry) => sum + entry.value, 0) || 1;
      return Array.from(grouped.values()).sort((a, b) => b.value - a.value).map((entry) => ({ ...entry, pct: Math.round((entry.value / total) * 100) }));
    };
    const industryExposure = buildExposureEntries(stockDetails, "category");
    const countryExposure = buildExposureEntries(stockDetails, "country");
    return `
      <section class="admin-terminal-player-drawer-tabs-v301 admin-terminal-player-drawer-tabs-v303" data-admin-terminal-player-drawer aria-label="Player drawer tabs">
        <div class="admin-terminal-player-tablist-v301" role="tablist" aria-label="Player record sections">
          ${renderDrawerTabButton("overview", "Overview", true)}
          ${renderDrawerTabButton("bank", "Bank Accounts")}
          ${renderDrawerTabButton("assets", "Assets")}
          ${renderDrawerTabButton("liabilities", "Liabilities")}
          ${renderDrawerTabButton("inventory", "Inventory")}
          ${renderDrawerTabButton("logs", "Logs")}
        </div>
        <div class="admin-terminal-player-tab-panels-v301">
          <section class="admin-terminal-player-tab-panel-v301 is-active" data-player-drawer-panel="overview" role="tabpanel">
            <div class="admin-terminal-player-overview-grid-v301 admin-terminal-player-overview-grid-v303">
              <section class="admin-terminal-player-drawer-card-v301 is-account" aria-label="Account overview">
                <header>
                  <div><span>Account</span><strong>Money and risk</strong></div>
                  <em>${data.loans.length ? `${data.loans.length} loans` : "Clear"}</em>
                </header>
                ${renderMoneyRiskRows()}
              </section>
              <section class="admin-terminal-player-drawer-card-v301" aria-label="Holdings overview">
                <header>
                  <div><span>Assets</span><strong>Holdings and yield</strong></div>
                  <em>${escapeHtml(stockDetails.length + businessAssets.length + realEstateAssets.length)} records</em>
                </header>
                <div class="admin-terminal-player-holding-summary-v303">
                  <article><b>${renderHoldingSummaryIcon("stocks")}</b><strong>${escapeHtml(stockDetails.reduce((sum, stock) => sum + Number(stock.shares || 0), 0))}</strong><span>Stock shares</span></article>
                  <article><b>${renderHoldingSummaryIcon("businesses")}</b><strong>${escapeHtml(businessAssets.length)}</strong><span>Businesses</span></article>
                  <article><b>${renderHoldingSummaryIcon("realEstate")}</b><strong>${escapeHtml(realEstateAssets.length)}</strong><span>Real estate</span></article>
                </div>
                <div class="admin-terminal-player-yield-strip-v303">
                  <article><small>Unrealized gain / loss</small><strong class="${totalUnrealized >= 0 ? "is-positive is-signed-positive" : "is-negative is-signed-negative"}">${renderSignedPlayerCurrencyAmount(totalUnrealized, player)}</strong></article>
                  <article><small>Cashflow</small><strong class="${totalCashflow >= 0 ? "is-positive is-signed-positive" : "is-negative is-signed-negative"}">${renderSignedPlayerCurrencyAmount(totalCashflow, player)}/day</strong></article>
                  <article><small>Portfolio value</small><strong class="is-portfolio">${renderPlayerCurrencyAmount(totalPortfolioValue || player.portfolioValue || "—", player)}</strong></article>
                </div>
              </section>
            </div>
          </section>
          <section class="admin-terminal-player-tab-panel-v301" data-player-drawer-panel="bank" role="tabpanel" hidden>
            <section class="admin-terminal-player-drawer-card-v301" aria-label="Bank account records">
              <header>
                <div><span>Bank Accounts</span><strong>Checking, savings, and reserves</strong></div>
                <em>${escapeHtml(currencyEntries.length + 2)} records</em>
              </header>
              <div class="admin-terminal-player-bank-primary-grid-v303">
                <article class="admin-terminal-player-bank-primary-card-v303">
                  <i aria-hidden="true"><img src="./assets/icons/bank-checking.svg" alt="" loading="lazy" decoding="async" /></i>
                  <div><small>Checking</small><strong>${renderPlayerCurrencyAmount(checkingAccountBalance, player)}</strong></div>
                  ${renderRateChip("Yield", checkingApy)}
                </article>
                <article class="admin-terminal-player-bank-primary-card-v303">
                  <i aria-hidden="true"><img src="./assets/icons/bank-savings.svg" alt="" loading="lazy" decoding="async" /></i>
                  <div><small>Savings</small><strong>${renderPlayerCurrencyAmount(savingsAccountBalance, player)}</strong></div>
                  ${renderRateChip("Yield", savingsApy)}
                </article>
              </div>
              <div class="admin-terminal-player-currency-grid-v303">
                ${renderCompactList(currencyEntries, "No currency reserves recorded.", (entry) => `
                  <article class="admin-terminal-player-currency-card-v303">
                    <i aria-hidden="true">${renderBankCurrencySymbol(entry.symbolKey)}</i>
                    <div><small>${escapeHtml(entry.label)}</small><strong>${escapeHtml(entry.title)}</strong><span>${escapeHtml(entry.note)}</span></div>
                    <b>${renderPlayerCurrencyReserveAmount(entry.value, player, entry.label)}</b>
                  </article>`)}
              </div>
              <p class="admin-terminal-player-normalized-note-v303">Currency reserves keep their original currency. The ≈ line shows the rough domestic value: ${escapeHtml(domesticMeta.name)} (${escapeHtml(domesticMeta.code)}).</p>
            </section>
          </section>
          <section class="admin-terminal-player-tab-panel-v301" data-player-drawer-panel="assets" role="tabpanel" hidden>
            <div class="admin-terminal-player-assets-layout-v303">
              <section class="admin-terminal-player-drawer-card-v301" aria-label="Portfolio exposure">
                <header>
                  <div><span>Portfolio</span><strong>Diversification split</strong></div>
                  <em>Total ${renderPlayerCurrencyAmount(totalPortfolioValue || player.portfolioValue || "—", player)}</em>
                </header>
                <div class="admin-terminal-player-portfolio-dashboard-v303">
                  ${renderPlayerPortfolioDiversification(stockDetails, player)}
                  <div class="admin-terminal-player-exposure-grid-v303">
                    <section><h4>Industry exposure</h4>${renderCompactList(industryExposure, "No industry exposure.", (entry) => `<p><span>${escapeHtml(entry.label)}</span><b>${escapeHtml(entry.pct)}%</b></p>`)}</section>
                    <section><h4>Country exposure</h4>${renderCompactList(countryExposure, "No country exposure.", (entry) => `<p><span>${escapeHtml(entry.label)}</span><b>${escapeHtml(entry.pct)}%</b></p>`)}</section>
                  </div>
                </div>
                <div class="admin-terminal-player-stock-table-v303">
                  ${renderCompactList(stockDetails, "No stock positions yet.", (stock) => `
                    <article class="admin-terminal-player-stock-row-v303">
                      <i>${escapeHtml(stock.symbol)}</i>
                      <div class="admin-terminal-player-stock-identity-v435">
                        <small>${escapeHtml(stock.category)} · ${escapeHtml(stock.country)}</small>
                        <strong>${escapeHtml(stock.title)}</strong>
                        <span>${escapeHtml(stock.shares)} shares</span>
                      </div>
                      <div class="admin-terminal-player-stock-price-grid-v435" aria-label="Price details">
                        <p><span>Avg price</span><strong>${renderPlayerCurrencyAmount(stock.avgPrice, player)}</strong></p>
                        <p><span>Current</span><strong>${renderPlayerCurrencyAmount(stock.currentPrice, player)}</strong></p>
                      </div>
                      <b class="admin-terminal-player-stock-return-v435 ${stock.gainValue >= 0 ? "is-positive is-signed-positive" : "is-negative is-signed-negative"}">
                        <small>Return</small>
                        ${renderSignedPlayerCurrencyAmount(stock.gainValue, player)}
                        <em>${escapeHtml(formatPct(stock.gainPct))}</em>
                      </b>
                    </article>`)}
                </div>
              </section>
              <section class="admin-terminal-player-drawer-card-v301" aria-label="Businesses and real estate assets">
                <header>
                  <div><span>Owned Assets</span><strong>Businesses and real estate</strong></div>
                  <em>${escapeHtml(data.assets.length)} visible</em>
                </header>
                <div class="admin-terminal-player-asset-card-list-v303">
                  ${renderCompactList(data.assets, "No businesses or real estate owned yet.", (item, index) => {
                    const cashflowMatch = String(item.meta || "").match(/cashflow\s*\+?([0-9,.]+)/i);
                    const cashflow = Number(String(cashflowMatch?.[1] || (item.category === "Businesses" ? 65 + index * 35 : 18 + index * 12)).replace(/,/g, ""));
                    const value = item.value || Math.max(450, cashflow * 42).toLocaleString();
                    const assetImageUrl = getPlayerAssetImageUrl(item);
                    const assetImageMarkup = assetImageUrl
                      ? `<img src="${escapeHtml(assetImageUrl)}" alt="" loading="lazy" decoding="async">`
                      : escapeHtml(item.category === "Businesses" ? "▣" : "⌂");
                    return `
                    <details class="admin-terminal-player-business-card-v303">
                      <summary>
                        <span class="admin-terminal-player-business-image-v303" aria-hidden="true">${assetImageMarkup}</span>
                        <div><small>${escapeHtml(item.category)}</small><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.meta)}</span></div>
                        <b>⌄</b>
                      </summary>
                      <div class="admin-terminal-player-business-detail-v303">
                        <p><span>Value</span><strong>${renderCurrencyAmount(value, "USD")}</strong></p>
                        <p><span>Cashflow</span><strong class="${cashflow >= 0 ? "is-signed-positive" : "is-signed-negative"}">${escapeHtml(formatSigned(cashflow))}/day</strong></p>
                        <p><span>Status</span><strong>Active</strong></p>
                      </div>
                    </details>`;})}
                </div>
              </section>
            </div>
          </section>
          <section class="admin-terminal-player-tab-panel-v301" data-player-drawer-panel="liabilities" role="tabpanel" hidden>
            <section class="admin-terminal-player-drawer-card-v301 is-liability" aria-label="Liability records">
              <header>
                <div><span>Liabilities</span><strong>Debt and risk exposure</strong></div>
                <em>${data.loans.length ? `${data.loans.length} loans` : "Clear"}</em>
              </header>
              <div class="admin-terminal-player-liability-layout-v303">
                <aside class="admin-terminal-player-liability-overview-v303 is-v456-overview-dashboard" aria-label="Current liabilities overview">
                  <header class="admin-terminal-player-liability-hero-v456">
                    <span>Current liabilities</span>
                    <b>${liabilityDetails.length ? renderLiabilityMoney(totalRemainingToPay, domesticMeta.code) : "None"}</b>
                  </header>
                  <section class="admin-terminal-player-liability-kpis-v456" aria-label="Current liability summary metrics">
                    <div><span>Loans</span><b>${escapeHtml(String(liabilityDetails.length))}</b></div>
                    <div><span>Weekly min</span><b>${liabilityDetails.length ? renderLiabilityMoney(totalWeeklyMinimum, domesticMeta.code) : "—"}</b></div>
                    <div><span>Principal</span><b>${liabilityDetails.length ? renderLiabilityMoney(totalLoanAmount, domesticMeta.code) : "—"}</b></div>
                    <div><span>Late fees</span><b>${liabilityDetails.length ? renderLiabilityMoney(totalLateFees, domesticMeta.code) : "—"}</b></div>
                  </section>
                  <section class="admin-terminal-player-liability-apr-card-v456" aria-label="Weighted variable APR range">
                    <header><span>Variable APR position</span><b class="admin-terminal-weighted-apr-value is-rate-apr">${escapeHtml(debtApr)}</b></header>
                    <p>${escapeHtml(debtAprRange)} · ${escapeHtml(weightedAprBandLabel)} · ${weightedAprPosition.toFixed(0)}% through range</p>
                    <div class="admin-terminal-player-liability-apr-track-v456"><i style="--liability-rate-position:${weightedAprPosition.toFixed(1)}%"></i></div>
                    <footer><span>Floor ${weightedAprFloor.toFixed(2)}%</span><span>Ceiling ${weightedAprCeiling.toFixed(2)}%</span></footer>
                  </section>
                </aside>
                <div class="admin-terminal-player-liability-list-v303">
                  ${renderCompactList(liabilityDetails, "No loans or liabilities recorded.", (loan) => {
                    const rateBasis = `${loan.locationRate.baseRate.toFixed(2)}% ${loan.locationRate.label} base + ${loan.riskSpread.toFixed(2)}% risk spread${loan.rateAdjustment ? ` + ${loan.rateAdjustment.toFixed(2)}% variable adjustment` : ""}`;
                    const rateRange = `${loan.aprFloor.toFixed(2)}–${loan.aprCeiling.toFixed(2)}% APR range`;
                    return `
                    <details class="admin-terminal-player-liability-row-v303">
                      <summary>
                        <div><small><mark>Debt</mark>${escapeHtml(loan.locationRate.label)} · ${escapeHtml(loan.localCode)} · variable rate</small><strong>${escapeHtml(loan.label)}</strong><span>${escapeHtml(loan.variableApr.toFixed(2))}% APR · ${renderLiabilityMoney(loan.weeklyMinimum, loan.localCode)} / week minimum</span></div>
                        <b>${renderLiabilityMoney(loan.remainingToPay, loan.localCode)}<small>remaining to pay</small></b>
                      </summary>
                      <div class="admin-terminal-player-liability-detail-v303">
                        <section class="admin-terminal-player-liability-snapshot-v453">
                          <article class="is-due"><small>Remaining to pay</small><strong>${renderLiabilityMoney(loan.remainingToPay, loan.localCode)}</strong><span>Includes projected interest and late fees</span></article>
                          <article><small>Weekly minimum</small><strong>${renderLiabilityMoney(loan.weeklyMinimum, loan.localCode)}</strong><span>${escapeHtml(loan.variableApr.toFixed(2))}% variable APR</span></article>
                          <article><small>Payment progress</small><strong>${escapeHtml(String(loan.paidPeriods))} / ${escapeHtml(String(loan.termWeeks))}</strong><span>${escapeHtml(String(loan.periodsRemaining))} periods left</span></article>
                        </section>
                        <section class="admin-terminal-player-liability-progress-v453" aria-label="Loan payment progress">
                          <div><span style="--liability-progress:${loan.progressPercent.toFixed(1)}%"></span></div>
                          <p><b>${escapeHtml(loan.progressPercent.toFixed(0))}% paid by period count</b><em>${escapeHtml(String(loan.periodsRemaining))} weeks remaining</em></p>
                        </section>
                        <section class="admin-terminal-player-liability-rate-range-v454" aria-label="Variable interest range for ${escapeHtml(loan.label)}">
                          <header><small>Variable interest range</small><strong>${escapeHtml(loan.variableApr.toFixed(2))}% APR</strong><span>${escapeHtml(rateRange)} · ${escapeHtml(loan.aprBandLabel)}</span></header>
                          <div><span style="--liability-rate-position:${loan.aprRangePosition.toFixed(1)}%"></span></div>
                          <footer><span>Floor ${escapeHtml(loan.aprFloor.toFixed(2))}%</span><b>Current ${escapeHtml(loan.aprRangePosition.toFixed(0))}% through range</b><span>Ceiling ${escapeHtml(loan.aprCeiling.toFixed(2))}%</span></footer>
                        </section>
                        <section class="admin-terminal-player-liability-breakdown-v453" aria-label="Loan cost breakdown">
                          <article><small>Principal</small><strong>${renderLiabilityMoney(loan.remainingPrincipal, loan.localCode)}</strong><span>Original ${renderLiabilityMoney(loan.originalPrincipal, loan.localCode)}</span></article>
                          <article><small>Paid to date</small><strong>${renderLiabilityMoney(loan.principalPaid, loan.localCode)}</strong><span>Principal paid</span></article>
                          <article><small>Interest paid</small><strong>${renderLiabilityMoney(loan.interestPaid, loan.localCode)}</strong><span>${escapeHtml(rateBasis)}</span></article>
                          <article><small>Late fees</small><strong>${renderLiabilityMoney(loan.lateFees, loan.localCode)}</strong><span>${escapeHtml(String(loan.lateCount))} late period${loan.lateCount === 1 ? "" : "s"}</span></article>
                        </section>
                        <section class="admin-terminal-player-liability-history-v452 is-v453-clean" aria-label="Payment history for ${escapeHtml(loan.label)}">
                          <header><span>Date / status</span><b>Principal</b><b>Interest</b><b>Fees</b></header>
                          ${loan.paymentHistory.map((payment) => `<article class="${payment.status === "Late" ? "is-late" : ""}"><span><em>${escapeHtml(payment.date)}</em><strong>${escapeHtml(payment.status)}</strong></span><b>${renderLiabilityMoney(payment.principal, loan.localCode)}</b><b>${renderLiabilityMoney(payment.interest, loan.localCode)}</b><b>${renderLiabilityMoney(payment.fee, loan.localCode)}</b></article>`).join("")}
                        </section>
                      </div>
                    </details>`;})}
                </div>
              </div>
            </section>
          </section>
          <section class="admin-terminal-player-tab-panel-v301" data-player-drawer-panel="inventory" role="tabpanel" hidden>
            <section class="admin-terminal-player-drawer-card-v301 admin-terminal-player-inventory-dashboard-v459" aria-label="Inventory overview and item holdings">
              <header>
                <div><span>Inventory</span><strong>Current item holdings</strong></div>
                <em>${inventoryDetails.length ? `${inventoryDetails.length} records · ${inventoryUnitCount} units` : "Empty"}</em>
              </header>
              <div class="admin-terminal-player-inventory-layout-v459">
                <aside class="admin-terminal-player-inventory-overview-v459" aria-label="Inventory overview">
                  <header>
                    <span>Inventory value</span>
                    <b>${inventoryDetails.length ? renderPlayerCurrencyAmount(inventoryTotalValue, player) : "None"}</b>
                    <small>${escapeHtml(String(inventoryUnitCount))} units across ${escapeHtml(String(inventoryDetails.length))} records</small>
                  </header>
                  <section aria-label="Inventory status counts">
                    <article><span>Usable</span><b>${escapeHtml(String(usableInventoryCount))}</b></article>
                    <article><span>Tradable</span><b>${escapeHtml(String(tradableInventoryCount))}</b></article>
                    <article><span>Locked</span><b>${escapeHtml(String(lockedInventoryCount))}</b></article>
                    <article><span>Top type</span><b>${escapeHtml(largestInventoryCategory)}</b></article>
                  </section>
                  <p>Sample item images are pulled from Magnific stock assets for inventory UI testing.</p>
                </aside>
                <div class="admin-terminal-player-inventory-table-v459" aria-label="Inventory holdings table">
                  <div class="admin-terminal-player-inventory-head-v459" aria-hidden="true"><span>Item</span><span>Type</span><span>Qty</span><span>Unit value</span><span>Total</span><span>Status</span></div>
                  ${renderCompactList(inventoryDetails, "No inventory items owned.", (item) => `
                    <details class="admin-terminal-player-inventory-row-v459">
                      <summary>
                        <div class="admin-terminal-player-inventory-item-v459">
                          <figure><img src="${escapeHtml(item.image)}" alt="" loading="lazy"></figure>
                          <div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.sourceLabel)}</small></div>
                        </div>
                        <span>${escapeHtml(item.typeLabel)}</span>
                        <b>${escapeHtml(String(item.quantity))}</b>
                        <em>${renderPlayerCurrencyAmount(item.unitValue, player)}</em>
                        <em>${renderPlayerCurrencyAmount(item.totalValue, player)}</em>
                        <mark class="${item.locked ? "is-locked" : item.tradable ? "is-tradable" : item.usable ? "is-usable" : ""}">${escapeHtml(item.statusText)}</mark>
                        <i>⌄</i>
                      </summary>
                      <div class="admin-terminal-player-inventory-detail-v459">
                        <p><span>Use state</span><strong>${escapeHtml(item.usable ? "Usable" : "Not directly usable")}</strong></p>
                        <p><span>Trade state</span><strong>${escapeHtml(item.tradable ? "Tradable" : "Restricted")}</strong></p>
                        <p><span>Storage</span><strong>${escapeHtml(item.locked ? "Locked / assigned" : "Player-held")}</strong></p>
                        <p><span>Note</span><strong>${escapeHtml(item.note || item.meta || "Inventory record")}</strong></p>
                      </div>
                    </details>`)}
                </div>
              </div>
            </section>
          </section>
          <section class="admin-terminal-player-tab-panel-v301" data-player-drawer-panel="logs" role="tabpanel" hidden>
            <section class="admin-terminal-player-drawer-card-v301 admin-terminal-player-logs-simple-v464" aria-label="Player log">
              <header>
                <div><span>Player Log</span><strong>Latest actions</strong></div>
                <em>${playerLogDetails.length ? `${playerLogDetails.length} shown` : "Empty"}</em>
              </header>
              <div class="admin-terminal-player-log-table-v303 admin-terminal-player-log-table-v464" data-player-log-list>
                <div class="admin-terminal-player-log-head-v303 admin-terminal-player-log-head-v464" aria-hidden="true"><span>Date</span><span>Time</span><span>Location</span><span>Action</span><span>Interacted item</span><span>Impact</span><span>View</span></div>
                ${playerLogDetails.length ? playerLogDetails.map((entry) => {
                  const impactText = entry.hasCashImpact ? `${entry.priceValue >= 0 ? "+" : "−"}${Math.abs(entry.priceValue).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${domesticMeta.code}` : (entry.impactLabel || "Record");
                  return `
                  <article class="admin-terminal-player-log-row-v303 admin-terminal-player-log-row-v464" data-log-date="${escapeHtml(entry.date || "")}" data-player-log-id="${escapeHtml(entry.eventId)}">
                    <span>${escapeHtml(entry.date || "—")}</span>
                    <span>${escapeHtml(entry.time || "—")}</span>
                    <span>${escapeHtml(entry.location || player.location || "—")}</span>
                    <strong>${escapeHtml(entry.title || entry.category || "Action")}</strong>
                    <span>${escapeHtml(entry.item || "—")}</span>
                    <b class="${entry.hasCashImpact ? (entry.priceValue >= 0 ? "is-signed-positive" : "is-signed-negative") : ""}">${entry.hasCashImpact ? renderSignedPlayerCurrencyAmount(entry.priceValue, player) : escapeHtml(entry.impactLabel || "Record")}</b>
                    <button type="button"
                      data-admin-terminal-action="open-player-log-detail"
                      data-log-event-id="${escapeHtml(entry.eventId || "—")}"
                      data-log-title="${escapeHtml(entry.title || entry.category || "Action")}"
                      data-log-detail="${escapeHtml(entry.detail || "No detail provided.")}"
                      data-log-date="${escapeHtml(entry.date || "—")}"
                      data-log-time="${escapeHtml(entry.time || "—")}"
                      data-log-actor="${escapeHtml(entry.actor || "—")}"
                      data-log-source="${escapeHtml(entry.source || "—")}"
                      data-log-location="${escapeHtml(entry.location || player.location || "—")}"
                      data-log-item="${escapeHtml(entry.item || "—")}"
                      data-log-before="${escapeHtml(entry.before || "—")}"
                      data-log-after="${escapeHtml(entry.after || "—")}"
                      data-log-impact="${escapeHtml(impactText)}"
                      data-log-severity="${escapeHtml(entry.severity || "Info")}"
                      data-log-context="${escapeHtml(entry.exchangeContext || "No additional context recorded.")}">View</button>
                  </article>`;}).join("") : renderPlayerEmptyState("No player actions recorded yet.", "logs")}
              </div>
            </section>
          </section>
        </div>
      </section>`;
  }
  function renderPlayersPage(model) {
    const players = getTerminalPlayerRows(model);
    const selectedRank = model?.selectedPlayerRank ?? null;
    const activeStatusFilter = normalizePlayerRosterStatusFilter(model?.playersStatusFilter || model?.playerStatusFilter || "all");
    const activeSearchFilter = normalizePlayersRosterSearch(model?.playersSearch || model?.playerRosterSearch || "");
    const statusFilteredPlayers = filterPlayersByRosterStatus(players, activeStatusFilter);
    const filteredPlayers = filterPlayersByRosterSearch(statusFilteredPlayers, activeSearchFilter);
    const onlineCount = players.filter((player) => isPlayerOnlineForRosterFilter(player)).length;
    const offlineCount = Math.max(0, players.length - onlineCount);
    const flaggedCount = players.filter((player) => isPlayerFlaggedForRosterFilter(player)).length;
    const allowedPageSizes = [10, 50, 100];
    const requestedPageSize = Number(model?.playersPerPage || 10);
    const playersPerPage = allowedPageSizes.includes(requestedPageSize) ? requestedPageSize : 10;
    const pageCount = Math.max(1, Math.ceil(filteredPlayers.length / playersPerPage));
    const requestedPage = Number(model?.playersPage || 1);
    const currentPage = Math.max(1, Math.min(pageCount, Number.isFinite(requestedPage) ? requestedPage : 1));
    const pageStartIndex = (currentPage - 1) * playersPerPage;
    const pageEndIndex = Math.min(filteredPlayers.length, pageStartIndex + playersPerPage);
    const visiblePlayers = filteredPlayers.slice(pageStartIndex, pageEndIndex);
    const emptyFilterCopy = activeSearchFilter
      ? "No players match this search and status filter."
      : activeStatusFilter === "online"
        ? "No online players match this filter."
        : activeStatusFilter === "offline"
          ? "No offline players match this filter."
          : activeStatusFilter === "flagged"
            ? "No flagged players match this filter."
            : "No players on this page.";
    return `
      <section class="admin-terminal-overview admin-terminal-players-page" aria-label="Admin players terminal" data-admin-terminal-page="Players">
        ${renderPlayersPageHeader(model)}
        <section class="admin-terminal-players-command" aria-label="Player filters">
          <label class="admin-terminal-players-search admin-terminal-players-v293-search">
            <span>Search roster</span>
            <input type="search" value="${escapeHtml(activeSearchFilter)}" placeholder="Name, player ID, or country" aria-label="Search roster by name, player ID, or country" data-admin-terminal-players-search />
          </label>
          <div class="admin-terminal-players-filter-row" aria-label="Player status filters">
            <button type="button" class="${activeStatusFilter === "all" ? "active" : ""}" data-admin-terminal-action="filter-players-all" aria-pressed="${activeStatusFilter === "all" ? "true" : "false"}">All ${escapeHtml(players.length)}</button>
            <button type="button" class="${activeStatusFilter === "online" ? "active" : ""}" data-admin-terminal-action="filter-players-online" aria-pressed="${activeStatusFilter === "online" ? "true" : "false"}">Online ${escapeHtml(onlineCount)}</button>
            <button type="button" class="${activeStatusFilter === "offline" ? "active" : ""}" data-admin-terminal-action="filter-players-offline" aria-pressed="${activeStatusFilter === "offline" ? "true" : "false"}">Offline ${escapeHtml(offlineCount)}</button>
            <button type="button" class="${activeStatusFilter === "flagged" ? "active" : ""}" data-admin-terminal-action="filter-players-flagged" aria-pressed="${activeStatusFilter === "flagged" ? "true" : "false"}">Flagged ${escapeHtml(flaggedCount)}</button>
          </div>
          <button class="admin-terminal-players-add admin-terminal-action is-good" type="button" data-admin-terminal-action="add-player">
            <span class="admin-terminal-action-rail" aria-hidden="true"></span>
            <span class="admin-terminal-action-mark" aria-hidden="true">${renderNavIcon("players")}</span>
            <span class="admin-terminal-action-copy">
              <strong>Add Player</strong>
              <small>ID + Access</small>
            </span>
            <span class="admin-terminal-action-arrow" aria-hidden="true">↗</span>
          </button>
        </section>
        <div class="admin-terminal-players-layout admin-terminal-players-accordion-layout">
          <section class="admin-terminal-players-roster admin-terminal-players-roster-full" aria-label="Player roster">
            <header>
              <div>
                <span>Roster</span>
                <h3>Player Control</h3>
              </div>
              <div class="admin-terminal-players-v232-roster-meta">
                <button class="admin-terminal-players-v237-classroom" type="button" data-admin-terminal-action="connect-google-classroom" aria-label="Connect Google Classroom" title="Connect Google Classroom">
                  <img src="./assets/icons/google-classroom-logo.svg" alt="" aria-hidden="true" loading="lazy" decoding="async" />
                  <span>Connect Google Classroom</span>
                </button>
                <button class="admin-terminal-players-v232-import" type="button" data-admin-terminal-action="import-roster-csv" aria-label="Import roster CSV" title="Import roster CSV">
                  <img src="./assets/images/csv-export-gold.png" alt="" aria-hidden="true" loading="lazy" decoding="async" />
                  <span>Import CSV</span>
                </button>
                <input type="file" accept=".csv,text/csv" hidden data-admin-terminal-roster-csv-input aria-label="Roster CSV file input">
              </div>
            </header>
            <div class="admin-terminal-players-v245-pagination" aria-label="Roster pagination controls">
              <div class="admin-terminal-players-v245-page-summary">
                <span>Roster range</span>
                <strong>Showing ${escapeHtml(filteredPlayers.length ? pageStartIndex + 1 : 0)}–${escapeHtml(pageEndIndex)} of ${escapeHtml(filteredPlayers.length)} players</strong>
              </div>
              <div class="admin-terminal-players-v245-controls">
                <div class="admin-terminal-players-v245-page-size" aria-label="Rows per page">
                  <span>Rows</span>
                  ${allowedPageSizes.map((size) => `<button type="button" class="${size === playersPerPage ? "active" : ""}" data-admin-terminal-action="players-page-size" data-player-page-size="${escapeHtml(size)}">${escapeHtml(size)}</button>`).join("")}
                </div>
                <button type="button" data-admin-terminal-action="players-page-prev" ${currentPage <= 1 ? "disabled" : ""} aria-label="Previous player page">‹</button>
                <strong class="admin-terminal-players-v245-page-index">${escapeHtml(currentPage)} / ${escapeHtml(pageCount)}</strong>
                <button type="button" data-admin-terminal-action="players-page-next" ${currentPage >= pageCount ? "disabled" : ""} aria-label="Next player page">›</button>
              </div>
            </div>
            <div class="admin-terminal-player-list admin-terminal-player-accordion-list admin-terminal-player-table-list-v295 ${visiblePlayers.length ? "" : "is-empty-state"}">
              ${visiblePlayers.length ? visiblePlayers.map((player) => renderPlayersRosterRow(player, selectedRank)).join("") : `<article class="admin-terminal-players-v245-empty">${escapeHtml(emptyFilterCopy)}</article>`}
            </div>
          </section>
        </div>
      </section>`;
  }
  function getTerminalAttendanceRows(model) {
    const rosterPlayers = getTerminalPlayerRows(model);
    const explicitRows = Array.isArray(model?.attendance) ? model.attendance : [];
    if (explicitRows.length) {
      return explicitRows.map((row, index) => {
        const status = String(row.status || (index % 4 === 0 ? "Late" : "Present")).trim();
        const normalized = status.toLowerCase();
        const tone =
          normalized.includes("present") ? "is-present" :
          normalized.includes("late") ? "is-late" :
          normalized.includes("absent") ? "is-absent" :
          "is-offline";
        return {
          student: row.student || row.name || rosterPlayers[index]?.name || `Player ${index + 1}`,
          location: row.location || rosterPlayers[index]?.location || "—",
          status,
          tone,
          time: row.time || (normalized.includes("present") ? "08:01" : normalized.includes("late") ? "08:14" : "—"),
          reward: row.reward || (normalized.includes("present") ? "+10.00" : normalized.includes("late") ? "+4.00" : "0.00"),
          source: row.source || "Scanner",
          note: row.note || (normalized.includes("late") ? "Late scan" : normalized.includes("absent") ? "No scan recorded" : "Verified")
        };
      });
    }
    return rosterPlayers.map((player, index) => {
      const status = index === 1 ? "Late" : index === 3 ? "Absent" : player.session.label === "ONLINE" ? "Present" : "Offline";
      const normalized = status.toLowerCase();
      const tone =
        normalized === "present" ? "is-present" :
        normalized === "late" ? "is-late" :
        normalized === "absent" ? "is-absent" :
        "is-offline";
      return {
        student: player.name,
        location: player.location,
        status,
        tone,
        time: normalized === "present" ? "08:01" : normalized === "late" ? "08:14" : "—",
        reward: normalized === "present" ? "+10.00" : normalized === "late" ? "+4.00" : "0.00",
        source: normalized === "offline" || normalized === "absent" ? "No Scan" : "Scanner",
        note: normalized === "late" ? "Late scan" : normalized === "absent" ? "No scan recorded" : "Verified"
      };
    });
  }
  function renderAttendancePageHeader(model) {
    return `
      <header class="admin-terminal-top admin-terminal-page-top">
        <div>
          <span>Attendance / operations</span>
          <h2>Attendance</h2>
          <p>Resolve exceptions, correct records, and audit attendance rewards after scanning.</p>
        </div>
        <div class="admin-terminal-top-actions">
          <button class="admin-terminal-bell" type="button" aria-label="Alerts" data-admin-terminal-bell>
            ${bellIcon()}
            ${model.notificationCount ? `<small>${escapeHtml(model.notificationCount)}</small>` : ""}
          </button>
          <button class="admin-terminal-user-button" type="button" aria-label="Open admin profile menu" aria-expanded="false" data-admin-terminal-user>
            <span class="admin-terminal-avatar">${escapeHtml(getAdminInitials(model.adminName))}</span>
            <i aria-hidden="true"></i>
          </button>
          ${renderNotifications(model)}
          ${renderAdminUserMenu(model)}
        </div>
      </header>`;
  }
  function renderAttendanceStat(label, value, meta, tone = "cyan") {
    return `
      <article class="admin-terminal-attendance-stat is-${escapeHtml(tone)}">
        <small>${escapeHtml(label)}</small>
        <strong>${escapeHtml(value)}</strong>
        <span>${escapeHtml(meta)}</span>
      </article>`;
  }
  function renderAttendanceRow(row) {
    return `
      <article class="admin-terminal-attendance-row ${escapeHtml(row.tone)}">
        <div class="admin-terminal-attendance-row-player">
          <i aria-hidden="true"></i>
          <span>
            <strong>${escapeHtml(row.student)}</strong>
            <small>${escapeHtml(row.location)}</small>
          </span>
        </div>
        <div class="admin-terminal-attendance-row-status">
          <strong>${escapeHtml(row.status)}</strong>
          <small>${escapeHtml(row.note)}</small>
        </div>
        <div class="admin-terminal-attendance-row-time">
          <small>Time</small>
          <strong>${escapeHtml(row.time)}</strong>
        </div>
        <div class="admin-terminal-attendance-row-reward">
          <small>Reward</small>
          <strong>${renderSignedCurrencyAmount(row.reward, "NRC")}</strong>
        </div>
        <button type="button" data-admin-terminal-action="manual-attendance-correction">Correct</button>
      </article>`;
  }
  function getAttendanceRowKey(row, index = 0) {
    const raw = row.id || row.studentId || row.playerId || row.student || row.name || `attendance-${index}`;
    return String(raw || `attendance-${index}`)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || `attendance-${index}`;
  }
  function getAttendanceStatusGroup(row) {
    const status = String(row?.status || "").toLowerCase();
    if (status.includes("excused") || status.includes("absent")) return "absent";
    if (status.includes("absent") || status.includes("offline") || status.includes("missing") || status.includes("no scan")) return "absent";
    if (status.includes("late")) return "late";
    if (status.includes("present") || status.includes("checked")) return "present";
    return "needs";
  }
  function getAttendanceProblemType(row) {
    const status = String(row?.status || "").toLowerCase();
    const note = String(row?.note || "").toLowerCase();
    const source = String(row?.source || "").toLowerCase();
    const reward = String(row?.reward || "").toLowerCase();
    if (note.includes("duplicate")) return "Duplicate scan";
    if (note.includes("reward") && (note.includes("failed") || note.includes("missing"))) return "Reward issue";
    if (source.includes("manual") || source.includes("correction")) return "Manual review";
    if (status.includes("absent") || status.includes("offline") || source.includes("no scan")) return "No scan";
    if (status.includes("late")) return "Late scan";
    if (reward === "0.00" || reward === "+0.00") return "No reward";
    return "";
  }
  function getAttendanceRewardNumber(row) {
    const raw = String(row?.reward || "0").replace(/[^0-9.-]/g, "");
    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
  }
  function getAttendanceHistoryForRow(row, index = 0) {
    if (Array.isArray(row.history) && row.history.length) {
      return row.history.map((item, itemIndex) => ({
        date: item.date || item.day || (itemIndex === 0 ? "Today" : `Previous ${itemIndex}`),
        status: item.status || row.status || "Present",
        time: item.time || row.time || "—",
        reward: item.reward || row.reward || "0.00",
        source: item.source || row.source || "Scanner",
        note: item.note || item.reason || "Verified"
      }));
    }
    const isLate = String(row.status || "").toLowerCase().includes("late");
    const isAbsent = String(row.status || "").toLowerCase().includes("absent") || String(row.status || "").toLowerCase().includes("offline");
    return [
      { date: "Today", status: row.status || "Present", time: row.time || (isAbsent ? "—" : isLate ? "08:14" : "08:02"), reward: row.reward || (isAbsent ? "0.00" : isLate ? "+4.00" : "+10.00"), source: row.source || (isAbsent ? "System" : "Scanner"), note: row.note || (isAbsent ? "Auto-marked absent after 1-hour cutoff" : isLate ? "Checked in after attendance cutoff" : "Verified on-time check-in") },
      { date: "Yesterday", status: index % 3 === 0 ? "Late" : "Present", time: index % 3 === 0 ? "08:13" : "08:01", reward: index % 3 === 0 ? "+4.00" : "+10.00", source: "Scanner", note: index % 3 === 0 ? "Checked in after attendance cutoff" : "Verified on-time check-in" },
      { date: "Jun 21", status: "Present", time: "08:03", reward: "+10.00", source: "Scanner", note: "Verified on-time check-in" },
      { date: "Jun 20", status: "Absent", time: "—", reward: "0.00", source: "System", note: "Auto-marked absent after 1-hour cutoff" }
    ];
  }
  function isAttendanceNeedsAction(row) {
    const group = getAttendanceStatusGroup(row);
    return Boolean(getAttendanceProblemType(row)) || group === "absent" || group === "late";
  }
  function getOperationalAttendanceRows(model) {
    return getTerminalAttendanceRows(model).map((row, index) => {
      const key = getAttendanceRowKey(row, index);
      const group = getAttendanceStatusGroup(row);
      const issue = getAttendanceProblemType(row);
      const needsAction = isAttendanceNeedsAction(row);
      const history = getAttendanceHistoryForRow(row, index);
      return {
        ...row,
        key,
        index,
        group,
        issue,
        needsAction,
        rewardValue: getAttendanceRewardNumber(row),
        history,
        priority: group === "absent" ? 1 : group === "late" ? 2 : needsAction ? 3 : 4
      };
    }).sort((a, b) => a.priority - b.priority || a.student.localeCompare(b.student));
  }
  function getSelectedAttendanceRow(model, rows) {
    const feature = window.Econovaria.features.adminOverviewTerminal;
    const selectedKey = feature.selectedAttendanceKey || rows.find((row) => row.needsAction)?.key || rows[0]?.key || "";
    const selected = rows.find((row) => row.key === selectedKey) || rows[0] || null;
    if (selected) feature.selectedAttendanceKey = selected.key;
    return selected;
  }
  function renderAttendanceOpsButton(label, meta, actionName, tone = "") {
    return `
      <button type="button" class="${tone ? `is-${escapeHtml(tone)}` : ""}" data-admin-terminal-action="${escapeHtml(actionName)}">
        <strong>${escapeHtml(label)}</strong>
        <small>${escapeHtml(meta)}</small>
      </button>`;
  }
  function renderAttendanceMissionCard(label, value, meta = "", tone = "cyan", valueIsHtml = false) {
    const valueMarkup = valueIsHtml ? String(value ?? "") : escapeHtml(value);
    return `
      <article class="admin-terminal-attendance-v204-metric is-${escapeHtml(tone)}">
        <small>${escapeHtml(label)}</small>
        <strong>${valueMarkup}</strong>
        ${meta ? `<span>${escapeHtml(meta)}</span>` : ""}
      </article>`;
  }
  function renderAttendanceExceptionRow(row, selectedKey) {
    return `
      <button
        type="button"
        class="admin-terminal-attendance-v204-exception ${escapeHtml(row.tone)}${row.key === selectedKey ? " is-selected" : ""}"
        data-admin-terminal-action="select-attendance-student"
        data-attendance-key="${escapeHtml(row.key)}"
      >
        <span>${escapeHtml(row.issue || row.status || "Review")}</span>
        <strong>${escapeHtml(row.student)}</strong>
        <small>${escapeHtml(row.location)} · ${escapeHtml(row.time)} · ${renderSignedCurrencyAmount(row.reward, "NRC")}</small>
      </button>`;
  }
  function renderAttendanceStudentRow(row, selectedKey) {
    const rewardText = String(row?.reward || "").trim();
    const rewardValue = Number(String(row?.reward || "").replace(/[^0-9.-]/g, ""));
    const rewardTone = rewardText.includes("-") || rewardValue < 0 ? "is-negative" : rewardText.includes("+") || rewardValue > 0 ? "is-positive" : "is-neutral";
    const groupTone = row?.group ? ` group-${String(row.group).toLowerCase()}` : "";
    return `
      <button
        type="button"
        class="admin-terminal-attendance-v204-student admin-terminal-attendance-v209-student ${escapeHtml(row.tone)}${escapeHtml(groupTone)}${row.key === selectedKey ? " is-selected" : ""}"
        data-admin-terminal-action="select-attendance-student"
        data-attendance-key="${escapeHtml(row.key)}"
      >
        <span class="status-dot" aria-hidden="true"></span>
        <span class="identity">
          <strong>${escapeHtml(row.student)}</strong>
          <small>${escapeHtml(row.location)}</small>
        </span>
        <span class="status">${escapeHtml(row.status)}</span>
        <span class="time">${escapeHtml(row.time)}</span>
        <span class="reward ${escapeHtml(rewardTone)}">${renderSignedCurrencyAmount(row.reward, "NRC")}</span>
      </button>`;
  }
  function renderAttendanceRosterColumnHeader() {
    return `
      <div class="admin-terminal-attendance-v209-table-head" aria-hidden="true">
        <span></span>
        <span>Student</span>
        <span>Status</span>
        <span>Last Scan</span>
        <span>Reward</span>
      </div>`;
  }
  function renderAttendanceRosterEmptyRow() {
    return `
      <div class="admin-terminal-attendance-v204-student admin-terminal-attendance-v209-student is-empty-state" aria-hidden="true">
        <span class="status-dot"></span>
        <span class="identity">
          <strong>—</strong>
          <small>—</small>
        </span>
        <span class="status">—</span>
        <span class="time">—</span>
        <span class="reward">—</span>
      </div>`;
  }
  function normalizeAttendanceRosterMatch(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  }
  function getRosterNotCheckedInRows(model, existingRows = []) {
    const rosterPlayers = getTerminalPlayerRows(model);
    const existingKeys = new Set(
      existingRows.map((row) => `${normalizeAttendanceRosterMatch(row.student)}::${normalizeAttendanceRosterMatch(row.location)}`)
    );
    return rosterPlayers
      .filter((player) => !existingKeys.has(`${normalizeAttendanceRosterMatch(player.name)}::${normalizeAttendanceRosterMatch(player.location)}`))
      .map((player, index) => {
        const synthetic = {
          student: player.name,
          location: player.location || "—",
          status: "No scan",
          tone: "is-absent",
          time: "—",
          reward: "—",
          source: "Roster",
          note: "No check-in recorded",
          history: [
            { date: "Today", status: "Absent", time: "—", reward: "0.00", source: "System", note: "Auto-marked absent after 1-hour cutoff" },
            { date: "Yesterday", status: "Present", time: "08:01", reward: "+10.00", source: "Scanner", note: "Verified on-time check-in" },
            { date: "Jun 21", status: "Present", time: "08:03", reward: "+10.00", source: "Scanner", note: "Verified on-time check-in" },
            { date: "Jun 20", status: "Absent", time: "—", reward: "0.00", source: "System", note: "Auto-marked absent after 1-hour cutoff" }
          ]
        };
        const rowIndex = existingRows.length + index;
        return {
          ...synthetic,
          key: getAttendanceRowKey({ student: synthetic.student, status: `missing-${synthetic.status}` }, rowIndex),
          index: rowIndex,
          group: "missing",
          issue: "No scan",
          needsAction: true,
          rewardValue: 0,
          priority: 3.5
        };
      })
      .sort((a, b) => a.student.localeCompare(b.student));
  }
  function renderAttendanceCompactGroup(label, rows, selectedKey) {
    const normalized = String(label || "").toLowerCase();
    const toneClass = normalized.includes("present") ? "is-present" : normalized.includes("late") ? "is-late" : normalized.includes("absent") ? "is-absent" : normalized.includes("not checked") || normalized.includes("missing") ? "is-missing" : normalized.includes("other") ? "is-other" : "is-neutral";
    return `
      <section class="admin-terminal-attendance-v204-group admin-terminal-attendance-v209-group ${toneClass}">
        <header>
          <span>${escapeHtml(label)}</span>
        </header>
        <div>
          ${renderAttendanceRosterColumnHeader()}${rows.length ? rows.map((row) => renderAttendanceStudentRow(row, selectedKey)).join("") : renderAttendanceRosterEmptyRow()}
        </div>
      </section>`;
  }
  function renderAttendanceHistoryLedgerRow(item) {
    const status = String(item?.status || "").toLowerCase();
    const tone = status.includes("late") ? "is-late" : status.includes("absent") || status.includes("excused") || status.includes("absent") ? "is-absent" : "is-present";
    const displayStatus = status.includes("excused") || status.includes("absent") ? "Absent" : (item.status || "Present");
    return `
      <article class="admin-terminal-attendance-v220-history-row ${escapeHtml(tone)}">
        <span>${escapeHtml(item.time || "—")}</span>
        <strong>${escapeHtml(item.date || "—")}</strong>
        <small>${escapeHtml(displayStatus)}</small>
        <small>${renderSignedCurrencyAmount(item.reward || "—", "NRC")}</small>
        <small>${escapeHtml(item.source || "—")}</small>
        <em>${escapeHtml(item.note || "—")}</em>
      </article>`;
  }
  function renderAttendanceStudentDetailV204(row) {
    if (!row) {
      return `
        <aside class="admin-terminal-attendance-v204-detail">
          <header>
            <span>Student Record</span>
            <strong>Select a student</strong>
          </header>
        </aside>`;
    }
    const history = Array.isArray(row.history) ? row.history : [];
    const lateCount = history.filter((item) => String(item.status || "").toLowerCase().includes("late")).length;
    const absentCount = history.filter((item) => String(item.status || "").toLowerCase().includes("absent")).length;
    const presentCount = history.filter((item) => String(item.status || "").toLowerCase().includes("present")).length;
    return `
      <aside class="admin-terminal-attendance-v204-detail admin-terminal-attendance-v207-detail admin-terminal-attendance-v208-detail admin-terminal-attendance-v209-detail" aria-label="Selected student attendance record">
        <header>
          <span>Student Record</span>
          <small>${escapeHtml(row.location)}</small>
          <strong>${escapeHtml(row.student)}</strong>
        </header>
        <section class="admin-terminal-attendance-v204-status-card admin-terminal-attendance-v208-status-card admin-terminal-attendance-v209-status-card ${escapeHtml(row.tone)}">
          <div>
            <small>Current Status</small>
            <strong>${escapeHtml(row.status)}</strong>
          </div>
          <dl>
            <div><dt>Last Scan</dt><dd>${escapeHtml(row.time)}</dd></div>
            <div><dt>Reward</dt><dd>${renderSignedCurrencyAmount(row.reward, "NRC")}</dd></div>
            <div><dt>Present</dt><dd>${escapeHtml(presentCount)}</dd></div>
            <div><dt>Late</dt><dd>${escapeHtml(lateCount)}</dd></div>
            <div><dt>Absent</dt><dd>${escapeHtml(absentCount)}</dd></div>
          </dl>
        </section>
        <section class="admin-terminal-attendance-v207-reward-editor admin-terminal-attendance-v208-reward-editor admin-terminal-attendance-v209-reward-editor" aria-label="Attendance reward adjustment">
          <details>
            <summary>
              <span>
                <small>Reward Adjustment</small>
                <strong>Adjust payout</strong>
              </span>
              <em class="admin-terminal-attendance-v211-drawer-chevron" aria-hidden="true"></em>
            </summary>
            <div class="admin-terminal-attendance-v207-reward-form admin-terminal-attendance-v208-reward-form admin-terminal-attendance-v225-reward-form">
              <label>
                <span>Record date</span>
                <input type="date" value="${escapeHtml(getAttendanceHistoryInputDate(history[0]?.date || "Today"))}" aria-label="Attendance record date to adjust">
              </label>
              <label>
                <span>New attendance reward</span>
                <input type="number" min="0" step="1" value="${escapeHtml(String(row.reward || "").replace(/[^0-9.]/g, "") || "0")}" aria-label="Overwrite attendance reward amount">
              </label>
              <label>
                <span>Adjustment note</span>
                <textarea rows="3" aria-label="Reward correction note" placeholder="Only for manual payout correction"></textarea>
              </label>
              <button type="button" data-admin-terminal-action="attendance-adjust-reward">
                Submit Adjustment
              </button>
            </div>
          </details>
        </section>
      </aside>`;
  }
  function renderAttendanceHistoryColumnHeader() {
    return `
      <div class="admin-terminal-attendance-v223-table-head admin-terminal-attendance-v224-table-head" aria-hidden="true">
        <span></span>
        <span>Record</span>
        <span>Status</span>
        <span>Reward</span>
        <span>Event</span>
        <span>Adjustment Note</span>
      </div>`;
  }
  function getAttendanceHistoryInputDate(rawDate) {
    const raw = String(rawDate || "").trim();
    if (!raw || raw.toLowerCase() === "today") return "2026-06-26";
    if (raw.toLowerCase() === "yesterday") return "2026-06-25";
    const match = raw.match(/^([A-Z][a-z]{2}) (\d{1,2})(?:,\s*(\d{4}))?$/);
    if (match) {
      const monthMap = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
      const month = monthMap[match[1]] || "06";
      const day = String(match[2]).padStart(2, "0");
      const year = match[3] || "2026";
      return `${year}-${month}-${day}`;
    }
    return "2026-06-26";
  }
  function getAttendanceHistoryAbsoluteDate(rawDate, itemIndex = 0) {
    const raw = String(rawDate || "").trim();
    if (!raw || raw.toLowerCase() === "today") return "Jun 26, 2026";
    if (raw.toLowerCase() === "yesterday") return "Jun 25, 2026";
    if (/^[A-Z][a-z]{2} \d{1,2}$/.test(raw)) return `${raw}, 2026`;
    return raw;
  }
  function getAttendanceHistoryMeta(item, itemIndex = 0) {
    const raw = String(item?.date || "").trim().toLowerCase();
    const time = String(item?.time || "—").trim();
    if (raw === "today") return `Today · ${time}`;
    if (raw === "yesterday") return `Yesterday · ${time}`;
    return time;
  }
  function getAttendanceHistoryDisplayEvent(item) {
    const status = String(item?.status || "").toLowerCase();
    const note = String(item?.note || "").trim();
    const noteLower = note.toLowerCase();
    if (status.includes("absent") || status.includes("excused") || status.includes("absent") || noteLower.includes("auto absent") || noteLower.includes("no scan") || noteLower.includes("check-in recorded") || noteLower.includes("auto-marked absent")) {
      return "Auto-marked absent after 1-hour cutoff";
    }
    if (status.includes("late") || noteLower.includes("late arrival") || noteLower.includes("attendance cutoff")) {
      return "Checked in after attendance cutoff";
    }
    if (noteLower.includes("verified")) {
      return "Verified on-time check-in";
    }
    return note || "Verified on-time check-in";
  }
  function getAttendanceAdjustmentNote(item) {
    const note = item?.adjustmentNote || item?.payoutNote || item?.rewardAdjustmentNote || item?.manualAdjustmentNote || item?.manualNote || "";
    return String(note || "").trim() || "—";
  }
  function renderAttendanceLedgerRowV204(row, rowIndex = 0) {
    const status = String(row?.status || "").toLowerCase();
    const tone = status.includes("late") ? "is-late" : status.includes("absent") || status.includes("excused") || status.includes("absent") ? "is-absent" : "is-present";
    const displayStatus = status.includes("excused") || status.includes("absent") ? "Absent" : (row?.status || "—");
    const rewardText = String(row?.reward || "—").trim();
    const rewardValue = Number(String(rewardText).replace(/[^0-9.-]/g, ""));
    const rewardTone = rewardText.includes("-") || rewardValue < 0 ? "is-negative" : rewardText.includes("+") || rewardValue > 0 ? "is-positive" : "is-neutral";
    return `
      <article class="admin-terminal-attendance-v223-history-row admin-terminal-attendance-v224-history-row ${escapeHtml(tone)}">
        <span class="status-dot" aria-hidden="true"></span>
        <span class="identity">
          <strong>${escapeHtml(getAttendanceHistoryAbsoluteDate(row.date, rowIndex))}</strong>
          <small>${escapeHtml(getAttendanceHistoryMeta(row, rowIndex))}</small>
        </span>
        <span class="status">${escapeHtml(displayStatus)}</span>
        <span class="reward ${escapeHtml(rewardTone)}">${renderSignedCurrencyAmount(rewardText || "—", "NRC")}</span>
        <span class="event">${escapeHtml(getAttendanceHistoryDisplayEvent(row))}</span>
        <span class="adjustment-note">${escapeHtml(getAttendanceAdjustmentNote(row))}</span>
      </article>`;
  }
  function renderAttendanceOpsPage(model) {
    const operationalRows = getOperationalAttendanceRows(model);
    const notCheckedInRows = getRosterNotCheckedInRows(model, operationalRows);
    const rows = [...operationalRows, ...notCheckedInRows];
    const counts = getAttendanceStatusCounts(model);
    const selected = getSelectedAttendanceRow(model, rows);
    const selectedKey = selected?.key || "";
    const presentRows = rows.filter((row) => row.group === "present");
    const lateRows = rows.filter((row) => row.group === "late");
    const absentRows = rows.filter((row) => row.group === "absent");
    const notScannedRows = rows.filter((row) => row.group === "missing");
    const excusedRows = rows.filter((row) => row.group === "excused");
    const historyRows = Array.isArray(selected?.history) ? selected.history : [];
    const exportPlayerOptions = Array.from(
      new Map(rows.map((row) => [String(row.student || "").trim().toLowerCase(), row]).filter(([key]) => key)).values()
    ).sort((a, b) => String(a.student || "").localeCompare(String(b.student || "")));
    const rewardTotal = rows.reduce((sum, row) => sum + row.rewardValue, 0) || counts.rewardsIssued || 0;
    return `
      <section class="admin-terminal-overview admin-terminal-attendance-v204 admin-terminal-attendance-v206 admin-terminal-attendance-v207 admin-terminal-attendance-v208 admin-terminal-attendance-v209 admin-terminal-attendance-v211 admin-terminal-attendance-v216 admin-terminal-attendance-v217 admin-terminal-attendance-v220 admin-terminal-attendance-v221 admin-terminal-attendance-v222 admin-terminal-attendance-v223 admin-terminal-attendance-v224 admin-terminal-attendance-v225 admin-terminal-attendance-v227" aria-label="Attendance operations terminal" data-admin-terminal-page="Attendance">
        ${renderAttendancePageHeader(model)}
        <section class="admin-terminal-attendance-v207-actions admin-terminal-attendance-v208-actions" aria-label="Attendance quick actions">
          <button type="button" class="admin-terminal-attendance-v208-overview-action admin-terminal-action is-amber" data-admin-terminal-action="scan-attendance">
            <span class="admin-terminal-action-rail" aria-hidden="true"></span>
            <span class="admin-terminal-action-mark" aria-hidden="true">${renderNavIcon("attendance")}</span>
            <span class="admin-terminal-action-copy">
              <strong>Scan Attendance</strong>
              <small>Open Scanner</small>
            </span>
            <span class="admin-terminal-action-arrow" aria-hidden="true">↗</span>
          </button>
          <button type="button" class="admin-terminal-attendance-v208-overview-action admin-terminal-action is-amber is-export" data-admin-terminal-action="attendance-open-export">
            <span class="admin-terminal-action-rail" aria-hidden="true"></span>
            <span class="admin-terminal-action-mark admin-terminal-attendance-v209-export-icon" aria-hidden="true">
              <img src="./assets/images/csv-export-gold.png" alt="">
            </span>
            <span class="admin-terminal-action-copy">
              <strong>Export CSV</strong>
              <small>Attendance Records</small>
            </span>
            <span class="admin-terminal-action-arrow" aria-hidden="true">↗</span>
          </button>
        </section>
        <section class="admin-terminal-attendance-v204-metrics admin-terminal-attendance-v207-metrics admin-terminal-attendance-v208-metrics" aria-label="Attendance operational metrics">
          ${renderAttendanceMissionCard("Present", counts.present, "", "good")}
          ${renderAttendanceMissionCard("Late", counts.late, "", "warn")}
          ${renderAttendanceMissionCard("Absent", counts.absent, "", "danger")}
          ${renderAttendanceMissionCard("Rewards Issued", renderCurrencyAmount(rewardTotal, "NRC"), "", "cyan", true)}
        </section>
        <section class="admin-terminal-attendance-v206-workspace admin-terminal-attendance-v207-workspace admin-terminal-attendance-v208-workspace">
          <section class="admin-terminal-attendance-v204-roster admin-terminal-attendance-v206-roster admin-terminal-attendance-v207-roster admin-terminal-attendance-v208-roster">
            <header>
              <div>
                <span>Roster</span>
                <strong>Student attendance records</strong>
              </div>
            </header>
            ${renderAttendanceCompactGroup("Present", presentRows, selectedKey)}
            ${renderAttendanceCompactGroup("Late", lateRows, selectedKey)}
            ${renderAttendanceCompactGroup("Absent", absentRows, selectedKey)}
            ${renderAttendanceCompactGroup("Not Checked In", notScannedRows, selectedKey)}
            ${""}
          </section>
          ${renderAttendanceStudentDetailV204(selected)}
        </section>
        <section class="admin-terminal-attendance-v207-ledger admin-terminal-attendance-v208-ledger admin-terminal-attendance-v221-ledger" aria-label="Attendance history ledger">
          <header>
            <div>
              <span>Attendance History</span>
              <strong>Attendance Timeline</strong>
              <small>${escapeHtml(selected?.student || "No student selected")}${selected?.location ? ` · ${escapeHtml(selected.location)}` : ""}</small>
            </div>
            <div class="admin-terminal-attendance-v207-ledger-controls admin-terminal-attendance-v208-ledger-controls">
              <button type="button" data-admin-terminal-action="attendance-ledger-prev-day" aria-label="Previous day">←</button>
              <input type="date" aria-label="Attendance history date lookup">
              <button type="button" data-admin-terminal-action="attendance-ledger-next-day" aria-label="Next day">→</button>
              <select aria-label="Attendance history time period">
                <option>Today</option>
                <option>This week</option>
                <option>All records</option>
              </select>
              <input type="search" placeholder="Search history" aria-label="Search attendance history records">
            </div>
          </header>
          <div class="admin-terminal-attendance-v207-ledger-list admin-terminal-attendance-v208-ledger-list admin-terminal-attendance-v223-history-list">
            ${renderAttendanceHistoryColumnHeader()}
            ${historyRows.length ? historyRows.map((row, rowIndex) => renderAttendanceLedgerRowV204(row, rowIndex)).join("") : `
              <article class="admin-terminal-attendance-v204-empty">No attendance history available for this student.</article>
            `}
          </div>
        </section>
        <dialog class="admin-terminal-attendance-v207-export admin-terminal-attendance-v208-export" aria-label="Attendance export options">
          <form method="dialog">
            <header>
              <span>Export CSV</span>
              <strong>Attendance records</strong>
            </header>
            <label>
              <span>Export scope</span>
              <select>
                <option>Whole roster</option>
                <option>Specific player</option>
              </select>
            </label>
            <label>
              <span>Specific player</span>
              <select aria-label="Specific player export selection">
                <option value="">Select player</option>
                ${exportPlayerOptions.map((row) => `
                  <option value="${escapeHtml(row.key || row.student)}">${escapeHtml(row.student)}${row.location ? ` · ${escapeHtml(row.location)}` : ""}</option>
                `).join("")}
              </select>
            </label>
            <label>
              <span>Time period</span>
              <select>
                <option>Week</option>
                <option>Month</option>
                <option>Quarter</option>
                <option>Year</option>
              </select>
            </label>
            <footer>
              <button value="cancel">Cancel</button>
              <button value="default" data-admin-terminal-action="export-attendance">Export CSV</button>
            </footer>
          </form>
        </dialog>
      </section>`;
  }
  function normalizeTerminalContractStatus(status) {
    const raw = String(status || "Active").trim() || "Active";
    const normalized = raw.toLowerCase();
    if (normalized.includes("draft")) return { label: "Draft", filter: "draft", tone: "is-muted" };
    if (normalized.includes("schedule") || normalized.includes("upcoming")) return { label: "Scheduled", filter: "scheduled", tone: "is-cyan" };
    if (normalized.includes("due") || normalized.includes("overdue")) return { label: normalized.includes("overdue") ? "Overdue" : "Due Soon", filter: "due", tone: "is-warn" };
    if (normalized.includes("submitted") || normalized.includes("pending") || normalized.includes("review")) return { label: "Under Review", filter: "review", tone: "is-purple" };
    if (normalized.includes("complete") || normalized.includes("approved") || normalized.includes("paid")) return { label: "Completed", filter: "completed", tone: "is-good" };
    if (normalized.includes("expire")) return { label: "Expired", filter: "expired", tone: "is-bad" };
    if (normalized.includes("cancel") || normalized.includes("archive")) return { label: "Cancelled", filter: "cancelled", tone: "is-muted" };
    return { label: "Active", filter: "active", tone: "is-active" };
  }
  function getTerminalContractRows(model) {
    const assignments = Array.isArray(model?.assignments) ? model.assignments : [];
    const fallback = [
      {
        title: "Market Reflection",
        meta: "Deadline Friday · All countries",
        reward: "15.00",
        status: "Active",
        submissions: "7 / 18",
        difficulty: "Standard",
        deadline: "Friday 16:00",
        audience: "All countries",
        objective: "Explain how the current market cycle changed one business decision.",
        instructions: "Review the current market update, identify one change that affected your company, and explain the business decision you would make in response.",
        successCriteria: "Response names the market change, connects it to a company decision, and uses at least one specific piece of evidence from the simulation.",
        teacherNote: "Check for clear cause-and-effect reasoning before approving payout.",
        payoutType: "Cash reward",
        evidence: "Short response + market screenshot",
        owner: "Admin",
        category: "Economy"
      },
      {
        title: "Supply Shock Response",
        meta: "Deadline Today · Northreach, Yrethia",
        reward: "20.00",
        status: "Due Soon",
        submissions: "4 / 18",
        difficulty: "Advanced",
        deadline: "Today 15:30",
        audience: "Northreach, Yrethia",
        objective: "Respond to a simulated resource constraint and justify the pricing decision.",
        instructions: "Use the supply shock notice to choose a price, quantity, or sourcing response for your company. Explain why your choice protects profit or customer demand.",
        successCriteria: "Submission includes a clear action, a reason connected to supply constraints, and a realistic tradeoff.",
        teacherNote: "Advanced task; reject vague answers that do not mention the shortage or price impact.",
        payoutType: "Cash + item",
        evidence: "Decision memo",
        owner: "Admin",
        category: "Operations"
      },
      {
        title: "Store Budget Task",
        meta: "Scheduled Monday · All countries",
        reward: "12.00",
        status: "Scheduled",
        submissions: "0 / 18",
        difficulty: "Standard",
        deadline: "Monday 09:00",
        audience: "All countries",
        objective: "Prepare a simple purchasing plan before the next store cycle opens.",
        instructions: "List what you plan to buy, why the item matters to your strategy, and how much cash you want to keep after purchasing.",
        successCriteria: "Budget includes at least one item, a reason for buying it, and a cash reserve decision.",
        teacherNote: "This is a planning task; do not require a purchase receipt yet.",
        payoutType: "Cash reward",
        evidence: "Budget note",
        owner: "Admin",
        category: "Store"
      },
      {
        title: "Country Risk Brief",
        meta: "Deadline Wednesday · One country each",
        reward: "25.00",
        status: "Under Review",
        submissions: "6 pending",
        difficulty: "Advanced",
        deadline: "Wednesday 17:00",
        audience: "One country each",
        objective: "Identify one political, currency, or logistics risk and state the likely player impact.",
        instructions: "Choose one country risk from the dashboard and explain how it could affect prices, stock, trade, or company decisions.",
        successCriteria: "Brief names the risk, explains the impact, and includes a plausible action the player should take.",
        teacherNote: "Review for specificity; generic country descriptions should be sent back for revision.",
        payoutType: "Cash reward",
        evidence: "Brief for review",
        owner: "Admin",
        category: "Country Risk"
      }
    ];
    const source = assignments.length ? assignments : fallback;
    return source.map((item, index) => {
      const base = fallback[index % fallback.length];
      const title = item.title || base.title;
      const meta = item.meta || base.meta;
      const reward = item.reward || base.reward;
      const status =
        item.status ||
        (index === 1 ? "Due Soon" : index === 2 ? "Scheduled" : index === 3 ? "Under Review" : "Active");
      const statusMeta = normalizeTerminalContractStatus(status);
      const submissions = item.submissions || base.submissions;
      const submissionMatch = String(submissions).match(/(\d+)\s*\/\s*(\d+)/);
      const pendingMatch = String(submissions).match(/(\d+)\s*pending/i);
      const submittedCount = submissionMatch ? Number(submissionMatch[1]) : pendingMatch ? Number(pendingMatch[1]) : 0;
      const totalCount = submissionMatch ? Number(submissionMatch[2]) : 18;
      const completionPercent = totalCount ? Math.min(100, Math.round((submittedCount / totalCount) * 100)) : 0;
      return {
        title,
        meta,
        reward,
        status: statusMeta.label,
        rawStatus: status,
        filterStatus: statusMeta.filter,
        tone: statusMeta.tone,
        submissions,
        submittedCount,
        totalCount,
        completionPercent,
        difficulty: item.difficulty || base.difficulty,
        locations: item.locations || item.audience || base.audience || (meta.includes("All") ? "All countries" : "Selected countries"),
        deadline: item.deadline || base.deadline || meta.split("·")[0].replace("Deadline", "").trim(),
        objective: item.objective || base.objective,
        instructions: item.instructions || base.instructions || item.detail || "Write the student-facing instructions for this contract.",
        successCriteria: item.successCriteria || item.acceptanceCriteria || base.successCriteria || "Acceptance criteria pending.",
        teacherNote: item.teacherNote || item.reviewNote || base.teacherNote || "No internal review note.",
        payoutType: item.payoutType || base.payoutType,
        evidence: item.evidence || base.evidence,
        owner: item.owner || base.owner,
        category: item.category || base.category,
        completion: item.completion || `${submittedCount} submitted`,
        index
      };
    });
  }
  function renderContractsPageHeader(model) {
    return `
      <header class="admin-terminal-top admin-terminal-page-top">
        <div>
          <span>Assignments / contracts</span>
          <h2>Contracts</h2>
          <p>Issue class contracts, monitor submissions, and control reward exposure.</p>
        </div>
        <div class="admin-terminal-top-actions">
          <button class="admin-terminal-bell" type="button" aria-label="Alerts" data-admin-terminal-bell>
            ${bellIcon()}
            ${model.notificationCount ? `<small>${escapeHtml(model.notificationCount)}</small>` : ""}
          </button>
          <button class="admin-terminal-user-button" type="button" aria-label="Open admin profile menu" aria-expanded="false" data-admin-terminal-user>
            <span class="admin-terminal-avatar">${escapeHtml(getAdminInitials(model.adminName))}</span>
            <i aria-hidden="true"></i>
          </button>
          ${renderNotifications(model)}
          ${renderAdminUserMenu(model)}
        </div>
      </header>`;
  }
  function renderContractStatusBadge(status, tone = "is-active") {
    return `<span class="admin-terminal-contract-status ${escapeHtml(tone)}">${escapeHtml(status)}</span>`;
  }
  function renderContractProgress(contract) {
    return `
      <div class="admin-terminal-contract-progress-v466" aria-label="Submission progress for ${escapeHtml(contract.title)}">
        <span><i style="--contract-progress:${escapeHtml(contract.completionPercent)}%"></i></span>
        <b>${escapeHtml(contract.completionPercent)}%</b>
      </div>`;
  }
  function renderContractLedgerRow(contract) {
    const reward = renderCurrencyAmount(contract.reward, "NRC");
    return `
      <details class="admin-terminal-contract-ledger-row-v466 ${escapeHtml(contract.tone)}" data-contract-row data-contract-filter="${escapeHtml(contract.filterStatus)}" data-contract-status="${escapeHtml(contract.status)}" data-contract-title="${escapeHtml(contract.title)}">
        <summary>
          <div class="admin-terminal-contract-ledger-title-v466">
            <span>${escapeHtml(contract.category)}</span>
            <strong>${escapeHtml(contract.title)}</strong>
            <small>${escapeHtml(contract.objective)}</small>
          </div>
          <div class="admin-terminal-contract-ledger-status-v466">
            ${renderContractStatusBadge(contract.status, contract.tone)}
          </div>
          <div class="admin-terminal-contract-ledger-reward-v466">
            <span>Reward</span>
            <strong>${reward}</strong>
          </div>
          <div class="admin-terminal-contract-ledger-submissions-v466">
            <span>Submissions</span>
            <strong>${escapeHtml(contract.submissions)}</strong>
            ${renderContractProgress(contract)}
          </div>
          <div class="admin-terminal-contract-ledger-deadline-v466">
            <span>Deadline</span>
            <strong>${escapeHtml(contract.deadline)}</strong>
          </div>
          <button
            type="button"
            class="admin-terminal-contract-ledger-open-v466"
            data-admin-terminal-action="open-contract-profile"
            data-contract-title="${escapeHtml(contract.title)}"
            data-contract-meta="${escapeHtml(contract.meta)}"
            data-contract-reward="${escapeHtml(contract.reward)}"
            data-contract-status="${escapeHtml(contract.status)}"
            data-contract-objective="${escapeHtml(contract.objective)}"
            data-contract-deadline="${escapeHtml(contract.deadline)}"
            data-contract-submissions="${escapeHtml(contract.submissions)}"
            data-contract-progress="${escapeHtml(contract.completionPercent)}"
            data-contract-locations="${escapeHtml(contract.locations)}"
            data-contract-payout="${escapeHtml(contract.payoutType)}"
            data-contract-evidence="${escapeHtml(contract.evidence)}"
            data-contract-instructions="${escapeHtml(contract.instructions)}"
            data-contract-success="${escapeHtml(contract.successCriteria)}"
            data-contract-review-note="${escapeHtml(contract.teacherNote)}"
            data-contract-owner="${escapeHtml(contract.owner)}"
            data-contract-category="${escapeHtml(contract.category)}"
            data-contract-difficulty="${escapeHtml(contract.difficulty)}"
          >View</button>
        </summary>
        <section class="admin-terminal-contract-ledger-detail-v466 admin-terminal-contract-ledger-detail-v494 admin-terminal-contract-ledger-detail-v495">
          <div class="admin-terminal-contract-writing-summary-v494 admin-terminal-contract-writing-summary-v495">
            <span>Instructions</span>
            <p>${escapeHtml(contract.instructions)}</p>
          </div>
          <div class="admin-terminal-contract-criteria-grid-v494 admin-terminal-contract-criteria-grid-v495">
            <article>
              <span>Submission requirement</span>
              <p>${escapeHtml(contract.evidence)}</p>
            </article>
            <article>
              <span>Audience</span>
              <p>${escapeHtml(contract.locations)}</p>
            </article>
          </div>
          <div class="admin-terminal-contract-ledger-detail-actions-v470">
            <button
              type="button"
              data-admin-terminal-action="review-contract-submissions"
              data-contract-title="${escapeHtml(contract.title)}"
              data-contract-meta="${escapeHtml(contract.meta)}"
              data-contract-reward="${escapeHtml(contract.reward)}"
              data-contract-status="${escapeHtml(contract.status)}"
              data-contract-objective="${escapeHtml(contract.objective)}"
              data-contract-deadline="${escapeHtml(contract.deadline)}"
              data-contract-submissions="${escapeHtml(contract.submissions)}"
              data-contract-progress="${escapeHtml(contract.completionPercent)}"
              data-contract-locations="${escapeHtml(contract.locations)}"
              data-contract-payout="${escapeHtml(contract.payoutType)}"
              data-contract-evidence="${escapeHtml(contract.evidence)}"
              data-contract-instructions="${escapeHtml(contract.instructions)}"
              data-contract-success="${escapeHtml(contract.successCriteria)}"
              data-contract-review-note="${escapeHtml(contract.teacherNote)}"
              data-contract-owner="${escapeHtml(contract.owner)}"
              data-contract-category="${escapeHtml(contract.category)}"
              data-contract-difficulty="${escapeHtml(contract.difficulty)}"
            >Review Submissions</button>
          </div>
        </section>
      </details>`;
  }
  function renderContractOverviewMetric(label, value, detail = "") {
    return `
      <article>
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
        ${detail ? `<small>${escapeHtml(detail)}</small>` : ""}
      </article>`;
  }
  function renderContractsPage(model) {
    const contracts = getTerminalContractRows(model);
    const active = contracts.filter((contract) => contract.filterStatus === "active");
    const dueSoon = contracts.filter((contract) => contract.filterStatus === "due");
    const submitted = contracts.filter((contract) => contract.filterStatus === "review");
    const scheduled = contracts.filter((contract) => contract.filterStatus === "scheduled");
    const rewardPressure = contracts.reduce((sum, contract) => sum + (Number.parseFloat(contract.reward) || 0), 0).toFixed(2);
    const submittedTotal = contracts.reduce((sum, contract) => sum + (Number(contract.submittedCount) || 0), 0);
    const totalSlots = contracts.reduce((sum, contract) => sum + (Number(contract.totalCount) || 0), 0);
    const reviewState = submitted.length ? `${submitted.length} waiting` : "Clear";
    const selected = contracts[0];
    const focusContract = dueSoon[0] || selected || null;
    return `
      <section class="admin-terminal-overview admin-terminal-contracts-page" aria-label="Admin contracts terminal" data-admin-terminal-page="Assignments">
        ${renderContractsPageHeader(model)}
        <div class="admin-terminal-contracts-layout-v466">
          <aside class="admin-terminal-contracts-overview-v466" aria-label="Contracts overview">
            <header>
              <span>Contract Overview</span>
              <strong>${escapeHtml(contracts.length)} records</strong>
              <small>${escapeHtml(active.length)} active · ${escapeHtml(dueSoon.length)} due soon · ${escapeHtml(reviewState)}</small>
            </header>
            <section class="admin-terminal-contracts-hero-v466">
              <span>Reward Exposure</span>
              <strong>${renderCurrencyAmount(rewardPressure, "NRC")}</strong>
              <small>Total listed payout across current contracts.</small>
            </section>
            <div class="admin-terminal-contracts-metrics-v466">
              ${renderContractOverviewMetric("Active", String(active.length), "live work")}
              ${renderContractOverviewMetric("Review", String(submitted.length), "submitted")}
              ${renderContractOverviewMetric("Scheduled", String(scheduled.length), "upcoming")}
              ${renderContractOverviewMetric("Progress", totalSlots ? `${Math.round((submittedTotal / totalSlots) * 100)}%` : "0%", `${submittedTotal}/${totalSlots} submissions`)}
            </div>
            <button
              class="admin-terminal-contracts-focus-v466 is-clickable"
              type="button"
              data-admin-terminal-action="focus-contract"
              data-contract-title="${escapeHtml(focusContract?.title || "")}"
              ${focusContract ? "" : "disabled"}
              aria-label="Jump to current focus contract"
            >
              <span>Current Focus</span>
              <strong>${escapeHtml(focusContract?.title || "No contract selected")}</strong>
              <small>${escapeHtml(focusContract?.deadline || "No deadline")}</small>
              <em>Open contract view</em>
            </button>
            <button class="admin-terminal-contracts-add-v466" type="button" data-admin-terminal-action="add-contract">
              <span>＋</span>
              Add Contract
            </button>
          </aside>
          <section class="admin-terminal-contracts-workspace-v466" aria-label="Contract workspace">
            <header class="admin-terminal-contracts-workspace-head-v466">
              <div>
                <span>Contract Ledger</span>
                <strong>Current class work</strong>
                <small>Filter active work, review queue, scheduled contracts, and due-soon items from one ledger.</small>
              </div>
              <div class="admin-terminal-contracts-filter-v466" aria-label="Contract filters" data-contract-filter-controls>
                <button type="button" class="active" aria-pressed="true" data-admin-terminal-action="filter-contracts" data-contract-filter="all">All ${escapeHtml(contracts.length)}</button>
                <button type="button" aria-pressed="false" data-admin-terminal-action="filter-contracts" data-contract-filter="active">Active ${escapeHtml(active.length)}</button>
                <button type="button" aria-pressed="false" data-admin-terminal-action="filter-contracts" data-contract-filter="due">Due ${escapeHtml(dueSoon.length)}</button>
                <button type="button" aria-pressed="false" data-admin-terminal-action="filter-contracts" data-contract-filter="review">Review ${escapeHtml(submitted.length)}</button>
                <button type="button" aria-pressed="false" data-admin-terminal-action="filter-contracts" data-contract-filter="scheduled">Scheduled ${escapeHtml(scheduled.length)}</button>
              </div>
            </header>
            <div class="admin-terminal-contract-ledger-v466" role="table" aria-label="Contracts ledger table">
              <div class="admin-terminal-contract-ledger-head-v466" role="row">
                <span>Contract</span>
                <span>Status</span>
                <span>Reward</span>
                <span>Submissions</span>
                <span>Deadline</span>
                <span>Action</span>
              </div>
              ${contracts.length ? contracts.map(renderContractLedgerRow).join("") : `<p class="admin-terminal-contract-empty-v466">No contracts available.</p>`}
              <p class="admin-terminal-contract-empty-v466 is-filter-empty" data-contract-filter-empty hidden>No contracts match this filter.</p>
            </div>
          </section>
        </div>
      </section>`;
  }
  function normalizeTerminalStoreStatus(status) {
    const raw = String(status || "Active").trim();
    const normalized = raw.toLowerCase();
    if (normalized.includes("low")) {
      return { label: "Low Stock", filter: "risk", tone: "is-warn" };
    }
    if (normalized.includes("sold") || normalized.includes("out")) {
      return { label: "Sold Out", filter: "risk", tone: "is-muted" };
    }
    if (normalized.includes("draft")) {
      return { label: "Draft", filter: "draft", tone: "is-muted" };
    }
    if (normalized.includes("pause") || normalized.includes("inactive") || normalized.includes("hidden")) {
      return { label: "Paused", filter: "risk", tone: "is-muted" };
    }
    if (normalized.includes("restrict") || normalized.includes("blocked") || normalized.includes("disabled")) {
      return { label: "Restricted", filter: "risk", tone: "is-bad" };
    }
    return { label: "Active", filter: "active", tone: "is-active" };
  }
  function normalizeTerminalStoreKind(item) {
    const raw = String(item?.kind || item?.category || item?.itemType || "Consumable").toLowerCase();
    if (raw.includes("material") || raw.includes("resource") || raw.includes("component") || raw.includes("alloy")) {
      return { key: "materials", label: "Material" };
    }
    if (raw.includes("equipment") || raw.includes("tool") || raw.includes("device") || raw.includes("gear")) {
      return { key: "equipment", label: "Equipment" };
    }
    if (raw.includes("consumable") || raw.includes("pass") || raw.includes("boost") || raw.includes("one-time") || raw.includes("supply")) {
      return { key: "consumables", label: "Consumable" };
    }
    return { key: "consumables", label: "Consumable" };
  }
  function normalizeTerminalStoreSource(item, index) {
    const raw = String(item?.sourceType || item?.origin || item?.catalogSource || item?.source || "").toLowerCase();
    const explicitlyCustom = item?.customItem === true || item?.teacherItem === true || raw.includes("custom") || raw.includes("teacher");
    const explicitlySystem = item?.systemItem === true || item?.lockedSystemItem === true || raw.includes("system") || raw.includes("seed");
    if (explicitlyCustom) {
      return { key: "custom", label: "Custom", badge: "Teacher item", editable: true, meta: "Teacher-created item. Safe to edit without changing the economic core." };
    }
    if (explicitlySystem || index < 9) {
      return { key: "system", label: "System", badge: "Seeded item", editable: false, meta: "System item. Visible in Store, but protected from teacher edits." };
    }
    return { key: "custom", label: "Custom", badge: "Teacher item", editable: true, meta: "Teacher-created item. Safe to edit without changing the economic core." };
  }
  function isTerminalStoreRiskItem(item, statusMeta) {
    const risk = String(item?.risk || "").toLowerCase();
    const stock = String(item?.stock || "").toLowerCase();
    return statusMeta.filter === "risk" || risk.includes("high") || risk.includes("restock") || risk.includes("pause") || risk.includes("restrict") || stock === "0";
  }
  const TERMINAL_STORE_COUNTRIES_V480 = Object.freeze([
    { code: "NORTHREACH", label: "Northreach", weight: 1.18, priceDrift: -3, restockDrift: "+12%", macroDriver: "Strong AS", restockDriver: "Logistics surplus" },
    { code: "YRETHIA", label: "Yrethia", weight: .92, priceDrift: 5, restockDrift: "-4%", macroDriver: "Demand pressure", restockDriver: "Stable supply" },
    { code: "SOLVEND", label: "Solvend", weight: 1.32, priceDrift: -6, restockDrift: "+18%", macroDriver: "Productive surplus", restockDriver: "High AS" },
    { code: "ELDORAN", label: "Eldoran", weight: .78, priceDrift: 9, restockDrift: "-12%", macroDriver: "Cost pressure", restockDriver: "Input tightness" },
    { code: "THALORIS", label: "Thaloris", weight: .66, priceDrift: 14, restockDrift: "-18%", macroDriver: "High inflation", restockDriver: "Supply constrained" },
    { code: "VALERION", label: "Valerion", weight: 1.08, priceDrift: 2, restockDrift: "+5%", macroDriver: "Balanced AD/AS", restockDriver: "Normal cycle" },
    { code: "SYNDALIS", label: "Syndalis", weight: .54, priceDrift: 22, restockDrift: "-28%", macroDriver: "Inflation shock", restockDriver: "Weak AS" },
    { code: "KAIVORA", label: "Kaivora", weight: 1.02, priceDrift: 4, restockDrift: "+2%", macroDriver: "Import stable", restockDriver: "Port access" },
    { code: "ORINTH", label: "Orinth", weight: .84, priceDrift: 11, restockDrift: "-10%", macroDriver: "Currency pressure", restockDriver: "Trade friction" },
    { code: "DRAVIK", label: "Dravik", weight: .70, priceDrift: 16, restockDrift: "-22%", macroDriver: "Trade restricted", restockDriver: "Import bottleneck" }
  ]);
  function normalizeTerminalStoreCountryCode(value) {
    return String(value || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_") || "NORTHREACH";
  }
  function numberFromTerminalStoreValue(value, fallback = 0) {
    if (value === "∞") return Number.POSITIVE_INFINITY;
    const numeric = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(numeric) ? numeric : fallback;
  }
  function formatTerminalStoreStockValue(value) {
    return value === Number.POSITIVE_INFINITY || value === "∞" ? "∞" : String(Math.max(0, Math.round(Number(value) || 0)));
  }
  function normalizeTerminalStorePricingMode(item, sourceMeta) {
    const raw = String(item?.pricingMode || item?.priceMode || "").toLowerCase();
    const economyLinked = sourceMeta?.key === "system" || raw.includes("economy") || raw.includes("macro") || raw.includes("dynamic") || item?.followEconomy === true;
    return economyLinked
      ? { key: "economy", label: "Variable by country", meta: "Backend-controlled pricing" }
      : { key: "fixed", label: "Fixed price", meta: "Teacher-set price" };
  }
  function parseTerminalStorePercent(value, fallback = 0) {
    const numeric = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(numeric) ? numeric : fallback;
  }
  function formatTerminalStorePriceRange(value, currency = "NRC") {
    const prices = Array.isArray(value) ? value.filter((entry) => Number.isFinite(entry)) : [];
    if (!prices.length) return `0 ${currency}`;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const formatPrice = (amount) => `${amount.toFixed(2)} ${currency}`;
    return Math.abs(max - min) < .01 ? formatPrice(min) : `${formatPrice(min)}–${formatPrice(max)}`;
  }
  function deriveTerminalStoreCountryStock(item, index, statusMeta, sourceMeta) {
    const supplied = Array.isArray(item?.countryStock) ? item.countryStock : Array.isArray(item?.stockByCountry) ? item.stockByCountry : null;
    const baseStock = numberFromTerminalStoreValue(item?.stock, Number.POSITIVE_INFINITY);
    const basePrice = numberFromTerminalStoreValue(item?.price, 0);
    const pricingMode = normalizeTerminalStorePricingMode(item, sourceMeta);
    const countryCount = TERMINAL_STORE_COUNTRIES_V480.length;
    if (supplied && supplied.length) {
      return TERMINAL_STORE_COUNTRIES_V480.map((country, countryIndex) => {
        const match = supplied.find((entry) => normalizeTerminalStoreCountryCode(entry?.code || entry?.country || entry?.location) === country.code) || {};
        const stock = match.stock === "∞" || match.stock === "Unlimited" ? Number.POSITIVE_INFINITY : numberFromTerminalStoreValue(match.stock, Math.max(0, Math.round((Number.isFinite(baseStock) ? baseStock : 30) / countryCount)));
        const available = stock;
        const macroModifier = parseTerminalStorePercent(match.priceModifier || match.modifier, country.priceDrift || 0);
        const appliedModifier = pricingMode.key === "economy" ? macroModifier : 0;
        const localPrice = numberFromTerminalStoreValue(match.price ?? match.localPrice, basePrice * (1 + appliedModifier / 100));
        const priceModifier = pricingMode.key === "economy" ? (appliedModifier > 0 ? `+${appliedModifier}%` : `${appliedModifier}%`) : "Fixed";
        const status = match.status || (available === 0 ? "Sold Out" : available <= 3 ? "Low Stock" : statusMeta.label);
        const restock = match.restock || item.restock || "Manual";
        const visibility = match.visibility || item.visibility || "All players";
        const macroDriver = match.macroDriver || match.priceReason || (pricingMode.key === "economy" ? country.macroDriver : "Teacher fixed");
        const restockDriver = match.restockDriver || match.restockReason || (pricingMode.key === "economy" ? country.restockDriver : "Manual rule");
        return {
          code: country.code,
          country: match.label || match.country || country.label,
          stock,
          available,
          priceModifier,
          price: localPrice.toFixed(2),
          priceNumber: localPrice,
          currency: match.currency || item.currency || "NRC",
          status,
          restock,
          visibility,
          macroDriver,
          restockDriver,
          pricingMode: pricingMode.label
        };
      });
    }
    if (!Number.isFinite(baseStock)) {
      return TERMINAL_STORE_COUNTRIES_V480.map((country) => {
        const appliedModifier = pricingMode.key === "economy" ? country.priceDrift || 0 : 0;
        const localPrice = basePrice * (1 + appliedModifier / 100);
        return {
          code: country.code,
          country: country.label,
          stock: Number.POSITIVE_INFINITY,
          available: Number.POSITIVE_INFINITY,
          priceModifier: pricingMode.key === "economy" ? (appliedModifier > 0 ? `+${appliedModifier}%` : `${appliedModifier}%`) : "Fixed",
          price: localPrice.toFixed(2),
          priceNumber: localPrice,
          currency: item.currency || "NRC",
          status: statusMeta.label,
          restock: item.restock || "Unlimited",
          visibility: item.visibility || "All players",
          macroDriver: pricingMode.key === "economy" ? country.macroDriver : "Teacher fixed",
          restockDriver: pricingMode.key === "economy" ? country.restockDriver : "Unlimited rule",
          pricingMode: pricingMode.label
        };
      });
    }
    const totalWeight = TERMINAL_STORE_COUNTRIES_V480.reduce((sum, country) => sum + country.weight, 0);
    let remaining = Math.max(0, Math.round(baseStock));
    return TERMINAL_STORE_COUNTRIES_V480.map((country, countryIndex) => {
      const last = countryIndex === countryCount - 1;
      const allocation = last ? remaining : Math.max(0, Math.round((baseStock * country.weight) / totalWeight));
      remaining -= allocation;
      const available = Math.max(0, allocation);
      const modifierNumber = pricingMode.key === "economy" ? country.priceDrift || 0 : 0;
      const localPrice = basePrice * (1 + modifierNumber / 100);
      const status = available === 0 ? "Sold Out" : available <= 3 ? "Low Stock" : statusMeta.label;
      return {
        code: country.code,
        country: country.label,
        stock: allocation,
        available,
        priceModifier: pricingMode.key === "economy" ? (modifierNumber > 0 ? `+${modifierNumber}%` : `${modifierNumber}%`) : "Fixed",
        price: localPrice.toFixed(2),
        priceNumber: localPrice,
        currency: item.currency || "NRC",
        status,
        restock: item.restock || "Manual",
        visibility: item.visibility || "All players",
        macroDriver: pricingMode.key === "economy" ? country.macroDriver : "Teacher fixed",
        restockDriver: pricingMode.key === "economy" ? country.restockDriver : "Manual rule",
        pricingMode: pricingMode.label
      };
    });
  }
  function summarizeTerminalStoreCountryStock(countryStock) {
    const countries = Array.isArray(countryStock) ? countryStock : [];
    const finite = countries.filter((entry) => Number.isFinite(entry.available));
    const unlimited = countries.some((entry) => entry.available === Number.POSITIVE_INFINITY);
    const total = unlimited ? "∞" : finite.reduce((sum, entry) => sum + Math.max(0, Number(entry.available) || 0), 0);
    const activeCountries = countries.filter((entry) => entry.available === Number.POSITIVE_INFINITY || Number(entry.available) > 0).length;
    const lowCountries = countries.filter((entry) => Number.isFinite(entry.available) && Number(entry.available) > 0 && Number(entry.available) <= 3).length;
    const soldOutCountries = countries.filter((entry) => Number.isFinite(entry.available) && Number(entry.available) <= 0).length;
    const stockMeta = unlimited ? "Unlimited by country" : `${activeCountries}/${countries.length} countries stocked`;
    const countryRisk = soldOutCountries ? `${soldOutCountries} sold out` : lowCountries ? `${lowCountries} low` : "balanced";
    const pricedCountries = countries.filter((entry) => Number.isFinite(entry.priceNumber));
    const priceCurrency = pricedCountries[0]?.currency || countries[0]?.currency || "NRC";
    const priceRangeText = formatTerminalStorePriceRange(pricedCountries.map((entry) => entry.priceNumber), priceCurrency);
    const priceVariance = pricedCountries.length ? Math.max(...pricedCountries.map((entry) => entry.priceNumber)) - Math.min(...pricedCountries.map((entry) => entry.priceNumber)) : 0;
    const economyLinked = countries.some((entry) => String(entry.priceModifier || "").toLowerCase() !== "fixed");
    return {
      totalStock: total,
      totalStockText: total === "∞" ? "∞" : String(total),
      activeCountries,
      lowCountries,
      soldOutCountries,
      countryRisk,
      stockMeta,
      priceRangeText,
      priceVariance,
      priceCurrency,
      economyLinked,
      hasCountryVariance: countries.length > 1
    };
  }
  function getTerminalStoreItems(model) {
    const source = Array.isArray(model?.storeItems) && model.storeItems.length
      ? model.storeItems
      : [
          { name: "Refined Alloy Bundle", kind: "Material", category: "Industrial Material", subcategory: "Crafting input", price: "12.00", currency: "NRC", stock: "64", status: "Active", restock: "Weekly", purchases: "18", pricingMode: "Economy-linked", risk: "Balanced", fulfillment: "Add to inventory", visibility: "All players", description: "Base material used for manufacturing and contract production tasks." },
          { name: "Energy Cell Pack", kind: "Material", category: "Power Material", subcategory: "Energy input", price: "9.00", currency: "NRC", stock: "42", status: "Active", restock: "Every 3 days", purchases: "24", pricingMode: "Economy-linked", risk: "Balanced", fulfillment: "Add to inventory", visibility: "All players", description: "Consumable production input for power-sensitive simulations." },
          { name: "Logistics Scanner", kind: "Equipment", category: "Operations Equipment", subcategory: "Reusable tool", price: "55.00", currency: "NRC", stock: "6", status: "Active", restock: "Manual", purchases: "5", pricingMode: "Economy-linked", risk: "High value", fulfillment: "Add equipment record", visibility: "Unlocked after first contract", description: "Reusable equipment that supports logistics and inspection contracts." },
          { name: "Market Lens", kind: "Equipment", category: "Analysis Equipment", subcategory: "Reusable tool", price: "70.00", currency: "NRC", stock: "3", status: "Low Stock", restock: "Manual", purchases: "7", pricingMode: "Economy-linked", risk: "Restock soon", fulfillment: "Add equipment record", visibility: "All players", description: "Premium analysis device used for market-readiness tasks." },
          { name: "Emergency Repair Kit", kind: "Consumable", category: "Consumable", subcategory: "One-time use", price: "18.00", currency: "NRC", stock: "25", status: "Active", restock: "Weekly", purchases: "16", pricingMode: "Economy-linked", risk: "Low risk", fulfillment: "Add to inventory", visibility: "All players", description: "One-time item for resolving equipment or production disruptions." },
          { name: "Priority Processing Token", kind: "Consumable", category: "Service Token", subcategory: "One-time use", price: "30.00", currency: "NRC", stock: "10", status: "Active", restock: "Weekly", purchases: "9", pricingMode: "Economy-linked", risk: "High impact", fulfillment: "Manual redemption", visibility: "Teacher approval", description: "Consumable token that lets a player request priority processing." },
          { name: "Field Permit", kind: "Consumable", category: "Access Pass", subcategory: "Contract unlock", price: "22.00", currency: "NRC", stock: "∞", status: "Active", restock: "Unlimited", purchases: "12", pricingMode: "Economy-linked", risk: "Balanced", fulfillment: "Unlock player action", visibility: "All players", description: "Purchaseable permit for participating in location-based tasks." },
          { name: "Advanced Fabricator", kind: "Equipment", category: "Manufacturing Equipment", subcategory: "Reusable machine", price: "120.00", currency: "NRC", stock: "1", status: "Restricted", restock: "Admin only", purchases: "1", pricingMode: "Economy-linked", risk: "Restricted high value", fulfillment: "Admin approval required", visibility: "Admin release", description: "High-value equipment for advanced production scenarios." },
          { name: "Data Chip", kind: "Material", category: "Digital Material", subcategory: "Research input", price: "15.00", currency: "NRC", stock: "0", status: "Sold Out", restock: "Next class", purchases: "30", pricingMode: "Economy-linked", risk: "Restock soon", fulfillment: "Add to inventory", visibility: "All players", description: "Research component used in information-market contracts.", systemItem: true },
          { name: "Teacher Bonus Coupon", kind: "Consumable", category: "Classroom Custom", subcategory: "Teacher reward", price: "8.00", currency: "Steam Bucks", stock: "∞", status: "Active", restock: "Unlimited", purchases: "4", pricingMode: "Fixed price", risk: "Teacher controlled", fulfillment: "Manual redemption", visibility: "Admin release only", description: "Custom classroom reward created by the teacher. Does not affect system economy logic.", customItem: true },
          { name: "Workshop Access Pass", kind: "Consumable", category: "Classroom Custom", subcategory: "Access pass", price: "12.00", currency: "Steam Bucks", stock: "18", status: "Active", restock: "Manual", purchases: "6", pricingMode: "Fixed price", risk: "Teacher controlled", fulfillment: "Unlock player action", visibility: "Selected locations", description: "Custom access item for teacher-run events, side tasks, or classroom activities.", customItem: true }
        ];
    return source.map((item, index) => {
      const status = item.status || (index === 3 ? "Low Stock" : index === 7 ? "Restricted" : "Active");
      const statusMeta = normalizeTerminalStoreStatus(status);
      const kindMeta = normalizeTerminalStoreKind(item);
      const sourceMeta = normalizeTerminalStoreSource(item, index);
      const priceNumber = Number(String(item.price || "0").replace(/[^0-9.-]/g, "")) || 0;
      const stockText = String(item.stock ?? "∞");
      const pricingMode = normalizeTerminalStorePricingMode(item, sourceMeta);
      const countryStock = deriveTerminalStoreCountryStock(item, index, statusMeta, sourceMeta);
      const countryStockSummary = summarizeTerminalStoreCountryStock(countryStock);
      const stockNumber = countryStockSummary.totalStock === "∞" ? Number.POSITIVE_INFINITY : Number(countryStockSummary.totalStock);
      const stockLevel = Number.isFinite(stockNumber)
        ? stockNumber <= 0 ? "soldout" : stockNumber <= 5 || countryStockSummary.lowCountries > 0 ? "low" : "stocked"
        : "unlimited";
      const riskFilter = isTerminalStoreRiskItem(item, statusMeta) || countryStockSummary.lowCountries > 0 || countryStockSummary.soldOutCountries > 0 ? "risk" : "clear";
      return {
        name: item.name || `Store Item ${index + 1}`,
        kind: kindMeta.label,
        kindKey: kindMeta.key,
        sourceKey: sourceMeta.key,
        sourceLabel: sourceMeta.label,
        sourceBadge: sourceMeta.badge,
        sourceMeta: sourceMeta.meta,
        editable: sourceMeta.editable,
        category: item.category || kindMeta.label,
        subcategory: item.subcategory || item.itemType || "Purchasable item",
        price: item.price || "0.00",
        priceNumber,
        priceRange: countryStockSummary.priceRangeText || `${item.price || "0.00"} ${item.currency || "NRC"}`,
        pricingMode: pricingMode.label,
        pricingModeKey: pricingMode.key,
        pricingModeMeta: pricingMode.meta,
        currency: item.currency || "NRC",
        stock: countryStockSummary.totalStockText,
        baseStock: stockText,
        stockLevel,
        countryStock,
        countryStockSummary,
        status: statusMeta.label,
        rawStatus: status,
        filterStatus: statusMeta.filter,
        riskFilter,
        tone: statusMeta.tone,
        restock: item.restock || "Manual",
        purchases: item.purchases || "0",
        fulfillment: item.fulfillment || "Add to inventory",
        visibility: item.visibility || "All players",
        description: item.description || "Purchasable store item.",
        index
      };
    });
  }
  function renderStorePageHeader(model) {
    return `
      <header class="admin-terminal-top admin-terminal-page-top">
        <div>
          <span>Purchasable catalog</span>
          <h2>Store</h2>
          <p>Build and manage materials, equipment, consumables, country stock, prices, and player-facing availability.</p>
        </div>
        <div class="admin-terminal-top-actions">
          <button class="admin-terminal-bell" type="button" aria-label="Alerts" data-admin-terminal-bell>
            ${bellIcon()}
            ${model.notificationCount ? `<small>${escapeHtml(model.notificationCount)}</small>` : ""}
          </button>
          <button class="admin-terminal-user-button" type="button" aria-label="Open admin profile menu" aria-expanded="false" data-admin-terminal-user>
            <span class="admin-terminal-avatar">${escapeHtml(getAdminInitials(model.adminName))}</span>
            <i aria-hidden="true"></i>
          </button>
          ${renderNotifications(model)}
          ${renderAdminUserMenu(model)}
        </div>
      </header>`;
  }
  function renderStoreStatusBadge(status, tone = "is-active") {
    return `<span class="admin-terminal-store-status ${escapeHtml(tone)}">${escapeHtml(status)}</span>`;
  }
  function renderStoreTypeChip(item) {
    return `<span class="admin-terminal-store-type-v479 is-${escapeHtml(item.kindKey)}">${escapeHtml(item.kind)}</span>`;
  }
  function renderStoreMetric(label, value, meta, tone = "cyan") {
    return `
      <article class="admin-terminal-store-metric is-${escapeHtml(tone)}">
        <small>${escapeHtml(label)}</small>
        <strong>${escapeHtml(value)}</strong>
        <span>${escapeHtml(meta)}</span>
      </article>`;
  }
  function renderStoreCountryStockTable(item) {
    const countries = Array.isArray(item.countryStock) ? item.countryStock : [];
    return `
      <section class="admin-terminal-store-country-stock-v480" aria-label="Country stock for ${escapeHtml(item.name)}">
        <header>
          <span>Country stock</span>
          <strong>${escapeHtml(item.countryStockSummary.stockMeta)}</strong>
          <small>Store stock controls purchasable inventory only.</small>
        </header>
        <div class="admin-terminal-store-country-stock-head-v480" role="row">
          <span>Country</span>
          <span>Available</span>
          <span>Local Price</span>
          <span>Restock</span>
          <span>Status</span>
        </div>
        ${countries.map((country) => {
          const availableText = formatTerminalStoreStockValue(country.available);
          const statusTone = String(country.status || "").toLowerCase().includes("sold") ? "is-muted" : String(country.status || "").toLowerCase().includes("low") ? "is-warn" : "is-active";
          return `
            <article class="admin-terminal-store-country-stock-row-v480 ${escapeHtml(statusTone)}" role="row">
              <span><b>${escapeHtml(country.country)}</b><small>${escapeHtml(country.code)}</small></span>
              <span><b>${escapeHtml(availableText)}</b><small>purchasable stock</small></span>
              <span><b>${renderCurrencyAmount(country.price, country.currency)}</b></span>
              <span><b>${escapeHtml(country.restock)}</b><small>Next cycle</small></span>
              <span>${renderStoreStatusBadge(country.status, statusTone)}</span>
            </article>`;
        }).join("")}
      </section>`;
  }
  function normalizeStoreEditSelect(value, field = "") {
    const text = String(value || "").toLowerCase();
    if (field === "restock") {
      if (text.includes("daily")) return "Daily restock";
      if (text.includes("weekly")) return "Weekly restock";
      if (text.includes("class")) return "Per class cycle";
      if (text.includes("never")) return "Never restock";
      return "Manual restock";
    }
    return String(value || "");
  }
  function renderStoreCatalogRow(item) {
    const stockMeta = item.countryStockSummary?.stockMeta || (item.stockLevel === "unlimited" ? "Unlimited" : item.stockLevel === "soldout" ? "Sold out" : item.stockLevel === "low" ? "Low stock" : "Stocked");
    const actionLabel = item.editable ? "Edit" : "Locked";
    const editStockMode = item.baseStock === "∞" ? "Unlimited" : "Limited";
    const editStockQuantity = item.baseStock === "∞" ? "" : String(item.baseStock || "").replace(/[^0-9]/g, "");
    const editRestock = normalizeStoreEditSelect(item.restock, "restock");
    return `
      <details class="admin-terminal-store-row-v479 ${escapeHtml(item.tone)} is-${escapeHtml(item.sourceKey)}-item" data-store-item data-store-status="${escapeHtml(item.filterStatus)}" data-store-risk="${escapeHtml(item.riskFilter)}" data-store-kind="${escapeHtml(item.kindKey)}" data-store-source="${escapeHtml(item.sourceKey)}">
        <summary>
          <span class="admin-terminal-store-row-item-v479">
            <i aria-hidden="true">${escapeHtml(item.kind.slice(0, 1))}</i>
            <span>
              <small>${escapeHtml(item.sourceLabel)}</small>
              <strong>${escapeHtml(item.name)}</strong>
            </span>
          </span>
          <span class="admin-terminal-store-row-type-v479">
            ${renderStoreTypeChip(item)}
            <small>${escapeHtml(item.subcategory)}</small>
          </span>
          <span class="admin-terminal-store-row-price-v479 is-v489">
            <small>Price Range</small>
            <strong>${escapeHtml(item.priceRange)}</strong>
          </span>
          <span class="admin-terminal-store-row-stock-v479 is-${escapeHtml(item.stockLevel)}">
            <small>${escapeHtml(stockMeta)}</small>
            <strong>${escapeHtml(item.stock)}</strong>
          </span>
          <span class="admin-terminal-store-row-status-v479">
            <b class="admin-terminal-store-origin-v481 is-${escapeHtml(item.sourceKey)}">${escapeHtml(item.sourceBadge)}</b>
            ${renderStoreStatusBadge(item.status, item.tone)}
          </span>
          <span class="admin-terminal-store-row-actions-v479">
            ${item.editable
              ? `<button type="button"
                  data-admin-terminal-action="edit-store-item"
                  data-store-edit-name="${escapeHtml(item.name)}"
                  data-store-edit-description="${escapeHtml(item.description)}"
                  data-store-edit-category="${escapeHtml(item.kind)}"
                  data-store-edit-type="${escapeHtml(item.subcategory)}"
                  data-store-edit-status="${escapeHtml(item.status)}"
                  data-store-edit-price="${escapeHtml(item.price)}"
                  data-store-edit-currency="${escapeHtml(item.currency)}"
                  data-store-edit-pricing-mode="${escapeHtml(item.pricingMode)}"
                  data-store-edit-stock-mode="${escapeHtml(editStockMode)}"
                  data-store-edit-stock-quantity="${escapeHtml(editStockQuantity)}"
                  data-store-edit-restock="${escapeHtml(editRestock)}"
                  data-store-edit-visibility="${escapeHtml(item.visibility)}"
                  data-store-edit-fulfillment="${escapeHtml(item.fulfillment)}"
                  data-store-edit-usage="Player redeems manually">${escapeHtml(actionLabel)}</button>`
              : `<button type="button" class="is-locked" disabled aria-disabled="true">${escapeHtml(actionLabel)}</button>`}
          </span>
        </summary>
        <section class="admin-terminal-store-row-detail-v479 is-clean-v491">
          <article class="admin-terminal-store-description-v491"><small>Description</small><p>${escapeHtml(item.description)}</p></article>
          <article><small>Restock</small><strong>${escapeHtml(item.restock)}</strong></article>
          <article><small>Visibility</small><strong>${escapeHtml(item.visibility)}</strong></article>
          <article><small>Fulfillment</small><strong>${escapeHtml(item.fulfillment)}</strong></article>
        </section>
        ${renderStoreCountryStockTable(item)}
      </details>`;
  }
  function renderStorePage(model) {
    const items = getTerminalStoreItems(model);
    const activeCount = items.filter((item) => item.status === "Active").length;
    const materialCount = items.filter((item) => item.kindKey === "materials").length;
    const equipmentCount = items.filter((item) => item.kindKey === "equipment").length;
    const consumableCount = items.filter((item) => item.kindKey === "consumables").length;
    const riskCount = items.filter((item) => item.riskFilter === "risk").length;
    const systemCount = items.filter((item) => item.sourceKey === "system").length;
    const customCount = items.filter((item) => item.sourceKey === "custom").length;
    const lowStockCount = items.filter((item) => item.stockLevel === "low" || item.stockLevel === "soldout").length;
    const countryStockedCount = items.reduce((total, item) => total + (item.countryStockSummary?.activeCountries || 0), 0);
    const countryLowCount = items.reduce((total, item) => total + (item.countryStockSummary?.lowCountries || 0) + (item.countryStockSummary?.soldOutCountries || 0), 0);
    const listedValue = items.reduce((total, item) => total + item.priceNumber, 0);
    return `
      <section class="admin-terminal-overview admin-terminal-store-page" aria-label="Admin store terminal" data-admin-terminal-page="Store">
        ${renderStorePageHeader(model)}
        <div class="admin-terminal-store-manager-v479">
          <aside class="admin-terminal-store-overview-v479" aria-label="Store catalog overview">
            <header>
              <span>Catalog</span>
              <strong>${escapeHtml(items.length)} items</strong>
              <small>${escapeHtml(systemCount)} system locked · ${escapeHtml(customCount)} custom editable</small>
            </header>
            <button class="admin-terminal-store-add-v479" type="button" data-admin-terminal-action="add-store-item">
              <span>＋</span>
              Add Custom Item
            </button>
            <section class="admin-terminal-store-metrics-v479 is-slim-v482">
              ${renderStoreMetric("System", systemCount, "locked", "cyan")}
              ${renderStoreMetric("Custom", customCount, "editable", "active")}
              ${renderStoreMetric("Review", riskCount, "needs check", riskCount ? "warn" : "active")}
            </section>
            <section class="admin-terminal-store-rules-v479 is-slim-v482">
              <span>Store rule</span>
              <p>System items are seeded and protected. Teachers only add or edit custom items.</p>
            </section>
          </aside>
          <section class="admin-terminal-store-catalog-v479" aria-label="Store catalog manager">
            <header>
              <div>
                <span>Purchasable Catalog</span>
                <h3>Store items</h3>
                <small>Open a row for country stock, local prices, restock, and item details.</small>
              </div>
              <div class="admin-terminal-store-tabs-v479 is-slim-v482" data-store-filter-controls>
                <button type="button" class="active" aria-pressed="true" data-admin-terminal-action="filter-store" data-store-filter="all">All ${escapeHtml(items.length)}</button>
                <button type="button" aria-pressed="false" data-admin-terminal-action="filter-store" data-store-filter="system">System ${escapeHtml(systemCount)}</button>
                <button type="button" aria-pressed="false" data-admin-terminal-action="filter-store" data-store-filter="custom">Custom ${escapeHtml(customCount)}</button>
                <button type="button" aria-pressed="false" data-admin-terminal-action="filter-store" data-store-filter="materials">Materials ${escapeHtml(materialCount)}</button>
                <button type="button" aria-pressed="false" data-admin-terminal-action="filter-store" data-store-filter="equipment">Equipment ${escapeHtml(equipmentCount)}</button>
                <button type="button" aria-pressed="false" data-admin-terminal-action="filter-store" data-store-filter="consumables">Consumables ${escapeHtml(consumableCount)}</button>
                <button type="button" aria-pressed="false" data-admin-terminal-action="filter-store" data-store-filter="risk">Review ${escapeHtml(riskCount)}</button>
              </div>
            </header>
            <div class="admin-terminal-store-ledger-v479" data-store-filter-scope>
              <div class="admin-terminal-store-ledger-head-v479" role="row">
                <span>Item</span>
                <span>Class</span>
                <span>Price</span>
                <span>Stock</span>
                <span>Status</span>
                <span>Action</span>
              </div>
              ${items.map(renderStoreCatalogRow).join("")}
              <p class="admin-terminal-store-empty-v479" data-store-filter-empty hidden>No store items match this filter.</p>
            </div>
          </section>
        </div>
      </section>`;
  }
  function formatMarketplaceFinancialValue(value) {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "number") {
      if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}B`;
      return `${value.toFixed(1)}M`;
    }
    return String(value);
  }
  function sanitizeMarketplaceId(value) {
    return String(value || "market-security").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "market-security";
  }
  function buildMarketplaceFinancialRows(rows, fallbackRows) {
    if (Array.isArray(rows) && rows.length) {
      return rows.map((row) => ({
        label: row.label || row.name || "Metric",
        value: formatMarketplaceFinancialValue(row.value ?? row.amount ?? row.metric),
        meta: row.meta || row.period || row.note || ""
      }));
    }
    return fallbackRows;
  }
  function buildMarketplaceFinancials(asset, priceNumber, type) {
    const financials = asset.financials || {};
    const isCompany = String(type || "").toLowerCase() === "stock";
    const scale = Math.max(1, Number(priceNumber) || 1);
    const revenue = scale * (isCompany ? 48 : 18);
    const grossProfit = revenue * 0.42;
    const operatingIncome = revenue * 0.18;
    const netIncome = revenue * 0.12;
    const cash = revenue * 0.21;
    const debt = revenue * 0.34;
    const assets = revenue * 1.18;
    const equity = assets - debt;
    const freeCashFlow = netIncome * 0.82;
    const sharesOut = Math.max(18, scale * 1.9);
    const title = isCompany ? "Company financials" : "Instrument financials";
    const formatSeriesValue = (value) => `${value.toFixed(1)}M`;
    const annualPeriods = ["2022", "2023", "2024", "2025"];
    const quarterlyPeriods = ["Jun 2025", "Sep 2025", "Dec 2025", "Mar 2026"];
    const annualRevenue = [revenue * 0.72, revenue * 0.84, revenue * 0.93, revenue];
    const annualNetIncome = [netIncome * 0.68, netIncome * 0.79, netIncome * 0.91, netIncome];
    const annualAssets = [assets * 0.80, assets * 0.91, assets * 1.02, assets * 1.08];
    const annualDebt = [debt * 0.82, debt * 0.94, debt, debt * 1.04];
    const annualOperatingCF = [freeCashFlow * 0.92, freeCashFlow * 1.04, freeCashFlow * 1.12, freeCashFlow * 1.22];
    const annualFreeCF = [freeCashFlow * 0.58, freeCashFlow * 0.67, freeCashFlow * 0.79, freeCashFlow];
    const quarterlyRevenue = [revenue * 0.23, revenue * 0.25, revenue * 0.28, revenue * 0.24];
    const quarterlyNetIncome = [netIncome * 0.20, netIncome * 0.23, netIncome * 0.30, netIncome * 0.27];
    const quarterlyAssets = [assets * 0.97, assets, assets * 1.03, assets * 1.06];
    const quarterlyDebt = [debt * 0.96, debt * 0.99, debt * 1.02, debt * 1.04];
    const quarterlyOperatingCF = [freeCashFlow * 0.24, freeCashFlow * 0.28, freeCashFlow * 0.32, freeCashFlow * 0.29];
    const quarterlyFreeCF = [freeCashFlow * 0.16, freeCashFlow * 0.19, freeCashFlow * 0.23, freeCashFlow * 0.20];
    const statementRows = {
      income: {
        annual: [
          { label: "Revenue", values: annualRevenue.map(formatSeriesValue) },
          { label: "Gross profit", values: annualRevenue.map((value) => formatSeriesValue(value * 0.42)) },
          { label: "Operating income", values: annualRevenue.map((value) => formatSeriesValue(value * 0.18)) },
          { label: "Net income", values: annualNetIncome.map(formatSeriesValue) },
          { label: "EPS", values: annualNetIncome.map((value) => `${Math.max(0.12, value / sharesOut).toFixed(2)}`) },
          { label: "EBITDA", values: annualRevenue.map((value) => formatSeriesValue(value * 0.22)) }
        ],
        quarterly: [
          { label: "Revenue", values: quarterlyRevenue.map(formatSeriesValue) },
          { label: "Gross profit", values: quarterlyRevenue.map((value) => formatSeriesValue(value * 0.42)) },
          { label: "Operating income", values: quarterlyRevenue.map((value) => formatSeriesValue(value * 0.18)) },
          { label: "Net income", values: quarterlyNetIncome.map(formatSeriesValue) },
          { label: "EPS", values: quarterlyNetIncome.map((value) => `${Math.max(0.03, value / sharesOut).toFixed(2)}`) },
          { label: "EBITDA", values: quarterlyRevenue.map((value) => formatSeriesValue(value * 0.22)) }
        ]
      },
      balance: {
        annual: [
          { label: "Cash", values: annualAssets.map((value) => formatSeriesValue(value * 0.18)) },
          { label: "Total assets", values: annualAssets.map(formatSeriesValue) },
          { label: "Total debt", values: annualDebt.map(formatSeriesValue) },
          { label: "Equity", values: annualAssets.map((value, index) => formatSeriesValue(value - annualDebt[index])) },
          { label: "Working capital", values: annualAssets.map((value) => formatSeriesValue(value * 0.14)) },
          { label: "Shares outstanding", values: annualPeriods.map(() => `${sharesOut.toFixed(1)}M`) }
        ],
        quarterly: [
          { label: "Cash", values: quarterlyAssets.map((value) => formatSeriesValue(value * 0.18)) },
          { label: "Total assets", values: quarterlyAssets.map(formatSeriesValue) },
          { label: "Total debt", values: quarterlyDebt.map(formatSeriesValue) },
          { label: "Equity", values: quarterlyAssets.map((value, index) => formatSeriesValue(value - quarterlyDebt[index])) },
          { label: "Working capital", values: quarterlyAssets.map((value) => formatSeriesValue(value * 0.14)) },
          { label: "Shares outstanding", values: quarterlyPeriods.map(() => `${sharesOut.toFixed(1)}M`) }
        ]
      },
      cashflow: {
        annual: [
          { label: "Operating cash flow", values: annualOperatingCF.map(formatSeriesValue) },
          { label: "Capital expenditure", values: annualOperatingCF.map((value) => formatSeriesValue(-Math.abs(value * 0.28))) },
          { label: "Free cash flow", values: annualFreeCF.map(formatSeriesValue) },
          { label: "Financing flow", values: annualFreeCF.map((value) => formatSeriesValue(-Math.abs(value * 0.22))) },
          { label: "Cash change", values: annualFreeCF.map((value) => formatSeriesValue(value * 0.38)) },
          { label: "FCF margin", values: annualFreeCF.map((value, index) => `${Math.max(2, (value / annualRevenue[index]) * 100).toFixed(1)}%`) }
        ],
        quarterly: [
          { label: "Operating cash flow", values: quarterlyOperatingCF.map(formatSeriesValue) },
          { label: "Capital expenditure", values: quarterlyOperatingCF.map((value) => formatSeriesValue(-Math.abs(value * 0.28))) },
          { label: "Free cash flow", values: quarterlyFreeCF.map(formatSeriesValue) },
          { label: "Financing flow", values: quarterlyFreeCF.map((value) => formatSeriesValue(-Math.abs(value * 0.22))) },
          { label: "Cash change", values: quarterlyFreeCF.map((value) => formatSeriesValue(value * 0.38)) },
          { label: "FCF margin", values: quarterlyFreeCF.map((value, index) => `${Math.max(2, (value / quarterlyRevenue[index]) * 100).toFixed(1)}%`) }
        ]
      }
    };
    return {
      title,
      period: financials.period || asset.financialPeriod || "TTM / latest cycle",
      currency: asset.currency || "NRC",
      overview: buildMarketplaceFinancialRows(financials.overview, [
        { label: "Revenue", value: `${revenue.toFixed(1)}M`, meta: "TTM" },
        { label: "Gross Profit", value: `${grossProfit.toFixed(1)}M`, meta: "42% margin" },
        { label: "Operating Income", value: `${operatingIncome.toFixed(1)}M`, meta: "Core earnings" },
        { label: "Net Income", value: `${netIncome.toFixed(1)}M`, meta: "After tax" },
        { label: "EPS", value: `${Math.max(0.12, scale / 88).toFixed(2)}`, meta: "per share" },
        { label: "Shares Out", value: `${sharesOut.toFixed(1)}M`, meta: "float" }
      ]),
      income: buildMarketplaceFinancialRows(financials.income, [
        { label: "Revenue", value: `${revenue.toFixed(1)}M`, meta: "sales" },
        { label: "Cost of Revenue", value: `${(revenue - grossProfit).toFixed(1)}M`, meta: "COGS" },
        { label: "Gross Profit", value: `${grossProfit.toFixed(1)}M`, meta: "after COGS" },
        { label: "Operating Expense", value: `${(grossProfit - operatingIncome).toFixed(1)}M`, meta: "OPEX" },
        { label: "Operating Income", value: `${operatingIncome.toFixed(1)}M`, meta: "EBIT" },
        { label: "Net Income", value: `${netIncome.toFixed(1)}M`, meta: "bottom line" }
      ]),
      balance: buildMarketplaceFinancialRows(financials.balance, [
        { label: "Cash", value: `${cash.toFixed(1)}M`, meta: "liquidity" },
        { label: "Total Assets", value: `${assets.toFixed(1)}M`, meta: "asset base" },
        { label: "Total Debt", value: `${debt.toFixed(1)}M`, meta: "borrowings" },
        { label: "Equity", value: `${equity.toFixed(1)}M`, meta: "book value" },
        { label: "Working Capital", value: `${(cash * 0.64).toFixed(1)}M`, meta: "near term" },
        { label: "Debt / Equity", value: `${Math.max(0.05, debt / Math.max(equity, 1)).toFixed(2)}x`, meta: "leverage" }
      ]),
      cashflow: buildMarketplaceFinancialRows(financials.cashflow, [
        { label: "Operating Cash Flow", value: `${(netIncome * 1.14).toFixed(1)}M`, meta: "operations" },
        { label: "Capital Expenditure", value: `${(-Math.abs(netIncome * 0.32)).toFixed(1)}M`, meta: "investment" },
        { label: "Free Cash Flow", value: `${freeCashFlow.toFixed(1)}M`, meta: "after capex" },
        { label: "Financing Flow", value: `${(-Math.abs(netIncome * 0.18)).toFixed(1)}M`, meta: "debt/equity" },
        { label: "Cash Change", value: `${(freeCashFlow * 0.42).toFixed(1)}M`, meta: "period" },
        { label: "FCF Margin", value: `${Math.max(2, (freeCashFlow / revenue) * 100).toFixed(1)}%`, meta: "quality" }
      ]),
      ratios: buildMarketplaceFinancialRows(financials.ratios, [
        { label: "P/E", value: asset.pe || asset.ratio || `${Math.max(8, 10 + scale / 16).toFixed(1)}`, meta: "valuation" },
        { label: "Net Margin", value: `${((netIncome / revenue) * 100).toFixed(1)}%`, meta: "profitability" },
        { label: "ROE", value: `${Math.max(4, (netIncome / Math.max(equity, 1)) * 100).toFixed(1)}%`, meta: "return" },
        { label: "Current Ratio", value: `${Math.max(0.8, 1.05 + scale / 240).toFixed(2)}x`, meta: "liquidity" },
        { label: "Dividend Yield", value: asset.yield || asset.dividendYield || "0.0%", meta: "income" },
        { label: "Beta", value: asset.beta || asset.volatility || "—", meta: "volatility" }
      ]),
      statements: {
        annualPeriods,
        quarterlyPeriods,
        income: {
          chartTitle: "Income statement",
          annualSeries: annualPeriods.map((label, index) => ({ label, primary: annualRevenue[index], secondary: annualNetIncome[index] })),
          quarterlySeries: quarterlyPeriods.map((label, index) => ({ label, primary: quarterlyRevenue[index], secondary: quarterlyNetIncome[index] })),
          annualRows: statementRows.income.annual,
          quarterlyRows: statementRows.income.quarterly,
          primaryLabel: "Revenue",
          secondaryLabel: "Net income"
        },
        balance: {
          chartTitle: "Balance sheet",
          annualSeries: annualPeriods.map((label, index) => ({ label, primary: annualAssets[index], secondary: annualDebt[index] })),
          quarterlySeries: quarterlyPeriods.map((label, index) => ({ label, primary: quarterlyAssets[index], secondary: quarterlyDebt[index] })),
          annualRows: statementRows.balance.annual,
          quarterlyRows: statementRows.balance.quarterly,
          primaryLabel: "Assets",
          secondaryLabel: "Debt"
        },
        cashflow: {
          chartTitle: "Cash flow",
          annualSeries: annualPeriods.map((label, index) => ({ label, primary: annualOperatingCF[index], secondary: annualFreeCF[index] })),
          quarterlySeries: quarterlyPeriods.map((label, index) => ({ label, primary: quarterlyOperatingCF[index], secondary: quarterlyFreeCF[index] })),
          annualRows: statementRows.cashflow.annual,
          quarterlyRows: statementRows.cashflow.quarterly,
          primaryLabel: "Operating CF",
          secondaryLabel: "Free cash flow"
        }
      }
    };
  }
  function buildMarketplaceCandles(asset, priceNumber, changeNumber) {
    const raw = Array.isArray(asset.candles) && asset.candles.length
      ? asset.candles
      : Array.isArray(asset.ohlc) && asset.ohlc.length
        ? asset.ohlc
        : [];
    if (raw.length) {
      return raw.map((candle, index) => ({
        label: candle.label || candle.time || candle.date || `T-${raw.length - index}`,
        open: Number(candle.open ?? candle.o ?? priceNumber) || priceNumber,
        high: Number(candle.high ?? candle.h ?? priceNumber) || priceNumber,
        low: Number(candle.low ?? candle.l ?? priceNumber) || priceNumber,
        close: Number(candle.close ?? candle.c ?? priceNumber) || priceNumber,
        volume: Number(candle.volume ?? candle.v ?? 80) || 80
      }));
    }
    const history = Array.isArray(asset.history) && asset.history.length ? asset.history : [0.52,0.54,0.57,0.55,0.59,0.62,0.60,0.64,0.67,0.66,0.70,0.72];
    const base = Math.max(0.01, Number(priceNumber) || 1);
    const targetCandles = 56;
    const sampleAt = (position) => {
      const scaled = position * Math.max(history.length - 1, 1);
      const left = Math.floor(scaled);
      const right = Math.min(history.length - 1, left + 1);
      const weight = scaled - left;
      const leftValue = Number(history[left]) || 0.5;
      const rightValue = Number(history[right]) || leftValue;
      return leftValue + (rightValue - leftValue) * weight;
    };
    let priorClose = base * (0.91 + Math.max(-8, Math.min(8, -changeNumber)) / 100);
    return Array.from({ length: targetCandles }, (_, index) => {
      const progress = index / Math.max(targetCandles - 1, 1);
      const normalized = Math.max(0.12, Math.min(0.98, sampleAt(progress)));
      const rhythm = Math.sin(index * 0.82) * 0.007 + Math.cos(index * 0.37) * 0.004;
      const drift = (normalized - 0.5) * 0.19 + (changeNumber / 100) * progress + rhythm;
      const close = Math.max(0.01, base * (0.96 + drift));
      const open = priorClose;
      const spread = Math.max(base * 0.006, Math.abs(close - open) * 0.54 + base * (0.004 + (index % 6) * 0.0012));
      const high = Math.max(open, close) + spread;
      const low = Math.max(0.01, Math.min(open, close) - spread * 0.86);
      const volume = Math.round(54 + normalized * 138 + (index % 7) * 8 + Math.abs(close - open) / base * 720);
      priorClose = close;
      return { label: `D${index + 1}`, open, high, low, close, volume };
    });
  }
  function normalizeMarketplaceSecurity(asset, index) {
    const priceNumber = Number(String(asset.price ?? asset.lastPrice ?? asset.premium ?? 0).replace(/[^0-9.-]/g, "")) || 0;
    const change = asset.change || asset.changePct || asset.delta || (index % 3 === 0 ? "+1.2%" : index % 3 === 1 ? "-0.6%" : "+0.0%");
    const changeNumber = Number(String(change).replace(/[^0-9.-]/g, "")) || 0;
    const type = asset.type || asset.assetType || "Stock";
    const symbol = asset.symbol || asset.ticker || `SEC${index + 1}`;
    const history = Array.isArray(asset.history) && asset.history.length
      ? asset.history
      : [0.62, 0.74, 0.68, 0.79, 0.71, 0.84, 0.81, 0.90, 0.86, 0.94, 0.91, Math.max(0.28, Math.min(0.98, 0.72 + changeNumber / 18))];
    return {
      id: asset.id || symbol,
      symbol,
      name: asset.name || asset.company || `${symbol} Holdings`,
      type,
      sector: asset.sector || "Diversified",
      country: asset.country || asset.location || "Northreach",
      exchange: asset.exchange || "NOVX",
      currency: asset.currency || "NRC",
      price: priceNumber.toFixed(2),
      priceNumber,
      change,
      changeNumber,
      tone: changeNumber > 0 ? "is-up" : changeNumber < 0 ? "is-down" : "is-flat",
      volume: asset.volume || asset.turnover || "—",
      marketCap: asset.marketCap || asset.size || "—",
      pe: asset.pe || asset.ratio || "—",
      yieldValue: asset.yield || asset.coupon || asset.dividendYield || "—",
      beta: asset.beta || asset.volatility || "—",
      dayRange: asset.dayRange || `${Math.max(priceNumber * 0.96, 0).toFixed(2)}–${(priceNumber * 1.04).toFixed(2)}`,
      risk: asset.risk || asset.rating || "Moderate",
      description: asset.description || "Simulation security used for student trading, portfolio construction, and market literacy decisions.",
      thesis: asset.thesis || asset.profile || "Price movement is driven by country conditions, sector demand, company fundamentals, and current market events.",
      holdings: asset.holdings || asset.components || "—",
      maturity: asset.maturity || "—",
      coupon: asset.coupon || "—",
      expenseRatio: asset.expenseRatio || "—",
      contract: asset.contract || "—",
      optionChain: Array.isArray(asset.optionChain) ? asset.optionChain : [],
      financials: buildMarketplaceFinancials(asset, priceNumber, type),
      candles: buildMarketplaceCandles(asset, priceNumber, changeNumber),
      rangeCandles: asset.rangeCandles || asset.candleRanges || asset.chartData || {},
      history,
      tradable: asset.tradable !== false,
      shortable: asset.shortable !== false && !String(type).toLowerCase().includes("bond"),
      options: asset.options !== false && ["Stock", "ETF", "Index"].includes(type),
      index
    };
  }
  function getTerminalMarketplaceSecurities(model) {
    const fallback = [
      { symbol: "FROST", name: "Frostline Energy & Logistics", type: "Stock", sector: "Energy", country: "Northreach", exchange: "NRX", price: 128.20, change: "+2.4%", volume: "1.24M", marketCap: "9.8B", pe: "18.6", yield: "1.1%", beta: "1.18", risk: "Cyclical", description: "Cold-region energy producer with heavy exposure to shipping routes, fuel demand, and infrastructure reliability.", thesis: "Benefits when Northreach logistics improve; vulnerable to fuel oversupply and export delays.", history: [0.55,0.57,0.61,0.60,0.66,0.70,0.69,0.72,0.78,0.76,0.82,0.88], optionChain: [{ type: "Call", strike: "130", expiry: "W2", premium: "4.20" }, { type: "Put", strike: "125", expiry: "W2", premium: "3.10" }] },
      { symbol: "SABLE", name: "Sable Port Finance", type: "Stock", sector: "Finance", country: "Thaloris", exchange: "TPX", price: 74.10, change: "+0.8%", volume: "820K", marketCap: "4.1B", pe: "14.2", yield: "2.8%", beta: "0.92", risk: "Rate sensitive", description: "Port-finance lender tied to trade volume, credit conditions, and logistics activity.", thesis: "Moves with trade confidence and interest-rate pressure.", history: [0.44,0.48,0.46,0.51,0.55,0.54,0.58,0.57,0.61,0.64,0.63,0.67] },
      { symbol: "DUSK", name: "Duskline Repair Yards", type: "Stock", sector: "Industrials", country: "Syndalis", exchange: "SDX", price: 31.42, change: "-1.9%", volume: "1.01M", marketCap: "1.2B", pe: "22.1", yield: "0.0%", beta: "1.46", risk: "High volatility", description: "Repair-yard operator exposed to port inspections, informal logistics, and commodity shipment interruptions.", thesis: "Rises when maintenance backlogs build; falls when inspection or sanctions risk slows traffic.", history: [0.66,0.63,0.61,0.58,0.60,0.56,0.52,0.49,0.50,0.46,0.44,0.42], optionChain: [{ type: "Call", strike: "35", expiry: "W1", premium: "1.20" }, { type: "Put", strike: "30", expiry: "W1", premium: "1.75" }] },
      { symbol: "SOLV", name: "Solvend Aerotech", type: "Stock", sector: "Technology", country: "Yrethia", exchange: "YTX", price: 212.88, change: "+4.1%", volume: "1.89M", marketCap: "18.6B", pe: "41.7", yield: "0.0%", beta: "1.62", risk: "Growth", description: "AI and aerospace contractor driven by defense contracts, research grants, and technology sentiment.", thesis: "Strong upside during innovation cycles; sensitive to funding cuts and failed launches.", history: [0.50,0.54,0.57,0.55,0.63,0.66,0.69,0.75,0.78,0.84,0.88,0.96] },
      { symbol: "ELDR", name: "Eldoran Grain Transport", type: "Stock", sector: "Agriculture", country: "Eldora", exchange: "EGX", price: 96.33, change: "-0.4%", volume: "690K", marketCap: "6.3B", pe: "16.9", yield: "1.9%", beta: "0.81", risk: "Weather", description: "Agriculture transport company affected by crop output, fuel prices, and rural infrastructure.", thesis: "Defensive revenue base, but margin pressure rises when harvest or transport conditions weaken.", history: [0.60,0.61,0.63,0.62,0.61,0.64,0.62,0.61,0.59,0.58,0.57,0.56] },
      { symbol: "NVRX", name: "Novaria Composite Index", type: "Index", sector: "Broad Market", country: "All Countries", exchange: "NOVX", price: 4232.55, change: "+0.7%", volume: "Index", marketCap: "Composite", pe: "19.4", yield: "1.5%", beta: "1.00", risk: "Market", description: "Broad simulation index tracking large-cap stocks across the game economy.", thesis: "Useful for comparing individual holdings against the total market.", history: [0.52,0.55,0.57,0.56,0.60,0.62,0.65,0.66,0.68,0.70,0.72,0.74] },
      { symbol: "N10Y", name: "Northreach 10Y Government Bond", type: "Bond", sector: "Sovereign Debt", country: "Northreach", exchange: "Debt Desk", price: 98.60, change: "-0.2%", volume: "540K", marketCap: "Sovereign", coupon: "4.2%", maturity: "10Y", yield: "4.38%", beta: "0.22", risk: "Interest-rate", description: "Benchmark government bond used to teach yield, price sensitivity, and safe-asset behavior.", thesis: "Bond price falls when rates rise and generally stabilizes during equity stress.", history: [0.72,0.71,0.70,0.68,0.67,0.66,0.65,0.66,0.64,0.63,0.62,0.61], shortable: false, options: false },
      { symbol: "SYN5", name: "Syndalis 5Y Recovery Bond", type: "Bond", sector: "Sovereign Debt", country: "Syndalis", exchange: "Debt Desk", price: 89.45, change: "+1.1%", volume: "310K", marketCap: "Sovereign", coupon: "7.5%", maturity: "5Y", yield: "9.12%", beta: "0.48", risk: "Credit", description: "Higher-yield government bond exposed to country risk and recovery expectations.", thesis: "Rewards risk appetite; sells off quickly when stability weakens.", history: [0.44,0.43,0.46,0.45,0.48,0.49,0.51,0.53,0.52,0.55,0.57,0.60], shortable: false, options: false },
      { symbol: "FOOD", name: "Food Staples ETF", type: "ETF", sector: "Consumer Staples", country: "All Countries", exchange: "NOVX", price: 52.74, change: "+0.3%", volume: "1.12M", marketCap: "ETF", pe: "15.8", expenseRatio: "0.18%", yield: "2.1%", beta: "0.64", risk: "Defensive", holdings: "ELDR, farm logistics, cold-chain operators", description: "Basket of food, agriculture, and staple logistics securities.", thesis: "Lower volatility than single stocks; reacts to food inflation and harvest quality.", history: [0.56,0.57,0.58,0.57,0.59,0.60,0.61,0.61,0.62,0.63,0.63,0.64] },
      { symbol: "TECH", name: "Advanced Systems ETF", type: "ETF", sector: "Technology", country: "All Countries", exchange: "NOVX", price: 118.05, change: "+2.2%", volume: "980K", marketCap: "ETF", pe: "32.4", expenseRatio: "0.24%", yield: "0.2%", beta: "1.34", risk: "Growth", holdings: "SOLV, automation suppliers, compute infrastructure", description: "Technology-sector basket for students who want sector exposure without single-company concentration.", thesis: "Tracks innovation confidence and credit availability.", history: [0.47,0.49,0.51,0.54,0.53,0.57,0.61,0.63,0.67,0.70,0.74,0.79] },
      { symbol: "OIL", name: "Crude Fuel Contract", type: "Commodity", sector: "Energy", country: "Global", exchange: "Commodities", price: 83.20, change: "+1.7%", volume: "2.4M", marketCap: "Futures", contract: "Front month", beta: "1.21", risk: "Supply shock", description: "Energy commodity used to show input-cost shocks across transportation, manufacturing, and consumer prices.", thesis: "Rises when supply tightens or demand accelerates; pressures transport-heavy businesses.", history: [0.51,0.54,0.53,0.56,0.60,0.58,0.62,0.65,0.66,0.70,0.71,0.75] },
      { symbol: "WHT", name: "Wheat Basket", type: "Commodity", sector: "Agriculture", country: "Eldora", exchange: "Commodities", price: 22.15, change: "-0.9%", volume: "1.6M", marketCap: "Spot basket", contract: "Cash", beta: "0.77", risk: "Weather", description: "Food commodity used to connect harvest conditions, staples pricing, and consumer sentiment.", thesis: "Moves with weather, logistics, and food security concerns.", history: [0.63,0.60,0.62,0.59,0.57,0.56,0.55,0.53,0.54,0.52,0.51,0.50] },
      { symbol: "SOLV-C230", name: "SOLV 230 Call", type: "Option", sector: "Technology", country: "Yrethia", exchange: "Options", price: 6.80, change: "+8.2%", volume: "410K", marketCap: "Derivative", contract: "Call · Strike 230 · W2", beta: "High", risk: "Leveraged", description: "Call option contract giving upside exposure to Solvend Aerotech above the strike price before expiry.", thesis: "Useful for teaching premium, strike, expiry, leverage, and time decay.", history: [0.32,0.35,0.34,0.42,0.44,0.48,0.52,0.57,0.61,0.66,0.72,0.81] },
      { symbol: "FROST-P120", name: "FROST 120 Put", type: "Option", sector: "Energy", country: "Northreach", exchange: "Options", price: 3.40, change: "-4.6%", volume: "280K", marketCap: "Derivative", contract: "Put · Strike 120 · W2", beta: "High", risk: "Leveraged", description: "Put option contract giving downside protection or bearish exposure to Frostline Energy.", thesis: "Good for demonstrating hedging and speculative downside exposure.", history: [0.70,0.68,0.64,0.66,0.60,0.58,0.55,0.51,0.48,0.45,0.42,0.39] }
    ];
    const source = Array.isArray(model?.marketplaceSecurities) && model.marketplaceSecurities.length
      ? model.marketplaceSecurities
      : Array.isArray(model?.marketTickers) && model.marketTickers.length
        ? model.marketTickers
        : Array.isArray(model?.stocks) && model.stocks.length
          ? model.stocks
          : fallback;
    return source.map(normalizeMarketplaceSecurity);
  }
  function getUniqueMarketplaceValues(securities, key) {
    return Array.from(new Set(securities.map((asset) => asset[key]).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)));
  }
  function renderMarketplaceSelectOptions(values) {
    return values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  }
  function renderMarketplaceIcon(name) {
    const icons = {
      candle: '<path d="M7 4v16M17 3v18"></path><rect x="5" y="8" width="4" height="8" rx="1"></rect><rect x="15" y="7" width="4" height="10" rx="1"></rect>',
      line: '<path d="M3.5 16.5l4.5-5 4 3 7.5-8"></path><path d="M3.5 20.5h17"></path>',
      area: '<path d="M3.5 17l4.5-5 4 3 7.5-8"></path><path d="M3.5 20h17"></path><path d="M4 17l4-4 4 3 7-8v12H4z" class="is-soft-fill"></path>',
      bar: '<path d="M4 20.5h16"></path><path d="M7 20V9M12 20V4M17 20v-7"></path>',
      compare: '<path d="M4 7h9"></path><path d="M10 3.5L13.5 7 10 10.5"></path><path d="M20 17h-9"></path><path d="M14 13.5L10.5 17 14 20.5"></path>',
      indicator: '<path d="M4 18l4-8 4 5 4-9 4 12"></path><path d="M4 21h16"></path>',
      none: '<path d="M6 6l12 12M18 6L6 18"></path>',
      ma: '<path d="M4 16c3-6 5-6 8 0s5 6 8 0"></path><path d="M4 20h16"></path>',
      vwap: '<path d="M4 7h16M4 12h16M4 17h16"></path><path d="M8 4v16M16 4v16"></path>'
    };
    const body = icons[name] || icons.candle;
    return `<span class="admin-terminal-marketplace-icon-cell" aria-hidden="true"><svg class="admin-terminal-marketplace-ui-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" focusable="false" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg></span>`;
  }
  function renderMarketplaceChartMarkers(candles, security, layout, xFor, yFor, showAdminMarkers = false) {
    if (showAdminMarkers !== true) return "";
    const events = Array.isArray(security.chartEvents) && security.chartEvents.length
      ? security.chartEvents
      : Array.isArray(security.events) && security.events.length
        ? security.events
        : [
          { index: Math.max(1, candles.length - 8), label: "Economy", tone: "event" },
          { index: Math.max(2, candles.length - 4), label: "Trade", tone: "trade" }
        ];
    const markerMax = candles.length - 1;
    return events.slice(0, 4).map((event) => {
      const index = Math.max(0, Math.min(markerMax, Number(event.index ?? event.candleIndex ?? markerMax) || 0));
      const candle = candles[index];
      const x = xFor(index);
      const y = Math.max(layout.top + 12, yFor(candle.high) - 10);
      const tone = event.tone === "trade" ? "is-trade" : "is-event";
      const label = event.label || (tone === "is-trade" ? "Trade" : "Event");
      const iconPath = tone === "is-trade"
        ? `<path class="admin-terminal-marketplace-marker-icon" d="M ${(x - 5).toFixed(1)} ${(y + 1).toFixed(1)} L ${x.toFixed(1)} ${(y - 6).toFixed(1)} L ${(x + 5).toFixed(1)} ${(y + 1).toFixed(1)} L ${x.toFixed(1)} ${(y + 6).toFixed(1)} Z"></path>`
        : `<circle class="admin-terminal-marketplace-marker-icon" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5.2"></circle><path class="admin-terminal-marketplace-marker-glyph" d="M ${(x - 3).toFixed(1)} ${y.toFixed(1)} H ${(x + 3).toFixed(1)} M ${x.toFixed(1)} ${(y - 3).toFixed(1)} V ${(y + 3).toFixed(1)}"></path>`;
      return `<g class="admin-terminal-marketplace-marker ${tone}" data-marketplace-chart-marker data-marketplace-admin-only="true" aria-label="Admin-only ${escapeHtml(label)} chart marker">${iconPath}<text x="${x.toFixed(1)}" y="${(y - 10).toFixed(1)}" text-anchor="middle">${escapeHtml(label)}</text></g>`;
    }).join("");
  }
  const MARKETPLACE_CHART_RANGES = ["1D", "5D", "1M", "6M", "YTD", "1Y", "5Y", "MAX"];
  const MARKETPLACE_CHART_ANCHOR_DATE = new Date(Date.UTC(2026, 6, 2, 16, 0, 0));
  const MARKETPLACE_CHART_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function getMarketplaceRangeConfig(range = "1M") {
    const normalized = String(range || "1M").toUpperCase();
    const configs = {
      "1D": { range: "1D", label: "1D intraday", axisMode: "time", count: 78, daysBack: 0, noise: 0.020, driftScale: 0.42, volumeScale: 0.90 },
      "5D": { range: "5D", label: "5D hourly", axisMode: "dayHours", count: 60, daysBack: 4, noise: 0.032, driftScale: 0.54, volumeScale: 1.00 },
      "1M": { range: "1M", label: "1M daily", axisMode: "days", count: 64, daysBack: 29, noise: 0.052, driftScale: 0.72, volumeScale: 1.12 },
      "6M": { range: "6M", label: "6M monthly", axisMode: "months", count: 72, monthsBack: 5, noise: 0.092, driftScale: 1.06, volumeScale: 1.24 },
      "YTD": { range: "YTD", label: "YTD monthly", axisMode: "months", count: 72, ytd: true, noise: 0.082, driftScale: 0.96, volumeScale: 1.20 },
      "1Y": { range: "1Y", label: "1Y monthly", axisMode: "months", count: 80, monthsBack: 11, noise: 0.115, driftScale: 1.22, volumeScale: 1.30 },
      "5Y": { range: "5Y", label: "5Y annual", axisMode: "years", count: 72, yearsBack: 4, noise: 0.215, driftScale: 1.58, volumeScale: 1.42 },
      "MAX": { range: "MAX", label: "MAX annual", axisMode: "years", count: 84, yearsBack: 8, noise: 0.315, driftScale: 1.92, volumeScale: 1.56 }
    };
    return configs[normalized] || configs["1M"];
  }
  function shiftMarketplaceDate(date, amount, unit) {
    const shifted = new Date(date.getTime());
    if (unit === "days") shifted.setUTCDate(shifted.getUTCDate() + amount);
    if (unit === "months") shifted.setUTCMonth(shifted.getUTCMonth() + amount);
    if (unit === "years") shifted.setUTCFullYear(shifted.getUTCFullYear() + amount);
    return shifted;
  }
  function getMarketplaceLabelDate(config, index, count) {
    const progress = count <= 1 ? 1 : index / (count - 1);
    if (config.axisMode === "dayHours") {
      const daysBack = Number(config.daysBack ?? 4);
      const tradingDays = Math.max(1, daysBack + 1);
      const samplesPerDay = Math.max(1, count / tradingDays);
      const dayOffset = Math.min(daysBack, Math.floor(index / samplesPerDay));
      const dayStartIndex = dayOffset * samplesPerDay;
      const withinDaySpan = Math.max(1, samplesPerDay - 1);
      const withinDayProgress = Math.max(0, Math.min(1, (index - dayStartIndex) / withinDaySpan));
      const tradingStartMinutes = 9 * 60 + 30;
      const tradingMinutes = 390;
      const minutes = Math.round((tradingStartMinutes + withinDayProgress * tradingMinutes) / 30) * 30;
      const dated = shiftMarketplaceDate(MARKETPLACE_CHART_ANCHOR_DATE, -(daysBack - dayOffset), "days");
      dated.setUTCHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
      return dated;
    }
    if (config.axisMode === "days") {
      const daysBack = Number(config.daysBack ?? 29);
      return shiftMarketplaceDate(MARKETPLACE_CHART_ANCHOR_DATE, -Math.round(daysBack * (1 - progress)), "days");
    }
    if (config.axisMode === "months") {
      if (config.ytd) {
        const anchorMonth = MARKETPLACE_CHART_ANCHOR_DATE.getUTCMonth();
        const monthIndex = Math.min(anchorMonth, Math.round(anchorMonth * progress));
        return new Date(Date.UTC(MARKETPLACE_CHART_ANCHOR_DATE.getUTCFullYear(), monthIndex, 1));
      }
      const monthsBack = Number(config.monthsBack ?? 11);
      return shiftMarketplaceDate(MARKETPLACE_CHART_ANCHOR_DATE, -Math.round(monthsBack * (1 - progress)), "months");
    }
    if (config.axisMode === "years") {
      const yearsBack = Number(config.yearsBack ?? 8);
      return shiftMarketplaceDate(MARKETPLACE_CHART_ANCHOR_DATE, -Math.round(yearsBack * (1 - progress)), "years");
    }
    return MARKETPLACE_CHART_ANCHOR_DATE;
  }
  function formatMarketplaceDateLabel(date, mode) {
    const month = MARKETPLACE_CHART_MONTHS[date.getUTCMonth()] || "Jan";
    const day = date.getUTCDate();
    const year = date.getUTCFullYear();
    if (mode === "day") return `${month} ${day}`;
    if (mode === "dayTime") {
      const hours = String(date.getUTCHours()).padStart(2, "0");
      const minutes = String(date.getUTCMinutes()).padStart(2, "0");
      return `${month} ${day} · ${hours}:${minutes}`;
    }
    if (mode === "monthYear") return `${month} ${year}`;
    return `${month} ${day}`;
  }
  function isPlaceholderMarketplaceDateLabel(value) {
    return /^(?:D\d+|Day\s+\d+)$/i.test(String(value || "").trim());
  }
  function formatMarketplaceAxisLabel(range, index, count) {
    const config = getMarketplaceRangeConfig(range);
    const progress = count <= 1 ? 0 : index / (count - 1);
    if (config.axisMode === "time") {
      const startMinutes = 9 * 60 + 30;
      const totalMinutes = 390;
      const minutes = Math.round((startMinutes + progress * totalMinutes) / 5) * 5;
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
    }
    if (config.axisMode === "dayHours") {
      return formatMarketplaceDateLabel(getMarketplaceLabelDate(config, index, count), "dayTime");
    }
    if (config.axisMode === "days") {
      return formatMarketplaceDateLabel(getMarketplaceLabelDate(config, index, count), "day");
    }
    if (config.axisMode === "months" || config.axisMode === "years") {
      return formatMarketplaceDateLabel(getMarketplaceLabelDate(config, index, count), "monthYear");
    }
    return formatMarketplaceDateLabel(getMarketplaceLabelDate(config, index, count), "monthYear");
  }
  function normalizeMarketplaceRawCandles(raw, priceNumber, range) {
    const config = getMarketplaceRangeConfig(range);
    return raw.map((candle, index) => {
      const suppliedLabel = candle.label || candle.time || candle.date || "";
      const label = suppliedLabel && !isPlaceholderMarketplaceDateLabel(suppliedLabel)
        ? suppliedLabel
        : formatMarketplaceAxisLabel(config.range, index, raw.length);
      return {
        label,
        open: Number(candle.open ?? candle.o ?? priceNumber) || priceNumber,
        high: Number(candle.high ?? candle.h ?? priceNumber) || priceNumber,
        low: Number(candle.low ?? candle.l ?? priceNumber) || priceNumber,
        close: Number(candle.close ?? candle.c ?? priceNumber) || priceNumber,
        volume: Number(candle.volume ?? candle.v ?? 80) || 80
      };
    });
  }
  function getMarketplacePreviousClose(security, candles, config, fallbackLast = null) {
    const last = fallbackLast || candles?.[candles.length - 1] || { close: Number(security?.priceNumber ?? security?.price) || 1 };
    const explicitPreviousClose = Number(security?.previousClose ?? security?.prevClose ?? security?.previousDayClose ?? security?.priorClose);
    if (Number.isFinite(explicitPreviousClose) && explicitPreviousClose > 0) return explicitPreviousClose;
    const changeNumber = Number(security?.changeNumber);
    if (config?.range === "1D" && Number.isFinite(changeNumber) && changeNumber > -99.9) {
      const derived = last.close / (1 + changeNumber / 100);
      if (Number.isFinite(derived) && derived > 0) return derived;
    }
    const first = candles?.[0];
    const fallback = Number(first?.open ?? first?.close ?? last?.close ?? security?.priceNumber ?? security?.price);
    return Number.isFinite(fallback) && fallback > 0 ? fallback : 1;
  }
  function buildMarketplaceRangeCandles(security, range = "1M") {
    const config = getMarketplaceRangeConfig(range);
    const rangeCandles = security?.rangeCandles || security?.candleRanges || security?.chartData || {};
    const supplied = rangeCandles[config.range] || rangeCandles[config.range.toLowerCase()] || rangeCandles[config.range.replace(/[^a-z0-9]/gi, "").toLowerCase()];
    const priceNumber = Number(security?.priceNumber ?? security?.price) || 1;
    if (Array.isArray(supplied) && supplied.length) return normalizeMarketplaceRawCandles(supplied, priceNumber, config.range);
    const history = Array.isArray(security?.history) && security.history.length
      ? security.history
      : [0.52, 0.54, 0.57, 0.55, 0.59, 0.62, 0.60, 0.64, 0.67, 0.66, 0.70, 0.72];
    const base = Math.max(0.01, priceNumber);
    const changeNumber = Number(security?.changeNumber || 0);
    const count = config.count;
    const sampleAt = (position) => {
      const scaled = position * Math.max(history.length - 1, 1);
      const left = Math.floor(scaled);
      const right = Math.min(history.length - 1, left + 1);
      const weight = scaled - left;
      const leftValue = Number(history[left]) || 0.5;
      const rightValue = Number(history[right]) || leftValue;
      return leftValue + (rightValue - leftValue) * weight;
    };
    const rangeBackshift = {
      "1D": 0.995,
      "5D": 0.985,
      "1M": 0.960,
      "6M": 0.910,
      "YTD": 0.925,
      "1Y": 0.880,
      "5Y": 0.620,
      "MAX": 0.540
    }[config.range] || 0.96;
    let priorClose = Math.max(0.01, base * (rangeBackshift + Math.max(-12, Math.min(12, -changeNumber)) / 220));
    return Array.from({ length: count }, (_, index) => {
      const progress = index / Math.max(count - 1, 1);
      const normalized = Math.max(0.12, Math.min(0.98, sampleAt(progress)));
      const seasonal = Math.sin(index * (config.axisMode === "time" ? 0.42 : 0.18)) * config.noise;
      const cycle = Math.cos(index * (config.axisMode === "years" ? 0.34 : 0.27)) * config.noise * 0.42;
      const longDrift = ((normalized - 0.5) * 0.18 + (changeNumber / 100) * progress) * config.driftScale;
      const close = Math.max(0.01, base * (rangeBackshift + longDrift + seasonal + cycle + progress * (1 - rangeBackshift)));
      const open = priorClose;
      const spread = Math.max(base * 0.0026, Math.abs(close - open) * 0.48 + base * (0.002 + (index % 5) * 0.0008) * config.driftScale);
      const high = Math.max(open, close) + spread;
      const low = Math.max(0.01, Math.min(open, close) - spread * 0.84);
      const volume = Math.round((42 + normalized * 126 + (index % 8) * 7 + Math.abs(close - open) / base * 720) * config.volumeScale);
      priorClose = close;
      return {
        label: formatMarketplaceAxisLabel(config.range, index, count),
        open,
        high,
        low,
        close,
        volume
      };
    });
  }
  function renderMarketplaceChartFrame(security, range = "1M", active = false, compareCandidates = [], options = {}) {
    const config = getMarketplaceRangeConfig(range);
    const candles = buildMarketplaceRangeCandles(security, config.range);
    if (!candles.length) return "";
    const width = 1040;
    const height = 390;
    const layout = {
      left: 48,
      right: 64,
      top: 18,
      chartHeight: 264,
      axisGap: 12,
      volumeTop: 300,
      volumeHeight: 48,
      bottomAxis: 374
    };
    const plotWidth = width - layout.left - layout.right;
    const last = candles[candles.length - 1];
    const previous = candles[candles.length - 2] || last;
    const first = candles[0] || previous;
    const isDailyRange = config.range === "1D";
    const previousClose = getMarketplacePreviousClose(security, candles, config, last);
    const minLow = Math.min(...candles.map((candle) => candle.low), isDailyRange ? previousClose : Number.POSITIVE_INFINITY);
    const maxHigh = Math.max(...candles.map((candle) => candle.high), isDailyRange ? previousClose : Number.NEGATIVE_INFINITY);
    const maxVolume = Math.max(...candles.map((candle) => candle.volume), 1);
    const rangeValue = Math.max(0.01, maxHigh - minLow);
    const paddedMin = Math.max(0.01, minLow - rangeValue * 0.10);
    const paddedMax = maxHigh + rangeValue * 0.10;
    const paddedRange = Math.max(0.01, paddedMax - paddedMin);
    const step = plotWidth / candles.length;
    const candleWidth = Math.max(2.3, Math.min(9.8, step * 0.44));
    const yFor = (value) => layout.top + ((paddedMax - value) / paddedRange) * layout.chartHeight;
    const xFor = (index) => layout.left + index * step + step / 2;
    const gridValues = Array.from({ length: 7 }, (_, index) => paddedMax - paddedRange * (index / 6));
    const changeReference = isDailyRange ? previousClose : previous.close;
    const rangeReference = isDailyRange ? previousClose : first.close;
    const lastTone = last.close >= changeReference ? "is-up" : "is-down";
    const trendTone = last.close >= rangeReference ? "is-up" : "is-down";
    const lastX = xFor(candles.length - 1);
    const lastY = yFor(last.close);
    const previousCloseY = yFor(previousClose);
    const changeAmount = last.close - changeReference;
    const changePercent = changeReference ? (changeAmount / changeReference) * 100 : 0;
    const totalChange = rangeReference ? ((last.close - rangeReference) / rangeReference) * 100 : 0;
    const formatAxisPrice = (value) => {
      if (!Number.isFinite(value)) return "—";
      if (value >= 1000) return value.toFixed(0);
      if (value >= 100) return value.toFixed(1);
      return value.toFixed(2);
    };
    const formatVolume = (value) => {
      if (!Number.isFinite(value)) return "—";
      if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
      if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
      return String(Math.round(value));
    };
    const pathFromPoints = (points) => points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
    const buildClosePoints = (transform = (candle) => candle.close) => candles.map((candle, index) => ({ x: xFor(index), y: yFor(Math.max(0.01, transform(candle, index))) }));
    const buildAveragePoints = (period) => candles.map((candle, index) => {
      const slice = candles.slice(Math.max(0, index - period + 1), index + 1);
      const average = slice.reduce((sum, item) => sum + item.close, 0) / Math.max(slice.length, 1);
      return { x: xFor(index), y: yFor(average) };
    });
    const vwapPoints = (() => {
      let valueVolume = 0;
      let volume = 0;
      return candles.map((candle) => {
        valueVolume += candle.close * candle.volume;
        volume += candle.volume;
        return { x: xFor(candles.indexOf(candle)), y: yFor(valueVolume / Math.max(volume, 1)) };
      });
    })();
    const priceGrid = gridValues.map((value) => {
      const y = yFor(value);
      return `<g><line class="admin-terminal-marketplace-chart-grid" x1="${layout.left}" y1="${y.toFixed(1)}" x2="${(width - layout.right).toFixed(1)}" y2="${y.toFixed(1)}"></line><text class="admin-terminal-marketplace-chart-axis-label" text-anchor="start" x="${(width - layout.right + layout.axisGap).toFixed(1)}" y="${(y + 4).toFixed(1)}">${formatAxisPrice(value)}</text></g>`;
    }).join("");
    const verticalTicksByRange = {
      "1D": [0, 0.25, 0.50, 0.75, 1],
      "5D": [0, 0.20, 0.40, 0.60, 0.80, 1],
      "1M": [0, 0.25, 0.50, 0.75, 1],
      "6M": [0, 0.20, 0.40, 0.60, 0.80, 1],
      "YTD": [0, 0.20, 0.40, 0.60, 0.80, 1],
      "1Y": [0, 0.25, 0.50, 0.75, 1],
      "5Y": [0, 0.25, 0.50, 0.75, 1],
      "MAX": [0, 0.20, 0.40, 0.60, 0.80, 1]
    }[config.range] || [0, 0.33, 0.66, 1];
    const verticalGrid = verticalTicksByRange.map((ratio) => {
      const x = layout.left + plotWidth * ratio;
      return `<line class="admin-terminal-marketplace-chart-grid is-vertical" x1="${x.toFixed(1)}" y1="${layout.top}" x2="${x.toFixed(1)}" y2="${(layout.volumeTop + layout.volumeHeight).toFixed(1)}"></line>`;
    }).join("");
    const closeLinePoints = pathFromPoints(buildClosePoints());
    const areaPoints = `${layout.left},${(layout.volumeTop - 6).toFixed(1)} ${closeLinePoints} ${(width - layout.right).toFixed(1)},${(layout.volumeTop - 6).toFixed(1)}`;
    const compareLineNodes = (Array.isArray(compareCandidates) ? compareCandidates : []).slice(0, 10).map((candidate, candidateIndex) => {
      const candidateCandles = buildMarketplaceRangeCandles(candidate, config.range);
      if (!candidateCandles.length) return "";
      const selectedBase = Math.max(0.01, candles[0]?.close || last.close || 1);
      const candidateBase = Math.max(0.01, candidateCandles[0]?.close || Number(candidate.priceNumber) || 1);
      const points = pathFromPoints(candles.map((_, index) => {
        const candidateCandle = candidateCandles[Math.min(candidateCandles.length - 1, index)] || candidateCandles[candidateCandles.length - 1];
        const normalizedClose = selectedBase * ((candidateCandle?.close || candidateBase) / candidateBase);
        return { x: xFor(index), y: yFor(Math.max(0.01, normalizedClose)) };
      }));
      const toneClass = `is-compare-${(candidateIndex % 4) + 1}`;
      return `<polyline class="admin-terminal-marketplace-compare-line ${toneClass}" data-marketplace-compare-line="${escapeHtml(candidate.symbol)}" data-marketplace-compare-symbol="${escapeHtml(candidate.symbol)}" data-marketplace-compare-name="${escapeHtml(candidate.name)}" points="${points}"></polyline>`;
    }).join("");
    const ma20Points = pathFromPoints(buildAveragePoints(Math.min(20, candles.length)));
    const ma50Points = pathFromPoints(buildAveragePoints(Math.min(50, candles.length)));
    const vwapLinePoints = pathFromPoints(vwapPoints);
    const candleNodes = candles.map((candle, index) => {
      const x = xFor(index);
      const yOpen = yFor(candle.open);
      const yClose = yFor(candle.close);
      const yHigh = yFor(candle.high);
      const yLow = yFor(candle.low);
      const bodyY = Math.min(yOpen, yClose);
      const bodyHeight = Math.max(2.4, Math.abs(yClose - yOpen));
      const volumeHeightPx = Math.max(2.4, (candle.volume / maxVolume) * layout.volumeHeight);
      const tone = candle.close >= candle.open ? "is-up" : "is-down";
      return `<g class="admin-terminal-marketplace-candle ${tone}"><line x1="${x.toFixed(1)}" y1="${yHigh.toFixed(1)}" x2="${x.toFixed(1)}" y2="${yLow.toFixed(1)}"></line><rect x="${(x - candleWidth / 2).toFixed(1)}" y="${bodyY.toFixed(1)}" width="${candleWidth.toFixed(1)}" height="${bodyHeight.toFixed(1)}" rx="1.1"></rect><rect class="admin-terminal-marketplace-volume" x="${(x - candleWidth / 2).toFixed(1)}" y="${(layout.volumeTop + layout.volumeHeight - volumeHeightPx).toFixed(1)}" width="${candleWidth.toFixed(1)}" height="${volumeHeightPx.toFixed(1)}" rx="1.1"></rect></g>`;
    }).join("");
    const barNodes = candles.map((candle, index) => {
      const x = xFor(index);
      const yOpen = yFor(candle.open);
      const yClose = yFor(candle.close);
      const yHigh = yFor(candle.high);
      const yLow = yFor(candle.low);
      const volumeHeightPx = Math.max(2.4, (candle.volume / maxVolume) * layout.volumeHeight);
      const tone = candle.close >= candle.open ? "is-up" : "is-down";
      return `<g class="admin-terminal-marketplace-bar ${tone}"><line class="is-range" x1="${x.toFixed(1)}" y1="${yHigh.toFixed(1)}" x2="${x.toFixed(1)}" y2="${yLow.toFixed(1)}"></line><line class="is-open" x1="${(x - candleWidth * 0.66).toFixed(1)}" y1="${yOpen.toFixed(1)}" x2="${x.toFixed(1)}" y2="${yOpen.toFixed(1)}"></line><line class="is-close" x1="${x.toFixed(1)}" y1="${yClose.toFixed(1)}" x2="${(x + candleWidth * 0.66).toFixed(1)}" y2="${yClose.toFixed(1)}"></line><rect class="admin-terminal-marketplace-volume" x="${(x - candleWidth / 2).toFixed(1)}" y="${(layout.volumeTop + layout.volumeHeight - volumeHeightPx).toFixed(1)}" width="${candleWidth.toFixed(1)}" height="${volumeHeightPx.toFixed(1)}" rx="1.1"></rect></g>`;
    }).join("");
    const hitNodes = candles.map((candle, index) => {
      const x = xFor(index);
      const prior = candles[Math.max(0, index - 1)] || candle;
      const pointReference = isDailyRange ? previousClose : prior.close;
      const pointChangePercent = pointReference ? ((candle.close - pointReference) / pointReference) * 100 : 0;
      const pointChangeLabel = `${pointChangePercent >= 0 ? "+" : ""}${pointChangePercent.toFixed(2)}%`;
      return `<rect class="admin-terminal-marketplace-candle-hit" data-marketplace-candle-hit data-chart-time="${escapeHtml(candle.label)}" data-chart-x="${x.toFixed(1)}" data-chart-open="${formatAxisPrice(candle.open)}" data-chart-high="${formatAxisPrice(candle.high)}" data-chart-low="${formatAxisPrice(candle.low)}" data-chart-close="${formatAxisPrice(candle.close)}" data-chart-price="${formatAxisPrice(candle.close)}" data-chart-change="${escapeHtml(pointChangeLabel)}" data-chart-volume="${formatVolume(candle.volume)}" x="${(x - step / 2).toFixed(1)}" y="${layout.top}" width="${step.toFixed(1)}" height="${(layout.volumeTop + layout.volumeHeight - layout.top).toFixed(1)}"></rect>`;
    }).join("");
    const ghostStart = Math.max(0, candles.length - 10);
    const ghostTrail = candles.slice(ghostStart).map((candle, offset) => `${xFor(ghostStart + offset).toFixed(1)},${yFor(candle.close).toFixed(1)}`).join(" ");
    const timeTickIndexes = verticalTicksByRange.map((ratio) => Math.max(0, Math.min(candles.length - 1, Math.round((candles.length - 1) * ratio))));
    const timeLabels = Array.from(new Set(timeTickIndexes)).map((index, position, all) => {
      const candle = candles[index];
      const x = xFor(index);
      const anchor = position === 0 ? "start" : position === all.length - 1 ? "end" : "middle";
      return `<text class="admin-terminal-marketplace-chart-time" text-anchor="${anchor}" x="${x.toFixed(1)}" y="${layout.bottomAxis}">${escapeHtml(candle.label)}</text>`;
    }).join("");
    const markers = "";
    const gradientId = `marketplace-chart-area-${sanitizeMarketplaceId(security.symbol)}-${config.range.toLowerCase()}`;
    const summaryPrice = formatAxisPrice(last.close);
    const summaryChange = `${changeAmount >= 0 ? "+" : ""}${formatAxisPrice(changeAmount)} · ${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(2)}%`;
    const summaryRange = isDailyRange ? `${totalChange >= 0 ? "+" : ""}${totalChange.toFixed(2)}% prev close` : `${totalChange >= 0 ? "+" : ""}${totalChange.toFixed(2)}% range`;
    const previousCloseLabel = `Prev. close $${formatAxisPrice(previousClose)}`;
    const previousClosePillWidth = Math.max(92, previousCloseLabel.length * 5.4 + 18);
    const previousClosePillX = width - layout.right - previousClosePillWidth - 8;
    const previousClosePillY = Math.max(layout.top + 8, Math.min(layout.volumeTop - 30, previousCloseY - 14));
    const previousCloseTextY = previousClosePillY + 17;
    const previousCloseGuide = isDailyRange ? `
          <line class="admin-terminal-marketplace-prev-close-line" x1="${layout.left}" y1="${previousCloseY.toFixed(1)}" x2="${(width - layout.right).toFixed(1)}" y2="${previousCloseY.toFixed(1)}"></line>
          <g class="admin-terminal-marketplace-prev-close-pill" aria-label="Previous close ${formatAxisPrice(previousClose)}">
            <rect class="admin-terminal-marketplace-prev-close-label-bg" x="${previousClosePillX.toFixed(1)}" y="${previousClosePillY.toFixed(1)}" width="${previousClosePillWidth.toFixed(1)}" height="24" rx="12"></rect>
            <text class="admin-terminal-marketplace-prev-close-label" x="${(previousClosePillX + 10).toFixed(1)}" y="${previousCloseTextY.toFixed(1)}"><tspan>Prev. close </tspan><tspan class="admin-terminal-marketplace-prev-close-value">$${formatAxisPrice(previousClose)}</tspan></text>
          </g>` : "";
    return `
      <div class="admin-terminal-marketplace-chart-frame" data-marketplace-chart-frame="${escapeHtml(config.range)}" data-marketplace-axis-mode="${escapeHtml(config.axisMode)}" data-marketplace-chart-window-label="${escapeHtml(config.label)}" data-marketplace-range-live-price="${escapeHtml(summaryPrice)}" data-marketplace-range-live-change="${escapeHtml(summaryChange)}" data-marketplace-range-live-tone="${lastTone}" data-marketplace-range-total-change="${escapeHtml(summaryRange)}" data-marketplace-range-total-tone="${trendTone}" ${active ? "" : "hidden"}>
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(security.symbol)} ${escapeHtml(config.label)} market chart">
          <defs>
            <linearGradient id="${escapeHtml(gradientId)}" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stop-color="rgba(101,245,169,.22)"></stop>
              <stop offset="58%" stop-color="rgba(101,245,169,.07)"></stop>
              <stop offset="100%" stop-color="rgba(101,245,169,0)"></stop>
            </linearGradient>
          </defs>
          <rect class="admin-terminal-marketplace-chart-bg" x="0" y="0" width="${width}" height="${height}"></rect>
          ${verticalGrid}
          ${priceGrid}
          <polygon class="admin-terminal-marketplace-area-fill ${trendTone}" points="${areaPoints}"></polygon>
          <polyline class="admin-terminal-marketplace-close-line ${trendTone}" points="${closeLinePoints}"></polyline>
          ${compareLineNodes}
          <polyline class="admin-terminal-marketplace-indicator-line is-ma20" data-marketplace-indicator-line="ma20" points="${ma20Points}"></polyline>
          <polyline class="admin-terminal-marketplace-indicator-line is-ma50" data-marketplace-indicator-line="ma50" points="${ma50Points}"></polyline>
          <polyline class="admin-terminal-marketplace-indicator-line is-vwap" data-marketplace-indicator-line="vwap" points="${vwapLinePoints}"></polyline>
          <g class="admin-terminal-marketplace-bars-layer">${barNodes}</g>
          <g class="admin-terminal-marketplace-candles-layer">${candleNodes}</g>
          ${previousCloseGuide}
          <line class="admin-terminal-marketplace-crosshair is-vertical admin-terminal-marketplace-hover-guide" data-marketplace-hover-guide visibility="hidden" x1="${lastX.toFixed(1)}" y1="${layout.top}" x2="${lastX.toFixed(1)}" y2="${(layout.volumeTop + layout.volumeHeight).toFixed(1)}"></line>
          <polyline class="admin-terminal-marketplace-ghost-trail" points="${ghostTrail}"></polyline>
          ${markers}
          <g class="admin-terminal-marketplace-end-dot ${lastTone}" aria-label="Current price ${formatAxisPrice(last.close)}">
            <circle class="admin-terminal-marketplace-end-dot-ring" cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="5.4"></circle>
            <circle class="admin-terminal-marketplace-end-dot-core" cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="2.6"></circle>
          </g>
          <g class="admin-terminal-marketplace-price-tag is-hidden" aria-hidden="true">
            <rect x="-999" y="-999" width="0" height="0"></rect>
            <text class="admin-terminal-marketplace-price-tag-text" x="-999" y="-999" data-marketplace-price-tag>${formatAxisPrice(last.close)}</text>
          </g>
          <line class="admin-terminal-marketplace-volume-base" x1="${layout.left}" y1="${(layout.volumeTop + layout.volumeHeight).toFixed(1)}" x2="${(width - layout.right).toFixed(1)}" y2="${(layout.volumeTop + layout.volumeHeight).toFixed(1)}"></line>
          <text class="admin-terminal-marketplace-chart-footer" x="${layout.left}" y="${(layout.volumeTop - 8).toFixed(1)}">Vol</text>
          <text class="admin-terminal-marketplace-chart-footer" text-anchor="end" x="${(width - layout.right).toFixed(1)}" y="${(layout.volumeTop - 8).toFixed(1)}">${escapeHtml(security.volume)}</text>
          ${timeLabels}
          <g class="admin-terminal-marketplace-hit-layer">${hitNodes}</g>
        </svg>
        <div class="admin-terminal-marketplace-chart-tooltip" data-marketplace-chart-tooltip hidden>
          <span>${escapeHtml(last.label)}</span>
          <b>O ${formatAxisPrice(last.open)} · H ${formatAxisPrice(last.high)} · L ${formatAxisPrice(last.low)} · C ${formatAxisPrice(last.close)}</b>
          <small>Vol ${formatVolume(last.volume)}</small>
        </div>
      </div>`;
  }
  function renderMarketplaceCandlestickChart(security, securities = [], options = {}) {
    const activeRange = "1M";
    const activeConfig = getMarketplaceRangeConfig(activeRange);
    const compareStocks = (Array.isArray(securities) ? securities : []).filter((candidate) => candidate && candidate.symbol !== security.symbol && String(candidate.type || "").toLowerCase() === "stock");
    const compareCandidates = (compareStocks.length ? compareStocks : (Array.isArray(securities) ? securities : []).filter((candidate) => candidate && candidate.symbol !== security.symbol)).slice(0, 10);
    const frames = MARKETPLACE_CHART_RANGES.map((range) => renderMarketplaceChartFrame(security, range, range === activeRange, compareCandidates, options)).join("");
    const activeCandles = buildMarketplaceRangeCandles(security, activeRange);
    const last = activeCandles[activeCandles.length - 1];
    const previous = activeCandles[activeCandles.length - 2] || last;
    const first = activeCandles[0] || previous;
    const changeAmount = last.close - previous.close;
    const changePercent = previous.close ? (changeAmount / previous.close) * 100 : 0;
    const totalChange = first.close ? ((last.close - first.close) / first.close) * 100 : 0;
    const lastTone = last.close >= previous.close ? "is-up" : "is-down";
    const trendTone = last.close >= first.close ? "is-up" : "is-down";
    const formatAxisPrice = (value) => {
      if (!Number.isFinite(value)) return "—";
      if (value >= 1000) return value.toFixed(0);
      if (value >= 100) return value.toFixed(1);
      return value.toFixed(2);
    };
    return `
      <section class="admin-terminal-marketplace-chart is-finance-reference is-realtime-ready" aria-label="Full-width OHLC price chart with volume" data-marketplace-chart-root data-marketplace-chart-style="candle" data-marketplace-compare="none" data-marketplace-indicator="none" data-marketplace-timeframe="${escapeHtml(activeRange)}" data-marketplace-chart-symbol="${escapeHtml(security.symbol)}" data-marketplace-chart-price="${escapeHtml(security.price)}" data-marketplace-chart-currency="${escapeHtml(security.currency)}" data-marketplace-admin-events="false">
        <header class="admin-terminal-marketplace-chart-tools" aria-label="Chart controls">
          <div class="admin-terminal-marketplace-chart-mode">
            <div class="admin-terminal-marketplace-chart-control" data-marketplace-chart-control>
              <button type="button" data-admin-terminal-action="marketplace-toggle-chart-menu" data-marketplace-chart-menu-toggle="style" aria-expanded="false" aria-label="Chart type">${renderMarketplaceIcon("candle")}<b data-marketplace-chart-type-label>Candle</b><i aria-hidden="true"></i></button>
              <div class="admin-terminal-marketplace-chart-dropdown" data-marketplace-chart-menu="style" hidden>
                ${[
                  ["line", "Line", "line"],
                  ["area", "Area", "area"],
                  ["candle", "Candle", "candle"],
                  ["bar", "Bar", "bar"]
                ].map(([style, label, icon]) => `<button type="button" data-admin-terminal-action="marketplace-set-chart-style" data-marketplace-chart-style="${style}" aria-pressed="${style === "candle" ? "true" : "false"}">${renderMarketplaceIcon(icon)}${label}</button>`).join("")}
              </div>
            </div>
            <div class="admin-terminal-marketplace-chart-control" data-marketplace-chart-control>
              <button type="button" data-admin-terminal-action="marketplace-toggle-chart-menu" data-marketplace-chart-menu-toggle="compare" aria-expanded="false" aria-label="Compare securities">${renderMarketplaceIcon("compare")}<b data-marketplace-compare-label>Compare</b><i aria-hidden="true"></i></button>
              <div class="admin-terminal-marketplace-chart-dropdown is-compare-picker" data-marketplace-chart-menu="compare" hidden>
                <button type="button" data-admin-terminal-action="marketplace-set-chart-compare" data-marketplace-chart-compare="none" aria-pressed="true">${renderMarketplaceIcon("none")}<strong>No comparison</strong><small>Primary security only</small></button>
                ${compareCandidates.length ? compareCandidates.map((candidate) => `<button type="button" data-admin-terminal-action="marketplace-set-chart-compare" data-marketplace-chart-compare="${escapeHtml(candidate.symbol)}" data-marketplace-chart-compare-label="${escapeHtml(candidate.symbol)}" aria-pressed="false"><span>${escapeHtml(candidate.symbol)}</span><strong>${escapeHtml(candidate.name)}</strong><small>${escapeHtml(candidate.type)} · ${escapeHtml(candidate.sector)} · ${escapeHtml(candidate.country)}</small></button>`).join("") : `<button type="button" disabled><span>—</span><strong>No other stocks available</strong><small>Add more marketplace securities to compare.</small></button>`}
              </div>
            </div>
            <div class="admin-terminal-marketplace-chart-control" data-marketplace-chart-control>
              <button type="button" data-admin-terminal-action="marketplace-toggle-chart-menu" data-marketplace-chart-menu-toggle="indicator" aria-expanded="false" aria-label="Indicators">${renderMarketplaceIcon("indicator")}<b data-marketplace-indicator-label>Indicators</b><i aria-hidden="true"></i></button>
              <div class="admin-terminal-marketplace-chart-dropdown" data-marketplace-chart-menu="indicator" hidden>
                ${[
                  ["none", "No indicator", "none"],
                  ["ma20", "Moving average 20", "ma"],
                  ["ma50", "Moving average 50", "ma"],
                  ["vwap", "VWAP", "vwap"]
                ].map(([indicator, label, icon]) => `<button type="button" data-admin-terminal-action="marketplace-set-chart-indicator" data-marketplace-chart-indicator="${indicator}" aria-pressed="${indicator === "none" ? "true" : "false"}">${renderMarketplaceIcon(icon)}${label}</button>`).join("")}
              </div>
            </div>
          </div>
          <div class="admin-terminal-marketplace-chart-feed" aria-label="Live market feed status">
            <span class="admin-terminal-marketplace-feed-pill" data-marketplace-feed-status>
              <i aria-hidden="true"></i>
              <b>Live</b>
            </span>
            <span class="admin-terminal-marketplace-feed-divider" aria-hidden="true"></span>
            <span class="admin-terminal-marketplace-feed-time">
              <em>Last tick</em>
              <time data-marketplace-last-tick>Standby</time>
            </span>
          </div>
        </header>
        <div class="admin-terminal-marketplace-chart-canvas" data-marketplace-chart-canvas>
          ${frames}
        </div>
        <nav class="admin-terminal-marketplace-chart-ranges" aria-label="Chart range">
          ${MARKETPLACE_CHART_RANGES.map((range) => `<button type="button" data-admin-terminal-action="marketplace-set-timeframe" data-marketplace-timeframe="${range}" aria-pressed="${range === activeRange ? "true" : "false"}">${range}</button>`).join("")}
          <span data-marketplace-chart-window>${escapeHtml(activeConfig.label)}</span>
          <strong data-marketplace-live-price>${formatAxisPrice(last.close)} ${escapeHtml(security.currency)}</strong>
          <small class="${lastTone}" data-marketplace-live-change>${changeAmount >= 0 ? "+" : ""}${formatAxisPrice(changeAmount)} · ${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(2)}%</small>
          <em class="${trendTone}" data-marketplace-range-change>${totalChange >= 0 ? "+" : ""}${totalChange.toFixed(2)}% range</em>
        </nav>
      </section>`;
  }
  function renderMarketplaceFinancialPanel(rows) {
    return `<div class="admin-terminal-marketplace-financial-table is-simple-grid is-ratios-grid">
      ${rows.map((row) => `
        <article>
          <span>${escapeHtml(row.label)}</span>
          <strong>${escapeHtml(row.value)}</strong>
          ${row.meta ? `<small>${escapeHtml(row.meta)}</small>` : ""}
        </article>`).join("")}
    </div>`;
  }
  function renderMarketplaceFinancialOverview(rows) {
    return `<div class="admin-terminal-marketplace-financial-overview-grid">
      ${rows.map((row) => `
        <article>
          <span>${escapeHtml(row.label)}</span>
          <strong>${escapeHtml(row.value)}</strong>
          ${row.meta ? `<small>${escapeHtml(row.meta)}</small>` : ""}
        </article>`).join("")}
    </div>`;
  }
  function renderMarketplaceFinancialChart(statement, mode, currency) {
    const series = mode === "annual" ? statement.annualSeries : statement.quarterlySeries;
    const maxValue = Math.max(1, ...series.flatMap((point) => [Math.abs(point.primary || 0), Math.abs(point.secondary || 0)]));
    const bars = series.map((point) => {
      const primaryHeight = Math.max(8, (Math.abs(point.primary || 0) / maxValue) * 118);
      const secondaryHeight = Math.max(6, (Math.abs(point.secondary || 0) / maxValue) * 84);
      return `<div class="admin-terminal-marketplace-statement-bar-group">
        <div class="admin-terminal-marketplace-statement-bars">
          <i class="is-primary" style="height:${primaryHeight.toFixed(1)}px"></i>
          <i class="is-secondary" style="height:${secondaryHeight.toFixed(1)}px"></i>
        </div>
        <span>${escapeHtml(point.label)}</span>
      </div>`;
    }).join("");
    return `<section class="admin-terminal-marketplace-statement-card">
      <header>
        <div>
          <strong>${escapeHtml(statement.chartTitle)}</strong>
          <small>${escapeHtml(statement.primaryLabel)} vs ${escapeHtml(statement.secondaryLabel)}</small>
        </div>
        <div class="admin-terminal-marketplace-statement-legend">
          <span><i class="is-primary"></i>${escapeHtml(statement.primaryLabel)}</span>
          <span><i class="is-secondary"></i>${escapeHtml(statement.secondaryLabel)}</span>
          <em>${escapeHtml(mode === "annual" ? "Annual" : "Quarterly")} · ${escapeHtml(currency)}</em>
        </div>
      </header>
      <div class="admin-terminal-marketplace-statement-chart">
        <div class="admin-terminal-marketplace-statement-bars-row">${bars}</div>
      </div>
    </section>`;
  }
  function renderMarketplaceFinancialStatementTable(periods, rows, currency) {
    return `<div class="admin-terminal-marketplace-statement-table-wrap">
      <table class="admin-terminal-marketplace-statement-table">
        <thead>
          <tr>
            <th>All values in ${escapeHtml(currency)}</th>
            ${periods.map((period) => `<th>${escapeHtml(period)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `<tr><th scope="row">${escapeHtml(row.label)}</th>${row.values.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>
    </div>`;
  }
  function renderMarketplaceFinancialStatementSection(sectionKey, statement, mode, currency) {
    const periods = mode === "annual" ? statement.annualSeries.map((point) => point.label) : statement.quarterlySeries.map((point) => point.label);
    const rows = mode === "annual" ? statement.annualRows : statement.quarterlyRows;
    return `<div class="admin-terminal-marketplace-statement-section" data-statement-section="${escapeHtml(sectionKey)}" data-statement-mode="${escapeHtml(mode)}">
      ${renderMarketplaceFinancialChart(statement, mode, currency)}
      ${renderMarketplaceFinancialStatementTable(periods, rows, currency)}
    </div>`;
  }
  function renderMarketplaceFinancialsDrawer(security) {
    const id = sanitizeMarketplaceId(security.symbol);
    const group = `marketplace-financial-${id}`;
    const modeGroup = `${group}-mode`;
    const tabs = [
      { key: "overview", label: "Overview" },
      { key: "income", label: "Income statement" },
      { key: "balance", label: "Balance sheet" },
      { key: "cashflow", label: "Cash flow" },
      { key: "ratios", label: "Ratios" }
    ];
    return `
      <details class="admin-terminal-marketplace-financials is-v510-financials is-v515-financials" open>
        <summary>
          <span>Financial statements</span>
          <strong>${escapeHtml(security.financials.title)}</strong>
          <small>${escapeHtml(security.financials.period)} · structured for quick review</small>
        </summary>
        <div class="admin-terminal-marketplace-financial-shell">
          ${tabs.map((tab, index) => `<input type="radio" name="${escapeHtml(group)}" id="${escapeHtml(group)}-${escapeHtml(tab.key)}" data-financial-tab="${escapeHtml(tab.key)}" ${index === 0 ? "checked" : ""}>`).join("")}
          <input type="radio" name="${escapeHtml(modeGroup)}" id="${escapeHtml(modeGroup)}-annual" data-financial-mode="annual" checked>
          <input type="radio" name="${escapeHtml(modeGroup)}" id="${escapeHtml(modeGroup)}-quarterly" data-financial-mode="quarterly">
          <div class="admin-terminal-marketplace-financial-topnav" role="tablist" aria-label="Financial section tabs">
            ${tabs.map((tab) => `<label for="${escapeHtml(group)}-${escapeHtml(tab.key)}" data-financial-label="${escapeHtml(tab.key)}">${escapeHtml(tab.label)}</label>`).join("")}
          </div>
          <div class="admin-terminal-marketplace-financial-topbar">
            <div>
              <b>${escapeHtml(security.name)}</b>
              <small>${escapeHtml(security.symbol)} · ${escapeHtml(security.exchange)} · ${escapeHtml(security.financials.currency)}</small>
            </div>
            <div class="admin-terminal-marketplace-financial-mode-toggle" aria-label="Financial period mode">
              <label for="${escapeHtml(modeGroup)}-annual">Annual</label>
              <label for="${escapeHtml(modeGroup)}-quarterly">Quarterly</label>
            </div>
          </div>
          <div class="admin-terminal-marketplace-financial-panels">
            <section data-financial-panel="overview">
              <div class="admin-terminal-marketplace-financial-story">
                <p>${escapeHtml(security.name)} financial overview consolidates the latest operating performance, balance sheet strength, and cash generation into a cleaner review workspace.</p>
              </div>
              ${renderMarketplaceFinancialOverview(security.financials.overview)}
            </section>
            <section data-financial-panel="income">
              ${renderMarketplaceFinancialStatementSection("income", security.financials.statements.income, "annual", security.financials.currency)}
              ${renderMarketplaceFinancialStatementSection("income", security.financials.statements.income, "quarterly", security.financials.currency)}
            </section>
            <section data-financial-panel="balance">
              ${renderMarketplaceFinancialStatementSection("balance", security.financials.statements.balance, "annual", security.financials.currency)}
              ${renderMarketplaceFinancialStatementSection("balance", security.financials.statements.balance, "quarterly", security.financials.currency)}
            </section>
            <section data-financial-panel="cashflow">
              ${renderMarketplaceFinancialStatementSection("cashflow", security.financials.statements.cashflow, "annual", security.financials.currency)}
              ${renderMarketplaceFinancialStatementSection("cashflow", security.financials.statements.cashflow, "quarterly", security.financials.currency)}
            </section>
            <section data-financial-panel="ratios">
              ${renderMarketplaceFinancialPanel(security.financials.ratios)}
            </section>
          </div>
        </div>
      </details>`;
  }
  function renderMarketplaceSecurityRow(security) {
    return `
      <article class="admin-terminal-marketplace-security ${escapeHtml(security.tone)}" data-market-security-row data-market-symbol="${escapeHtml(security.symbol)}" data-market-name="${escapeHtml(security.name)}" data-market-type="${escapeHtml(security.type)}" data-market-location="${escapeHtml(security.country)}" data-market-sector="${escapeHtml(security.sector)}" data-market-price="${escapeHtml(security.price)}" data-market-change="${escapeHtml(security.changeNumber)}" data-market-currency="${escapeHtml(security.currency)}" data-market-options="${escapeHtml(JSON.stringify(security.optionChain || []))}">
        <button type="button" data-admin-terminal-action="select-market-security" data-market-symbol="${escapeHtml(security.symbol)}" aria-label="Open ${escapeHtml(security.symbol)} profile">
          <span>${escapeHtml(security.symbol)}</span>
          <strong>${escapeHtml(security.name)}</strong>
          <small>${escapeHtml(security.type)} · ${escapeHtml(security.sector)} · ${escapeHtml(security.country)}</small>
        </button>
        <div>
          <strong>${renderCurrencyAmount(security.price, security.currency)}</strong>
          <em>${escapeHtml(security.change)}</em>
        </div>
      </article>`;
  }
  function renderMarketplaceTicketInstrumentOptions(security) {
    const optionTypes = new Set((security.optionChain || []).map((option) => String(option.type || "").toLowerCase()));
    return [
      `<option value="Stock">Stock</option>`,
      optionTypes.has("call") ? `<option value="Call Option">Call option</option>` : "",
      optionTypes.has("put") ? `<option value="Put Option">Put option</option>` : ""
    ].filter(Boolean).join("");
  }
  function renderMarketplaceTicketContractOptions(security) {
    const contracts = Array.isArray(security.optionChain) ? security.optionChain : [];
    if (!contracts.length) return `<option value="">No option contracts listed</option>`;
    return contracts.map((option) => {
      const value = [option.type, option.strike, option.expiry, option.premium].map((part) => String(part || "").replace(/\|/g, "/")).join("|");
      return `<option value="${escapeHtml(value)}" data-option-symbol="${escapeHtml(security.symbol)}" data-option-type="${escapeHtml(option.type)}" data-option-strike="${escapeHtml(option.strike)}" data-option-expiry="${escapeHtml(option.expiry)}" data-option-premium="${escapeHtml(option.premium)}">${escapeHtml(option.type)} ${escapeHtml(option.strike)} · ${escapeHtml(option.expiry)} · ${renderCurrencyAmount(option.premium, security.currency)}</option>`;
    }).join("");
  }
  function renderMarketplaceHiddenOptionLoader(security) {
    const option = Array.isArray(security.optionChain) ? security.optionChain[0] : null;
    if (!option) return "";
    return `<button type="button" hidden data-admin-terminal-action="marketplace-load-option" data-option-symbol="${escapeHtml(security.symbol)}" data-option-type="${escapeHtml(option.type)}" data-option-strike="${escapeHtml(option.strike)}" data-option-expiry="${escapeHtml(option.expiry)}" data-option-premium="${escapeHtml(option.premium)}" aria-hidden="true"></button>`;
  }
  function renderMarketplaceProfile(security, securities = [], options = {}) {
    const optionAvailability = security.optionChain.length ? `${security.optionChain.length} contracts` : "None";
    return `
      <header>
        <span>${escapeHtml(security.type)} Profile</span>
        <strong>${escapeHtml(security.symbol)}</strong>
        <small>${escapeHtml(security.name)} · ${escapeHtml(security.exchange)}</small>
      </header>
      <section class="admin-terminal-marketplace-quote ${escapeHtml(security.tone)} is-finance-layout" data-marketplace-quote-card data-marketplace-quote-symbol="${escapeHtml(security.symbol)}">
        <div class="admin-terminal-marketplace-price-summary">
          <div>
            <small>Last Price</small>
            <strong data-marketplace-live-price>${renderCurrencyAmount(security.price, security.currency)}</strong>
            <span class="${escapeHtml(security.tone)}" data-marketplace-live-change>${escapeHtml(security.change)}</span>
          </div>
          <div>
            <small>Venue</small>
            <strong>${escapeHtml(security.exchange)}</strong>
            <span>${escapeHtml(security.currency)} · ${escapeHtml(security.type)}</span>
          </div>
          <div>
            <small>Session</small>
            <strong>Live</strong>
            <span>Realtime preview</span>
          </div>
        </div>
        ${renderMarketplaceCandlestickChart(security, securities, options)}
      </section>
      <section class="admin-terminal-marketplace-profile-grid">
        <article><small>Location</small><strong>${escapeHtml(security.country)}</strong></article>
        <article><small>Sector</small><strong>${escapeHtml(security.sector)}</strong></article>
        <article><small>Volume</small><strong>${escapeHtml(security.volume)}</strong></article>
        <article><small>Day Range</small><strong>${escapeHtml(security.dayRange)}</strong></article>
        <article><small>Market Cap / Size</small><strong>${escapeHtml(security.marketCap)}</strong></article>
        <article><small>P/E or Ratio</small><strong>${escapeHtml(security.pe)}</strong></article>
        <article><small>Yield / Coupon</small><strong>${escapeHtml(security.yieldValue)}</strong></article>
        <article><small>Beta / Volatility</small><strong>${escapeHtml(security.beta)}</strong></article>
        <article><small>Options</small><strong>${escapeHtml(optionAvailability)}</strong></article>
      </section>
      <section class="admin-terminal-marketplace-description">
        <span>Description</span>
        <p>${escapeHtml(security.description)}</p>
        <span>Market read</span>
        <p>${escapeHtml(security.thesis)}</p>
      </section>
      ${renderMarketplaceFinancialsDrawer(security)}`;
  }
  function renderMarketplaceOrderTicket(selected) {
    return `
      <section class="admin-terminal-marketplace-ticket" aria-label="Order ticket">
        <header>
          <span>Order Ticket</span>
          <strong data-marketplace-ticket-symbol>${escapeHtml(selected.symbol)}</strong>
          <small data-marketplace-ticket-name>${escapeHtml(selected.name)}</small>
        </header>
        <div class="admin-terminal-marketplace-ticket-grid">
          <label>
            <span>Instrument</span>
            <select data-marketplace-instrument>
              ${renderMarketplaceTicketInstrumentOptions(selected)}
            </select>
          </label>
          <label>
            <span>Side</span>
            <select data-marketplace-order-side>
              <option>Buy</option>
              <option>Sell</option>
              <option>Short Sell</option>
              <option>Cover Short</option>
            </select>
          </label>
          <label>
            <span>Order Type</span>
            <select data-marketplace-order-type>
              <option>Market</option>
              <option>Limit</option>
              <option>Stop Loss</option>
              <option>Stop Limit</option>
            </select>
          </label>
          <label class="admin-terminal-marketplace-contract-field" data-marketplace-contract-field hidden>
            <span>Contract</span>
            <select data-marketplace-option-contract ${selected.optionChain.length ? "" : "disabled"}>
              ${renderMarketplaceTicketContractOptions(selected)}
            </select>
          </label>
          <label>
            <span>Quantity</span>
            <input type="number" min="1" step="1" value="1" data-marketplace-order-qty>
          </label>
          <label>
            <span>Limit Price</span>
            <input type="number" min="0" step="0.01" value="${escapeHtml(selected.price)}" data-marketplace-order-limit>
          </label>
          <label>
            <span>Stop Price</span>
            <input type="number" min="0" step="0.01" placeholder="optional" data-marketplace-order-stop>
          </label>
          <label>
            <span>Time in Force</span>
            <select data-marketplace-order-tif>
              <option>Day</option>
              <option>Good Till Cancelled</option>
              <option>Immediate or Cancel</option>
            </select>
          </label>
        </div>
        <div class="admin-terminal-marketplace-option-loadout" data-marketplace-option-loadout hidden>
          <span data-marketplace-option-summary>Stock order selected</span>
        </div>
        <div hidden data-marketplace-hidden-option-loader>${renderMarketplaceHiddenOptionLoader(selected)}</div>
        <section class="admin-terminal-marketplace-order-preview" data-marketplace-order-preview>
          Select quantity and preview the order before submitting.
        </section>
        <div class="admin-terminal-marketplace-ticket-actions">
          <button type="button" data-admin-terminal-action="marketplace-preview-order">Preview</button>
          <button type="button" data-admin-terminal-action="marketplace-place-order" disabled title="Marketplace execution is preview-only until backend stock order wiring is connected.">Preview Only</button>
        </div>
      </section>`;
  }
  function renderMarketplaceRecentOrders(securities) {
    const sample = securities.slice(0, 5).map((security, index) => ({
      time: ["09:02", "09:09", "09:16", "09:22", "09:31"][index],
      side: ["Buy", "Sell", "Short Sell", "Buy", "Stop Loss"][index],
      qty: ["3", "1", "2", "1", "5"][index],
      symbol: security.symbol,
      price: security.price,
      currency: security.currency
    }));
    return `
      <section class="admin-terminal-marketplace-orders" aria-label="Recent marketplace orders">
        <header>
          <span>Order Flow</span>
          <strong>Recent activity</strong>
        </header>
        <div data-marketplace-orders>
          ${sample.map((order) => `
            <article>
              <span>${escapeHtml(order.time)}</span>
              <strong>${escapeHtml(order.side)} ${escapeHtml(order.qty)} ${escapeHtml(order.symbol)}</strong>
              <small>${renderCurrencyAmount(order.price, order.currency)}</small>
            </article>`).join("")}
        </div>
      </section>`;
  }
  function renderMarketPageHeader(model) {
    return `
      <header class="admin-terminal-top admin-terminal-page-top">
        <div>
          <span>Trading terminal / marketplace</span>
          <h2>Marketplace</h2>
          <p>Search securities, inspect profiles, and stage buy, sell, short, stop-loss, options, bond, ETF, index, and commodity orders.</p>
        </div>
        <div class="admin-terminal-top-actions">
          <button class="admin-terminal-bell" type="button" aria-label="Alerts" data-admin-terminal-bell>
            ${bellIcon()}
            ${model.notificationCount ? `<small>${escapeHtml(model.notificationCount)}</small>` : ""}
          </button>
          <button class="admin-terminal-user-button" type="button" aria-label="Open admin profile menu" aria-expanded="false" data-admin-terminal-user>
            <span class="admin-terminal-avatar">${escapeHtml(getAdminInitials(model.adminName))}</span>
            <i aria-hidden="true"></i>
          </button>
          ${renderNotifications(model)}
          ${renderAdminUserMenu(model)}
        </div>
      </header>`;
  }
  function renderMarketMetric(label, value, meta, tone = "cyan") {
    return `
      <article class="admin-terminal-market-metric is-${escapeHtml(tone)}">
        <small>${escapeHtml(label)}</small>
        <strong>${escapeHtml(value)}</strong>
        <span>${escapeHtml(meta)}</span>
      </article>`;
  }
  function renderMarketPage(model) {
    const securities = getTerminalMarketplaceSecurities(model);
    const selected = securities[0];
    const typeOptions = getUniqueMarketplaceValues(securities, "type");
    const countryOptions = getUniqueMarketplaceValues(securities, "country");
    const sectorOptions = getUniqueMarketplaceValues(securities, "sector");
    return `
      <section class="admin-terminal-overview admin-terminal-market-page is-marketplace-v502 is-marketplace-v503 is-marketplace-v504 is-marketplace-v505 is-marketplace-v506 is-marketplace-v507 is-marketplace-v508 is-marketplace-v509 is-marketplace-v510 is-marketplace-v511 is-marketplace-v512 is-marketplace-v513 is-marketplace-v514 is-marketplace-v515 is-marketplace-v516 is-marketplace-v517 is-marketplace-v518 is-marketplace-v519 is-marketplace-v520 is-marketplace-v521 is-marketplace-v523 is-marketplace-v524 is-marketplace-v525 is-marketplace-v526 is-marketplace-v527 is-marketplace-v529" aria-label="Admin marketplace terminal" data-admin-terminal-page="Market">
        ${renderMarketPageHeader(model)}
        <section class="admin-terminal-marketplace-toolbar" aria-label="Marketplace search and filters">
          <label class="admin-terminal-marketplace-toolbar-search">
            <span>Search</span>
            <input type="search" placeholder="Search ticker, company, sector, country" data-marketplace-search>
          </label>
          <div class="admin-terminal-marketplace-toolbar-filters">
            <label>
              <span>Asset</span>
              <select aria-label="Asset class" data-marketplace-filter="type"><option value="all">All assets</option>${renderMarketplaceSelectOptions(typeOptions)}</select>
            </label>
            <label>
              <span>Location</span>
              <select aria-label="Location" data-marketplace-filter="location"><option value="all">All locations</option>${renderMarketplaceSelectOptions(countryOptions)}</select>
            </label>
            <label>
              <span>Sector</span>
              <select aria-label="Sector" data-marketplace-filter="sector"><option value="all">All sectors</option>${renderMarketplaceSelectOptions(sectorOptions)}</select>
            </label>
            <label>
              <span>Price</span>
              <select aria-label="Price band" data-marketplace-filter="price">
                <option value="all">All prices</option>
                <option value="under-50">Under 50</option>
                <option value="50-100">50–100</option>
                <option value="100-250">100–250</option>
                <option value="over-250">Over 250</option>
              </select>
            </label>
            <label>
              <span>Sort</span>
              <select aria-label="Sort securities" data-marketplace-sort>
                <option value="symbol">Ticker</option>
                <option value="price-asc">Price ↑</option>
                <option value="price-desc">Price ↓</option>
                <option value="change-desc">Top movers</option>
                <option value="change-asc">Worst movers</option>
              </select>
            </label>
          </div>
          <button class="admin-terminal-marketplace-toolbar-clear" type="button" data-admin-terminal-action="marketplace-clear-filters" aria-label="Clear Marketplace filters">
            Clear
          </button>
        </section>
        <div class="admin-terminal-marketplace-layout">
          <section class="admin-terminal-marketplace-list" aria-label="Searchable securities list">
            <header>
              <div>
                <span>Securities</span>
                <h3>Market list</h3>
                <small><b data-marketplace-visible-count>${escapeHtml(securities.length)}</b> shown</small>
              </div>
            </header>
            <div class="admin-terminal-marketplace-list-head" role="row">
              <span>Security</span>
              <span>Price</span>
            </div>
            <div class="admin-terminal-marketplace-security-list" data-marketplace-list>
              ${securities.map(renderMarketplaceSecurityRow).join("")}
            </div>
            <p class="admin-terminal-marketplace-empty" data-marketplace-empty hidden>No securities match this search.</p>
          </section>
          <div class="admin-terminal-marketplace-workspace" aria-label="Selected security workspace">
            <aside class="admin-terminal-marketplace-profile" aria-label="Selected security profile" data-marketplace-profile>
              ${renderMarketplaceProfile(selected, securities, { showAdminEventMarkers: true })}
            </aside>
            <aside class="admin-terminal-marketplace-side" aria-label="Trading controls">
              ${renderMarketplaceOrderTicket(selected)}
              ${renderMarketplaceRecentOrders(securities)}
            </aside>
          </div>
        </div>
        <div hidden data-marketplace-profile-templates>
          ${securities.map((security) => `<template data-marketplace-profile-template="${escapeHtml(security.symbol)}">${renderMarketplaceProfile(security, securities, { showAdminEventMarkers: true })}</template>`).join("")}
        </div>
      </section>`;
  }
  function renderSettingsPageHeader(model) {
    return `
      <header class="admin-terminal-top admin-terminal-page-top">
        <div>
          <span>Simulation / game configuration</span>
          <h2>Settings</h2>
          <p>Difficulty configuration will be added after the game difficulty model is finalized.</p>
        </div>
        <div class="admin-terminal-top-actions">
          <button class="admin-terminal-bell" type="button" aria-label="Alerts" data-admin-terminal-bell>
            ${bellIcon()}
            ${model.notificationCount ? `<small>${escapeHtml(model.notificationCount)}</small>` : ""}
          </button>
          <button class="admin-terminal-user-button" type="button" aria-label="Open admin profile menu" aria-expanded="false" data-admin-terminal-user>
            <span class="admin-terminal-avatar">${escapeHtml(getAdminInitials(model.adminName))}</span>
            <i aria-hidden="true"></i>
          </button>
          ${renderNotifications(model)}
          ${renderAdminUserMenu(model)}
        </div>
      </header>`;
  }
  function renderSettingsPage(model) {
    return `
      <section class="admin-terminal-overview admin-terminal-settings-page" aria-label="Admin settings terminal" data-admin-terminal-page="Settings">
        ${renderSettingsPageHeader(model)}
        <section class="admin-terminal-settings-detail" aria-label="Settings paused">
          <header>
            <span>Paused</span>
            <strong>Settings paused</strong>
            <small>Difficulty configuration will be added after the game difficulty model is finalized.</small>
          </header>
          <section class="admin-terminal-settings-detail-card is-warn">
            <span>Backend wiring status</span>
            <p>Settings controls are intentionally disabled for this pass. No game-settings mutations are wired from the admin terminal.</p>
          </section>
        </section>
      </section>`;
  }
  function getTerminalLogRows(model) {
    const source = Array.isArray(model?.auditLogs) && model.auditLogs.length
      ? model.auditLogs
      : Array.isArray(model?.logs) && model.logs.length
        ? model.logs
        : [
            { time: "07:58", type: "Security", actor: "System", target: "Admin console", summary: "Staff session authenticated through domain login.", source: "Google SSO", before: "Signed out", after: "Signed in", severity: "Low", impact: "Access", eventId: "LOG-2407-001" },
            { time: "08:01", type: "Attendance", actor: "System", target: "Mina Park", summary: "Checked in on time and received attendance reward.", source: "Scanner", before: "Offline", after: "Present · +10.00", severity: "Low", impact: "Cash +10.00", eventId: "LOG-2407-002" },
            { time: "08:14", type: "Attendance", actor: "System", target: "Alex Kim", summary: "Marked late and received reduced attendance reward.", source: "Scanner", before: "Offline", after: "Late · +4.00", severity: "Medium", impact: "Cash +4.00", eventId: "LOG-2407-003" },
            { time: "08:20", type: "Store", actor: "Mina Park", target: "Homework Pass", summary: "Purchased store item and inventory record was created.", source: "Student purchase", before: "Cash 68.00", after: "Cash 43.00 · Item +1", severity: "Low", impact: "Cash -25.00", eventId: "LOG-2407-004" },
            { time: "08:26", type: "Inventory", actor: "System", target: "Energy Cell Pack", summary: "Reward item added to player inventory after contract completion.", source: "Contract reward", before: "Qty 0", after: "Qty 3", severity: "Low", impact: "Inventory +3", eventId: "LOG-2407-005" },
            { time: "08:31", type: "Contracts", actor: model.adminName || "Admin", target: "Market Reflection", summary: "Created contract for all countries with cash and item reward rules.", source: "Admin action", before: "Draft", after: "Active", severity: "Medium", impact: "New active contract", eventId: "LOG-2407-006" },
            { time: "08:38", type: "Finance", actor: model.adminName || "Admin", target: "Daniel Lee", summary: "Manual ledger adjustment applied after dispute review.", source: "Admin adjustment", before: "Cash 112.00", after: "Cash 127.00", severity: "Medium", impact: "Cash +15.00", eventId: "LOG-2407-007" },
            { time: "08:44", type: "Market", actor: "System", target: "FROST", summary: "Applied price movement from shipping-delay market event.", source: "Market event", before: "125.19", after: "128.20", severity: "Low", impact: "+2.4% asset price", eventId: "LOG-2407-008" },
            { time: "08:49", type: "Liabilities", actor: "System", target: "Yrethia Equipment Loan", summary: "Weekly minimum payment posted and remaining balance recalculated.", source: "Loan schedule", before: "Due 43.20", after: "Paid 43.20 · Current", severity: "Low", impact: "Debt -43.20", eventId: "LOG-2407-009" },
            { time: "08:52", type: "Settings", actor: model.adminName || "Admin", target: "Difficulty", summary: "Reviewed Standard difficulty preset without applying changes.", source: "Admin view", before: "Standard", after: "Standard", severity: "Low", impact: "No change", eventId: "LOG-2407-010" },
            { time: "09:03", type: "Contracts", actor: "Yuna Choi", target: "Supply Chain Memo", summary: "Submitted contract evidence for review.", source: "Student submission", before: "Assigned", after: "Submitted", severity: "Low", impact: "Review needed", eventId: "LOG-2407-011" },
            { time: "09:12", type: "Liabilities", actor: "System", target: "Syndalis Short-Term Credit", summary: "Loan crossed attention threshold because weekly payment was missed.", source: "Loan schedule", before: "Current", after: "Attention · late fee pending", severity: "High", impact: "Late risk", eventId: "LOG-2407-012" }
          ];
    return source.map((row, index) => {
      const type = row.type || row.category || "System";
      const normalized = String(type).toLowerCase();
      const severity = row.severity || row.priority || (normalized.includes("liabil") ? "Medium" : "Low");
      const normalizedSeverity = String(severity).toLowerCase();
      const tone =
        normalized.includes("attendance") ? "is-attendance" :
        normalized.includes("store") ? "is-store" :
        normalized.includes("inventory") ? "is-inventory" :
        normalized.includes("contract") || normalized.includes("assignment") ? "is-contracts" :
        normalized.includes("market") || normalized.includes("stock") ? "is-market" :
        normalized.includes("liabil") || normalized.includes("loan") || normalized.includes("debt") ? "is-liabilities" :
        normalized.includes("finance") || normalized.includes("ledger") || normalized.includes("cash") ? "is-finance" :
        normalized.includes("security") || normalized.includes("access") ? "is-security" :
        normalized.includes("setting") ? "is-settings" :
        "is-system";
      const severityTone =
        normalizedSeverity.includes("high") || normalizedSeverity.includes("critical") ? "is-high" :
        normalizedSeverity.includes("medium") || normalizedSeverity.includes("warn") ? "is-medium" :
        "is-low";
      return {
        time: row.time || row.timestamp || ["08:01", "08:14", "08:20", "08:31", "08:44", "08:52"][index % 6],
        type,
        actor: row.actor || row.user || "System",
        target: row.target || row.record || "Simulation",
        summary: row.summary || row.description || "System event recorded.",
        source: row.source || "System",
        before: row.before || "—",
        after: row.after || "—",
        severity,
        severityTone,
        impact: row.impact || row.effect || row.delta || "Recorded",
        eventId: row.eventId || row.id || `LOG-${String(index + 1).padStart(4, "0")}`,
        tone,
        index
      };
    });
  }
  function getLogCategoryLabel(log) {
    const type = String(log?.type || "System");
    return type.length > 18 ? `${type.slice(0, 18)}…` : type;
  }
  function isHighImpactLog(log) {
    const text = `${log?.severity || ""} ${log?.impact || ""} ${log?.summary || ""}`.toLowerCase();
    return text.includes("high") || text.includes("late") || text.includes("manual") || text.includes("adjust") || text.includes("risk");
  }
  function renderLogsPageHeader(model) {
    return `
      <header class="admin-terminal-top admin-terminal-page-top">
        <div>
          <span>Audit trail / system activity</span>
          <h2>Logs</h2>
          <p>Review what changed, who did it, when it happened, and what record was affected.</p>
        </div>
        <div class="admin-terminal-top-actions">
          <button class="admin-terminal-bell" type="button" aria-label="Alerts" data-admin-terminal-bell>
            ${bellIcon()}
            ${model.notificationCount ? `<small>${escapeHtml(model.notificationCount)}</small>` : ""}
          </button>
          <button class="admin-terminal-user-button" type="button" aria-label="Open admin profile menu" aria-expanded="false" data-admin-terminal-user>
            <span class="admin-terminal-avatar">${escapeHtml(getAdminInitials(model.adminName))}</span>
            <i aria-hidden="true"></i>
          </button>
          ${renderNotifications(model)}
          ${renderAdminUserMenu(model)}
        </div>
      </header>`;
  }
  function renderLogsMetric(label, value, meta, tone = "cyan") {
    return `
      <article class="admin-terminal-logs-metric is-${escapeHtml(tone)}">
        <small>${escapeHtml(label)}</small>
        <strong>${escapeHtml(value)}</strong>
        <span>${escapeHtml(meta)}</span>
      </article>`;
  }
  function renderLogTimelineRow(log) {
    return `
      <article class="admin-terminal-log-row ${escapeHtml(log.tone)} ${escapeHtml(log.severityTone)}">
        <button
          type="button"
          data-admin-terminal-action="open-log-detail"
          data-log-type="${escapeHtml(log.type)}"
          data-log-target="${escapeHtml(log.target)}"
        >
          <span class="admin-terminal-log-time">${escapeHtml(log.time)}</span>
          <span class="admin-terminal-log-dot" aria-hidden="true"></span>
          <span class="admin-terminal-log-main">
            <strong>${escapeHtml(log.target)}</strong>
            <small>${escapeHtml(log.summary)}</small>
            <em>${escapeHtml(log.actor)} · ${escapeHtml(log.source)}</em>
          </span>
          <span class="admin-terminal-log-side">
            <span class="admin-terminal-log-type">${escapeHtml(getLogCategoryLabel(log))}</span>
            <b class="admin-terminal-log-impact">${escapeHtml(log.impact)}</b>
          </span>
        </button>
      </article>`;
  }
  function renderLogSourceRow(label, value, tone = "cyan") {
    return `
      <article class="admin-terminal-log-source is-${escapeHtml(tone)}">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </article>`;
  }
  function renderLogsPage(model) {
    const logs = getTerminalLogRows(model);
    const selected = logs[0] || {
      time: "—",
      type: "System",
      actor: "System",
      target: "No event selected",
      summary: "No log event available.",
      source: "System",
      before: "—",
      after: "—",
      severity: "Low",
      severityTone: "is-low",
      impact: "None",
      eventId: "LOG-0000",
      tone: "is-system"
    };
    const attendanceCount = logs.filter((log) => log.tone === "is-attendance").length;
    const inventoryCount = logs.filter((log) => log.tone === "is-inventory" || log.tone === "is-store").length;
    const financialCount = logs.filter((log) => ["is-finance", "is-liabilities", "is-market", "is-store"].includes(log.tone)).length;
    const adminCount = logs.filter((log) => log.actor !== "System").length;
    const highImpactCount = logs.filter(isHighImpactLog).length;
    return `
      <section class="admin-terminal-overview admin-terminal-logs-page" aria-label="Admin logs terminal" data-admin-terminal-page="Logs">
        ${renderLogsPageHeader(model)}
        <section class="admin-terminal-logs-command" aria-label="Log filters and summary">
          ${renderLogsMetric("Events", logs.length, "visible records", "cyan")}
          ${renderLogsMetric("Manual", adminCount, "staff / student actors", "purple")}
          ${renderLogsMetric("High Impact", highImpactCount, "review priority", "warn")}
          ${renderLogsMetric("Financial", financialCount, "cash / market / debt", "active")}
          <button class="admin-terminal-logs-export" type="button" data-admin-terminal-action="export-logs">
            <span>⇩</span>
            Export Logs
          </button>
        </section>
        <section class="admin-terminal-logs-control-strip" aria-label="Log search and scope controls">
          <label>
            <span>Search Logs</span>
            <input type="search" placeholder="Player, item, loan, contract, event ID" aria-label="Search logs" data-admin-terminal-logs-search>
          </label>
          <div>
            <button type="button" class="active" data-admin-terminal-action="filter-logs-all">All</button>
            <button type="button" data-admin-terminal-action="filter-logs-attendance">Attendance</button>
            <button type="button" data-admin-terminal-action="filter-logs-inventory">Inventory</button>
            <button type="button" data-admin-terminal-action="filter-logs-finance">Finance</button>
            <button type="button" data-admin-terminal-action="filter-logs-contracts">Contracts</button>
            <button type="button" data-admin-terminal-action="filter-logs-admin">Admin</button>
          </div>
        </section>
        <section class="admin-terminal-log-source-grid" aria-label="Log coverage summary">
          ${renderLogSourceRow("Attendance", attendanceCount, "active")}
          ${renderLogSourceRow("Inventory / Store", inventoryCount, "cyan")}
          ${renderLogSourceRow("Cash / Debt / Market", financialCount, "warn")}
          ${renderLogSourceRow("Retention", "Full trail", "purple")}
        </section>
        <div class="admin-terminal-logs-layout">
          <section class="admin-terminal-logs-timeline" aria-label="Audit timeline">
            <header>
              <div>
                <span>Timeline</span>
                <h3>System Activity</h3>
              </div>
              <div class="admin-terminal-logs-tabs">
                <button type="button" class="active" data-admin-terminal-action="filter-logs-all">All</button>
                <button type="button" data-admin-terminal-action="filter-logs-system">System</button>
                <button type="button" data-admin-terminal-action="filter-logs-admin">Admin</button>
                <button type="button" data-admin-terminal-action="filter-logs-economy">Economy</button>
              </div>
            </header>
            <div class="admin-terminal-log-list">
              ${logs.map(renderLogTimelineRow).join("")}
            </div>
          </section>
          <aside class="admin-terminal-log-detail" aria-label="Selected log detail">
            <header>
              <span>Selected Event</span>
              <strong>${escapeHtml(selected.target)}</strong>
              <small>${escapeHtml(selected.type)} · ${escapeHtml(selected.time)} · ${escapeHtml(selected.source)}</small>
            </header>
            <section class="admin-terminal-log-detail-card ${escapeHtml(selected.tone)} ${escapeHtml(selected.severityTone)}">
              <span>Event Summary</span>
              <p>${escapeHtml(selected.summary)}</p>
              <dl>
                <div>
                  <dt>Event ID</dt>
                  <dd>${escapeHtml(selected.eventId)}</dd>
                </div>
                <div>
                  <dt>Severity</dt>
                  <dd>${escapeHtml(selected.severity)}</dd>
                </div>
                <div>
                  <dt>Actor</dt>
                  <dd>${escapeHtml(selected.actor)}</dd>
                </div>
                <div>
                  <dt>Target</dt>
                  <dd>${escapeHtml(selected.target)}</dd>
                </div>
                <div>
                  <dt>Impact</dt>
                  <dd>${escapeHtml(selected.impact)}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>${escapeHtml(selected.source)}</dd>
                </div>
                <div>
                  <dt>Before</dt>
                  <dd>${escapeHtml(selected.before)}</dd>
                </div>
                <div>
                  <dt>After</dt>
                  <dd>${escapeHtml(selected.after)}</dd>
                </div>
              </dl>
              <div class="admin-terminal-log-detail-actions">
                <button type="button" data-admin-terminal-action="open-related-record">Open Record</button>
                <button type="button" data-admin-terminal-action="copy-log-id">Copy Event</button>
                <button type="button" data-admin-terminal-action="flag-log-event">Flag Event</button>
                <button type="button" data-admin-terminal-action="export-logs">Export</button>
              </div>
            </section>
            <section class="admin-terminal-log-use-cases">
              <span>Audit Controls</span>
              <p>Use this panel to trace disputes across attendance scans, cash changes, inventory rewards, store purchases, contract submissions, market events, and loan activity.</p>
              <div>
                <button type="button" data-admin-terminal-action="search-logs">Search Logs</button>
                <button type="button" data-admin-terminal-action="audit-student-history">Student History</button>
                <button type="button" data-admin-terminal-action="export-logs">Export Trail</button>
              </div>
            </section>
          </aside>
        </div>
      </section>`;
  }
  function isAdminTerminalLeftMenuSection(section) {
    return ["Overview", "Players", "Attendance", "Assignments", "Store", "Market", "Settings", "Logs"].includes(normalizeTerminalPageSection(section));
  }
  function getAdminTerminalLeftMenuSection(section = null) {
    const feature = window.Econovaria.features.adminOverviewTerminal;
    const normalized = normalizeTerminalPageSection(section || "");
    if (isAdminTerminalLeftMenuSection(normalized)) return normalized;
    return normalizeTerminalPageSection(feature.lastLeftMenuSection || "Overview");
  }
  function setAdminTerminalLeftMenuSection(section) {
    const feature = window.Econovaria.features.adminOverviewTerminal;
    const normalized = getAdminTerminalLeftMenuSection(section);
    feature.lastLeftMenuSection = normalized;
    return normalized;
  }
  function getAdminAccountMeta(model) {
    const staffSession = getStaffSession() || {};
    return {
      name: model.adminName || staffSession.staffDisplayName || staffSession.displayName || "Administrator",
      role: staffSession.staffRole || staffSession.role || model.adminRole || "Teacher Admin",
      email: staffSession.staffEmail || staffSession.email || model.adminEmail || "admin@econovaria.local",
      gameName: model.gameName || "Eco Novaria Simulation",
      gameCode: model.gameCode || "—",
      gameStatus: model.gameStatus || "live"
    };
  }
  function getAdminProfileAvatarDataUrl() {
    return window.Econovaria.features.adminOverviewTerminal.adminProfileAvatarDataUrl || "";
  }
  function applyAdminProfileAvatar(dataUrl = "") {
    const value = String(dataUrl || "");
    window.Econovaria.features.adminOverviewTerminal.adminProfileAvatarDataUrl = value;
    if (value) {
      document.documentElement.classList.add("has-admin-terminal-profile-avatar");
      document.documentElement.style.setProperty("--admin-terminal-profile-avatar-image", `url("${value}")`);
    } else {
      document.documentElement.classList.remove("has-admin-terminal-profile-avatar");
      document.documentElement.style.removeProperty("--admin-terminal-profile-avatar-image");
    }
  }
  function renderAccountPageHeader(model, eyebrow, title, description) {
    return `
      <header class="admin-terminal-top admin-terminal-page-top">
        <div>
          <span>${escapeHtml(eyebrow)}</span>
          <h2>${escapeHtml(title)}</h2>
          <p>${escapeHtml(description)}</p>
        </div>
        <div class="admin-terminal-top-actions">
          <button class="admin-terminal-bell" type="button" aria-label="Alerts" data-admin-terminal-bell>
            ${bellIcon()}
            ${model.notificationCount ? `<small>${escapeHtml(model.notificationCount)}</small>` : ""}
          </button>
          <button class="admin-terminal-user-button" type="button" aria-label="Open admin profile menu" aria-expanded="false" data-admin-terminal-user>
            <span class="admin-terminal-avatar">${escapeHtml(getAdminInitials(model.adminName))}</span>
            <i aria-hidden="true"></i>
          </button>
          ${renderNotifications(model)}
          ${renderAdminUserMenu(model)}
        </div>
      </header>`;
  }
  function renderAdminAccountStat(label, value, meta = "", tone = "cyan") {
    return `
      <article class="admin-terminal-account-stat is-${escapeHtml(tone)}">
        <small>${escapeHtml(label)}</small>
        <strong>${escapeHtml(value)}</strong>
        ${meta ? `<span>${escapeHtml(meta)}</span>` : ""}
      </article>`;
  }
  function renderAdminAccountAction(label, meta, actionName, tone = "") {
    return `
      <button type="button" class="${tone ? `is-${escapeHtml(tone)}` : ""}" data-admin-terminal-action="${escapeHtml(actionName)}">
        <strong>${escapeHtml(label)}</strong>
        <small>${escapeHtml(meta)}</small>
      </button>`;
  }
  function renderAdminAccountActionList(actions = []) {
    return `<div class="admin-terminal-account-action-list">${actions.join("")}</div>`;
  }
  function renderAdminAccountDefinitionList(rows = []) {
    return `<dl class="admin-terminal-account-definition-list">${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${value}</dd></div>`).join("")}</dl>`;
  }
  function renderAdminAccountPanelHeader(kicker, title, meta = "") {
    return `<header><span>${escapeHtml(kicker)}</span><strong>${escapeHtml(title)}</strong>${meta ? `<small>${escapeHtml(meta)}</small>` : ""}</header>`;
  }
  function renderAdminAccountStats(stats = []) {
    return stats.length ? `<section class="admin-terminal-account-stat-grid">${stats.map((item) => renderAdminAccountStat(item[0], item[1], item[2], item[3])).join("")}</section>` : "";
  }
  function renderAdminAccountLayout({ primaryHeader, primaryBody, sideHeader, sideActions, sideBody = "" }) {
    return `
        <div class="admin-terminal-account-layout">
          <section class="admin-terminal-account-primary">
            ${primaryHeader}
            ${primaryBody}
          </section>
          <aside class="admin-terminal-account-side">
            ${sideHeader}
            ${sideBody}
            ${renderAdminAccountActionList(sideActions)}
          </aside>
        </div>`;
  }
  function renderAdminAccountShell(model, { page, ariaLabel, className = "", eyebrow, title, description, stats = [], primaryHeader, primaryBody, sideHeader, sideActions, sideBody = "" }) {
    const extraClass = className ? ` ${escapeHtml(className)}` : "";
    return `
      <section class="admin-terminal-overview admin-terminal-account-page${extraClass}" aria-label="${escapeHtml(ariaLabel)}" data-admin-terminal-page="${escapeHtml(page)}">
        ${renderAccountPageHeader(model, eyebrow, title, description)}
        ${renderAdminAccountStats(stats)}
        ${renderAdminAccountLayout({ primaryHeader, primaryBody, sideHeader, sideActions, sideBody })}
      </section>`;
  }
  function renderAdminProfilePage(model) {
    const meta = getAdminAccountMeta(model);
    const avatar = getAdminProfileAvatarDataUrl();
    const primaryBody = `
            <div class="admin-terminal-profile-photo-panel">
              <div class="admin-terminal-profile-avatar-frame has-admin-avatar-frame${avatar ? " has-custom-avatar" : ""}" data-admin-terminal-avatar-frame data-admin-profile-avatar-frame>
                <img data-admin-terminal-avatar-image src="${escapeHtml(avatar)}" alt="" ${avatar ? "" : "hidden"} />
                <span ${avatar ? "hidden" : ""}>${escapeHtml(getAdminInitials(meta.name))}</span>
                <input data-admin-terminal-avatar-input data-admin-profile-avatar-input type="file" accept="image/*" hidden />
                <button type="button" aria-label="Change profile picture" data-admin-terminal-action="change-sci-avatar">✎</button>
              </div>
              <div>
                <span>Profile Picture</span>
                <strong>Profile image</strong>
                <p>Use the pencil icon to upload or replace the admin profile photo. This control lives only on the Profile page.</p>
              </div>
            </div>
            ${renderAdminAccountDefinitionList([
              ["Name", escapeHtml(meta.name)],
              ["Email", escapeHtml(meta.email)],
              ["Role", escapeHtml(meta.role)],
              ["Current Game", escapeHtml(meta.gameName)]
            ])}`;
    return renderAdminAccountShell(model, {
      page: "AdminProfile",
      ariaLabel: "Admin profile page",
      className: "admin-terminal-profile-page",
      eyebrow: "Account / profile",
      title: "Profile",
      description: "Manage the admin identity shown inside the game console.",
      primaryHeader: renderAdminAccountPanelHeader("Admin Identity", meta.name, `${meta.role} · ${meta.email}`),
      primaryBody,
      sideHeader: renderAdminAccountPanelHeader("Profile Actions", "Account controls"),
      sideActions: [
        renderAdminAccountAction("Edit Profile", "Name, email, and visible identity", "edit-admin-profile"),
        renderAdminAccountAction("Upload Photo", "Use the pencil on the profile image", "focus-admin-profile-upload"),
        renderAdminAccountAction("View Security", "Sessions and access controls", "open-admin-security"),
        renderAdminAccountAction("Sign Out", "End admin session", "sign-out-admin", "danger")
      ]
    });
  }
  function renderAdminSettingsPage(model) {
    return renderAdminAccountShell(model, {
      page: "AdminSettings",
      ariaLabel: "Admin account settings page",
      eyebrow: "Account / settings",
      title: "Account Settings",
      description: "Set display, sound, and admin-console preferences.",
      stats: [
        ["Display", "Terminal", "dark neon interface", "cyan"],
        ["Sound", "Enabled", "login and action cues", "active"],
        ["Menu", "Hover", "open instantly, close delayed", "warn"],
        ["Density", "Compact", "admin command style", "purple"]
      ],
      primaryHeader: renderAdminAccountPanelHeader("Preference Groups", "Console Behavior", "These are account-level settings, separate from game simulation rules."),
      primaryBody: renderAdminAccountDefinitionList([
        ["Theme", "Dark terminal"],
        ["Accent", "Cyan / amber operational palette"],
        ["Sound Effects", "Enabled"],
        ["Notification Drawer", "Auto-hide after pointer leave"],
        ["Default Page", "Overview"],
        ["Profile Menu", "Top-right account switcher"]
      ]),
      sideHeader: renderAdminAccountPanelHeader("Settings Actions", "Pending backend wiring"),
      sideActions: [
        renderAdminAccountAction("Save Preferences", "Persist account preferences", "save-admin-account-settings"),
        renderAdminAccountAction("Reset Preferences", "Restore terminal defaults", "reset-admin-account-settings"),
        renderAdminAccountAction("Game Settings", "Open simulation-rule settings", "open-game-settings-page")
      ]
    });
  }
  function renderAdminNotificationsPage(model) {
    const notifications = Array.isArray(model.notifications) ? model.notifications : [];
    const notices = notifications.length ? notifications : [
      { tone: "bad", label: "2 players need codes", meta: "Access review" },
      { tone: "warn", label: "3 absent today", meta: "Attendance review" },
      { tone: "purple", label: "Store item out", meta: "Store inventory" }
    ];
    return renderAdminAccountShell(model, {
      page: "AdminNotifications",
      ariaLabel: "Admin notifications page",
      eyebrow: "Account / notifications",
      title: "Notifications",
      description: "Review alerts, delivery preferences, and unresolved admin notices.",
      stats: [
        ["Active", notices.length, "current alert count", "warn"],
        ["Delivery", "In-app", "email later", "cyan"],
        ["Urgent", notices.filter((item) => item.tone === "bad").length, "needs action", "bad"],
        ["Muted", 0, "none muted", "active"]
      ],
      primaryHeader: renderAdminAccountPanelHeader("Alert Inbox", "Notification Queue", "Opened from the bell icon's View more button."),
      primaryBody: `
            <div class="admin-terminal-account-notice-list">
              ${notices.map((item) => `
                <article class="admin-terminal-account-notice ${toneClass(item.tone)}">
                  <span aria-hidden="true"></span>
                  <div>
                    <strong>${escapeHtml(item.label)}</strong>
                    <small>${escapeHtml(item.meta || "Needs review")}</small>
                  </div>
                  <button type="button" data-admin-terminal-action="resolve-admin-notification">Resolve</button>
                </article>
              `).join("")}
            </div>`,
      sideHeader: renderAdminAccountPanelHeader("Delivery Rules", "Alert behavior"),
      sideActions: [
        renderAdminAccountAction("Enable Email Alerts", "Send critical items to email", "enable-email-alerts"),
        renderAdminAccountAction("Mute Low Priority", "Hide minor notices", "mute-low-priority-alerts"),
        renderAdminAccountAction("Mark All Reviewed", "Clear visible queue locally", "mark-notifications-reviewed")
      ]
    });
  }
  function renderAdminSecurityPage(model) {
    const meta = getAdminAccountMeta(model);
    return renderAdminAccountShell(model, {
      page: "AdminSecurity",
      ariaLabel: "Admin security page",
      eyebrow: "Account / security",
      title: "Security",
      description: "Review admin sessions, account access, and sign-out controls.",
      stats: [
        ["Session", "Active", "current browser", "active"],
        ["Role", meta.role, "permission level", "cyan"],
        ["2FA", "Recommended", "not wired yet", "warn"],
        ["Risk", "Low", "no critical alerts", "active"]
      ],
      primaryHeader: renderAdminAccountPanelHeader("Session Controls", "Access Review", meta.email),
      primaryBody: renderAdminAccountDefinitionList([
        ["Current Session", "Browser admin console"],
        ["Access Scope", "Teacher admin"],
        ["Game Access", escapeHtml(meta.gameName)],
        ["Last Security Check", "Just now"]
      ]),
      sideHeader: renderAdminAccountPanelHeader("Security Actions", "Confirmation required"),
      sideActions: [
        renderAdminAccountAction("Review Sessions", "View active devices", "review-admin-sessions"),
        renderAdminAccountAction("Reset Password", "Start recovery flow", "reset-admin-password"),
        renderAdminAccountAction("Sign Out", "Ask before ending session", "sign-out-admin", "danger")
      ]
    });
  }
  function renderAdminHelpPage(model) {
    return renderAdminAccountShell(model, {
      page: "AdminHelp",
      ariaLabel: "Admin help page",
      eyebrow: "Account / help",
      title: "Help",
      description: "Operational support for running the classroom simulation.",
      primaryHeader: renderAdminAccountPanelHeader("Support Topics", "Admin Guide", "Fast references for live simulation management."),
      primaryBody: `
            <div class="admin-terminal-help-grid">
              ${[
                renderAdminAccountAction("Start a Game", "Create, share, and monitor sessions", "open-help-start-game"),
                renderAdminAccountAction("Manage Players", "Roster, access codes, and profile IDs", "open-help-players"),
                renderAdminAccountAction("Scan Attendance", "Auto/manual scanning and corrections", "open-help-attendance"),
                renderAdminAccountAction("Run Market Events", "News drivers and price changes", "open-help-market"),
                renderAdminAccountAction("Store / Rewards", "Prices, stock, and purchase control", "open-help-store"),
                renderAdminAccountAction("Troubleshooting", "Common student issues", "open-help-troubleshooting")
              ].join("")}
            </div>`,
      sideHeader: renderAdminAccountPanelHeader("Need Support?", "Contact / docs"),
      sideActions: [
        renderAdminAccountAction("Copy Diagnostics", "Session and game metadata", "copy-admin-diagnostics"),
        renderAdminAccountAction("Open Docs", "Documentation placeholder", "open-admin-docs"),
        renderAdminAccountAction("Report Issue", "Send a support note", "report-admin-issue")
      ]
    });
  }
  function renderAdminGamesPage(model) {
    const staffSession = getStaffSession();
    const selectedGame = getSelectedGame(staffSession) || {
      name: model.gameName,
      joinCode: model.gameCode,
      status: model.gameStatus
    };
    const rawGames = Array.isArray(staffSession?.activeGameSessions) && staffSession.activeGameSessions.length
      ? staffSession.activeGameSessions
      : [
          selectedGame,
          { name: "Market Simulation Lab", joinCode: "MKT-204", status: "draft" },
          { name: "Period 4 Practice Economy", joinCode: "P4E-881", status: "paused" }
        ];
    const selectedCode = model.gameCode || selectedGame?.joinCode || selectedGame?.gameCode || "—";
    return renderAdminAccountShell(model, {
      page: "AdminGames",
      ariaLabel: "Admin games page",
      eyebrow: "Account / games",
      title: "Game Selection",
      description: "Switch between active games and load a different game into the admin console.",
      primaryHeader: renderAdminAccountPanelHeader("Available Games", "Load Game", "Click a game to switch the current admin console context."),
      primaryBody: `
            <div class="admin-terminal-account-game-grid">
              ${rawGames.filter(Boolean).map((game) => {
                const code = game.joinCode || game.gameCode || "—";
                const current = code === selectedCode || game.name === model.gameName;
                return `
                  <button
                    type="button"
                    class="admin-terminal-account-game-card${current ? " is-current" : ""}"
                    data-admin-terminal-action="switch-admin-game"
                    data-game-id="${escapeHtml(game.id || "")}"
                    data-game-code="${escapeHtml(code)}"
                    data-game-name="${escapeHtml(game.name || "Untitled game")}"
                    data-game-status="${escapeHtml(game.status || "live")}"
                  >
                    <strong>${escapeHtml(game.name || "Untitled game")}</strong>
                    <small>${escapeHtml(code)} · ${escapeHtml(game.status || "live")}</small>
                    <span>${current ? "Current" : "Load Game"}</span>
                  </button>`;
              }).join("")}
            </div>`,
      sideHeader: `<header><span>Current Game</span><strong>${escapeHtml(model.gameName)}</strong><small>Code ${escapeHtml(model.gameCode)}</small></header>`,
      sideActions: [
        renderAdminAccountAction("Share Current Game", "Open share modal", "share-current-game"),
        renderAdminAccountAction("Game Settings", "Simulation rules page", "open-game-settings-page"),
        renderAdminAccountAction("Archive Game", "Confirmation required", "archive-game", "danger")
      ]
    });
  }
  function renderAdminAccountPage(model, section) {
    if (section === "AdminSettings") return renderAdminSettingsPage(model);
    if (section === "AdminNotifications") return renderAdminNotificationsPage(model);
    if (section === "AdminSecurity") return renderAdminSecurityPage(model);
    if (section === "AdminHelp") return renderAdminHelpPage(model);
    if (section === "AdminGames") return renderAdminGamesPage(model);
    return renderAdminProfilePage(model);
  }
  function renderSignOutConfirmModal(model = {}) {
    const meta = getAdminAccountMeta(model);
    return renderModalShell({
      id: "admin-signout-confirm",
      tone: "bad",
      eyebrow: "Confirm sign out",
      title: "Are you sure?",
      body: `
        <div class="admin-terminal-signout-confirm" data-admin-terminal-signout-console>
          <p>You are about to end the admin session for <strong>${escapeHtml(meta.name)}</strong>.</p>
          <dl>
            <div><dt>Account</dt><dd>${escapeHtml(meta.email)}</dd></div>
            <div><dt>Current Game</dt><dd>${escapeHtml(meta.gameName)}</dd></div>
            <div><dt>Game Code</dt><dd>${escapeHtml(meta.gameCode)}</dd></div>
          </dl>
          <small>This prototype will only confirm the action locally. Production should call the real auth sign-out route.</small>
        </div>
      `,
      footer: `
        <button type="button" data-admin-terminal-modal-close>Cancel</button>
        <button type="button" class="danger" data-admin-terminal-action="confirm-admin-signout">Yes, sign out</button>
      `
    });
  }
  function applyAdminTerminalSignedTextClasses(root = document) {
    const scope = root?.querySelectorAll ? root : document;
    scope.querySelectorAll([
      ".admin-terminal-player-business-detail-v303 strong",
      ".admin-terminal-player-yield-strip-v303 strong",
      ".admin-terminal-player-stock-row-v303 > b",
      ".admin-terminal-player-log-row-v303 b",
      ".admin-terminal-player-log-row-v303 strong"
    ].join(",")).forEach((node) => {
      const text = String(node.textContent || "").replace(/\s+/g, "").replace("−", "-");
      const positive = /^\+\$[\d,]+(?:\.\d{2})?(?:\/day)?/.test(text);
      const negative = /^-\$[\d,]+(?:\.\d{2})?(?:\/day)?/.test(text) || /^\$-[\d,]+(?:\.\d{2})?(?:\/day)?/.test(text);
      if (!positive && !negative) return;
      node.classList.toggle("is-signed-positive", positive);
      node.classList.toggle("is-positive", positive);
      node.classList.toggle("is-signed-negative", negative);
      node.classList.toggle("is-negative", negative);
      if (negative && text.startsWith("$-")) node.textContent = String(node.textContent || "").replace("$-", "-$");
    });
  }
  function rerenderAdminTerminalWithModel(model, section = null) {
    const shell = document.querySelector("[data-admin-terminal-shell]");
    if (!shell) return;
    const nextSection = normalizeTerminalPageSection(section || window.Econovaria.features.adminOverviewTerminal.currentSection || "Overview");
    const leftMenuSection = getAdminTerminalLeftMenuSection(nextSection);
    const main = shell.querySelector(".admin-terminal-shell-main");
    const menu = shell.querySelector(".admin-terminal-left-menu");
    window.Econovaria.features.adminOverviewTerminal.currentModel = model;
    window.Econovaria.features.adminOverviewTerminal.currentSection = nextSection;
    if (isAdminTerminalLeftMenuSection(nextSection)) {
      setAdminTerminalLeftMenuSection(nextSection);
    }
    if (menu) menu.outerHTML = renderLeftMenu(model, leftMenuSection);
    if (main) {
      main.innerHTML = renderTerminalSection(model, nextSection);
      applyAdminTerminalSignedTextClasses(main);
      scheduleSciIdRankAlignment(main);
      if (nextSection === "Market") startMarketplaceRealtimeFeed(main);
    }
    window.requestAnimationFrame(() => {
      syncInitialMenuStates();
      applyAdminTerminalSignedTextClasses(main || document);
      scheduleSciIdRankAlignment(main || document);
    });
  }
  function openAdminAccountPage(sectionName) {
    const model = window.Econovaria.features.adminOverviewTerminal.currentModel || getOverviewModel({});
    const section = normalizeTerminalPageSection(sectionName);
    rerenderAdminTerminalWithModel(model, section);
    closeAllNotificationDrawers();
    closeAllAdminUserMenus();
    closeAllSharePopups();
  }
  function selectAdminTerminalPlayer(playerRank, announce = false) {
    const currentModel = window.Econovaria.features.adminOverviewTerminal.currentModel || getOverviewModel({});
    const isOpen = String(currentModel.selectedPlayerRank ?? "") === String(playerRank ?? "");
    const nextRank = isOpen ? null : playerRank;
    const nextModel = { ...currentModel, selectedPlayerRank: nextRank };
    rerenderAdminTerminalWithModel(nextModel, "Players");
    if (announce && typeof showGlobalStatus === "function") {
      showGlobalStatus(nextRank ? "ok" : "warn", nextRank ? `Opened player #${playerRank}.` : `Closed player #${playerRank}.`);
    }
  }
  function updatePlayersRosterPage({ page = null, pageSize = null } = {}) {
    const currentModel = window.Econovaria.features.adminOverviewTerminal.currentModel || getOverviewModel({});
    const players = filterPlayersForRoster(
      getTerminalPlayerRows(currentModel),
      currentModel.playersStatusFilter || currentModel.playerStatusFilter || "all",
      currentModel.playersSearch || currentModel.playerRosterSearch || ""
    );
    const allowedPageSizes = [10, 50, 100];
    const nextPageSizeRaw = Number(pageSize || currentModel.playersPerPage || 10);
    const nextPageSize = allowedPageSizes.includes(nextPageSizeRaw) ? nextPageSizeRaw : 10;
    const pageCount = Math.max(1, Math.ceil(players.length / nextPageSize));
    const currentPage = Number(currentModel.playersPage || 1) || 1;
    const nextPage = Math.max(1, Math.min(pageCount, Number(page || currentPage) || 1));
    const selectedStillVisible = players
      .slice((nextPage - 1) * nextPageSize, (nextPage - 1) * nextPageSize + nextPageSize)
      .some((player) => String(player.rank) === String(currentModel.selectedPlayerRank));
    rerenderAdminTerminalWithModel({
      ...currentModel,
      playersPerPage: nextPageSize,
      playersPage: nextPage,
      selectedPlayerRank: selectedStillVisible ? currentModel.selectedPlayerRank : null
    }, "Players");
  }
  function updatePlayersRosterStatusFilter(filter) {
    const currentModel = window.Econovaria.features.adminOverviewTerminal.currentModel || getOverviewModel({});
    const nextFilter = normalizePlayerRosterStatusFilter(filter);
    const matchingPlayers = filterPlayersForRoster(getTerminalPlayerRows(currentModel), nextFilter, currentModel.playersSearch || currentModel.playerRosterSearch || "");
    const selectedStillVisible = matchingPlayers.some((player) => String(player.rank) === String(currentModel.selectedPlayerRank));
    rerenderAdminTerminalWithModel({
      ...currentModel,
      playersStatusFilter: nextFilter,
      playersPage: 1,
      selectedPlayerRank: selectedStillVisible ? currentModel.selectedPlayerRank : null
    }, "Players");
  }
  function updatePlayersRosterSearch(searchValue) {
    const currentModel = window.Econovaria.features.adminOverviewTerminal.currentModel || getOverviewModel({});
    const nextSearch = normalizePlayersRosterSearch(searchValue);
    const matchingPlayers = filterPlayersForRoster(
      getTerminalPlayerRows(currentModel),
      currentModel.playersStatusFilter || currentModel.playerStatusFilter || "all",
      nextSearch
    );
    const selectedStillVisible = matchingPlayers.some((player) => String(player.rank) === String(currentModel.selectedPlayerRank));
    rerenderAdminTerminalWithModel({
      ...currentModel,
      playersSearch: nextSearch,
      playersPage: 1,
      selectedPlayerRank: selectedStillVisible ? currentModel.selectedPlayerRank : null
    }, "Players");
    window.requestAnimationFrame(() => {
      const input = document.querySelector("[data-admin-terminal-players-search]");
      if (!input) return;
      input.focus({ preventScroll: true });
      const end = String(input.value || "").length;
      try { input.setSelectionRange(end, end); } catch (_error) {}
    });
  }
  function switchAdminGameFromAction(action) {
    const currentModel = window.Econovaria.features.adminOverviewTerminal.currentModel || getOverviewModel({});
    const nextGame = {
      id: action.dataset.gameId || "",
      name: action.dataset.gameName || "Untitled game",
      joinCode: action.dataset.gameCode || "—",
      gameCode: action.dataset.gameCode || "—",
      status: action.dataset.gameStatus || "live"
    };
    const nextModel = {
      ...currentModel,
      gameName: nextGame.name,
      gameCode: nextGame.joinCode,
      gameStatus: nextGame.status,
      selectedGame: nextGame
    };
    window.Econovaria.features.adminOverviewTerminal.selectedGameOverride = nextGame;
    rerenderAdminTerminalWithModel(nextModel, "Overview");
    if (typeof showGlobalStatus === "function") {
      showGlobalStatus("ok", `Loaded ${nextGame.name}.`);
    }
  }
  function renderTerminalSection(model, section = "Overview") {
    const normalized = normalizeTerminalPageSection(section);
    window.Econovaria.features.adminOverviewTerminal.currentSection = normalized;
    window.Econovaria.features.adminOverviewTerminal.currentModel = model;
    if (normalized === "Players") return renderPlayersPage(model);
    if (normalized === "Attendance") return renderAttendanceOpsPage(model);
    if (normalized === "Assignments") return renderContractsPage(model);
    if (normalized === "Store") return renderStorePage(model);
    if (normalized === "Market") return renderMarketPage(model);
    if (normalized === "Settings") return renderSettingsPage(model);
    if (normalized === "Logs") return renderLogsPage(model);
    if (normalized === "AdminProfile" || normalized === "AdminSettings" || normalized === "AdminNotifications" || normalized === "AdminSecurity" || normalized === "AdminHelp" || normalized === "AdminGames") return renderAdminAccountPage(model, normalized);
    return render(model);
  }
  function alignSciIdRankToSerial(root = document) {
    const scope = root?.querySelectorAll ? root : document;
    scope.querySelectorAll(".admin-terminal-sci-id-card").forEach((card) => {
      const serial = card.querySelector(".admin-terminal-sci-id-serial");
      const rank = card.querySelector(".admin-terminal-sci-id-rank-badge");
      const rankValue = rank?.querySelector("strong") || rank;
      if (!serial || !rank || !rankValue) return;
      rank.style.setProperty("transform", "none", "important");
      const cardRect = card.getBoundingClientRect();
      const serialRect = serial.getBoundingClientRect();
      const rankRect = rank.getBoundingClientRect();
      const rankValueRect = rankValue.getBoundingClientRect();
      if (!cardRect.height || !serialRect.height || !rankRect.height || !rankValueRect.height) return;
      const currentTop = rankRect.top - cardRect.top;
      const delta = serialRect.bottom - rankValueRect.bottom;
      const nextTop = Math.max(0, Math.round((currentTop + delta) * 100) / 100);
      rank.style.setProperty("top", `${nextTop}px`, "important");
      rank.style.setProperty("bottom", "auto", "important");
      rank.dataset.adminRankSerialAligned = "true";
    });
  }
  function scheduleSciIdRankAlignment(root = document) {
    const scope = root?.querySelectorAll ? root : document;
    window.requestAnimationFrame(() => {
      alignSciIdRankToSerial(scope);
      window.requestAnimationFrame(() => alignSciIdRankToSerial(scope));
    });
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => alignSciIdRankToSerial(scope)).catch(() => {});
    }
  }
function bindTerminalModalDismissControls(root) {
    if (!root || root.dataset.dismissControlsBound === "true") return;
    root.dataset.dismissControlsBound = "true";
    root.addEventListener("click", (event) => {
      const closeButton = event.target?.closest?.("[data-admin-terminal-modal-close]");
      const backdrop = event.target?.matches?.("[data-admin-terminal-modal-backdrop]");
      if (!closeButton && !backdrop) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      closeTerminalModal();
    }, true);
  }
function openTerminalModal(html) {
    const root = getModalRoot();
    root.insertAdjacentHTML("beforeend", html);
    const modalLayer = root.lastElementChild || root;
    document.documentElement.classList.add("admin-terminal-modal-open");
    bindTerminalModalDismissControls(root);
    scheduleSciIdRankAlignment(modalLayer);
    window.requestAnimationFrame(() => {
      const activeScope = modalLayer || root;
      const scanner = activeScope.querySelector("[data-admin-terminal-scanner-console]");
      if (scanner) {
        bindScannerModalControls(activeScope);
        return;
      }
      const contract = activeScope.querySelector("[data-admin-terminal-contract-console]");
      if (contract) {
        bindContractModalControls(activeScope);
        return;
      }
      const player = activeScope.querySelector("[data-admin-terminal-player-console]");
      if (player) {
        bindPlayerModalControls(activeScope);
        return;
      }
      const storeItem = activeScope.querySelector("[data-admin-terminal-store-console]");
      if (storeItem) {
        bindStoreItemModalControls(activeScope);
        return;
      }
      const sharePanel = activeScope.querySelector("[data-admin-terminal-share-console]");
      if (sharePanel) {
        const firstCopyButton = activeScope.querySelector("[data-admin-terminal-action='copy-game-code']");
        firstCopyButton?.focus?.();
        return;
      }
      const firstInput = activeScope.querySelector("input, button, textarea, select, [tabindex]:not([tabindex='-1'])");
      firstInput?.focus?.();
    });
  }
  function render(modelOrCounts = {}) {
    injectStyles();
    const model = modelOrCounts.leaderboard ? modelOrCounts : getOverviewModel(modelOrCounts);
    window.Econovaria.features.adminOverviewTerminal.currentModel = model;
    return `
      <section class="admin-terminal-overview" aria-label="Admin overview terminal">
        <header class="admin-terminal-top">
          <div>
            <span>Market simulation / teacher</span>
            <h2>Overview</h2>
            <p>Scan attendance, add content, and monitor class activity.</p>
          </div>
          <div class="admin-terminal-top-actions">
            <button class="admin-terminal-bell" type="button" aria-label="Alerts" data-admin-terminal-bell>
              ${bellIcon()}
              ${model.notificationCount ? `<small>${escapeHtml(model.notificationCount)}</small>` : ""}
            </button>
            <button class="admin-terminal-user-button" type="button" aria-label="Open admin profile menu" aria-expanded="false" data-admin-terminal-user>
              <span class="admin-terminal-avatar">${escapeHtml(getAdminInitials(model.adminName))}</span>
              <i aria-hidden="true"></i>
            </button>
            ${renderNotifications(model)}
            ${renderAdminUserMenu(model)}
          </div>
        </header>
        ${renderQuickActions()}
        ${renderAttendance(model)}
        <div class="admin-terminal-primary-grid">
          ${renderLeaderboard(model.leaderboard)}
          ${renderAssignments(model.assignments)}
        </div>
      </section>`;
  }
  function renderShell(counts = {}) {
    injectStyles();
    const model = getOverviewModel(counts);
    const section = normalizeTerminalPageSection(window.Econovaria.features.adminOverviewTerminal.currentSection || "Overview");
    const leftMenuSection = getAdminTerminalLeftMenuSection(section);
    return `
      <section class="admin-terminal-shell is-collapsed" data-admin-terminal-shell aria-label="Eco Novaria admin terminal">
        ${renderLeftMenu(model, leftMenuSection)}
        <main class="admin-terminal-shell-main">
          ${renderTerminalSection(model, section)}
        </main>
      </section>`;
  }
  function applyShellCollapsed(shell, collapsed) {
    shell.classList.toggle("is-collapsed", collapsed);
  }
  function openMenuNow(shell) {
    window.clearTimeout(shell.__adminTerminalCollapseTimer);
    applyShellCollapsed(shell, false);
  }
  function scheduleMenuCollapse(shell, delay = 1000) {
    window.clearTimeout(shell.__adminTerminalCollapseTimer);
    shell.__adminTerminalCollapseTimer = window.setTimeout(() => {
      applyShellCollapsed(shell, true);
    }, delay);
  }
/**
   * Ensures the terminal stylesheet is present.
   * The old package embedded the entire CSS payload in this function. The CSS now
   * lives in css/admin-overview-terminal.css so UI edits are isolated from logic.
   */
  function injectStyles() {
    document.querySelectorAll("style[id^='admin-overview-terminal-style']").forEach((node) => {
      if (node.id !== STYLE_ID) node.remove();
    });
    if (document.getElementById(STYLE_ID)) return;
    const existingLink = document.querySelector("link[data-admin-terminal-stylesheet]");
    if (!existingLink) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "./css/admin-overview-terminal.css";
      link.setAttribute("data-admin-terminal-stylesheet", "");
      document.head.appendChild(link);
    }
    const sentinel = document.createElement("style");
    sentinel.id = STYLE_ID;
    sentinel.textContent = "";
    sentinel.setAttribute("data-admin-terminal-style-sentinel", "");
    document.head.appendChild(sentinel);
  }
  function closeNotificationDrawer(drawer) {
    if (!drawer) return;
    window.clearTimeout(drawer.__adminTerminalCloseTimer);
    drawer.hidden = true;
  }
  function closeAllNotificationDrawers(exceptDrawer = null) {
    document.querySelectorAll("[data-admin-terminal-bell-drawer]").forEach((drawer) => {
      if (drawer !== exceptDrawer) closeNotificationDrawer(drawer);
    });
  }
  function isNotificationDrawerHovering(drawer) {
    if (!drawer) return false;
    const bell = drawer.__adminTerminalBell;
    return Boolean(
      drawer.__adminTerminalHovering ||
      drawer.matches(":hover") ||
      drawer.contains(document.activeElement) ||
      drawer.__adminTerminalBellHovering ||
      bell?.matches(":hover") ||
      bell === document.activeElement ||
      bell?.contains(document.activeElement)
    );
  }
  function scheduleNotificationDrawerClose(drawer, delay = 1000) {
    if (!drawer) return;
    window.clearTimeout(drawer.__adminTerminalCloseTimer);
    drawer.__adminTerminalCloseTimer = window.setTimeout(() => {
      if (!isNotificationDrawerHovering(drawer)) closeNotificationDrawer(drawer);
    }, delay);
  }
  function bindNotificationDrawerHover(drawer, bell = null) {
    if (!drawer) return;
    if (bell) {
      drawer.__adminTerminalBell = bell;
      if (!bell.__adminTerminalBellHoverBound) {
        bell.__adminTerminalBellHoverBound = true;
        bell.addEventListener("pointerenter", () => {
          const activeDrawer = bell
            .closest(".admin-terminal-overview")
            ?.querySelector("[data-admin-terminal-bell-drawer]");
          if (!activeDrawer) return;
          activeDrawer.__adminTerminalBell = bell;
          activeDrawer.__adminTerminalBellHovering = true;
          window.clearTimeout(activeDrawer.__adminTerminalCloseTimer);
        });
        bell.addEventListener("pointerleave", () => {
          const activeDrawer = bell
            .closest(".admin-terminal-overview")
            ?.querySelector("[data-admin-terminal-bell-drawer]");
          if (!activeDrawer) return;
          activeDrawer.__adminTerminalBellHovering = false;
          scheduleNotificationDrawerClose(activeDrawer, 1000);
        });
        bell.addEventListener("focusin", () => {
          const activeDrawer = bell
            .closest(".admin-terminal-overview")
            ?.querySelector("[data-admin-terminal-bell-drawer]");
          if (!activeDrawer) return;
          activeDrawer.__adminTerminalBell = bell;
          activeDrawer.__adminTerminalBellHovering = true;
          window.clearTimeout(activeDrawer.__adminTerminalCloseTimer);
        });
        bell.addEventListener("focusout", () => {
          const activeDrawer = bell
            .closest(".admin-terminal-overview")
            ?.querySelector("[data-admin-terminal-bell-drawer]");
          if (!activeDrawer) return;
          activeDrawer.__adminTerminalBellHovering = false;
          scheduleNotificationDrawerClose(activeDrawer, 1000);
        });
      }
    }
    if (drawer.__adminTerminalHoverBound) return;
    drawer.__adminTerminalHoverBound = true;
    drawer.__adminTerminalHovering = false;
    drawer.__adminTerminalBellHovering = false;
    drawer.addEventListener("pointerenter", () => {
      drawer.__adminTerminalHovering = true;
      window.clearTimeout(drawer.__adminTerminalCloseTimer);
    });
    drawer.addEventListener("pointerleave", () => {
      drawer.__adminTerminalHovering = false;
      scheduleNotificationDrawerClose(drawer, 1000);
    });
    drawer.addEventListener("focusin", () => {
      drawer.__adminTerminalHovering = true;
      window.clearTimeout(drawer.__adminTerminalCloseTimer);
    });
    drawer.addEventListener("focusout", () => {
      if (!drawer.contains(document.activeElement)) {
        drawer.__adminTerminalHovering = false;
        scheduleNotificationDrawerClose(drawer, 1000);
      }
    });
  }
  function openNotificationDrawer(drawer, bell = null) {
    if (!drawer) return;
    bindNotificationDrawerHover(drawer, bell);
    closeAllNotificationDrawers(drawer);
    drawer.hidden = false;
    drawer.__adminTerminalHovering = drawer.matches(":hover");
    drawer.__adminTerminalBellHovering = Boolean(bell?.matches(":hover") || bell === document.activeElement);
    scheduleNotificationDrawerClose(drawer, 1000);
  }
  function closeAdminUserMenu(menu) {
    if (!menu) return;
    menu.hidden = true;
    const root = menu.closest(".admin-terminal-overview");
    const button = root?.querySelector("[data-admin-terminal-user]");
    button?.setAttribute("aria-expanded", "false");
  }
  function closeAllAdminUserMenus(exceptMenu = null) {
    document.querySelectorAll("[data-admin-terminal-user-menu]").forEach((menu) => {
      if (menu !== exceptMenu) closeAdminUserMenu(menu);
    });
  }
  function openAdminUserMenu(menu, button = null) {
    if (!menu) return;
    closeAllNotificationDrawers();
    closeAllAdminUserMenus(menu);
    menu.hidden = false;
    button?.setAttribute("aria-expanded", "true");
  }
  function toggleAdminUserMenu(menu, button = null) {
    if (!menu) return;
    if (menu.hidden) openAdminUserMenu(menu, button);
    else closeAdminUserMenu(menu);
  }
  function getTerminalBaseUrl() {
    try {
      const url = new URL(window.location.href);
      url.hash = "";
      return url;
    } catch (_) {
      return null;
    }
  }
  function getTerminalShareUrl(gameCode = "", mode = "student") {
    const code = String(gameCode || "").trim();
    const shareMode = String(mode || "student").trim() || "student";
    const baseUrl = getTerminalBaseUrl();
    if (!baseUrl) {
      return code ? `Student login · Game code ${code}` : "Student login";
    }
    baseUrl.searchParams.set("gameCode", code);
    baseUrl.searchParams.set("mode", shareMode);
    return baseUrl.toString();
  }
  function getTerminalShareText(gameCode = "", gameName = "") {
    const code = String(gameCode || "").trim();
    const name = String(gameName || "").trim() || "Eco Novaria";
    const studentLink = getTerminalShareUrl(code, "student");
    return `Join ${name}\n\nGame code: ${code}\nStudent login: ${studentLink}`;
  }
  function getAdminTerminalCurrentModel() {
    return window.Econovaria.features.adminOverviewTerminal.currentModel || getOverviewModel({});
  }
  function setAdminTerminalCurrentModel(model) {
    window.Econovaria.features.adminOverviewTerminal.currentModel = model;
    return model;
  }
  function showAdminTerminalStatus(tone, message) {
    if (typeof showGlobalStatus === "function") showGlobalStatus(tone, message);
  }
  function isTerminalModalDismissClick(event) {
    return event?.target?.closest?.("[data-admin-terminal-modal-close]") || event?.target?.matches?.("[data-admin-terminal-modal-backdrop]");
  }
  function openTerminalPlayerModalFromAction(action, modalRenderer) {
    const player = getSelectedTerminalPlayer(getAdminTerminalCurrentModel(), action?.dataset?.playerRank);
    openTerminalModal(modalRenderer(player));
  }
  function renderPlayerLogEventDetailModalFromAction(action) {
    const data = action?.dataset || {};
    const value = (key, fallback = "—") => String(data[key] || fallback);
    const eventId = value("logEventId");
    const title = value("logTitle", "Player action");
    const severity = value("logSeverity", "Info");
    const tone = /review|warning|attention|high/i.test(severity) ? "amber" : "cyan";
    return `
      <div class="admin-terminal-modal-backdrop admin-terminal-player-log-modal-backdrop-v464" data-admin-terminal-modal-backdrop data-modal-id="player-log-event-detail">
        <section class="admin-terminal-modal admin-terminal-player-log-modal-v464 is-${escapeHtml(tone)}" role="dialog" aria-modal="true" aria-labelledby="player-log-event-detail-title">
          <header class="admin-terminal-modal-head">
            <div>
              <span>Player log event</span>
              <h3 id="player-log-event-detail-title">${escapeHtml(title)}</h3>
            </div>
            <button class="admin-terminal-modal-close admin-terminal-modal-top-close-v474" type="button" aria-label="Close popup" title="Close" data-admin-terminal-modal-close>×</button>
          </header>
          <div class="admin-terminal-modal-body admin-terminal-player-log-modal-body-v464">
            <section class="admin-terminal-player-log-event-summary-v464">
              <small>${escapeHtml(eventId)}</small>
              <p>${escapeHtml(value("logDetail", "No detail provided."))}</p>
            </section>
            <dl class="admin-terminal-player-log-event-meta-v464">
              <div><dt>Date / time</dt><dd>${escapeHtml(value("logDate"))} · ${escapeHtml(value("logTime"))}</dd></div>
              <div><dt>Actor</dt><dd>${escapeHtml(value("logActor"))}</dd></div>
              <div><dt>Source</dt><dd>${escapeHtml(value("logSource"))}</dd></div>
              <div><dt>Location</dt><dd>${escapeHtml(value("logLocation"))}</dd></div>
              <div><dt>Interacted item</dt><dd>${escapeHtml(value("logItem"))}</dd></div>
              <div><dt>Impact</dt><dd>${escapeHtml(value("logImpact", "Record"))}</dd></div>
            </dl>
            <section class="admin-terminal-player-log-exchange-v464" aria-label="Exchange context">
              <article><span>Before</span><strong>${escapeHtml(value("logBefore"))}</strong></article>
              <article><span>After</span><strong>${escapeHtml(value("logAfter"))}</strong></article>
              <p><span>Context</span><strong>${escapeHtml(value("logContext", "No additional context recorded."))}</strong></p>
            </section>
          </div>
        </section>
      </div>`;
  }
  function renderShareAccessModal({ gameCode = "", gameName = "", gameStatus = "" } = {}) {
    const code = String(gameCode || "").trim();
    const name = String(gameName || "").trim() || "Eco Novaria";
    const status = String(gameStatus || "").trim() || "Active";
    const safeId = code.replace(/[^a-zA-Z0-9_-]/g, "-") || "game";
    const studentLink = getTerminalShareUrl(code, "student");
    const adminLink = getTerminalShareUrl(code, "admin");
    const inviteText = getTerminalShareText(code, name);
    return `
      <div class="admin-terminal-modal-backdrop admin-terminal-share-modal-backdrop" data-admin-terminal-modal-backdrop data-modal-id="share-game-access">
        <section class="admin-terminal-share-modal" role="dialog" aria-modal="true" aria-labelledby="admin-terminal-share-modal-title" data-admin-terminal-share-console>
          <header class="admin-terminal-share-modal-head">
            <div>
              <span>Share Game Access</span>
              <h3 id="admin-terminal-share-modal-title">${escapeHtml(name)}</h3>
              <p>${escapeHtml(status)} · copy links, paste invite text, or open the device share sheet.</p>
            </div>
            <button type="button" aria-label="Close share popup" data-admin-terminal-modal-close>×</button>
          </header>
          <section class="admin-terminal-share-modal-code">
            <div>
              <small>Game Code</small>
              <strong>${escapeHtml(code)}</strong>
            </div>
            <button type="button" data-admin-terminal-action="copy-game-code" data-game-code="${escapeHtml(code)}">Copy Code</button>
          </section>
          <section class="admin-terminal-share-modal-field">
            <label for="admin-terminal-share-student-link-${escapeHtml(safeId)}">Student login link</label>
            <div>
              <input id="admin-terminal-share-student-link-${escapeHtml(safeId)}" type="text" readonly value="${escapeHtml(studentLink)}" />
              <button type="button" data-admin-terminal-action="copy-share-value" data-share-target="admin-terminal-share-student-link-${escapeHtml(safeId)}">Copy</button>
            </div>
          </section>
          <section class="admin-terminal-share-modal-field">
            <label for="admin-terminal-share-admin-link-${escapeHtml(safeId)}">Admin monitor link</label>
            <div>
              <input id="admin-terminal-share-admin-link-${escapeHtml(safeId)}" type="text" readonly value="${escapeHtml(adminLink)}" />
              <button type="button" data-admin-terminal-action="copy-share-value" data-share-target="admin-terminal-share-admin-link-${escapeHtml(safeId)}">Copy</button>
            </div>
          </section>
          <section class="admin-terminal-share-modal-field is-message">
            <label for="admin-terminal-share-invite-${escapeHtml(safeId)}">Copy-paste invite text</label>
            <div>
              <textarea id="admin-terminal-share-invite-${escapeHtml(safeId)}" readonly rows="6">${escapeHtml(inviteText)}</textarea>
              <button type="button" data-admin-terminal-action="copy-share-value" data-share-target="admin-terminal-share-invite-${escapeHtml(safeId)}">Copy</button>
            </div>
          </section>
          <footer class="admin-terminal-share-modal-actions">
            <button type="button" data-admin-terminal-action="open-share-link" data-share-target="admin-terminal-share-student-link-${escapeHtml(safeId)}">
              <strong>Open Student Link</strong>
              <small>Test the login flow</small>
            </button>
            <button type="button" data-admin-terminal-action="share-game-native" data-game-code="${escapeHtml(code)}" data-game-name="${escapeHtml(name)}">
              <strong>System Share</strong>
              <small>Native share sheet or copy fallback</small>
            </button>
          </footer>
        </section>
      </div>`;
  }
  async function copyTerminalShareText(text, successMessage = "Copied.") {
    try {
      await navigator.clipboard?.writeText(String(text || ""));
      showAdminTerminalStatus("ok", successMessage);
      return true;
    } catch (_) {
      showAdminTerminalStatus("warn", "Copy unavailable. Select the value manually.");
      return false;
    }
  }
  function closeAllSharePopups() {}
  function renderAdminTerminalSectionFromButton(sectionButton) {
    if (!sectionButton) return false;
    const requestedSection = sectionButton.dataset.adminSection || "Overview";
    const nextSection = normalizeTerminalPageSection(requestedSection);
    const renderableSections = new Set([
      "Overview",
      "Players",
      "Attendance",
      "Assignments",
      "Store",
      "Market",
      "Settings",
      "Logs",
      "AdminProfile",
      "AdminSettings",
      "AdminNotifications",
      "AdminSecurity",
      "AdminHelp",
      "AdminGames"
    ]);
    if (!renderableSections.has(nextSection)) {
      showAdminTerminalStatus("warn", `${requestedSection === "Assignments" ? "Contracts" : requestedSection} page is planned for the next pass.`);
      return true;
    }
    const shell = sectionButton.closest("[data-admin-terminal-shell]") || document.querySelector("[data-admin-terminal-shell]");
    const main = shell?.querySelector(".admin-terminal-shell-main");
    const menu = shell?.querySelector(".admin-terminal-left-menu");
    const model = getAdminTerminalCurrentModel();
    window.Econovaria.features.adminOverviewTerminal.currentSection = nextSection;
    setAdminTerminalCurrentModel(model);
    setAdminTerminalLeftMenuSection(nextSection);
    if (menu) menu.outerHTML = renderLeftMenu(model, getAdminTerminalLeftMenuSection(nextSection));
    if (main) {
      main.innerHTML = renderTerminalSection(model, nextSection);
      if (typeof applyAdminTerminalSignedTextClasses === "function") applyAdminTerminalSignedTextClasses(main);
      if (nextSection === "Market") startMarketplaceRealtimeFeed(main);
    }
    closeAllNotificationDrawers();
    closeAllAdminUserMenus();
    closeAllSharePopups();
    window.requestAnimationFrame(() => {
      syncInitialMenuStates();
      if (typeof applyAdminTerminalSignedTextClasses === "function") applyAdminTerminalSignedTextClasses(main || document);
    });
    return true;
  }
  function handleTerminalEscapeKey(event) {
    if (event.key !== "Escape") return;
    closeAllNotificationDrawers();
    closeAllAdminUserMenus();
    closeAllSharePopups();
  }
  function bindTerminalEscapeKeyEvents() {
    document.addEventListener("keydown", handleTerminalEscapeKey);
  }
  function applyContractsLedgerFilter(page, filter = "all") {
    if (!page) return 0;
    page.querySelectorAll("[data-contract-filter-controls]").forEach((controls) => {
      controls.querySelectorAll("[data-admin-terminal-action]").forEach((button) => {
        const isActive = button.dataset.contractFilter === filter;
        button.classList.toggle("active", isActive);
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
    });
    let visibleCount = 0;
    page.querySelectorAll("[data-contract-row]").forEach((row) => {
      const rowFilter = row.dataset.contractFilter || "active";
      const shouldShow = filter === "all" || rowFilter === filter;
      row.hidden = !shouldShow;
      if (shouldShow) visibleCount += 1;
    });
    page.querySelectorAll("[data-contract-filter-empty]").forEach((empty) => {
      empty.hidden = visibleCount > 0;
    });
    return visibleCount;
  }
  function filterContractsLedgerFromAction(action) {
    const page = action.closest(".admin-terminal-contracts-page");
    if (!page) return;
    let filter = action.dataset.contractFilter || "all";
    const actionName = action.dataset.adminTerminalAction || "";
    if (actionName.startsWith("filter-contracts-") && !action.dataset.contractFilter) {
      const legacy = actionName.replace("filter-contracts-", "");
      filter = legacy === "submitted" ? "review" : legacy === "active" ? "all" : legacy;
    }
    applyContractsLedgerFilter(page, filter);
    const label = action.textContent?.trim()?.replace(/\s+\d+$/, "") || "Contracts";
    showAdminTerminalStatus("ok", `${label} filter applied.`);
  }
  function applyStoreCatalogFilter(page, filter = "all") {
    if (!page) return 0;
    const controls = page.querySelector("[data-store-filter-controls]");
    controls?.querySelectorAll("[data-admin-terminal-action]").forEach((button) => {
      const isActive = button.dataset.storeFilter === filter;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
    let visibleCount = 0;
    page.querySelectorAll("[data-store-item]").forEach((item) => {
      const status = item.dataset.storeStatus || "active";
      const risk = item.dataset.storeRisk || "clear";
      const kind = item.dataset.storeKind || "consumables";
      const source = item.dataset.storeSource || "custom";
      const shouldShow = filter === "all" || status === filter || kind === filter || source === filter || (filter === "risk" && risk === "risk");
      item.hidden = !shouldShow;
      if (shouldShow) visibleCount += 1;
    });
    page.querySelectorAll("[data-store-filter-empty]").forEach((empty) => {
      empty.hidden = visibleCount > 0;
    });
    return visibleCount;
  }
  function filterStoreCatalogFromAction(action) {
    const page = action.closest(".admin-terminal-store-page");
    if (!page) return;
    let filter = action.dataset.storeFilter || "all";
    const actionName = action.dataset.adminTerminalAction || "";
    if (actionName.startsWith("filter-store-") && !action.dataset.storeFilter) {
      filter = actionName.replace("filter-store-", "") || "all";
    }
    applyStoreCatalogFilter(page, filter);
    const label = action.textContent?.trim() || "Store";
    showAdminTerminalStatus("ok", `${label} filter applied.`);
  }
  function getMarketplacePageFromNode(node) {
    return node?.closest?.(".admin-terminal-market-page") || document.querySelector(".admin-terminal-market-page");
  }
  function getMarketplaceChartRootFromNode(node) {
    return node?.closest?.("[data-marketplace-chart-root]") || document.querySelector("[data-marketplace-chart-root]");
  }
  function formatMarketplaceRealtimePrice(value, currency = "NRC") {
    const number = Number(value) || 0;
    const formatted = number >= 1000 ? number.toFixed(0) : number >= 100 ? number.toFixed(1) : number.toFixed(2);
    return `${formatted} ${currency}`;
  }
  function updateMarketplaceLiveNodes(page, nextPrice, nextChange, currency = "NRC") {
    if (!page) return;
    const tone = nextChange >= 0 ? "is-up" : "is-down";
    const changeLabel = `${nextChange >= 0 ? "+" : ""}${nextChange.toFixed(2)}%`;
    page.querySelectorAll("[data-marketplace-live-price]").forEach((node) => {
      node.textContent = node.tagName === "STRONG" ? formatMarketplaceRealtimePrice(nextPrice, currency) : (nextPrice >= 1000 ? nextPrice.toFixed(0) : nextPrice >= 100 ? nextPrice.toFixed(1) : nextPrice.toFixed(2));
      node.classList.add("is-live-updated");
      window.setTimeout(() => node.classList.remove("is-live-updated"), 450);
    });
    page.querySelectorAll("[data-marketplace-live-change]").forEach((node) => {
      node.textContent = changeLabel;
      node.classList.toggle("is-up", nextChange >= 0);
      node.classList.toggle("is-down", nextChange < 0);
    });
    page.querySelectorAll("[data-marketplace-price-tag]").forEach((node) => {
      node.textContent = nextPrice >= 1000 ? nextPrice.toFixed(0) : nextPrice >= 100 ? nextPrice.toFixed(1) : nextPrice.toFixed(2);
    });
    page.querySelectorAll("[data-marketplace-feed-status]").forEach((node) => {
      const label = node.querySelector("b") || node;
      label.textContent = "Live";
      node.classList.add("is-live");
    });
    page.querySelectorAll("[data-marketplace-last-tick]").forEach((node) => {
      node.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    });
    const ticketLimit = page.querySelector("[data-marketplace-order-limit]");
    if (ticketLimit && document.activeElement !== ticketLimit) ticketLimit.value = nextPrice.toFixed(2);
    const activeRow = page.querySelector("[data-market-security-row].is-selected");
    if (activeRow) {
      activeRow.dataset.marketPrice = nextPrice.toFixed(2);
      activeRow.dataset.marketChange = nextChange.toFixed(2);
    }
    page.classList.toggle("is-market-live-up", tone === "is-up");
    page.classList.toggle("is-market-live-down", tone === "is-down");
  }
  function startMarketplaceRealtimeFeed(root = document) {
    const page = root?.querySelector?.(".admin-terminal-market-page") || document.querySelector(".admin-terminal-market-page");
    if (!page) return;
    const feature = window.Econovaria.features.adminOverviewTerminal;
    if (feature.marketplaceRealtimeTimer) {
      window.clearInterval(feature.marketplaceRealtimeTimer);
      feature.marketplaceRealtimeTimer = null;
    }
    const chart = page.querySelector("[data-marketplace-chart-root]");
    if (!chart) return;
    const currency = chart.dataset.marketplaceChartCurrency || "NRC";
    let basePrice = Number(chart.dataset.marketplaceChartPrice || page.querySelector("[data-market-security-row].is-selected")?.dataset.marketPrice || 0) || 1;
    let tick = 0;
    const step = () => {
      const wave = Math.sin((Date.now() / 1300) + tick) * 0.0018;
      const micro = ((tick % 3) - 1) * 0.0009;
      basePrice = Math.max(0.01, basePrice * (1 + wave + micro));
      tick += 1;
      const change = ((basePrice / (Number(chart.dataset.marketplaceChartPrice || basePrice) || basePrice)) - 1) * 100;
      updateMarketplaceLiveNodes(page, basePrice, change, currency);
    };
    window.requestAnimationFrame(step);
    feature.marketplaceRealtimeTimer = window.setInterval(step, 2200);
  }
  function handleMarketplaceTimeframe(action) {
    const chart = getMarketplaceChartRootFromNode(action);
    if (!chart) return;
    const range = action.dataset.marketplaceTimeframe || "1M";
    chart.dataset.marketplaceTimeframe = range;
    chart.querySelectorAll('[data-admin-terminal-action="marketplace-set-timeframe"]').forEach((button) => {
      button.setAttribute("aria-pressed", button === action ? "true" : "false");
    });
    let selectedFrame = null;
    chart.querySelectorAll("[data-marketplace-chart-frame]").forEach((frame) => {
      const active = frame.dataset.marketplaceChartFrame === range;
      frame.hidden = !active;
      frame.classList.toggle("is-active", active);
      if (active) selectedFrame = frame;
    });
    const label = chart.querySelector("[data-marketplace-chart-window]");
    if (label) label.textContent = selectedFrame?.dataset.marketplaceChartWindowLabel || `${range} window`;
    const livePrice = chart.querySelector(".admin-terminal-marketplace-chart-ranges [data-marketplace-live-price]");
    if (livePrice && selectedFrame?.dataset.marketplaceRangeLivePrice) {
      const currency = chart.dataset.marketplaceChartCurrency || "NRC";
      livePrice.textContent = `${selectedFrame.dataset.marketplaceRangeLivePrice} ${currency}`;
    }
    const liveChange = chart.querySelector(".admin-terminal-marketplace-chart-ranges [data-marketplace-live-change]");
    if (liveChange && selectedFrame?.dataset.marketplaceRangeLiveChange) {
      liveChange.textContent = selectedFrame.dataset.marketplaceRangeLiveChange;
      liveChange.classList.toggle("is-up", selectedFrame.dataset.marketplaceRangeLiveTone === "is-up");
      liveChange.classList.toggle("is-down", selectedFrame.dataset.marketplaceRangeLiveTone === "is-down");
    }
    const rangeChange = chart.querySelector("[data-marketplace-range-change]");
    if (rangeChange && selectedFrame?.dataset.marketplaceRangeTotalChange) {
      rangeChange.textContent = selectedFrame.dataset.marketplaceRangeTotalChange;
      rangeChange.classList.toggle("is-up", selectedFrame.dataset.marketplaceRangeTotalTone === "is-up");
      rangeChange.classList.toggle("is-down", selectedFrame.dataset.marketplaceRangeTotalTone === "is-down");
    }
    const axisMode = selectedFrame?.dataset.marketplaceAxisMode || "days";
    chart.querySelectorAll("[data-marketplace-chart-tooltip]").forEach((tooltip) => {
      tooltip.classList.remove("is-visible");
      tooltip.hidden = true;
    });
    chart.classList.add("is-timeframe-updated");
    window.setTimeout(() => chart.classList.remove("is-timeframe-updated"), 500);
    showAdminTerminalStatus("ok", `${range} chart window selected · x-axis switched to ${axisMode}.`);
  }
  function closeMarketplaceChartDropdowns(scope = document, exceptMenu = "") {
    const root = scope?.querySelectorAll ? scope : document;
    root.querySelectorAll("[data-marketplace-chart-menu]").forEach((menu) => {
      if (exceptMenu && menu.dataset.marketplaceChartMenu === exceptMenu) return;
      menu.hidden = true;
    });
    root.querySelectorAll("[data-marketplace-chart-menu-toggle]").forEach((button) => {
      if (exceptMenu && button.dataset.marketplaceChartMenuToggle === exceptMenu) return;
      button.setAttribute("aria-expanded", "false");
    });
  }
  function toggleMarketplaceChartMenu(action) {
    const chart = getMarketplaceChartRootFromNode(action);
    if (!chart) return;
    const menuName = action.dataset.marketplaceChartMenuToggle || "style";
    const menu = chart.querySelector(`[data-marketplace-chart-menu="${menuName}"]`);
    if (!menu) return;
    const willOpen = menu.hidden;
    closeMarketplaceChartDropdowns(chart, willOpen ? menuName : "");
    menu.hidden = !willOpen;
    action.setAttribute("aria-expanded", willOpen ? "true" : "false");
  }
  function handleMarketplaceChartStyle(action) {
    const chart = getMarketplaceChartRootFromNode(action);
    if (!chart) return;
    const style = action.dataset.marketplaceChartStyle || "candle";
    const label = action.textContent?.trim() || style;
    chart.dataset.marketplaceChartStyle = style;
    chart.querySelectorAll('[data-admin-terminal-action="marketplace-set-chart-style"]').forEach((button) => {
      button.setAttribute("aria-pressed", button === action ? "true" : "false");
    });
    const labelNode = chart.querySelector("[data-marketplace-chart-type-label]");
    if (labelNode) labelNode.textContent = label;
    closeMarketplaceChartDropdowns(chart);
    chart.classList.add("is-chart-control-updated");
    window.setTimeout(() => chart.classList.remove("is-chart-control-updated"), 420);
    showAdminTerminalStatus("ok", `${label} chart selected.`);
  }
  function handleMarketplaceChartCompare(action) {
    const chart = getMarketplaceChartRootFromNode(action);
    if (!chart) return;
    const compare = action.dataset.marketplaceChartCompare || "none";
    const label = action.dataset.marketplaceChartCompareLabel || action.querySelector("strong")?.textContent?.trim() || action.textContent?.trim() || "Compare";
    chart.dataset.marketplaceCompare = compare;
    chart.querySelectorAll('[data-admin-terminal-action="marketplace-set-chart-compare"]').forEach((button) => {
      button.setAttribute("aria-pressed", button === action ? "true" : "false");
    });
    chart.querySelectorAll("[data-marketplace-compare-line]").forEach((line) => {
      const active = compare !== "none" && line.dataset.marketplaceCompareLine === compare;
      line.classList.toggle("is-active", active);
    });
    const labelNode = chart.querySelector("[data-marketplace-compare-label]");
    if (labelNode) labelNode.textContent = compare === "none" ? "Compare" : `Compare: ${label}`;
    closeMarketplaceChartDropdowns(chart);
    chart.classList.add("is-chart-control-updated");
    window.setTimeout(() => chart.classList.remove("is-chart-control-updated"), 420);
    showAdminTerminalStatus("ok", compare === "none" ? "Comparison cleared." : `${label} comparison shown.`);
  }
  function handleMarketplaceChartIndicator(action) {
    const chart = getMarketplaceChartRootFromNode(action);
    if (!chart) return;
    const indicator = action.dataset.marketplaceChartIndicator || "none";
    const label = action.textContent?.trim() || "Indicators";
    chart.dataset.marketplaceIndicator = indicator;
    chart.querySelectorAll('[data-admin-terminal-action="marketplace-set-chart-indicator"]').forEach((button) => {
      button.setAttribute("aria-pressed", button === action ? "true" : "false");
    });
    const labelNode = chart.querySelector("[data-marketplace-indicator-label]");
    if (labelNode) labelNode.textContent = indicator === "none" ? "Indicators" : label;
    closeMarketplaceChartDropdowns(chart);
    showAdminTerminalStatus("ok", indicator === "none" ? "Indicator cleared." : `${label} indicator shown.`);
  }
  function positionMarketplaceChartTooltip(event, tooltip, frame) {
    if (!event || !tooltip || !frame) return;
    const bounds = frame.getBoundingClientRect();
    const offset = 16;
    const width = tooltip.offsetWidth || 230;
    const height = tooltip.offsetHeight || 72;
    let left = event.clientX - bounds.left + offset;
    let top = event.clientY - bounds.top + offset;
    if (left + width > bounds.width - 10) left = event.clientX - bounds.left - width - offset;
    if (top + height > bounds.height - 10) top = event.clientY - bounds.top - height - offset;
    tooltip.style.left = `${Math.max(10, left)}px`;
    tooltip.style.top = `${Math.max(10, top)}px`;
    tooltip.style.right = "auto";
    tooltip.style.bottom = "auto";
  }
  function formatMarketplaceChartTooltipContent(target, chart) {
    const style = chart?.dataset?.marketplaceChartStyle || "candle";
    const time = target?.dataset?.chartTime || "Market point";
    const volume = target?.dataset?.chartVolume || "—";
    const price = target?.dataset?.chartPrice || target?.dataset?.chartClose || "—";
    const change = target?.dataset?.chartChange || "—";
    if (style === "candle" || style === "bar") {
      return `<span>${time}</span><b>O ${target.dataset.chartOpen || "—"} · H ${target.dataset.chartHigh || "—"} · L ${target.dataset.chartLow || "—"} · C ${target.dataset.chartClose || "—"}</b><small>Volume ${volume}</small>`;
    }
    const changeTone = String(change).trim().startsWith("-") ? "is-down" : "is-up";
    return `<span>${time}</span><b>Price ${price} <em class="${changeTone}">${change}</em></b><small>Volume ${volume}</small>`;
  }
  function updateMarketplaceHoverGuide(target, frame) {
    const guide = frame?.querySelector?.("[data-marketplace-hover-guide]");
    if (!guide || !target?.dataset?.chartX) return;
    guide.setAttribute("x1", target.dataset.chartX);
    guide.setAttribute("x2", target.dataset.chartX);
    guide.removeAttribute("visibility");
    guide.classList?.add?.("is-visible");
  }
  function hideMarketplaceHoverGuide(node) {
    const frame = node?.closest?.("[data-marketplace-chart-frame]");
    const guide = frame?.querySelector?.("[data-marketplace-hover-guide]");
    if (!guide) return;
    guide.setAttribute("visibility", "hidden");
    guide.classList?.remove?.("is-visible");
  }
  function handleMarketplaceCandleHover(event) {
    const target = event.target?.closest?.("[data-marketplace-candle-hit]");
    if (!target) return;
    const chart = getMarketplaceChartRootFromNode(target);
    const frame = target.closest("[data-marketplace-chart-frame]");
    const tooltip = frame?.querySelector?.("[data-marketplace-chart-tooltip]");
    if (!tooltip || !frame) return;
    tooltip.innerHTML = formatMarketplaceChartTooltipContent(target, chart);
    tooltip.hidden = false;
    tooltip.classList.add("is-visible");
    updateMarketplaceHoverGuide(target, frame);
    positionMarketplaceChartTooltip(event, tooltip, frame);
  }
  function handleMarketplaceCandleMove(event) {
    const target = event.target?.closest?.("[data-marketplace-candle-hit]");
    if (!target) return;
    const chart = getMarketplaceChartRootFromNode(target);
    const frame = target.closest("[data-marketplace-chart-frame]");
    const tooltip = frame?.querySelector?.("[data-marketplace-chart-tooltip]");
    if (!tooltip || !frame) return;
    if (!tooltip.classList.contains("is-visible")) handleMarketplaceCandleHover(event);
    else tooltip.innerHTML = formatMarketplaceChartTooltipContent(target, chart);
    updateMarketplaceHoverGuide(target, frame);
    positionMarketplaceChartTooltip(event, tooltip, frame);
  }
  function hideMarketplaceChartTooltip(node) {
    const frame = node?.closest?.("[data-marketplace-chart-frame]");
    const chart = getMarketplaceChartRootFromNode(node);
    const tooltips = frame ? frame.querySelectorAll("[data-marketplace-chart-tooltip]") : chart?.querySelectorAll?.("[data-marketplace-chart-tooltip]");
    hideMarketplaceHoverGuide(node);
    if (!tooltips) return;
    tooltips.forEach((tooltip) => {
      tooltip.classList.remove("is-visible");
      tooltip.hidden = true;
    });
  }
  function handleMarketplaceCandleOut(event) {
    const target = event.target?.closest?.("[data-marketplace-candle-hit]");
    if (!target) return;
    const nextHit = event.relatedTarget?.closest?.("[data-marketplace-candle-hit]");
    if (nextHit && nextHit.closest("[data-marketplace-chart-frame]") === target.closest("[data-marketplace-chart-frame]")) return;
    hideMarketplaceChartTooltip(target);
  }
  function getMarketplaceFilterState(page) {
    return {
      query: (page.querySelector("[data-marketplace-search]")?.value || "").trim().toLowerCase(),
      type: page.querySelector('[data-marketplace-filter="type"]')?.value || "all",
      location: page.querySelector('[data-marketplace-filter="location"]')?.value || "all",
      sector: page.querySelector('[data-marketplace-filter="sector"]')?.value || "all",
      price: page.querySelector('[data-marketplace-filter="price"]')?.value || "all",
      sort: page.querySelector("[data-marketplace-sort]")?.value || "symbol"
    };
  }
  function getMarketplaceRowPrice(row) {
    return Number(row?.dataset?.marketPrice || 0) || 0;
  }
  function getMarketplaceRowChange(row) {
    return Number(row?.dataset?.marketChange || 0) || 0;
  }
  function rowMatchesMarketplacePrice(row, priceBand) {
    const price = getMarketplaceRowPrice(row);
    if (priceBand === "under-50") return price < 50;
    if (priceBand === "50-100") return price >= 50 && price <= 100;
    if (priceBand === "100-250") return price > 100 && price <= 250;
    if (priceBand === "over-250") return price > 250;
    return true;
  }
  function applyMarketplaceFilters(page = document.querySelector(".admin-terminal-market-page")) {
    if (!page) return 0;
    const state = getMarketplaceFilterState(page);
    const list = page.querySelector("[data-marketplace-list]");
    const rows = Array.from(page.querySelectorAll("[data-market-security-row]"));
    rows.forEach((row) => {
      const text = [row.dataset.marketSymbol, row.dataset.marketName, row.dataset.marketType, row.dataset.marketLocation, row.dataset.marketSector].join(" ").toLowerCase();
      const matchesSearch = !state.query || text.includes(state.query);
      const matchesType = state.type === "all" || row.dataset.marketType === state.type;
      const matchesLocation = state.location === "all" || row.dataset.marketLocation === state.location;
      const matchesSector = state.sector === "all" || row.dataset.marketSector === state.sector;
      const matchesPrice = rowMatchesMarketplacePrice(row, state.price);
      row.hidden = !(matchesSearch && matchesType && matchesLocation && matchesSector && matchesPrice);
    });
    const sortedRows = rows.slice().sort((a, b) => {
      if (state.sort === "price-asc") return getMarketplaceRowPrice(a) - getMarketplaceRowPrice(b);
      if (state.sort === "price-desc") return getMarketplaceRowPrice(b) - getMarketplaceRowPrice(a);
      if (state.sort === "change-desc") return getMarketplaceRowChange(b) - getMarketplaceRowChange(a);
      if (state.sort === "change-asc") return getMarketplaceRowChange(a) - getMarketplaceRowChange(b);
      return String(a.dataset.marketSymbol || "").localeCompare(String(b.dataset.marketSymbol || ""));
    });
    sortedRows.forEach((row) => list?.appendChild(row));
    const visibleCount = rows.filter((row) => !row.hidden).length;
    page.querySelectorAll("[data-marketplace-visible-count]").forEach((count) => { count.textContent = String(visibleCount); });
    const empty = page.querySelector("[data-marketplace-empty]");
    if (empty) empty.hidden = visibleCount > 0;
    return visibleCount;
  }
  function clearMarketplaceFilters(action) {
    const page = getMarketplacePageFromNode(action);
    if (!page) return;
    const search = page.querySelector("[data-marketplace-search]");
    if (search) search.value = "";
    page.querySelectorAll("[data-marketplace-filter]").forEach((select) => { select.value = "all"; });
    const sort = page.querySelector("[data-marketplace-sort]");
    if (sort) sort.value = "symbol";
    applyMarketplaceFilters(page);
    showAdminTerminalStatus("ok", "Marketplace filters cleared.");
  }
  function parseMarketplaceRowOptions(row) {
    try {
      const parsed = JSON.parse(row?.dataset?.marketOptions || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  }
  function getMarketplaceOptionTypeFromInstrument(value = "Stock") {
    const normalized = String(value || "Stock").toLowerCase();
    if (normalized.includes("call")) return "Call";
    if (normalized.includes("put")) return "Put";
    return "Stock";
  }
  function rebuildMarketplaceInstrumentSelect(select, optionContracts) {
    if (!select) return;
    const current = select.value || "Stock";
    const types = new Set((optionContracts || []).map((option) => String(option.type || "").toLowerCase()));
    select.innerHTML = "";
    select.append(new Option("Stock", "Stock"));
    if (types.has("call")) select.append(new Option("Call option", "Call Option"));
    if (types.has("put")) select.append(new Option("Put option", "Put Option"));
    select.value = Array.from(select.options).some((option) => option.value === current) ? current : "Stock";
  }
  function rebuildMarketplaceContractSelect(select, optionContracts, instrument = "Stock", symbol = "—", currency = "NRC") {
    if (!select) return null;
    const optionType = getMarketplaceOptionTypeFromInstrument(instrument);
    const filtered = optionType === "Stock" ? [] : (optionContracts || []).filter((option) => String(option.type || "").toLowerCase() === optionType.toLowerCase());
    select.innerHTML = "";
    if (!filtered.length) {
      select.append(new Option("No option contracts listed", ""));
      select.disabled = true;
      return null;
    }
    filtered.forEach((contract) => {
      const premium = contract.premium || "0.00";
      const label = `${contract.type || optionType} ${contract.strike || "—"} · ${contract.expiry || "—"} · ${premium} ${currency}`;
      const value = [contract.type || optionType, contract.strike || "—", contract.expiry || "—", premium].map((part) => String(part).replace(/\|/g, "/")).join("|");
      const option = new Option(label, value);
      option.dataset.optionSymbol = symbol;
      option.dataset.optionType = contract.type || optionType;
      option.dataset.optionStrike = contract.strike || "—";
      option.dataset.optionExpiry = contract.expiry || "—";
      option.dataset.optionPremium = premium;
      select.append(option);
    });
    select.disabled = false;
    return select.selectedOptions?.[0] || select.options[0] || null;
  }
  function applyMarketplaceInstrumentSelection(page, options = {}) {
    if (!page) return;
    const instrument = page.querySelector("[data-marketplace-instrument]");
    const contractField = page.querySelector("[data-marketplace-contract-field]");
    const contractSelect = page.querySelector("[data-marketplace-option-contract]");
    const loadout = page.querySelector("[data-marketplace-option-loadout]");
    const label = page.querySelector("[data-marketplace-option-summary]");
    const limit = page.querySelector("[data-marketplace-order-limit]");
    const symbol = page.querySelector("[data-marketplace-ticket-symbol]")?.textContent?.trim() || "—";
    const currency = page.dataset.marketplaceTicketCurrency || "NRC";
    const optionContracts = (() => {
      try {
        const parsed = JSON.parse(page.dataset.marketplaceTicketOptions || "[]");
        return Array.isArray(parsed) ? parsed : [];
      } catch (_error) {
        return [];
      }
    })();
    const selectedInstrument = instrument?.value || "Stock";
    const isOptionInstrument = selectedInstrument !== "Stock";
    if (contractField) contractField.hidden = !isOptionInstrument;
    if (!isOptionInstrument) {
      if (loadout) loadout.hidden = true;
      if (label) label.textContent = "Stock order selected";
      return;
    }
    const selectedContract = options.rebuild === false
      ? (contractSelect?.selectedOptions?.[0] || contractSelect?.options?.[0] || null)
      : rebuildMarketplaceContractSelect(contractSelect, optionContracts, selectedInstrument, symbol, currency);
    const premium = selectedContract?.dataset?.optionPremium || "0.00";
    const summary = selectedContract
      ? `${symbol} ${selectedContract.dataset.optionType || selectedInstrument} ${selectedContract.dataset.optionStrike || "—"} · ${selectedContract.dataset.optionExpiry || "—"} · premium ${premium}`
      : `${symbol} ${selectedInstrument}`;
    if (label) label.textContent = summary;
    if (loadout) loadout.hidden = false;
    if (limit && premium) limit.value = premium;
  }
  function updateMarketplaceTicket(page, row) {
    if (!page || !row) return;
    const symbol = row.dataset.marketSymbol || "—";
    const name = row.dataset.marketName || "Selected security";
    const price = row.dataset.marketPrice || "0.00";
    const currency = row.dataset.marketCurrency || "NRC";
    const optionContracts = parseMarketplaceRowOptions(row);
    const symbolNode = page.querySelector("[data-marketplace-ticket-symbol]");
    const nameNode = page.querySelector("[data-marketplace-ticket-name]");
    const limitInput = page.querySelector("[data-marketplace-order-limit]");
    const preview = page.querySelector("[data-marketplace-order-preview]");
    const instrument = page.querySelector("[data-marketplace-instrument]");
    const contractSelect = page.querySelector("[data-marketplace-option-contract]");
    const contractField = page.querySelector("[data-marketplace-contract-field]");
    const optionLoadout = page.querySelector("[data-marketplace-option-loadout]");
    const optionLabel = page.querySelector("[data-marketplace-option-summary]");
    if (symbolNode) symbolNode.textContent = symbol;
    if (nameNode) nameNode.textContent = name;
    if (limitInput) limitInput.value = price;
    if (preview) preview.textContent = "Select quantity and preview the order before submitting.";
    page.dataset.marketplaceTicketOptions = JSON.stringify(optionContracts);
    page.dataset.marketplaceTicketCurrency = currency;
    rebuildMarketplaceInstrumentSelect(instrument, optionContracts);
    if (instrument) instrument.value = "Stock";
    rebuildMarketplaceContractSelect(contractSelect, optionContracts, "Stock", symbol, currency);
    if (contractField) contractField.hidden = true;
    if (optionLoadout) optionLoadout.hidden = true;
    if (optionLabel) optionLabel.textContent = "Stock order selected";
  }
  function selectMarketplaceSecurity(action) {
    const page = getMarketplacePageFromNode(action);
    if (!page) return;
    const symbol = action.dataset.marketSymbol || action.closest("[data-market-security-row]")?.dataset.marketSymbol;
    const safeSymbol = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(symbol || "") : String(symbol || "").replace(/(["\\])/g, "\\$1");
    const row = page.querySelector(`[data-market-security-row][data-market-symbol="${safeSymbol}"]`);
    const template = page.querySelector(`[data-marketplace-profile-template="${safeSymbol}"]`);
    const profile = page.querySelector("[data-marketplace-profile]");
    if (template && profile) {
      profile.innerHTML = template.innerHTML;
    }
    page.querySelectorAll("[data-market-security-row]").forEach((item) => item.classList.toggle("is-selected", item === row));
    updateMarketplaceTicket(page, row);
    startMarketplaceRealtimeFeed(page);
    showAdminTerminalStatus("ok", `${symbol || "Security"} profile opened.`);
  }
  function getMarketplaceCurrentTicket(page) {
    const symbol = page.querySelector("[data-marketplace-ticket-symbol]")?.textContent?.trim() || "—";
    const name = page.querySelector("[data-marketplace-ticket-name]")?.textContent?.trim() || "Selected security";
    const instrument = page.querySelector("[data-marketplace-instrument]")?.value || "Stock";
    const side = page.querySelector("[data-marketplace-order-side]")?.value || "Buy";
    const type = page.querySelector("[data-marketplace-order-type]")?.value || "Market";
    const qty = Math.max(1, Math.floor(Number(page.querySelector("[data-marketplace-order-qty]")?.value || 1) || 1));
    const limit = Number(page.querySelector("[data-marketplace-order-limit]")?.value || 0) || 0;
    const stop = Number(page.querySelector("[data-marketplace-order-stop]")?.value || 0) || 0;
    const tif = page.querySelector("[data-marketplace-order-tif]")?.value || "Day";
    const optionLoadout = page.querySelector("[data-marketplace-option-loadout]");
    const optionSummary = instrument !== "Stock" && optionLoadout && !optionLoadout.hidden
      ? page.querySelector("[data-marketplace-option-summary]")?.textContent?.trim() || ""
      : "";
    return { symbol, name, instrument, side, type, qty, limit, stop, tif, optionSummary };
  }
  function renderMarketplaceOrderSummary(ticket) {
    const notional = ticket.qty * ticket.limit;
    const stopText = ticket.stop ? ` · stop ${ticket.stop.toFixed(2)}` : "";
    const instrumentText = ticket.instrument === "Stock" ? ticket.symbol : (ticket.optionSummary || `${ticket.symbol} ${ticket.instrument}`);
    return `${ticket.side} ${ticket.qty} ${instrumentText} · ${ticket.type} @ ${ticket.limit.toFixed(2)} · est. notional ${notional.toFixed(2)} NRC · ${ticket.tif}${stopText}`;
  }
  function previewMarketplaceOrder(action) {
    const page = getMarketplacePageFromNode(action);
    if (!page) return;
    const ticket = getMarketplaceCurrentTicket(page);
    const preview = page.querySelector("[data-marketplace-order-preview]");
    if (preview) preview.textContent = renderMarketplaceOrderSummary(ticket);
    showAdminTerminalStatus("ok", "Marketplace order preview updated.");
  }
  function placeMarketplaceOrder(action) {
    const page = getMarketplacePageFromNode(action);
    if (!page) return;
    const ticket = getMarketplaceCurrentTicket(page);
    const preview = page.querySelector("[data-marketplace-order-preview]");
    if (preview) preview.textContent = `Preview only: ${renderMarketplaceOrderSummary(ticket)}. This order was not submitted.`;
    showAdminTerminalStatus("warn", "Marketplace execution is preview-only until backend stock order wiring is connected.");
  }
  function loadMarketplaceOption(action) {
    const page = getMarketplacePageFromNode(action);
    if (!page) return;
    const optionType = action.dataset.optionType || "Option";
    const instrument = page.querySelector("[data-marketplace-instrument]");
    if (instrument) instrument.value = optionType.toLowerCase() === "put" ? "Put Option" : "Call Option";
    applyMarketplaceInstrumentSelection(page);
    const contractSelect = page.querySelector("[data-marketplace-option-contract]");
    if (contractSelect) {
      Array.from(contractSelect.options).forEach((option) => {
        option.selected = option.dataset.optionType === action.dataset.optionType && option.dataset.optionStrike === action.dataset.optionStrike && option.dataset.optionExpiry === action.dataset.optionExpiry;
      });
    }
    applyMarketplaceInstrumentSelection(page, { rebuild: false });
    showAdminTerminalStatus("ok", "Option contract loaded into order ticket.");
  }
  function handleMarketplaceFilterInput(event) {
    const target = event.target;
    if (target?.matches?.("[data-marketplace-instrument]")) {
      applyMarketplaceInstrumentSelection(getMarketplacePageFromNode(target));
      return;
    }
    if (target?.matches?.("[data-marketplace-option-contract]")) {
      applyMarketplaceInstrumentSelection(getMarketplacePageFromNode(target), { rebuild: false });
      return;
    }
    if (!target?.matches?.("[data-marketplace-search], [data-marketplace-filter], [data-marketplace-sort]")) return;
    applyMarketplaceFilters(getMarketplacePageFromNode(target));
  }
  function readStoreEditPayloadFromAction(action) {
    const data = action?.dataset || {};
    return {
      name: data.storeEditName || "Custom item",
      description: data.storeEditDescription || "",
      category: data.storeEditCategory || "Consumable",
      itemType: data.storeEditType || "One-time use",
      status: data.storeEditStatus || "Active",
      price: data.storeEditPrice || "",
      currency: data.storeEditCurrency || "NRC",
      pricingMode: data.storeEditPricingMode || "Fixed price",
      stockMode: data.storeEditStockMode || "Unlimited",
      stockQuantity: data.storeEditStockQuantity || "",
      restock: data.storeEditRestock || "Manual restock",
      visibility: data.storeEditVisibility || "All players",
      fulfillment: data.storeEditFulfillment || "Add to inventory",
      usageRule: data.storeEditUsage || "Player redeems manually"
    };
  }
  function openStoreEditItemFromAction(action) {
    const model = getAdminTerminalCurrentModel();
    openTerminalModal(renderAddStoreItemModal({ ...model, __storeEditItem: readStoreEditPayloadFromAction(action) }));
    showAdminTerminalStatus("ok", "Custom item editor opened.");
  }
  function readContractProfilePayloadFromAction(action) {
    return {
      title: action.dataset.contractTitle,
      meta: action.dataset.contractMeta,
      reward: action.dataset.contractReward,
      status: action.dataset.contractStatus,
      objective: action.dataset.contractObjective,
      deadline: action.dataset.contractDeadline,
      submissions: action.dataset.contractSubmissions,
      progress: action.dataset.contractProgress,
      locations: action.dataset.contractLocations,
      payoutType: action.dataset.contractPayout,
      evidence: action.dataset.contractEvidence,
      instructions: action.dataset.contractInstructions,
      successCriteria: action.dataset.contractSuccess,
      teacherNote: action.dataset.contractReviewNote,
      owner: action.dataset.contractOwner,
      category: action.dataset.contractCategory,
      difficulty: action.dataset.contractDifficulty
    };
  }
  function openContractProfileFromAction(action) {
    openTerminalModal(renderDashboardContractProfileModal(readContractProfilePayloadFromAction(action)));
  }
  function openContractSubmissionsFromAction(action) {
    openTerminalModal(renderContractSubmissionReviewModal(readContractProfilePayloadFromAction(action)));
  }
  function focusContractFromAction(action) {
    const page = action.closest(".admin-terminal-contracts-page");
    const title = action.dataset.contractTitle || "";
    if (!page || !title) return;
    applyContractsLedgerFilter(page, "all");
    const rows = Array.from(page.querySelectorAll("[data-contract-row]"));
    const row = rows.find((candidate) => (candidate.dataset.contractTitle || "") === title);
    if (!row) {
      showAdminTerminalStatus("warn", "Current focus contract was not found in the ledger.");
      return;
    }
    rows.forEach((candidate) => candidate.classList.remove("is-contract-focus-target"));
    row.hidden = false;
    row.classList.add("is-contract-focus-target");
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => {
      row.classList.remove("is-contract-focus-target");
    }, 2200);
    const viewAction = row.querySelector('[data-admin-terminal-action="open-contract-profile"]');
    if (viewAction) {
      window.setTimeout(() => openContractProfileFromAction(viewAction), 160);
      showAdminTerminalStatus("ok", `Opening current focus: ${title}.`);
    } else {
      showAdminTerminalStatus("warn", "Current focus contract is missing a View action.");
    }
  }
  function syncContractSubmissionReviewCounts(root = document) {
    const unreviewedList = root.querySelector('[data-contract-submissions-list="unreviewed"]');
    const reviewedList = root.querySelector('[data-contract-submissions-list="reviewed"]');
    const unreviewedCount = unreviewedList?.querySelectorAll("[data-contract-submission-card]").length || 0;
    const reviewedCount = reviewedList?.querySelectorAll("[data-contract-submission-card]").length || 0;
    const unreviewedCounter = root.querySelector('[data-contract-submissions-count="unreviewed"]');
    const reviewedCounter = root.querySelector('[data-contract-submissions-count="reviewed"]');
    const unreviewedEmpty = root.querySelector('[data-contract-submissions-empty="unreviewed"]');
    const reviewedEmpty = root.querySelector('[data-contract-submissions-empty="reviewed"]');
    if (unreviewedCounter) unreviewedCounter.textContent = String(unreviewedCount);
    if (reviewedCounter) reviewedCounter.textContent = String(reviewedCount);
    if (unreviewedEmpty) unreviewedEmpty.hidden = unreviewedCount > 0;
    if (reviewedEmpty) reviewedEmpty.hidden = reviewedCount > 0;
  }
  function openContractSubmissionDecisionConfirmation(action, accepted) {
    const card = action.closest("[data-contract-submission-card]");
    if (!card) return;
    const root = card.closest(".admin-terminal-contract-submissions-v470") || document;
    root.querySelectorAll("[data-submission-confirmation-panel]").forEach((panel) => panel.remove());
    const decision = accepted ? "accepted" : "rejected";
    const decisionLabel = accepted ? "Accept Contract" : "Reject Contract";
    const player = action.dataset.submissionPlayer || card.dataset.submissionPlayer || "player";
    const submissionId = action.dataset.submissionId || card.dataset.submissionId || "submission";
    const contractTitle = action.dataset.contractTitle || "contract";
    const toneClass = accepted ? "is-accept" : "is-reject";
    card.insertAdjacentHTML("beforeend", `
      <aside class="admin-terminal-contract-submission-confirm-v471 ${toneClass}" data-submission-confirmation-panel>
        <div>
          <span>Confirm decision</span>
          <strong>${escapeHtml(decisionLabel)}?</strong>
          <small>${escapeHtml(player)} · ${escapeHtml(submissionId)} · ${escapeHtml(contractTitle)}</small>
        </div>
        <footer>
          <button type="button" class="is-secondary" data-admin-terminal-action="contract-submission-cancel-decision">Cancel</button>
          <button
            type="button"
            data-admin-terminal-action="contract-submission-confirm-decision"
            data-contract-decision="${escapeHtml(decision)}"
            data-submission-id="${escapeHtml(submissionId)}"
            data-submission-player="${escapeHtml(player)}"
            data-contract-title="${escapeHtml(contractTitle)}"
          >Yes, ${escapeHtml(accepted ? "accept" : "reject")}</button>
        </footer>
      </aside>
    `);
    card.querySelector("[data-submission-confirmation-panel]")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  function confirmContractSubmissionDecision(action) {
    const panel = action.closest("[data-submission-confirmation-panel]");
    const card = panel?.closest("[data-contract-submission-card]");
    if (!card) return;
    const root = card.closest(".admin-terminal-contract-submissions-v470") || document;
    const reviewedList = root.querySelector('[data-contract-submissions-list="reviewed"]');
    const state = card.querySelector("[data-contract-submission-state]");
    const decision = action.dataset.contractDecision || "accepted";
    const accepted = decision === "accepted";
    const player = action.dataset.submissionPlayer || card.dataset.submissionPlayer || "player";
    const contractTitle = action.dataset.contractTitle || "contract";
    if (state) {
      state.textContent = accepted ? "Accepted" : "Rejected";
      state.classList.toggle("is-accepted", accepted);
      state.classList.toggle("is-rejected", !accepted);
    }
    card.classList.toggle("is-accepted", accepted);
    card.classList.toggle("is-rejected", !accepted);
    card.dataset.reviewedState = accepted ? "accepted" : "rejected";
    panel.remove();
    const footer = card.querySelector("footer");
    if (footer) {
      footer.querySelectorAll('[data-admin-terminal-action="contract-submission-accept"], [data-admin-terminal-action="contract-submission-reject"]').forEach((button) => button.remove());
      footer.querySelector("[data-contract-submission-reviewed-stamp]")?.remove();
      footer.insertAdjacentHTML("afterbegin", `<span class="admin-terminal-contract-submission-reviewed-stamp-v471" data-contract-submission-reviewed-stamp>Reviewed · ${escapeHtml(accepted ? "Accepted" : "Rejected")}</span>`);
    }
    reviewedList?.appendChild(card);
    syncContractSubmissionReviewCounts(root);
    card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    showAdminTerminalStatus("ok", `${accepted ? "Accepted" : "Rejected"} ${player} for ${contractTitle}. Moved to Reviewed.`);
  }
  function cancelContractSubmissionDecision(action) {
    const root = action.closest(".admin-terminal-contract-submissions-v470") || document;
    action.closest("[data-submission-confirmation-panel]")?.remove();
    syncContractSubmissionReviewCounts(root);
  }
  async function handleTerminalOverviewClick(event) {
      const modalDismiss = isTerminalModalDismissClick(event);
      const modeToggle = event.target.closest("[data-admin-terminal-mode-toggle]");
      const sectionButton = event.target.closest("[data-admin-section]");
      const bell = event.target.closest("[data-admin-terminal-bell]");
      const drawerHit = event.target.closest("[data-admin-terminal-bell-drawer]");
      const userButton = event.target.closest("[data-admin-terminal-user]");
      const userMenuHit = event.target.closest("[data-admin-terminal-user-menu]");
      const action = event.target.closest("[data-admin-terminal-action]");
      const marketplaceChartControlHit = event.target.closest("[data-marketplace-chart-control]");
      if (!marketplaceChartControlHit) {
        closeMarketplaceChartDropdowns(document);
      }
      if (modalDismiss) {
        closeTerminalModal();
        return;
      }
      if (modeToggle) {
        return;
      }
      if (sectionButton) {
        if (renderAdminTerminalSectionFromButton(sectionButton)) return;
      }
      if (bell) {
        const root = bell.closest(".admin-terminal-overview");
        const drawer = root?.querySelector("[data-admin-terminal-bell-drawer]");
        if (drawer) {
          if (drawer.hidden) openNotificationDrawer(drawer, bell);
          else closeNotificationDrawer(drawer);
        }
        closeAllAdminUserMenus();
        closeAllSharePopups();
        return;
      }
      if (userButton) {
        const root = userButton.closest(".admin-terminal-overview");
        const menu = root?.querySelector("[data-admin-terminal-user-menu]");
        toggleAdminUserMenu(menu, userButton);
        closeAllNotificationDrawers();
        closeAllSharePopups();
        return;
      }
      if (!drawerHit) {
        closeAllNotificationDrawers();
      }
      if (!userMenuHit) {
        closeAllAdminUserMenus();
      }
      if (drawerHit && !action) return;
      if (userMenuHit && !action) return;
      if (!action) return;
      if (userMenuHit) {
        closeAllAdminUserMenus();
      }
      const actionName = action.dataset.adminTerminalAction;
      if (actionName === "filter-contracts" || actionName.startsWith("filter-contracts-")) {
        filterContractsLedgerFromAction(action);
        return;
      }
      if (actionName === "filter-store" || actionName.startsWith("filter-store-")) {
        filterStoreCatalogFromAction(action);
        return;
      }
      if (actionName === "select-market-security" || actionName === "open-market-asset") {
        selectMarketplaceSecurity(action);
        return;
      }
      if (actionName === "marketplace-clear-filters" || actionName === "filter-market-all") {
        clearMarketplaceFilters(action);
        return;
      }
      if (actionName === "marketplace-set-timeframe") {
        handleMarketplaceTimeframe(action);
        return;
      }
      if (actionName === "marketplace-toggle-chart-menu") {
        toggleMarketplaceChartMenu(action);
        return;
      }
      if (actionName === "marketplace-set-chart-style") {
        handleMarketplaceChartStyle(action);
        return;
      }
      if (actionName === "marketplace-set-chart-compare") {
        handleMarketplaceChartCompare(action);
        return;
      }
      if (actionName === "marketplace-set-chart-indicator") {
        handleMarketplaceChartIndicator(action);
        return;
      }
      if (actionName === "filter-market-up" || actionName === "filter-market-down") {
        const page = getMarketplacePageFromNode(action);
        const sort = page?.querySelector("[data-marketplace-sort]");
        if (sort) sort.value = actionName === "filter-market-up" ? "change-desc" : "change-asc";
        applyMarketplaceFilters(page);
        showAdminTerminalStatus("ok", actionName === "filter-market-up" ? "Advancers sorted." : "Decliners sorted.");
        return;
      }
      if (actionName === "marketplace-preview-order") {
        previewMarketplaceOrder(action);
        return;
      }
      if (actionName === "marketplace-place-order") {
        placeMarketplaceOrder(action);
        return;
      }
      if (actionName === "marketplace-load-option") {
        loadMarketplaceOption(action);
        return;
      }
      if (actionName === "focus-contract") {
        focusContractFromAction(action);
        return;
      }
      if (actionName === "scan-attendance") {
        const overview = action.closest(".admin-terminal-overview");
        const model = getAdminTerminalCurrentModel();
        openTerminalModal(renderAttendanceScannerModal(model));
        return;
      }
      if (actionName === "mock-confirm-scan") {
        handleMockScannerCapture("confirm");
        return;
      }
      if (actionName === "mock-start-scanner") {
        const state = document.querySelector("[data-admin-terminal-scanner-state]");
        focusActiveScannerInput();
        if (state) {
          state.classList.remove("is-captured");
          state.textContent = document.querySelector("[data-admin-terminal-scanner-console]")?.dataset.scanMode === "manual" ? "Manual input ready" : "Armed";
        }
        showAdminTerminalStatus("warn", "Scanner focus restored. Backend wiring pending.");
        return;
      }
      if (actionName === "share-game-code") {
        event.preventDefault();
        event.stopPropagation();
        const gameCode = action.dataset.gameCode || "";
        const gameName = action.dataset.gameName || "Eco Novaria";
        const gameStatus = action.dataset.gameStatus || "Active";
        closeAllNotificationDrawers();
        closeAllAdminUserMenus();
        closeAllSharePopups();
        openTerminalModal(renderShareAccessModal({ gameCode, gameName, gameStatus }));
        return;
      }
      if (actionName === "copy-game-code") {
        const gameCode = action.dataset.gameCode || "";
        await copyTerminalShareText(gameCode, "Game code copied.");
        return;
      }
      if (actionName === "copy-share-value") {
        const targetId = action.dataset.shareTarget || "";
        const target = targetId ? document.getElementById(targetId) : null;
        const value = target?.value || target?.textContent || "";
        await copyTerminalShareText(value, "Copied.");
        target?.select?.();
        return;
      }
      if (actionName === "open-share-link") {
        const targetId = action.dataset.shareTarget || "";
        const target = targetId ? document.getElementById(targetId) : null;
        const value = target?.value || "";
        if (value && /^https?:\/\//.test(value)) {
          window.open(value, "_blank", "noopener,noreferrer");
        } else {
          showAdminTerminalStatus("warn", "No valid link available.");
        }
        return;
      }
      if (actionName === "copy-game-link") {
        const gameCode = action.dataset.gameCode || "";
        await copyTerminalShareText(getTerminalShareUrl(gameCode, "student"), "Student login link copied.");
        return;
      }
      if (actionName === "share-game-native") {
        const gameCode = action.dataset.gameCode || "";
        const gameName = action.dataset.gameName || "Eco Novaria";
        const shareText = getTerminalShareText(gameCode, gameName);
        const shareUrl = getTerminalShareUrl(gameCode);
        if (navigator.share) {
          try {
            await navigator.share({
              title: `${gameName} login`,
              text: shareText,
              url: shareUrl
            });
            showAdminTerminalStatus("ok", "Share sheet opened.");
          } catch (_) {
          }
        } else {
          await copyTerminalShareText(`${shareText}\n${shareUrl}`, "Share text copied.");
        }
        return;
      }
      if (actionName === "select-player-panel") {
        selectAdminTerminalPlayer(action.dataset.playerRank || "1");
        return;
      }
      if (actionName === "open-player-log-detail") {
        openTerminalModal(renderPlayerLogEventDetailModalFromAction(action));
        return;
      }
      if (actionName === "reset-player-code") {
        openTerminalPlayerModalFromAction(action, renderResetPlayerCodeModal);
        return;
      }
      if (actionName === "player-settings") {
        openTerminalPlayerModalFromAction(action, renderPlayerSettingsModal);
        return;
      }
      if (actionName === "adjust-player-balance") {
        openTerminalPlayerModalFromAction(action, renderAdjustPlayerBalanceModal);
        return;
      }
      if (actionName === "flag-player-account") {
        openTerminalPlayerModalFromAction(action, renderFlagPlayerAccountModal);
        return;
      }
      if (actionName === "open-player-profile") {
        const model = getAdminTerminalCurrentModel();
        const selectedPlayer = getSelectedTerminalPlayer(model, action.dataset.playerRank);
        openTerminalModal(renderDashboardPlayerProfileModal({
          ...selectedPlayer,
          rank: action.dataset.playerRank || selectedPlayer.rank,
          name: action.dataset.playerName || selectedPlayer.name,
          meta: action.dataset.playerMeta || selectedPlayer.meta,
          netWorth: action.dataset.playerNetWorth || selectedPlayer.netWorth,
          overall: action.dataset.playerOverall || selectedPlayer.overall
        }));
        return;
      }
      if (actionName === "change-sci-avatar") {
        const frame = action.closest("[data-admin-terminal-avatar-frame]");
        const input = frame?.querySelector("[data-admin-terminal-avatar-input]");
        input?.click?.();
        return;
      }
      if (actionName === "message-player" && action.dataset.playerRank) {
        openTerminalPlayerModalFromAction(action, renderPlayerDirectMessageModal);
        return;
      }
      if (actionName === "open-contract-profile") {
        event.preventDefault();
        event.stopPropagation();
        openContractProfileFromAction(action);
        return;
      }
      if (actionName === "review-contract-submissions") {
        event.preventDefault();
        event.stopPropagation();
        openContractSubmissionsFromAction(action);
        return;
      }
      if (actionName === "contract-submission-accept" || actionName === "contract-submission-reject") {
        event.preventDefault();
        event.stopPropagation();
        openContractSubmissionDecisionConfirmation(action, actionName === "contract-submission-accept");
        return;
      }
      if (actionName === "contract-submission-confirm-decision") {
        event.preventDefault();
        event.stopPropagation();
        confirmContractSubmissionDecision(action);
        return;
      }
      if (actionName === "contract-submission-cancel-decision") {
        event.preventDefault();
        event.stopPropagation();
        cancelContractSubmissionDecision(action);
        return;
      }
      if (actionName === "contract-submission-message") {
        event.preventDefault();
        event.stopPropagation();
        openTerminalModal(renderContractSubmissionMessageModalFromAction(action));
        return;
      }
      if (actionName === "confirm-contract-submission-message") {
        showAdminTerminalStatus("ok", `Admin message staged in Player Messages for ${action.dataset.submissionPlayer || "player"} about ${action.dataset.contractTitle || "contract"}.`);
        closeTerminalModal();
        return;
      }
      if (actionName === "add-contract") {
        const model = getAdminTerminalCurrentModel();
        openTerminalModal(renderAddContractModal(model));
        return;
      }
      if (actionName === "add-player") {
        const model = getAdminTerminalCurrentModel();
        openTerminalModal(renderAddPlayerModal(model));
        return;
      }
      if (actionName === "edit-store-item") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        openStoreEditItemFromAction(action);
        return;
      }
      if (actionName === "add-store-item") {
        const model = getAdminTerminalCurrentModel();
        openTerminalModal(renderAddStoreItemModal(model));
        return;
      }
      if (actionName === "select-attendance-student") {
        const key = action.dataset.attendanceKey || "";
        if (key) {
          window.Econovaria.features.adminOverviewTerminal.selectedAttendanceKey = key;
          const model = getAdminTerminalCurrentModel();
          rerenderAdminTerminalWithModel(model, "Attendance");
          showAdminTerminalStatus("ok", "Attendance history loaded.");
        }
        return;
      }
      if (actionName === "attendance-open-export") {
        const dialog = document.querySelector(".admin-terminal-attendance-v207-export");
        if (dialog && typeof dialog.showModal === "function") dialog.showModal();
        else showAdminTerminalStatus("ok", "Attendance CSV export options are ready for wiring.");
        return;
      }
      if (actionName === "attendance-ledger-prev-day" || actionName === "attendance-ledger-next-day") {
        showAdminTerminalStatus("ok", "Reward ledger day cycling is ready for backend wiring.");
        return;
      }
      const adminAccountRoutes = {
        "open-admin-profile": "AdminProfile",
        "open-admin-settings": "AdminSettings",
        "open-admin-notifications": "AdminNotifications",
        "view-alerts": "AdminNotifications",
        "open-admin-security": "AdminSecurity",
        "open-admin-help": "AdminHelp",
        "open-admin-games": "AdminGames",
        "open-game-settings-page": "Settings"
      };
      if (adminAccountRoutes[actionName]) {
        openAdminAccountPage(adminAccountRoutes[actionName]);
        return;
      }
      if (actionName === "switch-admin-game") {
        switchAdminGameFromAction(action);
        closeAllAdminUserMenus();
        closeAllNotificationDrawers();
        return;
      }
      if (actionName === "share-current-game") {
        const model = getAdminTerminalCurrentModel();
        openTerminalModal(renderShareAccessModal({
          gameCode: model.gameCode,
          gameName: model.gameName,
          gameStatus: model.gameStatus
        }));
        return;
      }
      if (actionName === "sign-out-admin") {
        const model = getAdminTerminalCurrentModel();
        closeAllAdminUserMenus();
        closeAllNotificationDrawers();
        openTerminalModal(renderSignOutConfirmModal(model));
        return;
      }
      if (actionName === "confirm-admin-signout") {
        closeTerminalModal();
        window.Econovaria.features.adminOverviewTerminal.signOutConfirmed = true;
        showAdminTerminalStatus("ok", "Signed out locally. Auth wiring pending.");
        return;
      }
      if (actionName === "focus-admin-profile-upload") {
        const input = document.querySelector("[data-admin-profile-avatar-input]");
        input?.click?.();
        return;
      }
      if (actionName === "clear-player-log-date") {
        const module = action.closest(".admin-terminal-player-v240-module");
        const input = module?.querySelector("[data-player-log-date-search]");
        if (input) input.value = "";
        filterPlayerActionLogByDate(module, "");
        return;
      }
      if (actionName === "select-player-drawer-tab") {
        const drawer = action.closest("[data-admin-terminal-player-drawer]");
        const targetTab = action.dataset.playerDrawerTab || "overview";
        if (!drawer) return;
        drawer.querySelectorAll("[data-player-drawer-tab]").forEach((button) => {
          const isActive = button === action;
          button.classList.toggle("active", isActive);
          button.setAttribute("aria-selected", isActive ? "true" : "false");
        });
        drawer.querySelectorAll("[data-player-drawer-panel]").forEach((panel) => {
          const isActive = panel.dataset.playerDrawerPanel === targetTab;
          panel.hidden = !isActive;
          panel.classList.toggle("is-active", isActive);
        });
        return;
      }
      if (actionName === "filter-player-panel") {
        const module = action.closest("[data-player-filter-module]");
        const group = action.dataset.playerFilterGroup || "";
        const category = action.dataset.playerFilterCategory || "all";
        if (!module || !group) return;
        module.querySelectorAll(`[data-player-filter-group="${group}"]`).forEach((button) => {
          button.classList.toggle("active", button === action);
        });
        const scope = module.querySelector(`[data-player-filter-scope="${group}"]`);
        if (!scope) return;
        let visibleCount = 0;
        scope.querySelectorAll("[data-filter-category]").forEach((item) => {
          const shouldShow = category === "all" || item.dataset.filterCategory === category;
          item.hidden = !shouldShow;
          if (shouldShow) visibleCount += 1;
        });
        scope.querySelectorAll(`[data-filter-empty="${group}"]`).forEach((empty) => {
          const isFilterEmpty = empty.classList.contains("is-filter-empty");
          if (isFilterEmpty) empty.hidden = visibleCount > 0;
        });
        return;
      }
      if (actionName.startsWith("filter-players-")) {
        updatePlayersRosterStatusFilter(actionName.replace("filter-players-", ""));
        return;
      }
      if (actionName === "players-page-size") {
        updatePlayersRosterPage({ page: 1, pageSize: action.dataset.playerPageSize || 10 });
        return;
      }
      if (actionName === "players-page-prev" || actionName === "players-page-next") {
        const currentModel = getAdminTerminalCurrentModel();
        const direction = actionName === "players-page-next" ? 1 : -1;
        updatePlayersRosterPage({ page: (Number(currentModel.playersPage || 1) || 1) + direction });
        return;
      }
      if (actionName === "connect-google-classroom") {
        showAdminTerminalStatus("warn", "Google Classroom integration is ready for OAuth / roster sync wiring.");
        return;
      }
      if (actionName === "import-roster-csv") {
        const input = document.querySelector("[data-admin-terminal-roster-csv-input]");
        input?.click?.();
        showAdminTerminalStatus("warn", "Roster CSV import selector opened. Parser wiring pending.");
        return;
      }
      {
        const actionMessages = {
          "view-attendance": "Attendance view is ready for wiring.",
          "view-alerts": "Notifications page opened.",
          "open-admin-profile": "Profile page opened.",
          "open-admin-games": "Games page opened.",
          "switch-admin-game": "Game loaded.",
          "open-admin-settings": "Account settings page opened.",
          "open-admin-notifications": "Notifications page opened.",
          "open-admin-security": "Security page opened.",
          "open-admin-help": "Help page opened.",
          "sign-out-admin": "Sign out confirmation opened.",
          "edit-admin-profile": "Profile editing is ready for backend wiring.",
          "save-admin-account-settings": "Account settings save is ready for backend wiring.",
          "reset-admin-account-settings": "Account settings reset is ready for backend wiring.",
          "resolve-admin-notification": "Notification resolution is ready for backend wiring.",
          "enable-email-alerts": "Email alert delivery is ready for backend wiring.",
          "mute-low-priority-alerts": "Notification muting is ready for backend wiring.",
          "mark-notifications-reviewed": "Notification review state is ready for backend wiring.",
          "review-admin-sessions": "Session review is ready for backend wiring.",
          "reset-admin-password": "Password reset is ready for auth wiring.",
          "open-help-start-game": "Start-game help content is ready for wiring.",
          "open-help-players": "Player help content is ready for wiring.",
          "open-help-attendance": "Attendance help content is ready for wiring.",
          "open-help-market": "Market help content is ready for wiring.",
          "open-help-store": "Store help content is ready for wiring.",
          "open-help-troubleshooting": "Troubleshooting help content is ready for wiring.",
          "copy-admin-diagnostics": "Diagnostics copy is ready for wiring.",
          "open-admin-docs": "Docs route is ready for wiring.",
          "report-admin-issue": "Issue reporting is ready for wiring.",
          "filter-players-all": "Player filters are ready for backend wiring.",
          "filter-players-online": "Online-player filter is ready for backend wiring.",
          "filter-players-offline": "Offline-player filter is ready for backend wiring.",
          "filter-players-flagged": "Flagged-player filter is ready for backend wiring.",
          "confirm-player-code-reset": "New player code is ready to issue.",
          "confirm-player-balance-adjustment": "Player balance adjustment is staged.",
          "message-player": "Direct player message is ready to send.",
          "player-settings": "Player settings editor is ready to save.",
          "confirm-player-settings-save": "Player settings are staged.",
          "confirm-player-delete": "Delete-player confirmation is ready for wiring.",
          "confirm-player-message-send": "Player message is staged.",
          "confirm-player-flag": "Player flag is ready to apply.",
          "copy-selected-player-code": "Copy selected player code is ready for wiring.",
          "view-unused-player-codes": "Unused-code review is ready for wiring.",
          "connect-google-classroom": "Google Classroom integration is ready for roster sync wiring.",
          "import-roster-csv": "Roster CSV import is ready for parser wiring.",
          "manual-attendance-correction": "Attendance correction modal is ready for wiring.",
          "lock-attendance": "Attendance lock is ready for wiring.",
          "notify-absent": "Offline-player notification is ready for wiring.",
          "export-attendance": "Attendance export is ready for backend wiring.",
          "export-attendance-audit": "Attendance audit export is ready for backend wiring.",
          "attendance-filter-all": "Attendance filter is ready for wiring.",
          "attendance-filter-present": "Present filter is ready for wiring.",
          "attendance-filter-late": "Late filter is ready for wiring.",
          "attendance-filter-absent": "Absent filter is ready for wiring.",
          "attendance-filter-needs-action": "Needs-action filter is ready for wiring.",
          "attendance-mark-present": "Mark-present correction is ready for backend wiring.",
          "attendance-mark-late": "Mark-late correction is ready for backend wiring.",
          "attendance-mark-absent": "Mark-absent correction is ready for backend wiring.",
          "attendance-mark-excused": "Mark-excused correction is ready for backend wiring.",
          "attendance-adjust-reward": "Attendance reward adjustment is ready for backend wiring.",
          "attendance-add-note": "Attendance note entry is ready for backend wiring.",
          "filter-contracts-active": "Active-contract filter is ready for wiring.",
          "filter-contracts-due": "Due-contract filter is ready for wiring.",
          "filter-contracts-submitted": "Submitted-contract filter is ready for wiring.",
          "filter-contracts-scheduled": "Scheduled-contract filter is ready for wiring.",
          "review-contract-submissions": "Contract submission review is ready.",
          "contract-submission-accept": "Submission approval is staged.",
          "contract-submission-reject": "Submission rejection is staged.",
          "contract-submission-message": "Submission message is ready.",
          "confirm-contract-submission-message": "Submission message is staged.",
          "duplicate-contract": "Contract duplication is ready for wiring.",
          "archive-contract": "Contract archive is ready for wiring.",
          "audit-contract-rewards": "Contract reward audit is ready for wiring.",
          "filter-store-all": "Store all-items filter is ready for wiring.",
          "filter-store-active": "Store active-items filter is ready for wiring.",
          "filter-store-risk": "Store risk filter is ready for wiring.",
          "add-store-item": "Store item creation is ready for wiring.",
          "edit-store-item": "Store item editing is ready for wiring.",
          "toggle-store-item": "Store item active/pause toggle is ready for wiring.",
          "restock-store-item": "Store restock flow is ready for wiring.",
          "rebalance-store-price": "Store price rebalance is ready for wiring.",
          "pause-store": "Store pause control is ready for wiring.",
          "filter-market-all": "Market all-assets filter is ready for wiring.",
          "filter-market-up": "Market advancers filter is ready for wiring.",
          "filter-market-down": "Market decliners filter is ready for wiring.",
          "open-market-asset": "Market asset detail is ready for wiring.",
          "open-market-event": "Market event detail is ready for wiring.",
          "create-market-event": "Market event creation is ready for wiring.",
          "edit-market-event": "Market event editing is ready for wiring.",
          "pause-market-event": "Market event pause control is ready for wiring.",
          "broadcast-market-news": "Market news broadcast is ready for wiring.",
          "audit-market-impact": "Market impact audit is ready for wiring.",
          "save-settings": "Settings save flow is ready for wiring.",
          "edit-settings-group": "Settings group edit modal is ready for wiring.",
          "reset-settings-group": "Settings group reset is ready for wiring.",
          "preview-settings-impact": "Settings impact preview is ready for wiring.",
          "audit-settings-changes": "Settings audit trail is ready for wiring.",
          "archive-game": "Archive-game confirmation is ready for wiring.",
          "reset-economy": "Economy reset confirmation is ready for wiring.",
          "filter-logs-all": "All-log filter is ready for wiring.",
          "filter-logs-system": "System-log filter is ready for wiring.",
          "filter-logs-admin": "Admin-log filter is ready for wiring.",
          "filter-logs-economy": "Economy-log filter is ready for wiring.",
          "filter-logs-attendance": "Attendance-log filter is ready for wiring.",
          "filter-logs-inventory": "Inventory-log filter is ready for wiring.",
          "filter-logs-finance": "Finance-log filter is ready for wiring.",
          "filter-logs-contracts": "Contract-log filter is ready for wiring.",
          "open-log-detail": "Log detail panel is ready for wiring.",
          "open-related-record": "Related-record lookup is ready for wiring.",
          "copy-log-id": "Copy-log event is ready for wiring.",
          "flag-log-event": "Log-event flagging is ready for wiring.",
          "export-logs": "Log export is ready for wiring.",
          "search-logs": "Log search is ready for wiring.",
          "filter-player-logs-all": "Player-log all filter is ready for wiring.",
          "filter-player-logs-attendance": "Player attendance-log filter is ready for wiring.",
          "filter-player-logs-inventory": "Player inventory-log filter is ready for wiring.",
          "filter-player-logs-finance": "Player finance-log filter is ready for wiring.",
          "filter-player-logs-contracts": "Player contract-log filter is ready for wiring.",
          "filter-player-logs-admin": "Player admin-log filter is ready for wiring.",
          "open-player-log-detail": "Player log detail is ready for wiring.",
          "copy-player-log-id": "Player log ID copy is ready for wiring.",
          "flag-player-log-event": "Player log flagging is ready for wiring.",
          "export-player-logs": "Player log export is ready for wiring.",
          "audit-student-history": "Student-history audit is ready for wiring.",
          "see-more-contracts": "Contracts view is ready for wiring.",
          "manage-contracts": "Contract management is ready for wiring."
        };
        showAdminTerminalStatus("warn", actionMessages[actionName] || `${actionName.replaceAll("-", " ")} modal is ready for wiring.`);
      }
  }
  function bindTerminalClickEvents() {
    document.addEventListener("click", handleTerminalOverviewClick);
  }
  function bindMarketplaceFilterEvents() {
    document.addEventListener("input", handleMarketplaceFilterInput);
    document.addEventListener("change", handleMarketplaceFilterInput);
    document.addEventListener("mouseover", handleMarketplaceCandleHover);
    document.addEventListener("mousemove", handleMarketplaceCandleMove);
    document.addEventListener("mouseout", handleMarketplaceCandleOut);
  }
  function bindTerminalOverviewEvents() {
    if (window.Econovaria.features.adminOverviewTerminal.eventsBound) return;
    window.Econovaria.features.adminOverviewTerminal.eventsBound = true;
    bindTerminalEscapeKeyEvents();
    bindTerminalClickEvents();
    bindMarketplaceFilterEvents();
  }
  function filterPlayerActionLogByDate(module, dateValue) {
    if (!module) return;
    const targetDate = String(dateValue || "").trim();
    const rows = Array.from(module.querySelectorAll("[data-log-date]"));
    let visibleCount = 0;
    rows.forEach((row) => {
      const shouldShow = !targetDate || row.dataset.logDate === targetDate;
      row.hidden = !shouldShow;
      if (shouldShow) visibleCount += 1;
    });
    const empty = module.querySelector("[data-player-log-empty]");
    if (empty) empty.hidden = visibleCount > 0;
  }
  document.addEventListener("input", (event) => {
    const input = event.target?.closest?.("[data-player-log-date-search]");
    if (!input) return;
    filterPlayerActionLogByDate(input.closest(".admin-terminal-player-v240-module"), input.value);
  });
  document.addEventListener("input", (event) => {
    const input = event.target?.closest?.("[data-admin-terminal-players-search]");
    if (!input) return;
    updatePlayersRosterSearch(input.value);
  });
  function bindSciIdAvatarInput() {
    if (window.Econovaria.features.adminOverviewTerminal.sciIdAvatarInputBound) return;
    window.Econovaria.features.adminOverviewTerminal.sciIdAvatarInputBound = true;
    const updatePortfolioCenterText = (visual, slice) => {
    const center = visual?.querySelector?.("[data-portfolio-center]");
    if (!center) return;
    const kicker = center.querySelector("small");
    const title = center.querySelector("strong");
    const percent = center.querySelector("span");
    if (!kicker || !title || !percent) return;
    visual?.querySelectorAll?.(".admin-terminal-player-v240-portfolio-slice.is-active").forEach((activeSlice) => {
      activeSlice.classList.remove("is-active");
    });
    if (slice) {
      slice.classList.add("is-active");
      kicker.textContent = "FOCUS";
      title.textContent = slice.dataset.category || "Portfolio";
      percent.textContent = `${slice.dataset.percent || "0"}%`;
      return;
    }
    kicker.textContent = center.dataset.defaultKicker || "TOP SECTOR";
    title.textContent = center.dataset.defaultTitle || "Portfolio";
    percent.textContent = center.dataset.defaultPercent || "0%";
  };
  document.addEventListener("pointerover", (event) => {
    const slice = event.target.closest?.(".admin-terminal-player-v240-portfolio-slice");
    if (!slice) return;
    const visual = slice.closest(".admin-terminal-player-v240-portfolio-visual");
    updatePortfolioCenterText(visual, slice);
  });
  document.addEventListener("pointerout", (event) => {
    const slice = event.target.closest?.(".admin-terminal-player-v240-portfolio-slice");
    if (!slice) return;
    const nextTarget = event.relatedTarget;
    const visual = slice.closest(".admin-terminal-player-v240-portfolio-visual");
    if (nextTarget && visual?.contains(nextTarget)) return;
    updatePortfolioCenterText(visual, null);
  });
  document.addEventListener("focusin", (event) => {
    const slice = event.target.closest?.(".admin-terminal-player-v240-portfolio-slice");
    if (!slice) return;
    const visual = slice.closest(".admin-terminal-player-v240-portfolio-visual");
    updatePortfolioCenterText(visual, slice);
  });
  document.addEventListener("focusout", (event) => {
    const slice = event.target.closest?.(".admin-terminal-player-v240-portfolio-slice");
    if (!slice) return;
    const visual = slice.closest(".admin-terminal-player-v240-portfolio-visual");
    const nextTarget = event.relatedTarget;
    if (nextTarget && visual?.contains(nextTarget)) return;
    updatePortfolioCenterText(visual, null);
  });
  const setPortfolioChartExpanded = (visual, expanded) => {
    if (!visual) return;
    if (visual.dataset.portfolioShrinkTimer) {
      window.clearTimeout(Number(visual.dataset.portfolioShrinkTimer));
      delete visual.dataset.portfolioShrinkTimer;
    }
    if (expanded) {
      visual.classList.add("is-expanded");
      return;
    }
    const timer = window.setTimeout(() => {
      visual.classList.remove("is-expanded");
      delete visual.dataset.portfolioShrinkTimer;
    }, 1000);
    visual.dataset.portfolioShrinkTimer = String(timer);
  };
  document.addEventListener("pointerenter", (event) => {
    const visual = event.target?.closest?.(".admin-terminal-player-v240-portfolio-visual");
    if (!visual) return;
    setPortfolioChartExpanded(visual, true);
  }, true);
  document.addEventListener("pointerleave", (event) => {
    const visual = event.target?.closest?.(".admin-terminal-player-v240-portfolio-visual");
    if (!visual) return;
    setPortfolioChartExpanded(visual, false);
  }, true);
  document.addEventListener("focusin", (event) => {
    const visual = event.target?.closest?.(".admin-terminal-player-v240-portfolio-visual");
    if (!visual) return;
    setPortfolioChartExpanded(visual, true);
  });
  document.addEventListener("focusout", (event) => {
    const visual = event.target?.closest?.(".admin-terminal-player-v240-portfolio-visual");
    if (!visual) return;
    const nextTarget = event.relatedTarget;
    if (nextTarget && visual.contains(nextTarget)) return;
    setPortfolioChartExpanded(visual, false);
  });
  document.addEventListener("change", (event) => {
      const input = event.target?.closest?.("[data-admin-terminal-avatar-input]");
      if (!input) return;
      const file = input.files?.[0];
      if (!file) return;
      if (!String(file.type || "").startsWith("image/")) {
        showAdminTerminalStatus("warn", "Please choose an image file.");
        return;
      }
      const frame = input.closest("[data-admin-terminal-avatar-frame]");
      const image = frame?.querySelector("[data-admin-terminal-avatar-image]");
      const letter = frame?.querySelector("span");
      if (!frame || !image) return;
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        const dataUrl = String(reader.result || "");
        image.src = dataUrl;
        image.hidden = false;
        if (letter) letter.hidden = true;
        frame.classList.add("has-custom-avatar");
        if (input.matches("[data-admin-profile-avatar-input]")) {
          applyAdminProfileAvatar(dataUrl);
          showAdminTerminalStatus("ok", "Profile picture updated.");
        } else {
          showAdminTerminalStatus("ok", "Avatar preview updated.");
        }
      }, { once: true });
      reader.readAsDataURL(file);
    });
  }
  function getContractItemOptionsMarkup() {
    return `                      <option value="homework_pass">Homework Pass</option>
                      <option value="late_pass">Late Pass</option>
                      <option value="seat_swap">Seat Swap</option>
                      <option value="music_request">Class Music Request</option>
                      <option value="bonus_hint">Bonus Hint</option>
                      <option value="quiz_reroll">Quiz Reroll</option>
                      <option value="supply_pack">Supply Pack</option>
                      <option value="team_bonus">Team Bonus Token</option>
                      <option value="market_tip">Market Tip</option>
                      <option value="mystery_box">Mystery Box</option>`;
  }
  function getContractLocationSelections(root) {
    const checkboxes = Array.from(root?.querySelectorAll("[data-admin-terminal-contract-location]") || []);
    const selected = checkboxes.filter((input) => input.checked);
    if (!selected.length) {
      const allInput = checkboxes.find((input) => input.value === "all");
      if (allInput) allInput.checked = true;
      return [{ value: "all", label: "All countries" }];
    }
    if (selected.some((input) => input.value === "all")) {
      return [{ value: "all", label: "All countries" }];
    }
    return selected.map((input) => {
      const rawLabel = input.closest("label")?.textContent || input.value;
      return {
        value: input.value,
        label: rawLabel.trim()
      };
    });
  }
  function readContractLocationText(root) {
    const selections = getContractLocationSelections(root);
    if (selections.length === 1) return selections[0].label;
    return `${selections.length} countries`;
  }
  function updateContractLocationSummary(root) {
    const summary = root?.querySelector("[data-admin-terminal-location-summary]");
    if (!summary) return;
    summary.textContent = readContractLocationText(root);
  }
  function normalizeContractLocationSelection(root, changedInput) {
    if (!root) return;
    const checkboxes = Array.from(root.querySelectorAll("[data-admin-terminal-contract-location]"));
    const allInput = checkboxes.find((input) => input.value === "all");
    const countryInputs = checkboxes.filter((input) => input.value !== "all");
    if (changedInput?.value === "all" && changedInput.checked) {
      countryInputs.forEach((input) => { input.checked = false; });
    }
    if (changedInput?.value !== "all" && changedInput?.checked && allInput) {
      allInput.checked = false;
    }
    const hasCountry = countryInputs.some((input) => input.checked);
    if (!hasCountry && allInput && !allInput.checked) allInput.checked = true;
    updateContractLocationSummary(root);
  }
  function setRewardStageKind(kind) {
    const root = document.querySelector("[data-admin-terminal-contract-console]");
    if (!root) return;
    const nextKind = kind === "item" ? "item" : "cash";
    const stage = root.querySelector("[data-admin-terminal-reward-stage]");
    const cashPanel = root.querySelector("[data-admin-terminal-reward-stage-cash]");
    const itemPanel = root.querySelector("[data-admin-terminal-reward-stage-item]");
    const cashButton = root.querySelector('[data-admin-terminal-action="stage-cash-reward"]');
    const itemButton = root.querySelector('[data-admin-terminal-action="stage-item-reward"]');
    if (stage) stage.dataset.rewardKind = nextKind;
    if (cashPanel) {
      cashPanel.hidden = nextKind !== "cash";
      cashPanel.style.display = nextKind === "cash" ? "grid" : "none";
    }
    if (itemPanel) {
      itemPanel.hidden = nextKind !== "item";
      itemPanel.style.display = nextKind === "item" ? "grid" : "none";
    }
    if (cashButton) cashButton.setAttribute("aria-pressed", nextKind === "cash" ? "true" : "false");
    if (itemButton) itemButton.setAttribute("aria-pressed", nextKind === "item" ? "true" : "false");
    window.requestAnimationFrame(() => {
      const target = nextKind === "item"
        ? root.querySelector("[data-admin-terminal-stage-item]")
        : root.querySelector("[data-admin-terminal-stage-cash]");
      target?.focus?.();
    });
  }
  function formatCashReward(amount) {
    return `NRC ${Math.max(0, Number(amount || 0)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  function formatItemReward(label, quantity = 1) {
    const safeQuantity = Math.max(1, Number(quantity || 1));
    return safeQuantity > 1 ? `${safeQuantity}× ${label}` : label;
  }
  function updateRewardChipLabel(chip) {
    if (!chip) return;
    const kind = chip.dataset.rewardKind === "item" ? "item" : "cash";
    let label;
    if (kind === "cash") {
      const total = Math.max(0, Number(chip.dataset.rewardTotal || chip.dataset.rewardValue || 0));
      chip.dataset.rewardTotal = String(total);
      chip.dataset.rewardValue = String(total);
      label = formatCashReward(total);
    } else {
      const itemName = chip.dataset.rewardItemName || chip.dataset.rewardLabel || "Item reward";
      const quantity = Math.max(1, Number(chip.dataset.rewardQuantity || 1));
      label = formatItemReward(itemName, quantity);
    }
    chip.dataset.rewardLabel = label;
    const labelNode = chip.querySelector("small");
    if (labelNode) labelNode.textContent = label;
    const removeButton = chip.querySelector("[data-admin-terminal-action='remove-contract-reward']");
    if (removeButton) removeButton.setAttribute("aria-label", `Remove ${label} reward`);
  }
  function createContractRewardChip(kind, label, value, quantity = 1) {
    const chip = document.createElement("div");
    const nextKind = kind === "item" ? "item" : "cash";
    const safeQuantity = Math.max(1, Number(quantity || 1));
    chip.className = "admin-terminal-contract-reward-chip";
    chip.dataset.adminTerminalContractRewardRow = "";
    chip.dataset.rewardKind = nextKind;
    if (nextKind === "cash") {
      const total = Math.max(0, Number(value || 0)) * safeQuantity;
      chip.dataset.rewardValue = String(total);
      chip.dataset.rewardTotal = String(total);
      chip.dataset.rewardQuantity = "1";
    } else {
      chip.dataset.rewardValue = String(value ?? "");
      chip.dataset.rewardItemName = label || "Item reward";
      chip.dataset.rewardQuantity = String(safeQuantity);
    }
    chip.innerHTML = `
      <small></small>
      <button type="button" aria-label="Remove reward" data-admin-terminal-action="remove-contract-reward">×</button>
    `;
    updateRewardChipLabel(chip);
    return chip;
  }
  function mergeContractRewardChip(newChip) {
    const root = document.querySelector("[data-admin-terminal-contract-console]");
    const list = root?.querySelector("[data-admin-terminal-contract-rewards-list]");
    if (!list || !newChip) return;
    const kind = newChip.dataset.rewardKind === "item" ? "item" : "cash";
    if (kind === "cash") {
      const existingCash = list.querySelector('[data-admin-terminal-contract-reward-row][data-reward-kind="cash"]');
      if (existingCash) {
        const currentTotal = Math.max(0, Number(existingCash.dataset.rewardTotal || existingCash.dataset.rewardValue || 0));
        const addedTotal = Math.max(0, Number(newChip.dataset.rewardTotal || newChip.dataset.rewardValue || 0));
        existingCash.dataset.rewardTotal = String(currentTotal + addedTotal);
        existingCash.dataset.rewardValue = String(currentTotal + addedTotal);
        updateRewardChipLabel(existingCash);
        return;
      }
      list.appendChild(newChip);
      updateRewardChipLabel(newChip);
      return;
    }
    const itemValue = newChip.dataset.rewardValue;
    const existingItem = Array.from(list.querySelectorAll('[data-admin-terminal-contract-reward-row][data-reward-kind="item"]'))
      .find((chip) => chip.dataset.rewardValue === itemValue);
    if (existingItem) {
      const currentQuantity = Math.max(1, Number(existingItem.dataset.rewardQuantity || 1));
      const addedQuantity = Math.max(1, Number(newChip.dataset.rewardQuantity || 1));
      existingItem.dataset.rewardQuantity = String(currentQuantity + addedQuantity);
      updateRewardChipLabel(existingItem);
      return;
    }
    list.appendChild(newChip);
    updateRewardChipLabel(newChip);
  }
  function addStagedContractReward() {
    const root = document.querySelector("[data-admin-terminal-contract-console]");
    if (!root) return;
    const stage = root.querySelector("[data-admin-terminal-reward-stage]");
    const kind = stage?.dataset.rewardKind === "item" ? "item" : "cash";
    let chip;
    if (kind === "item") {
      const itemSelect = root.querySelector("[data-admin-terminal-stage-item]");
      const quantityInput = root.querySelector("[data-admin-terminal-stage-item-quantity]");
      const label = itemSelect?.selectedOptions?.[0]?.textContent?.trim() || "Item reward";
      const value = itemSelect?.value || label;
      const quantity = Math.max(1, Number(quantityInput?.value || 1));
      chip = createContractRewardChip("item", label, value, quantity);
    } else {
      const cashInput = root.querySelector("[data-admin-terminal-stage-cash]");
      const amount = Math.max(0, Number(cashInput?.value || 0));
      chip = createContractRewardChip("cash", formatCashReward(amount), amount, 1);
    }
    mergeContractRewardChip(chip);
    updateContractPreview();
  }
  function readContractRewards(root) {
    const rows = Array.from(root?.querySelectorAll("[data-admin-terminal-contract-reward-row]") || []);
    rows.forEach(updateRewardChipLabel);
    return rows.map((row) => row.dataset.rewardLabel || row.querySelector("small")?.textContent?.trim()).filter(Boolean);
  }
  function readContractReward(root) {
    const rewards = readContractRewards(root);
    return rewards.length ? rewards.join(" + ") : "No reward";
  }
  function updateContractPostPanel() {
    const root = document.querySelector("[data-admin-terminal-contract-console]");
    if (!root) return;
    const postSetting = root.querySelector("[data-admin-terminal-contract-post-setting]")?.value || "now";
    const scheduledPanel = root.querySelector("[data-admin-terminal-scheduled-post-panel]");
    if (scheduledPanel) {
      scheduledPanel.hidden = postSetting !== "scheduled";
      scheduledPanel.style.display = postSetting === "scheduled" ? "grid" : "none";
    }
  }
  function formatContractDateTime(value) {
    if (!value) return "not set";
    return new Date(value).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }
  function updateContractPreview() {
    const root = document.querySelector("[data-admin-terminal-contract-console]");
    if (!root) return;
    updateContractPostPanel();
    updateContractLocationSummary(root);
    const rewardRows = Array.from(root.querySelectorAll("[data-admin-terminal-contract-reward-row]"));
    const emptyState = root.querySelector("[data-admin-terminal-selected-rewards-empty]");
    if (emptyState) emptyState.hidden = rewardRows.length > 0;
    const title = root.querySelector("[data-admin-terminal-contract-title]")?.value?.trim() || "Market Analysis Brief";
    const objective = root.querySelector("[data-admin-terminal-contract-objective]")?.value?.trim() || "Objective pending";
    const evidence = root.querySelector("[data-admin-terminal-contract-evidence]")?.value?.trim() || "Submission requirement pending";
    const deadlineValue = root.querySelector("[data-admin-terminal-contract-deadline]")?.value;
    const qtyValue = root.querySelector("[data-admin-terminal-contract-quantity]")?.value?.trim() || "1";
    const quantityScope = root.querySelector("[data-admin-terminal-contract-quantity-scope]")?.value || "total";
    const postSetting = root.querySelector("[data-admin-terminal-contract-post-setting]")?.value || "now";
    const postAtValue = root.querySelector("[data-admin-terminal-contract-post-at]")?.value;
    const reward = readContractReward(root);
    const preview = root.querySelector("[data-admin-terminal-contract-preview]");
    const deadlineText = formatContractDateTime(deadlineValue);
    const locationText = readContractLocationText(root);
    const postText = postSetting === "scheduled"
      ? `Posts: ${formatContractDateTime(postAtValue)}`
      : postSetting === "draft"
        ? "Draft"
        : "Posts: now";
    const qtyScopeText = quantityScope === "per_location" ? "per selected country" : "total pool";
    if (preview) {
      const titleNode = preview.querySelector("strong");
      const metaNode = preview.querySelector("small");
      if (titleNode) titleNode.textContent = title;
      if (metaNode) metaNode.textContent = `${objective} · Submit: ${evidence} · Reward: ${reward} · Qty: ${qtyValue} ${qtyScopeText} · ${locationText} · Deadline: ${deadlineText} · ${postText}`;
    }
  }
  function bindContractModalControls(root) {
    const contractRoot = root?.querySelector?.("[data-admin-terminal-contract-console]");
    if (!contractRoot) return;
    root.querySelector(".admin-terminal-modal")?.classList.add("is-contract-modal");
    if (contractRoot.dataset.controlsBound === "true") return;
    contractRoot.dataset.controlsBound = "true";
    contractRoot.addEventListener("input", updateContractPreview, true);
    contractRoot.addEventListener("change", (event) => {
      const locationInput = event.target?.closest?.("[data-admin-terminal-contract-location]");
      if (locationInput) normalizeContractLocationSelection(contractRoot, locationInput);
      updateContractPreview();
    }, true);
    root.addEventListener("click", (event) => {
      const modalDismiss = isTerminalModalDismissClick(event);
      const locationToggle = event.target?.closest?.("[data-admin-terminal-location-toggle]");
      const locationField = event.target?.closest?.("[data-admin-terminal-location-field]");
      const action = event.target?.closest?.("[data-admin-terminal-action]");
      if (modalDismiss) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        closeTerminalModal();
        return;
      }
      if (locationToggle && contractRoot.contains(locationToggle)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        const menu = contractRoot.querySelector("[data-admin-terminal-location-menu]");
        const isOpen = !menu?.hidden;
        if (menu) menu.hidden = isOpen;
        locationToggle.setAttribute("aria-expanded", isOpen ? "false" : "true");
        return;
      }
      if (!locationField) {
        const menu = contractRoot.querySelector("[data-admin-terminal-location-menu]");
        const toggle = contractRoot.querySelector("[data-admin-terminal-location-toggle]");
        if (menu) menu.hidden = true;
        if (toggle) toggle.setAttribute("aria-expanded", "false");
      }
      if (!action || !contractRoot.contains(action)) return;
      const actionName = action.dataset.adminTerminalAction;
      if (actionName === "stage-cash-reward" || actionName === "stage-item-reward") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        setRewardStageKind(actionName === "stage-item-reward" ? "item" : "cash");
        return;
      }
      if (actionName === "confirm-staged-reward") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        addStagedContractReward();
        return;
      }
      if (actionName === "remove-contract-reward") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        const row = action.closest("[data-admin-terminal-contract-reward-row]");
        row?.remove();
        updateContractPreview();
        return;
      }
      if (actionName === "mock-preview-contract") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        updateContractPreview();
        openTerminalPreviewOverlay(renderContractPlayerListingPreview(readContractDraft(contractRoot)));
        return;
      }
    }, true);
    const form = contractRoot.querySelector("[data-admin-terminal-contract-form]");
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopPropagation();
      updateContractPreview();
      const title = contractRoot.querySelector("[data-admin-terminal-contract-title]")?.value?.trim();
      const postSetting = contractRoot.querySelector("[data-admin-terminal-contract-post-setting]")?.value || "now";
      const postAt = contractRoot.querySelector("[data-admin-terminal-contract-post-at]")?.value;
      const quantity = Number(contractRoot.querySelector("[data-admin-terminal-contract-quantity]")?.value || 0);
      const rewardRows = Array.from(contractRoot.querySelectorAll("[data-admin-terminal-contract-reward-row]"));
      if (!title) {
        contractRoot.querySelector("[data-admin-terminal-contract-title]")?.focus?.();
        showAdminTerminalStatus("warn", "Contract title is required.");
        return;
      }
      if (!Number.isFinite(quantity) || quantity < 1) {
        contractRoot.querySelector("[data-admin-terminal-contract-quantity]")?.focus?.();
        showAdminTerminalStatus("warn", "Quantity must be at least 1.");
        return;
      }
      if (!rewardRows.length) {
        showAdminTerminalStatus("warn", "At least one reward is required.");
        return;
      }
      if (postSetting === "scheduled" && !postAt) {
        contractRoot.querySelector("[data-admin-terminal-contract-post-at]")?.focus?.();
        showAdminTerminalStatus("warn", "Scheduled post time is required.");
        return;
      }
      showAdminTerminalStatus("ok", "Contract saved locally. Backend wiring pending.");
    });
    normalizeContractLocationSelection(contractRoot, null);
    setRewardStageKind("cash");
    updateContractPreview();
    window.requestAnimationFrame(() => {
      contractRoot.querySelector("[data-admin-terminal-contract-title]")?.focus?.();
    });
  }
  function readSelectedOptionText(select, fallback) {
    return select?.selectedOptions?.[0]?.textContent?.trim() || fallback;
  }
  function syncPlayerManualPanels(root) {
    if (!root) return;
    const playerIdMode = root.querySelector("[data-admin-terminal-player-id-mode]")?.value || "auto";
    const accessCodeMode = root.querySelector("[data-admin-terminal-player-access-code-mode]")?.value || "auto";
    const playerIdPanel = root.querySelector("[data-admin-terminal-player-id-manual-panel]");
    const accessCodePanel = root.querySelector("[data-admin-terminal-player-access-code-manual-panel]");
    if (playerIdPanel) {
      playerIdPanel.hidden = playerIdMode !== "manual";
      playerIdPanel.style.display = playerIdMode === "manual" ? "grid" : "none";
    }
    if (accessCodePanel) {
      accessCodePanel.hidden = accessCodeMode !== "manual";
      accessCodePanel.style.display = accessCodeMode === "manual" ? "grid" : "none";
    }
  }
  function updatePlayerPreview() {
    const root = document.querySelector("[data-admin-terminal-player-console]");
    if (!root) return;
    syncPlayerManualPanels(root);
    const displayName = root.querySelector("[data-admin-terminal-player-display-name]")?.value?.trim() || "New player";
    const rosterLabel = root.querySelector("[data-admin-terminal-player-roster-label]")?.value?.trim() || "optional";
    const statusSelect = root.querySelector("[data-admin-terminal-player-status]");
    const statusText = readSelectedOptionText(statusSelect, "Active");
    const playerIdMode = root.querySelector("[data-admin-terminal-player-id-mode]")?.value || "auto";
    const manualPlayerId = root.querySelector("[data-admin-terminal-player-manual-id]")?.value?.trim();
    const startingLocationSelect = root.querySelector("[data-admin-terminal-player-starting-location]");
    const startingLocation = readSelectedOptionText(startingLocationSelect, "Randomized");
    const accessCodeMode = root.querySelector("[data-admin-terminal-player-access-code-mode]")?.value || "auto";
    const manualAccessCode = root.querySelector("[data-admin-terminal-player-manual-access-code]")?.value?.trim();
    const previewName = root.querySelector("[data-admin-terminal-player-preview-name]");
    const summary = root.querySelector("[data-admin-terminal-player-summary]");
    const previewStatus = root.querySelector("[data-admin-terminal-player-preview-status]");
    const previewId = root.querySelector("[data-admin-terminal-player-preview-id]");
    const previewLocation = root.querySelector("[data-admin-terminal-player-preview-location]");
    const previewAccess = root.querySelector("[data-admin-terminal-player-preview-access]");
    const previewNote = root.querySelector("[data-admin-terminal-player-preview-note]");
    const playerIdText = playerIdMode === "manual"
      ? (manualPlayerId || "Manual ID required")
      : "Auto-generated";
    const accessText = accessCodeMode === "manual"
      ? (manualAccessCode || "Manual code required")
      : accessCodeMode === "none"
        ? "Create later"
        : "Generated after save";
    if (previewName) previewName.textContent = displayName;
    if (previewStatus) previewStatus.textContent = statusText;
    if (previewId) previewId.textContent = playerIdText;
    if (previewLocation) previewLocation.textContent = startingLocation;
    if (previewAccess) previewAccess.textContent = accessText;
    if (previewNote) {
      previewNote.textContent = accessCodeMode === "none"
        ? "The player will be created without an active login code. Generate one later from Player Access Codes."
        : playerIdMode === "manual" || accessCodeMode === "manual"
          ? "Manual values will override generated values for this player."
          : "Standard setup: generated Player ID, selected start location, and generated access code.";
    }
    if (summary) {
      const titleNode = summary.querySelector("strong");
      const metaNode = summary.querySelector("small");
      if (titleNode) titleNode.textContent = displayName;
      if (metaNode) {
        metaNode.textContent = `Roster: ${rosterLabel} · Status: ${statusText} · Player ID: ${playerIdText} · Start: ${startingLocation} · Access: ${accessText}`;
      }
    }
    if (typeof scheduleSciIdRankAlignment === "function") scheduleSciIdRankAlignment(root);
  }
  function bindPlayerModalControls(root) {
    const playerRoot = root?.querySelector?.("[data-admin-terminal-player-console]");
    if (!playerRoot) return;
    root.querySelector(".admin-terminal-modal")?.classList.add("is-player-modal");
    if (playerRoot.dataset.controlsBound === "true") return;
    playerRoot.dataset.controlsBound = "true";
    playerRoot.addEventListener("input", updatePlayerPreview, true);
    playerRoot.addEventListener("change", updatePlayerPreview, true);
    root.addEventListener("click", (event) => {
      const modalDismiss = isTerminalModalDismissClick(event);
      const action = event.target?.closest?.("[data-admin-terminal-action]");
      if (modalDismiss) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        closeTerminalModal();
        return;
      }
      if (!action || !playerRoot.contains(action)) return;
      if (action.dataset.adminTerminalAction === "preview-player-side-profile") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        updatePlayerPreview();
        openTerminalPreviewOverlay(renderPlayerSideProfilePreview(readPlayerDraft(playerRoot)));
      }
    }, true);
    const form = playerRoot.querySelector("[data-admin-terminal-player-form]");
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopPropagation();
      updatePlayerPreview();
      const displayName = playerRoot.querySelector("[data-admin-terminal-player-display-name]")?.value?.trim();
      const playerIdMode = playerRoot.querySelector("[data-admin-terminal-player-id-mode]")?.value || "auto";
      const manualPlayerId = playerRoot.querySelector("[data-admin-terminal-player-manual-id]")?.value?.trim();
      const accessCodeMode = playerRoot.querySelector("[data-admin-terminal-player-access-code-mode]")?.value || "auto";
      const manualAccessCode = playerRoot.querySelector("[data-admin-terminal-player-manual-access-code]")?.value?.trim();
      if (!displayName) {
        playerRoot.querySelector("[data-admin-terminal-player-display-name]")?.focus?.();
        showAdminTerminalStatus("warn", "Display name is required.");
        return;
      }
      if (playerIdMode === "manual" && !manualPlayerId) {
        playerRoot.querySelector("[data-admin-terminal-player-manual-id]")?.focus?.();
        showAdminTerminalStatus("warn", "Manual Player ID is required.");
        return;
      }
      if (accessCodeMode === "manual" && !manualAccessCode) {
        playerRoot.querySelector("[data-admin-terminal-player-manual-access-code]")?.focus?.();
        showAdminTerminalStatus("warn", "Manual access code is required.");
        return;
      }
      showAdminTerminalStatus("ok", "Player saved locally. Backend wiring pending.");
    });
    updatePlayerPreview();
    window.requestAnimationFrame(() => {
      playerRoot.querySelector("[data-admin-terminal-player-display-name]")?.focus?.();
    });
  }
function bindScannerModeHardSwitch() {
    if (window.Econovaria.features.adminOverviewTerminal.modeHardSwitchBound) return;
    window.Econovaria.features.adminOverviewTerminal.modeHardSwitchBound = true;
    const handleModeSelection = (event) => {
      const button = event.target?.closest?.("[data-admin-terminal-set-mode]");
      if (!button) return;
      const scanner = button.closest("[data-admin-terminal-scanner-console]");
      if (!scanner) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      setScannerMode(button.dataset.adminTerminalSetMode === "manual" ? "manual" : "auto");
    };
    document.addEventListener("pointerdown", handleModeSelection, true);
    document.addEventListener("mousedown", handleModeSelection, true);
    document.addEventListener("click", handleModeSelection, true);
  }
function bindTerminalScannerInputCapture() {
    if (window.Econovaria.features.adminOverviewTerminal.scannerInputCaptureBound) return;
    window.Econovaria.features.adminOverviewTerminal.scannerInputCaptureBound = true;
    document.addEventListener("input", (event) => {
      const input = event.target;
      if (input?.matches?.("[data-bank-calc-field]")) {
        updateAdminTerminalBankCalculator(input);
        return;
      }
      if (!input?.matches?.("[data-admin-terminal-auto-scan-input]")) return;
      scheduleAutoScannerCapture(input);
    });
    document.addEventListener("change", (event) => {
      const field = event.target;
      if (!field?.matches?.("[data-bank-calc-field]")) return;
      updateAdminTerminalBankCalculator(field);
    });
    document.addEventListener("focusin", (event) => {
      const consoleRoot = document.querySelector("[data-admin-terminal-scanner-console]");
      if (!consoleRoot || consoleRoot.dataset.scanMode !== "auto") return;
      const isModalControl = event.target?.closest?.("[data-admin-terminal-modal-close], [data-admin-terminal-modal-secondary], [data-admin-terminal-modal-primary], [data-admin-terminal-set-mode]");
      if (isModalControl) return;
      const autoInput = consoleRoot.querySelector("[data-admin-terminal-auto-scan-input]");
      if (event.target !== autoInput) window.requestAnimationFrame(() => autoInput?.focus?.());
    });
  }
  function bindTerminalClickableKeyboard() {
    if (window.Econovaria.features.adminOverviewTerminal.clickableKeyboardBound) return;
    window.Econovaria.features.adminOverviewTerminal.clickableKeyboardBound = true;
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const clickable = event.target?.closest?.(".admin-terminal-clickable-row, .admin-terminal-nav-item, .admin-terminal-side-code-compact");
      if (!clickable) return;
      event.preventDefault();
      clickable.click?.();
    });
  }
  function bindTerminalModalKeyboard() {
    if (window.Econovaria.features.adminOverviewTerminal.modalKeyboardBound) return;
    window.Econovaria.features.adminOverviewTerminal.modalKeyboardBound = true;
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeTerminalModal();
        return;
      }
      if (event.key === "Enter" && event.target?.matches?.("[data-admin-terminal-auto-scan-input], [data-admin-terminal-manual-scan-input]")) {
        event.preventDefault();
        handleMockScannerCapture("enter");
      }
    });
  }
  function syncInitialMenuStates() {
    document.querySelectorAll("[data-admin-terminal-shell]").forEach((shell) => {
      if (!shell.__adminTerminalCollapseInitialized) {
        shell.__adminTerminalCollapseInitialized = true;
        applyShellCollapsed(shell, true);
      }
      const menu = shell.querySelector(".admin-terminal-left-menu");
      if (!menu || menu.__adminTerminalHoverBound) return;
      menu.__adminTerminalHoverBound = true;
      menu.addEventListener("pointerenter", () => openMenuNow(shell));
      menu.addEventListener("pointerleave", () => scheduleMenuCollapse(shell, 1000));
      menu.addEventListener("focusin", () => openMenuNow(shell));
      menu.addEventListener("focusout", () => {
        if (!menu.contains(document.activeElement)) scheduleMenuCollapse(shell, 1000);
      });
    });
  }
  function startClock() {
    if (window.Econovaria.features.adminOverviewTerminal.clockTimer) return;
    window.Econovaria.features.adminOverviewTerminal.clockTimer = window.setInterval(() => {
      document.querySelectorAll("[data-admin-terminal-clock]").forEach((node) => {
        node.textContent = new Date().toLocaleTimeString([], { hour12: false });
      });
    }, 1000);
  }
  injectStyles();
  bindTerminalOverviewEvents();
  bindScannerModeHardSwitch();
  bindTerminalScannerInputCapture();
  bindTerminalClickableKeyboard();
  bindSciIdAvatarInput();
  bindTerminalModalKeyboard();
  startClock();
  window.requestAnimationFrame(syncInitialMenuStates);
  Object.assign(window.Econovaria.features.adminOverviewTerminal, {
    render,
    renderShell,
    renderLeftMenu,
    renderModalShell,
    renderAttendanceScannerModal,
    renderAddContractModal,
    renderAddPlayerModal,
    renderAddStoreItemModal,
    renderDashboardPlayerProfileModal,
    renderDashboardContractProfileModal,
    openTerminalModal,
    closeTerminalModal,
    closeAllTerminalModals,
    setScannerMode,
    addStagedContractReward,
    updateContractPreview,
    updatePlayerPreview,
    updateStoreItemPreview,
    openTerminalPreviewOverlay,
    closeTerminalPreviewOverlay,
    injectStyles
  });
})();
