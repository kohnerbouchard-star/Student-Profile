// Student-facing UI helpers.

function tip(text) {
  return `<button type="button" class="tooltip" aria-label="More information" data-tip="${sanitize(text)}">?</button>`;
}

function initReliableTooltips() {
  if (window.__studentTooltipsReady) return;
  window.__studentTooltipsReady = true;

  const popover = document.createElement('div');
  popover.id = 'studentTooltipPopover';
  popover.className = 'tooltip-popover hidden';
  popover.setAttribute('role', 'tooltip');
  document.body.appendChild(popover);

  let activeTooltip = null;
  let hideTimer = null;

  function positionPopover(target) {
    const rect = target.getBoundingClientRect();
    const padding = 12;

    popover.classList.remove('hidden');
    popover.style.left = '0px';
    popover.style.top = '0px';

    const popRect = popover.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - popRect.width / 2;
    let top = rect.top - popRect.height - 10;

    if (left < padding) left = padding;
    if (left + popRect.width > window.innerWidth - padding) {
      left = window.innerWidth - popRect.width - padding;
    }

    if (top < padding) {
      top = rect.bottom + 10;
      popover.classList.add('below');
    } else {
      popover.classList.remove('below');
    }

    popover.style.left = `${Math.round(left + window.scrollX)}px`;
    popover.style.top = `${Math.round(top + window.scrollY)}px`;
  }

  function showTooltip(target) {
    if (!target || !target.classList || !target.classList.contains('tooltip')) return;
    const text = target.dataset.tip || '';
    if (!text) return;

    clearTimeout(hideTimer);
    activeTooltip = target;
    popover.textContent = text;
    target.setAttribute('aria-expanded', 'true');
    positionPopover(target);
  }

  function hideTooltip() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (activeTooltip) activeTooltip.setAttribute('aria-expanded', 'false');
      activeTooltip = null;
      popover.classList.add('hidden');
    }, 80);
  }

  document.addEventListener('mouseover', (event) => {
    const target = event.target.closest && event.target.closest('.tooltip');
    if (target) showTooltip(target);
  });

  document.addEventListener('focusin', (event) => {
    const target = event.target.closest && event.target.closest('.tooltip');
    if (target) showTooltip(target);
  });

  document.addEventListener('mouseout', (event) => {
    const target = event.target.closest && event.target.closest('.tooltip');
    if (target) hideTooltip();
  });

  document.addEventListener('focusout', (event) => {
    const target = event.target.closest && event.target.closest('.tooltip');
    if (target) hideTooltip();
  });

  document.addEventListener('click', (event) => {
    const target = event.target.closest && event.target.closest('.tooltip');

    if (target) {
      event.preventDefault();
      event.stopPropagation();

      if (activeTooltip === target && !popover.classList.contains('hidden')) {
        hideTooltip();
      } else {
        showTooltip(target);
      }
      return;
    }

    hideTooltip();
  });

  window.addEventListener('scroll', () => {
    if (activeTooltip && !popover.classList.contains('hidden')) positionPopover(activeTooltip);
  }, true);

  window.addEventListener('resize', () => {
    if (activeTooltip && !popover.classList.contains('hidden')) positionPopover(activeTooltip);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hideTooltip();
  });
}

function initUiSoundEffectLoader() {
  if (window.Econovaria?.ui?.playLoginActionSound) return;
  if (document.getElementById('uiSoundEffectsScript')) return;

  const script = document.createElement('script');
  script.id = 'uiSoundEffectsScript';
  script.src = 'frontend/src/ui/ui-sound-effects.js?v=20260622-loginsfx1';
  script.async = false;
  document.head.appendChild(script);
}

initReliableTooltips();
initUiSoundEffectLoader();

window.Econovaria = window.Econovaria || {};
window.Econovaria.ui = window.Econovaria.ui || {};
Object.assign(window.Econovaria.ui, { tip, initReliableTooltips, initUiSoundEffectLoader });
