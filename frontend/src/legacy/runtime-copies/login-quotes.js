// Rotating login quotes for the market simulation entry screen.

(function initLoginQuotes() {
  const quotes = [
    'Every decision has a cost. Every cost teaches a lesson.',
    'Markets reward patience, evidence, and timing.',
    'Good strategy starts with good information.',
    'A smart trade begins before the order is placed.',
    'Risk is not the enemy. Unmeasured risk is.',
    'The best investors learn from both wins and losses.',
    'Data gives you a signal. Judgment turns it into action.',
    'Small choices compound into major outcomes.',
    'Price tells a story. Your job is to read it carefully.',
    'In a market, preparation beats reaction.',
    'A forecast is stronger when it explains the why.',
    'Capital is limited. Strategy decides where it goes.',
    'The market does not wait, but it does leave clues.',
    'Strong decisions balance confidence with evidence.',
    'Opportunity looks different when you understand the numbers.',
    'Trading is easy. Thinking clearly is the hard part.',
    'Learn the pattern before you chase the price.',
    'A portfolio is a record of choices, not just assets.',
    'The goal is not guessing. The goal is reasoning better.',
    'Build the habit: observe, decide, review, improve.'
  ];

  let index = 0;

  function showQuote() {
    const quoteEl = document.getElementById('loginQuoteText');
    const countEl = document.getElementById('loginQuoteCount');
    if (!quoteEl) return;

    quoteEl.classList.add('is-changing');

    window.setTimeout(() => {
      quoteEl.textContent = quotes[index];
      if (countEl) countEl.textContent = `${String(index + 1).padStart(2, '0')} / ${quotes.length}`;
      quoteEl.classList.remove('is-changing');
      index = (index + 1) % quotes.length;
    }, 180);
  }

  function init() {
    showQuote();
    window.setInterval(showQuote, 5000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/* Restart quote animation whenever the rotating quote text changes. */
(function setupLoginQuoteSlideAnimation() {
  const apply = () => {
    const quoteText = document.getElementById("loginQuoteText");
    if (!quoteText || quoteText.dataset.slideObserverAttached === "true") return;

    quoteText.dataset.slideObserverAttached = "true";

    const restartAnimation = () => {
      quoteText.classList.remove("login-quote-slide");
      void quoteText.offsetWidth;
      quoteText.classList.add("login-quote-slide");
    };

    let lastText = quoteText.textContent;

    const observer = new MutationObserver(() => {
      const nextText = quoteText.textContent;
      if (nextText === lastText) return;

      lastText = nextText;
      restartAnimation();
    });

    observer.observe(quoteText, {
      childList: true,
      characterData: true,
      subtree: true
    });

    restartAnimation();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply, { once: true });
  } else {
    apply();
  }
})();

