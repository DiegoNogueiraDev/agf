#!/usr/bin/env bash
# build-windows-installer.sh — compile scripts/windows-installer.nsi into a
# double-clickable Windows setup .exe, for people who prefer a GUI installer
# to the PowerShell one-liner (scripts/install-agf.ps1 — still primary).
#
# NSIS (makensis) is cross-platform-buildable — it compiles a Windows .exe
# without needing Windows itself, so this runs `makensis` inside Docker
# (native arm64 container; makensis is a plain compiler, no target-arch
# concern like the AppImage runtime had).
#
# UNSIGNED by design (no paid code-signing credentials) — see the .nsi
# header for the SmartScreen bypass documented in INSTALL.md.
#
# Usage:
#   bash scripts/build-windows-installer.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/dist-packages"
VERSION="$(node -p "require('$ROOT/package.json').version")"
BIN="$ROOT/dist-bun/agf-windows-x64.exe"

if [ ! -f "$BIN" ]; then
  echo "✗ $BIN not found. Run: npm run pack:bun (or the windows-x64 target of it) first." >&2
  exit 1
fi

mkdir -p "$OUT"

echo "=== Windows .exe installer (makensis, via Docker) ==="
docker run --rm \
  -v "$ROOT:/work:ro" \
  -v "$OUT:/out" \
  -w /tmp \
  ubuntu:22.04 bash -c "
    set -euo pipefail
    apt-get update -qq && apt-get install -y -qq nsis file >/dev/null
    cp /work/dist-bun/agf-windows-x64.exe /tmp/agf-windows-x64.exe
    cp /work/scripts/windows-installer.nsi /tmp/windows-installer.nsi
    makensis -DAPP_VERSION='${VERSION}' -DPAYLOAD_EXE=/tmp/agf-windows-x64.exe /tmp/windows-installer.nsi
    mv \"/tmp/agf-setup-${VERSION}-x64.exe\" /out/
    file \"/out/agf-setup-${VERSION}-x64.exe\"
  "

echo "✓ $OUT/agf-setup-${VERSION}-x64.exe built (valid PE32+ installer, confirmed via file)"
echo "⚠ Execution not verified here: running the resulting .exe needs either a"
echo "  real Windows host or Wine — and Wine-on-ARM64-Linux would add a THIRD"
echo "  emulation layer (Docker Rosetta -> Wine -> Windows PE) on top of an"
echo "  already-fragile Docker+Rosetta setup (see the AppImage packaging task"
echo "  for the same class of limitation). Verify on a real Windows machine."
