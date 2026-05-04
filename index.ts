#!/usr/bin/env bun

import { startTui } from "./src/tui";
import { defaultLogsDir, defaultSessionDir } from "./src/usage";

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`copilot-tokens

Usage:
  bun run start [--logs-dir PATH] [--session-dir PATH] [--refresh-ms N]

Keys:
  s  settings modal
  r  refresh now
  q  quit

Defaults:
  logs:     ${defaultLogsDir()}
  sessions: ${defaultSessionDir()}
`);
  process.exit(0);
}

startTui({
  logsDir: args.logsDir,
  sessionDir: args.sessionDir,
  refreshMs: args.refreshMs,
});

function parseArgs(argv: string[]) {
  const parsed: {
    help?: boolean;
    logsDir?: string;
    sessionDir?: string;
    refreshMs?: number;
  } = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") parsed.help = true;
    if (arg === "--logs-dir") parsed.logsDir = argv[++index];
    if (arg === "--session-dir") parsed.sessionDir = argv[++index];
    if (arg === "--refresh-ms") parsed.refreshMs = Number(argv[++index]);
  }

  return parsed;
}
