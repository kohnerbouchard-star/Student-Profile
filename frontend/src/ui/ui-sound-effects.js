window.Econovaria = window.Econovaria || {};
window.Econovaria.ui = window.Econovaria.ui || {};

(function initUiSoundEffects() {
  const LOGIN_ACTION_SOUND_URL = "frontend/src/ui/sounds/login-action.mp3?v=20260622-loginsfx1";
  const LOGIN_ACTION_VOLUME = 0.46;
  let loginActionAudio = null;

  function getLoginActionAudio() {
    if (!loginActionAudio) {
      loginActionAudio = new Audio(LOGIN_ACTION_SOUND_URL);
      loginActionAudio.preload = "auto";
      loginActionAudio.volume = LOGIN_ACTION_VOLUME;
    }

    return loginActionAudio;
  }

  function playLoginActionSound() {
    const audio = getLoginActionAudio();

    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = LOGIN_ACTION_VOLUME;
      const playResult = audio.play();

      if (playResult && typeof playResult.catch === "function") {
        playResult.catch(() => {});
      }
    } catch (_) {}
  }

  function hasValue(id) {
    return Boolean(document.getElementById(id)?.value?.trim());
  }

  function isCreateGameReady() {
    const email = document.getElementById("createEmail")?.value.trim() || "";
    const password = document.getElementById("createAccessCode")?.value || "";
    const confirmPassword = document.getElementById("confirmAccessCode")?.value || "";
    const difficulty = document.getElementById("difficultyLevel")?.value || "";

    return (
      hasValue("licenseCode") &&
      hasValue("createEmail") &&
      hasValue("sessionName") &&
      ["easy", "moderate", "hard", "insane"].includes(difficulty) &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
      password.length >= 8 &&
      password === confirmPassword
    );
  }

  function shouldPlayForSubmit(form) {
    if (form?.id === "playerForm") {
      return hasValue("gameCode") && hasValue("playerId");
    }

    if (form?.id === "createForm") {
      return isCreateGameReady();
    }

    return false;
  }

  function bindLoginSoundTriggers() {
    if (document.documentElement.dataset.loginActionSoundBound === "true") return;
    document.documentElement.dataset.loginActionSoundBound = "true";

    document.addEventListener("submit", (event) => {
      if (shouldPlayForSubmit(event.target)) {
        playLoginActionSound();
      }
    }, true);

    document.addEventListener("click", (event) => {
      const gameRow = event.target?.closest?.("#adminGameList .game-row");
      if (gameRow && !gameRow.disabled) {
        playLoginActionSound();
      }
    }, true);
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
