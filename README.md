# copilot-tokens

> [!WARNING]
> **Superseded. Development has moved to
> [`pc-style/copilot-token-counter`](https://github.com/pc-style/copilot-token-counter),
> the canonical successor.** Treat this repository as a read-only record of the
> alternate process-log implementation.

## Problem and solution

This experiment watches local GitHub Copilot CLI process logs and presents parsed
token usage in a TypeScript/Bun terminal UI. It combines log-derived usage with
session workspace files to group activity by model, day, and project.

Use the canonical repository for installation and future changes. This superseded
implementation is retained because it has several distinct ideas: custom data-path
flags, configurable refresh timing, recent-call output, section visibility settings,
and a tested process-log parser.

## Demo

This repository does not include a screenshot or hosted demo. The interface provides
Summary, By Model, By Day, By Project, Recent Calls, and optional Pricing sections.

## Historical local use

Requires [Bun](https://bun.sh). From a checkout:

```sh
bun install --frozen-lockfile
bun run check
bun test
bun run start
```

Defaults:

- Logs: `~/.copilot/logs`
- Session state: `~/.copilot/session-state`
- Refresh: `1500ms`

Paths and refresh timing can be overridden:

```sh
bun run start --logs-dir /path/to/logs --session-dir /path/to/session-state --refresh-ms 1000
```

The historical `install.sh` still exists for reproducibility, but it installs this
superseded implementation. New users should install from the canonical repository.

## Trust and privacy

- The TUI reads local Copilot process logs and session workspace files.
- The application contains no telemetry or session-data upload code.
- Process logs may contain more than token metrics. The parser reads each matching
  log file in full, while the UI displays parsed models, timestamps, filenames,
  workspace paths, and usage values. Take care when sharing output.
- Dependency installation contacts the configured package registry. The historical
  installer also contacts GitHub.
- Cost figures are estimates based on the static February 2026 pricing snapshot,
  not Copilot billing statements.

## Status

Superseded and intended to be read-only as of August 2026. GitHub's archive setting
has not yet been enabled. No fixes, compatibility updates, or price updates are
planned in this repository. Its source and Git history remain available for
reference; use
[`pc-style/copilot-token-counter`](https://github.com/pc-style/copilot-token-counter)
for the canonical project.

## License

This repository has no license file or license grant. Copyright remains with its
owner; public source availability does not by itself grant permission to copy,
modify, or redistribute the code. The canonical successor is available under MIT.

## Provenance and relationship

Created on May 4, 2026 as an alternate implementation after
`copilot-token-counter`, this code uses the log-parsing approach from
[ekroon's Copilot token cost gist](https://gist.github.com/ekroon/424b81ebca907b5e5de3ce07a649da5e).

The canonical project instead tails structured
`~/.copilot/session-state/*/events.jsonl` data and uses OpenTUI. It does not currently
include this repository's process-log input, path/refresh flags, recent-call panel,
or settings modal. Retaining this repository preserves those unique implementation
ideas while the banner directs users to the single canonical project.

## Keys

- `s`: open settings modal
- `space` / `enter`: toggle the selected section in settings
- `esc`: close settings
- `r`: refresh now
- `q`: quit
