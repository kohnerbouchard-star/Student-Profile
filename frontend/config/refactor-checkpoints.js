(function (global) {
  global.ECONOVARIA_REFACTOR_CHECKPOINTS = {
    // Default stays on the stable root-script app behavior.
    // Use ?checkpoint=<name> to activate a checkpoint during QA.
    defaultCheckpoint: "baseline",

    checkpoints: {
      baseline: {
        label: "Baseline live app",
        description: "No folderized replacement files are loaded. This should match stable main behavior.",
        scripts: [],
        requiredGlobals: [
          "handleLogin",
          "logout",
          "refreshDashboard",
          "renderCurrentView",
          "renderProfile",
          "renderStore",
          "renderPortfolio",
          "renderTrade",
          "renderStockProfile",
          "renderRating",
          "purchaseItem",
          "submitTrade",
          "submitRating"
        ]
      },

      utils: {
        label: "Utilities extracted",
        description: "Loads behavior-preserving utility wrappers only. No page renderers should change.",
        scripts: [],
        requiredGlobals: [
          "sanitize",
          "money",
          "formatDateTime",
          "table",
          "metric",
          "mini"
        ]
      },

      ui: {
        label: "UI support extracted",
        description: "Loads behavior-preserving UI support scripts only.",
        scripts: [
          "frontend/src/ui/student-ui.js",
          "frontend/src/ui/mobile.js"
        ],
        requiredGlobals: []
      },

      auth: {
        label: "Auth extracted",
        description: "Loads behavior-preserving auth/login wrappers only.",
        scripts: [
          "frontend/src/features/auth/login-quotes.js"
        ],
        requiredGlobals: [
          "handleLogin",
          "showLogin",
          "showLoginError",
          "clearLoginError",
          "logout"
        ]
      },

      store: {
        label: "Store extracted",
        description: "Loads behavior-preserving store renderer and purchase action.",
        scripts: [],
        requiredGlobals: [
          "renderStore",
          "purchaseItem"
        ]
      },

      inventory: {
        label: "Inventory and item-use extracted",
        description: "Loads behavior-preserving inventory and use-item rendering/action.",
        scripts: [],
        requiredGlobals: [
          "renderUseItemCard",
          "useItem"
        ]
      },

      market: {
        label: "Market extracted",
        description: "Loads behavior-preserving market data and market news rendering.",
        scripts: [],
        requiredGlobals: [
          "renderStockProfile",
          "renderStockProfileDetail",
          "renderMarketCompanyNews"
        ]
      },

      full: {
        label: "Full folderized frontend",
        description: "Final checkpoint after all folderized files are behavior-equivalent.",
        scripts: [],
        requiredGlobals: [
          "renderCurrentView",
          "renderProfile",
          "renderStore",
          "renderPortfolio",
          "renderTrade",
          "renderStockProfile",
          "renderRating"
        ]
      }
    }
  };
})(window);
