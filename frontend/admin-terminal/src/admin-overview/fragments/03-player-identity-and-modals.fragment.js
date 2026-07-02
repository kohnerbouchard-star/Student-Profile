// Player identity helpers and profile/operations modals.
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
