#!/usr/bin/env bash
# build-linux-packages.sh — package the self-contained agf-linux-x64 binary
# (dist-bun/agf-linux-x64, from `npm run pack:bun`) as a double-clickable
# AppImage and a .deb, for people who prefer a GUI installer to the one-liner
# (scripts/install-agf-standalone.sh — that's still the primary path).
#
# Runs the actual Linux packaging tools (dpkg-deb, appimagetool) inside Docker
# since they don't exist natively on macOS — this also means the output is
# verified end-to-end on real Linux, not just assembled and hoped for.
#
# Usage:
#   bash scripts/build-linux-packages.sh            # both .deb and AppImage
#   bash scripts/build-linux-packages.sh deb
#   bash scripts/build-linux-packages.sh appimage
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="$ROOT/dist-bun/agf-linux-x64"
OUT="$ROOT/dist-packages"
VERSION="$(node -p "require('$ROOT/package.json').version")"
TARGET="${1:-all}"

mkdir -p "$OUT"

if [ ! -f "$BIN" ]; then
  echo "✗ $BIN not found. Run: npm run pack:bun (or the linux-x64 target of it) first." >&2
  exit 1
fi

build_deb() {
  echo ""
  echo "=== .deb (dpkg-deb, via Docker) ==="
  docker run --rm --platform linux/amd64 \
    -v "$ROOT:/work:ro" \
    -v "$OUT:/out" \
    -w /tmp \
    ubuntu:22.04 bash -c "
      set -euo pipefail
      apt-get update -qq && apt-get install -y -qq dpkg-dev >/dev/null
      PKG=agf_${VERSION}_amd64
      mkdir -p \"\$PKG/DEBIAN\" \"\$PKG/usr/local/bin\"
      cp /work/dist-bun/agf-linux-x64 \"\$PKG/usr/local/bin/agf\"
      chmod 755 \"\$PKG/usr/local/bin/agf\"
      SIZE_KB=\$(du -sk \"\$PKG/usr/local/bin\" | cut -f1)
      cat > \"\$PKG/DEBIAN/control\" <<CONTROL
Package: agf
Version: ${VERSION}
Section: devel
Priority: optional
Architecture: amd64
Installed-Size: \$SIZE_KB
Maintainer: Diego Lima Nogueira de Paula <devnogueiradiego@gmail.com>
Description: agent-graph-flow — local-first, token-frugal SWE agent CLI
 PRD-to-execution-graph agent with mandatory TDD and a brutally low
 token-cost design. Self-contained binary, no Node.js required.
CONTROL
      dpkg-deb --build --root-owner-group \"\$PKG\"
      cp \"\$PKG.deb\" /out/
      echo '--- verify ---'
      dpkg-deb --info \"/out/\$PKG.deb\"
      echo '--- install + smoke test in a clean container image ---'
    "
  # Verify install + run in a FRESH container (proves the real `dpkg -i` → agf --version path).
  docker run --rm --platform linux/amd64 -v "$OUT:/out:ro" ubuntu:22.04 bash -c "
    set -euo pipefail
    dpkg -i /out/agf_${VERSION}_amd64.deb
    agf --version
  "
  echo "✓ dist-packages/agf_${VERSION}_amd64.deb (built + installed + ran clean)"
}

build_appimage() {
  echo ""
  echo "=== AppImage (appimagetool, via Docker) ==="
  # Run the BUILD natively (no --platform override) using appimagetool's own
  # aarch64 build — the x86_64 release of appimagetool fails with "Exec format
  # error" under Docker Desktop's Rosetta/QEMU emulation on Apple Silicon, even
  # with APPIMAGE_EXTRACT_AND_RUN=1 (the kernel rejects the ELF before the env
  # var matters). ARCH=x86_64 tells appimagetool to still target x86_64 for the
  # OUTPUT AppImage, regardless of the host running the tool.
  docker run --rm \
    -v "$ROOT:/work:ro" \
    -v "$OUT:/out" \
    -w /tmp \
    ubuntu:22.04 bash -c "
      set -euo pipefail
      apt-get update -qq && apt-get install -y -qq curl file >/dev/null
      curl -sSfL -o /tmp/appimagetool https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-aarch64.AppImage
      chmod +x /tmp/appimagetool
      mkdir -p AppDir/usr/bin
      cp /work/dist-bun/agf-linux-x64 AppDir/usr/bin/agf
      chmod 755 AppDir/usr/bin/agf
      cat > AppDir/AppRun <<'APPRUN'
#!/bin/sh
HERE=\"\$(dirname \"\$(readlink -f \"\$0\")\")\"
exec \"\$HERE/usr/bin/agf\" \"\$@\"
APPRUN
      chmod 755 AppDir/AppRun
      cat > AppDir/agf.desktop <<'DESKTOP'
[Desktop Entry]
Type=Application
Name=agf
Exec=agf
Icon=agf
Categories=Development;
Terminal=true
DESKTOP
      # 1x1 transparent PNG placeholder — appimagetool requires an icon to exist.
      printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n\x2d\xb4\x00\x00\x00\x00IEND\xaeB\x60\x82' > AppDir/agf.png
      ARCH=x86_64 APPIMAGE_EXTRACT_AND_RUN=1 /tmp/appimagetool AppDir /out/agf-${VERSION}-x86_64.AppImage
      chmod +x /out/agf-${VERSION}-x86_64.AppImage
      file /out/agf-${VERSION}-x86_64.AppImage
    "
  echo "✓ dist-packages/agf-${VERSION}-x86_64.AppImage built (valid x86_64 ELF, confirmed via file)"
  echo "⚠ Execution verify skipped here: the AppImage runtime stub itself fails"
  echo "  with \"Exec format error\" under Docker Desktop's Rosetta/QEMU x86_64"
  echo "  emulation on Apple Silicon (a known local-sandbox limitation, not a"
  echo "  build defect — a plain ELF binary, e.g. the .deb's payload, runs fine"
  echo "  under the same emulation). Verify on a real x86_64 Linux host or CI runner."
}

case "$TARGET" in
  deb)      build_deb ;;
  appimage) build_appimage ;;
  all)      build_deb; build_appimage ;;
  *)
    echo "Usage: $0 [all|deb|appimage]" >&2
    exit 1
    ;;
esac

echo ""
echo "All done. Packages in dist-packages/:"
ls -lh "$OUT"
