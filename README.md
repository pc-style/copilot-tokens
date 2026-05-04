# copilot-tokens

TypeScript/Bun TUI for watching GitHub Copilot CLI process logs and counting session token usage in real time.

It is based on the log parsing approach from ekroon's Copilot token cost gist:
https://gist.github.com/ekroon/424b81ebca907b5e5de3ce07a649da5e

## Run

Install the `copilot-tokens` command:

```bash
curl -fsSL https://raw.githubusercontent.com/pc-style/copilot-tokens/main/install.sh | bash
```

Then run:

```bash
copilot-tokens
```

Or run from a local checkout:

```bash
bun install
bun run start
```

Defaults:

- Logs: `~/.copilot/logs`
- Session state: `~/.copilot/session-state`
- Refresh: `1500ms`

Override paths when testing or reading logs from another machine:

```bash
bun run start --logs-dir /path/to/logs --session-dir /path/to/session-state --refresh-ms 1000
```

## Keys

- `s`: open settings modal
- `space` / `enter`: toggle the selected section in settings
- `esc`: close settings
- `r`: refresh now
- `q`: quit

## Sections

- Summary
- By Model
- By Day
- By Project
- Recent Calls
- Pricing
