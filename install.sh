#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${COPILOT_TOKENS_REPO_URL:-https://github.com/pc-style/copilot-tokens.git}"
INSTALL_DIR="${COPILOT_TOKENS_INSTALL_DIR:-$HOME/.local/share/copilot-tokens}"
BIN_DIR="${COPILOT_TOKENS_BIN_DIR:-$HOME/.local/bin}"
BIN_PATH="$BIN_DIR/copilot-tokens"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: $1 is required." >&2
    exit 1
  fi
}

need git
need bun

mkdir -p "$BIN_DIR"

if [ -d "$INSTALL_DIR/.git" ]; then
  echo "Updating copilot-tokens in $INSTALL_DIR"
  git -C "$INSTALL_DIR" pull --ff-only
else
  if [ -e "$INSTALL_DIR" ]; then
    echo "Error: $INSTALL_DIR exists but is not a git checkout." >&2
    echo "Move it away or set COPILOT_TOKENS_INSTALL_DIR to another path." >&2
    exit 1
  fi
  echo "Installing copilot-tokens to $INSTALL_DIR"
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
bun install --frozen-lockfile

cat >"$BIN_PATH" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "$INSTALL_DIR"
exec bun run index.ts "\$@"
EOF

chmod +x "$BIN_PATH"

echo "Installed copilot-tokens to $BIN_PATH"
if ! command -v copilot-tokens >/dev/null 2>&1; then
  echo "Add this to your shell profile if needed:"
  echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
fi
