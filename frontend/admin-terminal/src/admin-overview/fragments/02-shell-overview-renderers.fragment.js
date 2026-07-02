// Top-shell renderers: notifications, account menu, left navigation, and overview cards.
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
