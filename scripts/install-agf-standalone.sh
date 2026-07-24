#!/usr/bin/env bash
# install-agf-standalone.sh — the installer for the self-contained agf binary
# (macOS/Linux, zero Node required).
#
# Fetches the fixed-name agf-<os>-<arch> asset from GitHub Releases, verifies its
# SHA256, defensively strips the macOS quarantine attribute (com.apple.quarantine,
# which produces the Gatekeeper "unidentified developer" prompt) and puts the
# binary on your PATH.
#
# It is deliberately uninvasive:
#   * installs into $HOME/.local/bin — never /usr/local/bin, never sudo
#   * never edits your shell rc; it prints the export line and lets you decide
#   * refuses to install on a checksum mismatch
#   * sends nothing anywhere. The only request is the download itself.
#
# The download reaches the project's own release host, which therefore sees your
# IP — as any download would. It keeps no access log for /releases/ and stores no
# record of who installed what. Point AGF_RELEASES_BASE at a mirror if you would
# rather not take that on trust.
#
# Usage:
#   curl -fsSL https://graph-flow.cloud/install.sh | bash
#
# Read it first if you like — that URL is the source, not an opaque blob.
#
# Environment variables (optional):
#   AGF_RELEASES_BASE   override the releases base URL (used by tests)
#   AGF_INSTALL_DIR     override the install dir (default: $HOME/.local/bin)

set -euo pipefail

RELEASES_BASE="${AGF_RELEASES_BASE:-https://graph-flow.cloud/releases}"

OS_RAW="$(uname -s)"
case "$OS_RAW" in
  Darwin) OS='darwin' ;;
  Linux) OS='linux' ;;
  *)
    echo "✗ Unsupported OS: $OS_RAW (this installer covers macOS/Linux only)" >&2
    exit 1
    ;;
esac

ARCH_RAW="$(uname -m)"
case "$ARCH_RAW" in
  x86_64) ARCH='x64' ;;
  arm64 | aarch64) ARCH='arm64' ;;
  *)
    echo "✗ Unsupported architecture: $ARCH_RAW" >&2
    exit 1
    ;;
esac

ASSET_NAME="agf-${OS}-${ARCH}"

# A user-owned directory by default. Writing to /usr/local/bin would need sudo on
# most machines, and an installer that asks for root to drop one binary is asking
# for more than it needs.
INSTALL_DIR="${AGF_INSTALL_DIR:-$HOME/.local/bin}"
mkdir -p "$INSTALL_DIR"
TARGET_BIN="$INSTALL_DIR/agf"

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT
TMP_BIN="$TMPDIR/$ASSET_NAME"

echo "Downloading $ASSET_NAME..."
if ! curl -fsSL "$RELEASES_BASE/$ASSET_NAME" -o "$TMP_BIN"; then
  echo "✗ Failed to download $RELEASES_BASE/$ASSET_NAME" >&2
  exit 1
fi

echo "Verifying checksum..."
EXPECTED_HASH="$(curl -fsSL "$RELEASES_BASE/$ASSET_NAME.sha256" | awk '{print tolower($1)}')"
if command -v sha256sum >/dev/null 2>&1; then
  ACTUAL_HASH="$(sha256sum "$TMP_BIN" | awk '{print tolower($1)}')"
else
  ACTUAL_HASH="$(shasum -a 256 "$TMP_BIN" | awk '{print tolower($1)}')"
fi

if [ "$ACTUAL_HASH" != "$EXPECTED_HASH" ]; then
  echo "✗ Checksum mismatch: expected $EXPECTED_HASH, got $ACTUAL_HASH" >&2
  exit 1
fi

# Defensively drop the macOS quarantine attribute (Gatekeeper) — a plain curl
# download normally never gets it, but browsers/some downloaders do.
if [ "$OS" = 'darwin' ]; then
  xattr -rd com.apple.quarantine "$TMP_BIN" 2>/dev/null || true
fi

chmod +x "$TMP_BIN"
mv -f "$TMP_BIN" "$TARGET_BIN"

echo ""
echo "agf installed at $TARGET_BIN"
case ":$PATH:" in
  *":$INSTALL_DIR:"*) "$TARGET_BIN" --version ;;
  *)
    echo "⚠ $INSTALL_DIR is not on your PATH. Add it, e.g.:"
    echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
    ;;
esac
exit 0
