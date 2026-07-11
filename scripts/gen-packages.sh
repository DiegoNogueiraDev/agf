#!/usr/bin/env bash
# gen-packages.sh — generate offline bundles for every cross-compilable target
# (everything except darwin-arm64, which is native to the self-hosted release
# runner and produced separately via `bun run pack:offline`, no flags).
#
# Uses prebuilt better-sqlite3 binaries from GitHub Releases (no Docker, no VM needed).
# Requires: curl, tar, node, npm (already present in any dev environment).
#
# Usage:
#   bash scripts/gen-packages.sh                # all cross-compile targets
#   bash scripts/gen-packages.sh linux-x64      # one target
#   bash scripts/gen-packages.sh linux-arm64
#   bash scripts/gen-packages.sh darwin-x64
#   bash scripts/gen-packages.sh win32-x64
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/dist-offline"
mkdir -p "$OUT"

TARGET="${1:-all}"

build_target() {
  local platform="$1" arch="$2"
  echo ""
  echo "=== ${platform}-${arch} (prebuilt binary injection) ==="
  node "$ROOT/scripts/pack-offline.mjs" --target-platform "$platform" --target-arch "$arch"
  echo "✓ ${platform}-${arch} bundle ready:"
  ls -lh "$OUT"/agf-offline-"${platform}"-"${arch}"-*.tgz
}

case "$TARGET" in
  linux-x64)    build_target linux x64 ;;
  linux-arm64)  build_target linux arm64 ;;
  darwin-x64)   build_target darwin x64 ;;
  win32-x64)    build_target win32 x64 ;;
  all)
    build_target linux x64
    build_target linux arm64
    build_target darwin x64
    build_target win32 x64
    ;;
  *)
    echo "Usage: $0 [all|linux-x64|linux-arm64|darwin-x64|win32-x64]" >&2
    echo ""
    echo "  all          — every cross-compile target (linux x64/arm64, darwin x64, win32 x64)"
    echo "  linux-x64    — Linux Intel/AMD only"
    echo "  linux-arm64  — Linux ARM64 only"
    echo "  darwin-x64   — macOS Intel only"
    echo "  win32-x64    — Windows x64 only"
    echo ""
    echo "darwin-arm64 is NOT cross-compiled here — it's native to the release"
    echo "runner, produced via \`bun run pack:offline\` (no flags)."
    exit 1
    ;;
esac

echo ""
echo "All done. Bundles in dist-offline/:"
ls -lh "$OUT"/agf-offline-*.tgz
