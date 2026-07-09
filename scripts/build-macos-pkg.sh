#!/usr/bin/env bash
# build-macos-pkg.sh — package the self-contained agf-darwin-<arch> binary as
# a double-clickable .pkg installer, for people who prefer a GUI installer to
# the curl|bash one-liner (scripts/install-agf-standalone.sh — still primary).
#
# UNSIGNED by design (no paid Apple Developer credentials) — Gatekeeper shows
# "unidentified developer" on first open; the workaround is documented in
# INSTALL.md ("Opção 3" for macOS): right-click the .pkg → Open.
#
# Uses native macOS tools (pkgbuild, productbuild) — no Docker needed.
#
# Usage:
#   bash scripts/build-macos-pkg.sh            # arm64 (default, this Mac's arch)
#   bash scripts/build-macos-pkg.sh arm64
#   bash scripts/build-macos-pkg.sh x64
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/dist-packages"
VERSION="$(node -p "require('$ROOT/package.json').version")"
ARCH="${1:-arm64}"

case "$ARCH" in
  arm64) BIN="$ROOT/dist-bun/agf-darwin-arm64" ;;
  x64) BIN="$ROOT/dist-bun/agf-darwin-x64" ;;
  *)
    echo "Usage: $0 [arm64|x64]" >&2
    exit 1
    ;;
esac

if [ ! -f "$BIN" ]; then
  echo "✗ $BIN not found. Run: npm run pack:bun (or the darwin-$ARCH target of it) first." >&2
  exit 1
fi

mkdir -p "$OUT"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

echo "=== .pkg for macOS $ARCH (pkgbuild + productbuild) ==="

mkdir -p "$STAGE/root/usr/local/bin"
cp "$BIN" "$STAGE/root/usr/local/bin/agf"
chmod 755 "$STAGE/root/usr/local/bin/agf"

COMPONENT_PKG="$STAGE/agf-component.pkg"
pkgbuild \
  --root "$STAGE/root" \
  --identifier "cloud.graph-flow.agf" \
  --version "$VERSION" \
  --install-location "/" \
  "$COMPONENT_PKG"

PKG_NAME="agf-${VERSION}-darwin-${ARCH}.pkg"
DIST_XML="$STAGE/distribution.xml"
cat > "$DIST_XML" <<XML
<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="1">
    <title>agent-graph-flow (agf)</title>
    <options customize="never" require-scripts="false"/>
    <choices-outline>
        <line choice="default">
            <line choice="cloud.graph-flow.agf"/>
        </line>
    </choices-outline>
    <choice id="default"/>
    <choice id="cloud.graph-flow.agf" visible="false">
        <pkg-ref id="cloud.graph-flow.agf"/>
    </choice>
    <pkg-ref id="cloud.graph-flow.agf" version="${VERSION}" onConclusion="none">agf-component.pkg</pkg-ref>
</installer-gui-script>
XML

productbuild \
  --distribution "$DIST_XML" \
  --package-path "$STAGE" \
  "$OUT/$PKG_NAME"

echo "✓ $OUT/$PKG_NAME"
