// Synchronous copy normalizer for remaining pre-refactor labels.
// No observers and no delayed timers: replacements happen inside the render call.

(function initCanonicalCopyNormalizer() {
  const pairs = [
    ['Shop Items', 'Store Items'],
    ['Shop Spent', 'Store Spend'],
    ['Shop', 'Store'],
    ['Investments', 'Portfolio'],
    ['Trade Desk', 'Trading'],
    ['Market Explorer', 'Market Data'],
    ['Predictions', 'Forecasts'],
    ['Submit a Prediction', 'Submit Forecast'],
    ['Submit Prediction', 'Submit Forecast'],
    ['Prediction History', 'Forecast History'],
    ['Buy an Item', 'Purchase Item'],
    ['Buy Item', 'Purchase Item'],
    ['Place a Trade', 'Place Order'],
    ['Submit Trade', 'Place Order'],
    ['Recent Trades', 'Recent Orders'],
    ['My Account', 'Account Summary'],
    ['My Items', 'Items']
  ];

  function normalizeText(value) {
    if (typeof value !== 'string') return value;
    return pairs.reduce((text, pair) => text.split(pair[0]).join(pair[1]), value);
  }

  function normalizeVisibleText(root) {
    const target = root || document.body;
    if (!target) return;

    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    nodes.forEach((node) => {
      const next = normalizeText(node.nodeValue);
      if (next !== node.nodeValue) node.nodeValue = next;
    });
  }

  function patchRender(name) {
    if (window[`__canonicalCopyPatched_${name}`] || typeof window[name] !== 'function') return;
    window[`__canonicalCopyPatched_${name}`] = true;

    const original = window[name];
    window[name] = function patchedCanonicalCopyRender() {
      const result = original.apply(this, arguments);
      normalizeVisibleText(document.body);
      return result;
    };
  }

  function init() {
    [
      'switchView',
      'renderCurrentView',
      'renderProfile',
      'renderStore',
      'renderPortfolio',
      'renderTrade',
      'renderStockProfile',
      'renderStockProfileDetail',
      'renderRating',
      'updateIdentity'
    ].forEach(patchRender);

    normalizeVisibleText(document.body);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  window.Econovaria = window.Econovaria || {};
  window.Econovaria.ui = window.Econovaria.ui || {};
  Object.assign(window.Econovaria.ui, { normalizeAcademicMarketCopy: normalizeVisibleText });
})();
