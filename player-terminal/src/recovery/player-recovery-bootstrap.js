import {
  installPlayerRecoveryController,
  installPlayerRecoveryInstrumentation
} from "./player-recovery-controller.js";

function installRecoveryRuntime(runtime = globalThis) {
  const mount = runtime.document?.getElementById("playerTerminal");
  const terminal = runtime.Econovaria?.playerTerminal;
  if (!mount || !terminal) return false;

  const config = runtime.ECONOVARIA_PLAYER_TERMINAL_CONFIG || {};
  const instrumentation = installPlayerRecoveryInstrumentation({ runtime });
  const controller = installPlayerRecoveryController({ mount, terminal, config, runtime });
  const destroyTerminal = terminal.destroy.bind(terminal);
  let destroyed = false;

  terminal.destroy = () => {
    if (!destroyed) {
      destroyed = true;
      controller.destroy();
      instrumentation.destroy();
    }
    destroyTerminal();
  };
  return true;
}

if (!installRecoveryRuntime()) {
  globalThis.addEventListener?.("DOMContentLoaded", () => installRecoveryRuntime(), { once: true });
}
