(function initGamePublicRealtime(root) {
  const app = root.Econovaria = root.Econovaria || {};
  app.features = app.features || {};
  app.features.realtime = app.features.realtime || {};

  const DEFAULT_STALE_FOCUS_MS = 120000;
  let sharedSupabaseClient = null;

  function startGamePublicRealtimeSubscription(options) {
    const gameSessionId = readText(options?.gameSessionId);
    const publicChannel = readText(options?.publicChannel);
    const supabaseClient = options?.supabaseClient;

    if (!gameSessionId || !publicChannel || !supabaseClient) {
      return noopSubscription();
    }

    if (publicChannel !== `game:${gameSessionId}:public`) {
      if (typeof options?.onResync === "function") {
        options.onResync("public_channel_mismatch");
      }
      return noopSubscription();
    }

    const state = {
      lastSequence: Number.isInteger(options?.lastSequence)
        ? options.lastSequence
        : null,
      subscribedOnce: false,
      closed: false,
    };
    const broadcastOptions = {
      gameSessionId,
      publicChannel,
      state,
      onStockTick: options?.onStockTick,
      onMarketNewsPosted: options?.onMarketNewsPosted,
      onMarketStatusChanged: options?.onMarketStatusChanged,
      onResync: options?.onResync,
    };

    const channel = supabaseClient
      .channel(publicChannel)
      .on("broadcast", { event: "stock_tick" }, (message) => {
        handleGamePublicRealtimeBroadcast(message, broadcastOptions);
      })
      .on("broadcast", { event: "market_news_posted" }, (message) => {
        handleGamePublicRealtimeBroadcast(message, broadcastOptions);
      })
      .on("broadcast", { event: "market_status_changed" }, (message) => {
        handleGamePublicRealtimeBroadcast(message, broadcastOptions);
      });

    channel.subscribe((status) => {
      if (state.closed || status !== "SUBSCRIBED") return;

      if (state.subscribedOnce && typeof options?.onReconnect === "function") {
        options.onReconnect();
      }

      state.subscribedOnce = true;
    });

    const removeFocusListeners = bindStaleFocusResync({
      staleMs: options?.staleFocusMs,
      onResync: options?.onResync,
      root,
    });

    return {
      channel: publicChannel,
      unsubscribe() {
        if (state.closed) return;
        state.closed = true;
        removeFocusListeners();

        if (typeof supabaseClient.removeChannel === "function") {
          supabaseClient.removeChannel(channel);
          return;
        }

        if (typeof channel.unsubscribe === "function") {
          channel.unsubscribe();
        }
      },
    };
  }

  function handleGamePublicRealtimeBroadcast(message, options) {
    const envelope = readBroadcastEnvelope(message);

    if (!envelope) {
      return false;
    }

    const eventType = readText(envelope.eventType);

    if (
      eventType !== "stock_tick" &&
      eventType !== "market_news_posted" &&
      eventType !== "market_status_changed"
    ) {
      return false;
    }

    if (
      readText(envelope.gameSessionId) !== readText(options?.gameSessionId) ||
      readText(envelope.channel) !== readText(options?.publicChannel)
    ) {
      if (typeof options?.onResync === "function") {
        options.onResync(`${eventType}_scope_mismatch`);
      }
      return false;
    }

    if (eventType === "stock_tick") {
      return handleStockTickBroadcast(envelope, options);
    }

    if (eventType === "market_news_posted") {
      if (typeof options?.onMarketNewsPosted === "function") {
        options.onMarketNewsPosted(envelope.payload, envelope);
      }
      return true;
    }

    if (eventType === "market_status_changed") {
      if (typeof options?.onMarketStatusChanged === "function") {
        options.onMarketStatusChanged(envelope.payload, envelope);
      }
      return true;
    }

    return false;
  }

  function handleStockTickBroadcast(envelope, options) {
    const sequence = Number.isInteger(envelope.sequence)
      ? envelope.sequence
      : null;
    const lastSequence = Number.isInteger(options?.state?.lastSequence)
      ? options.state.lastSequence
      : null;

    if (
      sequence !== null && lastSequence !== null &&
      sequence !== lastSequence + 1
    ) {
      if (typeof options?.onResync === "function") {
        options.onResync("stock_tick_sequence_gap");
      }
      options.state.lastSequence = sequence;
      return false;
    }

    if (sequence !== null && options?.state) {
      options.state.lastSequence = sequence;
    }

    if (typeof options?.onStockTick === "function") {
      options.onStockTick(envelope.payload, envelope);
    }

    return true;
  }

  function readBroadcastEnvelope(message) {
    if (!message || typeof message !== "object") return null;

    if (message.payload && typeof message.payload === "object") {
      if (message.payload.eventType) return message.payload;
      if (message.payload.payload?.eventType) return message.payload.payload;
    }

    if (message.eventType) return message;

    return null;
  }

  function applyStockTickToMarketRows(currentRows, payload) {
    const rows = Array.isArray(currentRows) ? currentRows : [];
    const stocks = Array.isArray(payload?.stocks) ? payload.stocks : [];
    const nextRows = rows.map((row) => ({ ...row }));

    stocks.forEach((stock) => {
      const nextStock = normalizeStockTickMarketRow(stock, payload?.tick);
      if (!nextStock.ticker && !nextStock.stockAssetId) return;

      const existingIndex = nextRows.findIndex((row) =>
        sameStockAsset(row, nextStock) || sameTicker(row, nextStock)
      );

      if (existingIndex >= 0) {
        nextRows[existingIndex] = {
          ...nextRows[existingIndex],
          ...nextStock,
          history: appendRealtimeHistoryPoint(
            nextRows[existingIndex],
            nextStock,
            payload?.tick,
          ),
        };
        return;
      }

      nextRows.push({
        ...nextStock,
        assetType: "Stock",
        history: appendRealtimeHistoryPoint(null, nextStock, payload?.tick),
      });
    });

    return nextRows;
  }

  function applyStockTickToState(stateApi, payload) {
    if (
      !stateApi || typeof stateApi.getState !== "function" ||
      typeof stateApi.setState !== "function"
    ) {
      return null;
    }

    const currentState = stateApi.getState() || {};
    const nextState = {
      ...currentState,
      market: applyStockTickToMarketRows(currentState.market || [], payload),
    };

    stateApi.setState(nextState);
    return nextState;
  }


  function applyMarketNewsPostedToState(stateApi, payload, envelope) {
    if (
      !stateApi || typeof stateApi.getState !== "function" ||
      typeof stateApi.setState !== "function"
    ) {
      return null;
    }

    const newsItem = normalizeMarketNewsPostedRow(payload, envelope);

    if (!newsItem) {
      return null;
    }

    const currentState = stateApi.getState() || {};
    const currentNews = Array.isArray(currentState.news)
      ? currentState.news
      : [];
    const existingIndex = currentNews.findIndex((row) =>
      sameNewsItem(row, newsItem)
    );
    const nextNews = currentNews.slice();

    if (existingIndex >= 0) {
      nextNews.splice(existingIndex, 1);
    }

    nextNews.unshift(newsItem);

    const nextState = {
      ...currentState,
      news: nextNews.slice(0, 50),
    };

    stateApi.setState(nextState);
    return nextState;
  }

  function applyMarketStatusChangedToState(stateApi, payload, envelope) {
    if (
      !stateApi || typeof stateApi.getState !== "function" ||
      typeof stateApi.setState !== "function"
    ) {
      return null;
    }

    const marketStatus = normalizeMarketStatusChanged(payload, envelope);

    if (!marketStatus) {
      return null;
    }

    const currentState = stateApi.getState() || {};
    const nextState = {
      ...currentState,
      marketStatus,
    };

    stateApi.setState(nextState);
    return nextState;
  }

  function normalizeStockTickMarketRow(stock, tick) {
    const stockAssetId = readText(stock?.stockAssetId || stock?.assetId);
    const ticker = readText(stock?.ticker).toUpperCase();
    const currentPrice = finiteNumber(stock?.currentPrice);
    const previousClose = finiteNumber(stock?.previousClose);
    const changePct = finiteNumber(stock?.changePct);
    const volume = finiteNumber(stock?.volume);

    return {
      assetId: stockAssetId,
      stockAssetId,
      ticker,
      companyName: readText(stock?.companyName) || ticker,
      sector: readText(stock?.sector),
      countryCode: readText(stock?.countryCode),
      currentPrice,
      previousClose,
      changePct,
      volume,
      trend: changePct > 0 ? "up" : changePct < 0 ? "down" : "flat",
      assetType: "Stock",
      lastUpdated: Number.isInteger(tick) ? `Tick ${tick}` : "",
    };
  }

  function appendRealtimeHistoryPoint(existingRow, nextStock, tick) {
    const history = Array.isArray(existingRow?.history)
      ? existingRow.history.slice()
      : [];
    const label = Number.isInteger(tick) ? `Tick ${tick}` : "Latest";
    const point = {
      tickIndex: Number.isInteger(tick) ? tick : undefined,
      label,
      price: nextStock.currentPrice,
      volume: nextStock.volume,
    };

    if (
      history.length &&
      String(history[history.length - 1]?.label || "") === label
    ) {
      history[history.length - 1] = point;
      return history;
    }

    history.push(point);
    return history.slice(-30);
  }

  function normalizeMarketNewsPostedRow(payload, envelope) {
    const source = payload?.news || payload?.item || payload;
    const id = readText(
      source?.newsId ||
      source?.id ||
      source?.marketNewsId ||
      envelope?.id ||
      envelope?.sequence
    );
    const headline = readText(
      source?.headline ||
      source?.title ||
      source?.message ||
      source?.summary
    );

    if (!headline) {
      return null;
    }

    return {
      id,
      headline,
      title: headline,
      summary: readText(source?.summary || source?.body || source?.description),
      body: readText(source?.body || source?.description),
      source: readText(source?.source || source?.publisher),
      severity: readText(source?.severity || source?.impact || source?.tone),
      countryCode: readText(source?.countryCode),
      sector: readText(source?.sector),
      tick: Number.isInteger(payload?.tick)
        ? payload.tick
        : Number.isInteger(envelope?.sequence)
          ? envelope.sequence
          : undefined,
      createdAt: readText(
        source?.createdAt ||
        source?.postedAt ||
        source?.timestamp ||
        envelope?.createdAt
      ),
    };
  }

  function normalizeMarketStatusChanged(payload, envelope) {
    const source = payload?.status || payload?.marketStatus || payload;
    const status = readText(
      source?.status ||
      source?.marketStatus ||
      source?.state ||
      source?.phase
    );

    if (!status) {
      return null;
    }

    return {
      status,
      label: readText(source?.label || source?.name) || status,
      reason: readText(source?.reason || source?.message || source?.summary),
      tick: Number.isInteger(source?.tick)
        ? source.tick
        : Number.isInteger(payload?.tick)
          ? payload.tick
          : undefined,
      updatedAt: readText(
        source?.updatedAt ||
        source?.changedAt ||
        source?.timestamp ||
        envelope?.createdAt
      ),
    };
  }

  function sameNewsItem(left, right) {
    const leftId = readText(left?.id || left?.newsId);
    const rightId = readText(right?.id || right?.newsId);

    if (leftId && rightId) {
      return leftId === rightId;
    }

    const leftHeadline = readText(left?.headline || left?.title).toLowerCase();
    const rightHeadline = readText(right?.headline || right?.title).toLowerCase();

    return Boolean(leftHeadline && rightHeadline && leftHeadline === rightHeadline);
  }

  function bindStaleFocusResync(options) {
    const runtime = options?.root || root;
    const staleMs = Number.isFinite(options?.staleMs)
      ? Math.max(0, options.staleMs)
      : DEFAULT_STALE_FOCUS_MS;
    let lastActiveAt = Date.now();

    function maybeResync() {
      const now = Date.now();
      const isStale = now - lastActiveAt >= staleMs;
      lastActiveAt = now;

      if (isStale && typeof options?.onResync === "function") {
        options.onResync("stale_focus");
      }
    }

    const documentRef = runtime.document;
    const windowRef = runtime.window || runtime;

    if (windowRef?.addEventListener) {
      windowRef.addEventListener("focus", maybeResync);
    }

    const onVisibilityChange = () => {
      if (!documentRef.hidden) maybeResync();
    };

    if (documentRef?.addEventListener) {
      documentRef.addEventListener("visibilitychange", onVisibilityChange);
    }

    return function removeFocusListeners() {
      if (windowRef?.removeEventListener) {
        windowRef.removeEventListener("focus", maybeResync);
      }

      if (documentRef?.removeEventListener) {
        documentRef.removeEventListener("visibilitychange", onVisibilityChange);
      }
    };
  }

  function getGamePublicRealtimeSupabaseClient() {
    if (sharedSupabaseClient) return sharedSupabaseClient;

    const constants = app.core?.constants || {};
    const supabaseUrl = readText(constants.SUPABASE_URL);
    const publishableKey = readText(constants.SUPABASE_PUBLISHABLE_KEY);
    const sdk = root.supabase;

    if (
      !supabaseUrl || !publishableKey || typeof sdk?.createClient !== "function"
    ) {
      return null;
    }

    sharedSupabaseClient = sdk.createClient(supabaseUrl, publishableKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    return sharedSupabaseClient;
  }

  function noopSubscription() {
    return {
      channel: "",
      unsubscribe() {},
    };
  }

  function sameStockAsset(row, stock) {
    const left = readText(row?.stockAssetId || row?.assetId);
    const right = readText(stock?.stockAssetId || stock?.assetId);
    return Boolean(left && right && left === right);
  }

  function sameTicker(row, stock) {
    const left = readText(row?.ticker).toUpperCase();
    const right = readText(stock?.ticker).toUpperCase();
    return Boolean(left && right && left === right);
  }

  function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function readText(value) {
    return String(value || "").trim();
  }

  Object.assign(app.features.realtime, {
    startGamePublicRealtimeSubscription,
    handleGamePublicRealtimeBroadcast,
    applyStockTickToMarketRows,
    applyStockTickToState,
    applyMarketNewsPostedToState,
    applyMarketStatusChangedToState,
    getGamePublicRealtimeSupabaseClient,
  });
})(typeof window !== "undefined" ? window : globalThis);
