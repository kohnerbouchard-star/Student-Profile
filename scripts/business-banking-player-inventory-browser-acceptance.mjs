#!/usr/bin/env node

import { runConnectedPlayerBffAcceptance } from "./connected-player-bff-acceptance-loader.mjs";

await runConnectedPlayerBffAcceptance(import.meta.url);
