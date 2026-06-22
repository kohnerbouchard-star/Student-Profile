window.Econovaria = window.Econovaria || {};
window.Econovaria.ui = window.Econovaria.ui || {};

(function initUiSoundEffects() {
  const SOUND_VERSION = "20260622-loginsfx2";
  const LOGIN_ACTION_VOLUME = 0.46;
  const scriptUrl = document.currentScript?.src || "";
  const LOGIN_ACTION_SOUND_URL = scriptUrl
    ? new URL(`sounds/login-action.mp3?v=${SOUND_VERSION}`, scriptUrl).href
    : `frontend/src/ui/sounds/login-action.mp3?v=${SOUND_VERSION}`;

  const ACTION_TARGET_SELECTOR = [
    "#playerForm button[type='submit']",
    "#createForm button[type='submit']",
    "#adminGameList .game-row"
  ].join(",");

  let loginActionAudio = null;
  let lastPlayAt = 0;

  function getLoginActionAudio() {
    if (!loginActionAudio) {
      loginActionAudio = new Audio(LOGIN_ACTION_SOUND_URL);
      loginActionAudio.preload = "auto";
      loginActionAudio.volume = LOGIN_ACTION_VOLUME;
      loginActionAudio.addEventListener("error", () => {
        console.warn("[ui-sound] Failed to load login action sound:", LOGIN_ACTION_SOUND_URL);
      }, { once: true });
    }

    return loginActionAudio;
  }

  function playLoginActionSound() {
    const now = Date.now();

    if (now - lastPlayAt < 220) return;
    lastPlayAt = now;

    const audio = getLoginActionAudio();

    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = LOGIN_ACTION_VOLUME;

      const playResult = audio.play();

      if (playResult && typeof playResult.catch === "function") {
        playResult.catch((error) => {
          console.warn("[ui-sound] Login action sound was blocked:", error);
        });
      }
    } catch (error) {
      console.warn("[ui-sound] Login action sound failed:", error);
    }
  }

  function findSoundTarget(target) {
    const soundTarget = target?.closest?.(ACTION_TARGET_SELECTOR);

    if (!soundTarget) return null;
    if (soundTarget.disabled) return null;
    if (soundTarget.getAttribute("aria-disabled") === "true") return null;

    return soundTarget;
  }

  function handleSoundPointer(event) {
    if (findSoundTarget(event.target)) {
      playLoginActionSound();
    }
  }

  function handleSoundKey(event) {
    if (event.key !== "Enter" && event.key !== " ") return;

    if (findSoundTarget(event.target)) {
      playLoginActionSound();
    }
  }

  function handleSubmitFallback(event) {
    if (event.target?.id === "playerForm" || event.target?.id === "createForm") {
      playLoginActionSound();
    }
  }

  function bindLoginSoundTriggers() {
    if (document.documentElement.dataset.loginActionSoundBound === "true") return;
    document.documentElement.dataset.loginActionSoundBound = "true";

    document.addEventListener("pointerdown", handleSoundPointer, true);
    document.addEventListener("click", handleSoundPointer, true);
    document.addEventListener("keydown", handleSoundKey, true);
    document.addEventListener("submit", handleSubmitFallback, true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindLoginSoundTriggers, { once: true });
  } else {
    bindLoginSoundTriggers();
  }

  Object.assign(window.Econovaria.ui, {
    playLoginActionSound
  });

  window.playLoginActionSound = playLoginActionSound;
})();
