#!/usr/bin/env node

import { runConnectedPlayerBffAcceptance } from "./connected-player-bff-acceptance-loader.mjs";
import { restartLocalEdgeRuntime } from "./local-edge-runtime-isolation.mjs";

await restartLocalEdgeRuntime();
await runConnectedPlayerBffAcceptance(import.meta.url);
