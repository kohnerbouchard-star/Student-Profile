import { createPlayerTerminal } from "./app.js";
import { resolvePlayerTerminalConfig } from "./config/player-terminal.config.js";

const mount = document.getElementById("playerTerminal");
const config = resolvePlayerTerminalConfig();

const terminal = createPlayerTerminal({ mount, config });

globalThis.Econovaria = globalThis.Econovaria || {};
globalThis.Econovaria.playerTerminal = terminal;
