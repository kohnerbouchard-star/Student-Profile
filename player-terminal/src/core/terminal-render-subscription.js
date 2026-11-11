// Live connection metadata has its own subscribed presenter. Replacing the
// shell for that update would detach focused controls after receipt dismissal.
// Any other field, including newly introduced fields, still requires a render.
function onlyLiveChanged(previous, next) {
  if (Object.is(previous.live, next.live)) return false;
  const previousKeys = Reflect.ownKeys(previous).filter((key) => key !== "live");
  const nextKeys = Reflect.ownKeys(next).filter((key) => key !== "live");
  return previousKeys.length === nextKeys.length && nextKeys.every((key) =>
    Object.hasOwn(previous, key) && Object.is(previous[key], next[key])
  );
}

export function subscribeTerminalRender(store, render) {
  let previous = store.getState();
  return store.subscribe((state) => {
    const liveOnly = onlyLiveChanged(previous, state);
    previous = state;
    if (!liveOnly) render();
  });
}
