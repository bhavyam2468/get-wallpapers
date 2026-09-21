#!/usr/bin/env bash
# wallgrab installer — Linux & macOS. No npm, no git, no package manager.
#
#   curl -fsSL https://raw.githubusercontent.com/bhavyam2468/get-wallpapers/main/install.sh | bash
#
# Options:
#   PREFIX=/usr/local   install system-wide (may need sudo)
#   PREFIX=~/.local     user install (default)

set -euo pipefail

RAW="https://raw.githubusercontent.com/bhavyam2468/get-wallpapers/main/wallgrab.mjs"
PREFIX="${PREFIX:-$HOME/.local}"
BIN="$PREFIX/bin"
# Node picks the module type from the file extension: no .mjs means CommonJS,
# and the bundle uses ESM import. So the real file keeps its extension and
# `wallgrab` is a symlink to it (Node resolves the realpath, so this works).
TARGET="$BIN/wallgrab.mjs"
LINK="$BIN/wallgrab"

say()  { printf '\033[38;2;0;198;255m▸\033[0m %s\n' "$*"; }
ok()   { printf '\033[32m✓\033[0m %s\n' "$*"; }
die()  { printf '\033[41;1;37m ✖ \033[0m %s\n' "$*" >&2; exit 1; }

# ── node ────────────────────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  die "Node.js is required (18 or newer). Install it first:
    macOS    brew install node
    Debian   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs
    Fedora   sudo dnf install nodejs
    Arch     sudo pacman -S nodejs
    Windows  winget install OpenJS.NodeJS.LTS"
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  die "Node $NODE_MAJOR is too old — wallgrab needs 18 or newer."
fi
ok "Node $(node -v)"

# ── fetcher ─────────────────────────────────────────────────────────────
if command -v curl >/dev/null 2>&1; then
  FETCH="curl -fsSL"
elif command -v wget >/dev/null 2>&1; then
  FETCH="wget -qO-"
else
  die "need curl or wget to download wallgrab"
fi

# ── install ─────────────────────────────────────────────────────────────
mkdir -p "$BIN" || die "cannot create $BIN (try PREFIX=\$HOME/.local)"

say "downloading wallgrab.mjs"
# mktemp -d, not mktemp: the file MUST end in .mjs or Node reads it as CommonJS
TMPDIR_W="$(mktemp -d)" || die "cannot create a temporary directory"
trap 'rm -rf "$TMPDIR_W"' EXIT
TMP="$TMPDIR_W/wallgrab.mjs"
$FETCH "$RAW" > "$TMP" || die "download failed — is the repo public?"

# sanity: refuse to install an error page
head -c 200 "$TMP" | grep -qi '<!doctype\|<html\|404: Not Found' &&
  die "got HTML instead of the script — the repo may not be pushed yet"

# real gate: the downloaded file must actually run
node "$TMP" --version >/dev/null 2>&1 ||
  die "downloaded file does not execute — refusing to install"
ok "verified: $(node "$TMP" --version 2>/dev/null | head -1)"

install -m 0755 "$TMP" "$TARGET" 2>/dev/null || { cp "$TMP" "$TARGET"; chmod 0755 "$TARGET"; }
ln -sf "$TARGET" "$LINK" 2>/dev/null || cp "$TARGET" "$LINK"
chmod 0755 "$LINK" 2>/dev/null || true
ok "installed → $TARGET"
ok "on PATH as → wallgrab"

# ── PATH ────────────────────────────────────────────────────────────────
case ":$PATH:" in
  *":$BIN:"*) ;;
  *)
    SHELL_RC="$HOME/.bashrc"
    [ -n "${ZSH_VERSION:-}" ] && SHELL_RC="$HOME/.zshrc"
    [ -f "$HOME/.zshrc" ] && SHELL_RC="$HOME/.zshrc"
    printf '\n%s is not on your PATH. Add this to %s:\n\n    export PATH="%s:$PATH"\n\n' \
      "$BIN" "$SHELL_RC" "$BIN"
    ;;
esac

printf '\n'
printf '\033[38;2;255;195;113m  wallgrab\033[0m            launch the editor\n'
printf '\033[38;2;255;195;113m  wallgrab --sources\033[0m    list all 11 sources\n'
printf '\033[38;2;255;195;113m  wallgrab --help\033[0m       every flag\n\n'
printf '  try it now: \033[2mwallgrab --source picsum --count 20 --yes\033[0m\n\n'
