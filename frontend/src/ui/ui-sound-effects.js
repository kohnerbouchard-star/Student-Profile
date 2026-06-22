window.Econovaria = window.Econovaria || {};
window.Econovaria.ui = window.Econovaria.ui || {};

(function initUiSoundEffects() {
  const LOGIN_ACTION_SOUND_SRC = "";
  const LOGIN_ACTION_VOLUME = 0.46;
  let loginActionAudio = null;

  function getLoginActionAudio() {
    if (!LOGIN_ACTION_SOUND_SRC) return null;

    if (!loginActionAudio) {
      loginActionAudio = new Audio(LOGIN_ACTION_SOUND_SRC);
      loginActionAudio.preload = "auto";
      loginActionAudio.volume = LOGIN_ACTION_VOLUME;
    }

    return loginActionAudio;
  }

  function playLoginActionSound() {
    const audio = getLoginActionAudio();
    if (!audio) return;

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

  Object.assign(window.Econovaria.ui, {
    playLoginActionSound
  });

  window.playLoginActionSound = playLoginActionSound;
})();
