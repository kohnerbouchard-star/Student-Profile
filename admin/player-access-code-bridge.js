(function initEconovariaPlayerAccessCodeBridge() {
  "use strict";

  const SUPABASE_URL = "https://cgiukdjwicykrmtkhudh.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_zkbXiJ1_zlmQIBMky6oi5w_4A24T1iV";
  const CLASSROOM_API_BASE = `${SUPABASE_URL}/functions/v1/classroom-api`;
  const LOCAL_API_PREFIX = "/api/admin";
  const SESSION_KEY = "econovaria.admin.auth.v1";
  const SELECTED_GAME_KEY = "econovaria.admin.selected-game.v1";
  const delegatedFetch = window.fetch.bind(window);

  function record(value) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  }

  function text(value) {
    return String(value ?? "").trim();
  }

  function storedSession() {
    try {
      return record(JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || "null"));
    } catch (_) {
      return {};
    }
  }

  async function responseJson(response) {
    try {
      return record(await response.clone().json());
    } catch (_) {
      return {};
    }
  }

  function flattenedResponse(value) {
    const source = record(value);
    const data = record(source.data);
    return { ...source, ...data };
  }

  function playerFrom(value) {
    const source = flattenedResponse(value);
    return record(source.player || source.createdPlayer);
  }

  function accessCodeFrom(value) {
    const source = flattenedResponse(value);
    const accessCode = source.accessCode;
    if (typeof accessCode === "string") return text(accessCode);
    const codeRecord = record(accessCode);
    return text(
      codeRecord.studentCode ||
      codeRecord.accessCode ||
      codeRecord.code ||
      source.studentCode ||
      source.generatedAccessCode,
    );
  }

  function createContext(request, url) {
    if (request.method !== "POST" || !url.pathname.startsWith(LOCAL_API_PREFIX)) {
      return null;
    }
    const match = url.pathname.match(/^\/api\/admin\/games\/([^/]+)\/players$/);
    if (!match) return null;
    return { gameId: decodeURIComponent(match[1]) };
  }

  function classroomHeaders(request, accessToken, gameId) {
    const headers = new Headers(request.headers);
    headers.set("apikey", SUPABASE_PUBLISHABLE_KEY);
    headers.set("Authorization", `Bearer ${accessToken}`);
    headers.set("Content-Type", "application/json");
    headers.set("X-Econovaria-Game-Id", gameId);
    headers.delete("Content-Length");
    headers.delete("X-CSRF-Token");
    headers.delete("X-Econovaria-CSRF");
    headers.delete("X-Econovaria-Admin-Read");
    return headers;
  }

  function emitAccessCode(detail) {
    if (typeof window.CustomEvent === "function") {
      window.dispatchEvent(new CustomEvent("econovaria:player-access-code-issued", { detail }));
    }
    renderAccessCodeDialog(detail);
  }

  function renderAccessCodeDialog(detail) {
    if (typeof document === "undefined" || !document.body) return;

    document.querySelector("[data-admin-player-access-code-dialog]")?.remove();

    const overlay = document.createElement("div");
    overlay.setAttribute("data-admin-player-access-code-dialog", "");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "adminPlayerAccessCodeTitle");
    overlay.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:12000",
      "display:grid",
      "place-items:center",
      "padding:24px",
      "background:rgba(1,7,14,.78)",
      "backdrop-filter:blur(8px)",
    ].join(";");

    const panel = document.createElement("section");
    panel.style.cssText = [
      "width:min(460px,100%)",
      "border:1px solid rgba(255,103,0,.7)",
      "background:#071421",
      "color:#e9fbff",
      "padding:24px",
      "box-shadow:0 24px 80px rgba(0,0,0,.5)",
      "font-family:Inter,Arial,sans-serif",
    ].join(";");

    const title = document.createElement("h2");
    title.id = "adminPlayerAccessCodeTitle";
    title.textContent = "Player access code created";
    title.style.cssText = "margin:0 0 8px;font-size:20px";

    const description = document.createElement("p");
    description.textContent = `${detail.displayName || "Player"} can use this code to sign in and scan attendance.`;
    description.style.cssText = "margin:0 0 18px;color:rgba(233,251,255,.72);line-height:1.5";

    const code = document.createElement("strong");
    code.setAttribute("data-admin-player-access-code-value", "");
    code.textContent = detail.studentCode;
    code.style.cssText = [
      "display:block",
      "padding:18px",
      "border:1px solid rgba(105,250,255,.45)",
      "background:#020b12",
      "font:800 28px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace",
      "letter-spacing:.16em",
      "text-align:center",
      "user-select:all",
    ].join(";");

    const warning = document.createElement("p");
    warning.textContent = "Copy this code now. Only its secure hash is stored in the database.";
    warning.style.cssText = "margin:14px 0 18px;color:rgba(233,251,255,.62);font-size:13px;line-height:1.5";

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;justify-content:flex-end;gap:10px";

    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copy code";
    copy.style.cssText = "min-height:40px;padding:0 16px;border:1px solid rgba(105,250,255,.55);background:#0b2333;color:#e9fbff;cursor:pointer";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(detail.studentCode);
        copy.textContent = "Copied";
      } catch (_) {
        code.focus?.();
      }
    });

    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Close";
    close.style.cssText = "min-height:40px;padding:0 16px;border:1px solid rgba(255,103,0,.65);background:#ff6700;color:#071421;font-weight:800;cursor:pointer";
    close.addEventListener("click", () => overlay.remove());

    actions.append(copy, close);
    panel.append(title, description, code, warning, actions);
    overlay.append(panel);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) overlay.remove();
    });
    document.body.append(overlay);
    close.focus();
  }

  function mergedResponse(primary, primaryBody, resetBody) {
    const source = flattenedResponse(primaryBody);
    const reset = flattenedResponse(resetBody);
    const player = playerFrom(resetBody);
    const accessCode = record(reset.accessCode);
    const body = {
      ...source,
      ok: true,
      player: Object.keys(player).length ? player : playerFrom(primaryBody),
      accessCode,
      data: {
        ...record(source.data),
        player: Object.keys(player).length ? player : playerFrom(primaryBody),
        accessCode,
      },
    };
    const headers = new Headers(primary.headers);
    headers.set("Content-Type", "application/json");
    headers.set("Cache-Control", "no-store");
    return new Response(JSON.stringify(body), {
      status: primary.status,
      statusText: primary.statusText,
      headers,
    });
  }

  window.fetch = async function econovariaPlayerAccessCodeFetch(input, init) {
    const rawUrl = input instanceof Request
      ? input.url
      : new URL(String(input), window.location.href).href;
    const request = input instanceof Request
      ? new Request(input, init)
      : new Request(rawUrl, init);
    const url = new URL(request.url, window.location.href);
    const context = createContext(request, url);

    if (!context) return delegatedFetch(request);

    const primary = await delegatedFetch(request);
    if (!primary.ok) return primary;

    const primaryBody = await responseJson(primary);
    const primaryPlayer = playerFrom(primaryBody);
    const existingCode = accessCodeFrom(primaryBody);

    if (existingCode) {
      emitAccessCode({
        playerId: text(primaryPlayer.id || primaryPlayer.playerId),
        displayName: text(primaryPlayer.displayName || primaryPlayer.name),
        studentCode: existingCode,
      });
      return primary;
    }

    const playerId = text(primaryPlayer.id || primaryPlayer.playerId);
    const session = storedSession();
    const accessToken = text(session.accessToken);
    const selectedGameId = text(window.sessionStorage.getItem(SELECTED_GAME_KEY));

    if (!playerId || !accessToken || (selectedGameId && selectedGameId !== context.gameId)) {
      return primary;
    }

    const resetResponse = await delegatedFetch(
      `${CLASSROOM_API_BASE}/games/${encodeURIComponent(context.gameId)}/players/${encodeURIComponent(playerId)}/access-code/reset`,
      {
        method: "POST",
        headers: classroomHeaders(request, accessToken, context.gameId),
        body: JSON.stringify({ reason: "player_created_without_access_code" }),
        credentials: "omit",
        cache: "no-store",
        redirect: "follow",
        referrerPolicy: "no-referrer",
      },
    );

    if (!resetResponse.ok) return primary;

    const resetBody = await responseJson(resetResponse);
    const studentCode = accessCodeFrom(resetBody);
    const resetPlayer = playerFrom(resetBody);

    if (!studentCode) return primary;

    emitAccessCode({
      playerId,
      displayName: text(resetPlayer.displayName || resetPlayer.name || primaryPlayer.displayName || primaryPlayer.name),
      studentCode,
    });

    return mergedResponse(primary, primaryBody, resetBody);
  };

  window.EconovariaPlayerAccessCodeBridge = {
    accessCodeFrom,
    playerFrom,
  };
})();
