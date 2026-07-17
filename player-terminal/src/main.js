import { createPlayerTerminal } from "./app.js";
import { resolvePlayerTerminalConfig } from "./config/player-terminal.config.js";
import { installFormDraftPreserver } from "./forms/form-draft-preserver.js";

const mount = document.getElementById("playerTerminal");
const config = resolvePlayerTerminalConfig();
const formDrafts = installFormDraftPreserver(mount, {
  sessionReadyEvent: config.sessionReadyEvent,
  sessionInvalidEvent: config.sessionInvalidEvent
});

const terminal = createPlayerTerminal({ mount, config });
const destroyTerminal = terminal.destroy.bind(terminal);
terminal.destroy = () => {
  formDrafts.destroy();
  destroyTerminal();
};

globalThis.Econovaria = globalThis.Econovaria || {};
globalThis.Econovaria.playerTerminal = terminal;
