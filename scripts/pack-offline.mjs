#!/usr/bin/env node
/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * pack-offline.mjs — produce a self-contained, offline-installable npm tarball
 * for the CURRENT OS/arch, using the standard `npm pack`.
 *
 * Mechanism (npm-native, cross-platform because it's Node):
 *   1. `npm run build` → dist/
 *   2. stage package.json with `bundledDependencies` = runtime deps present in
 *      node_modules (so `npm pack` ships node_modules INSIDE the tarball,
 *      including the native binaries already compiled for THIS OS).
 *   3. `npm pack --ignore-scripts` → tarball with bundled deps.
 *   4. rename → dist-offline/agf-offline-<platform>-<arch>-<version>[-node<major>].tgz
 *      (the -node<major> tag appears only when --target-abi was requested; it is
 *      derived from that ABI so the name always matches the binary inside)
 *   5. emit install.mjs (cross-platform installer) + README-OFFLINE.md
 *
 * Install (any OS with Node, zero network):
 *   node dist-offline/install.mjs
 *   # or: npm install -g <tgz> --offline --ignore-scripts
 *
 * Native modules compile per-platform, so run this once PER target OS to get
 * that OS's bundle (better-sqlite3 / onnxruntime-node ship as compiled binaries).
 */

import { execSync } from 'node:child_process'
import {
  readFileSync,
  writeFileSync,
  copyFileSync,
  rmSync,
  existsSync,
  mkdirSync,
  renameSync,
  readdirSync,
  statSync,
  chmodSync,
} from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { acquirePackLock, releasePackLock } from './pack-offline-lock.mjs'
import { abiTagForAbi } from './node-abi.mjs'

const ROOT = process.cwd()
const PKG = join(ROOT, 'package.json')
const BACKUP = join(ROOT, '.package.json.pack-offline.bak')
const OUT = join(ROOT, 'dist-offline')

// Prevent two concurrent pack-offline runs from racing on the same
// node_modules/package.json (root cause of the better-sqlite3 offline
// tarball corruption). No wrapping function exists around this top-level
// script, so `process.on('exit', ...)` is the finally-equivalent: it fires
// on normal completion, a thrown error, or an explicit process.exit.
const LOCK_PATH = join(ROOT, '.pack-offline.lock')
acquirePackLock(LOCK_PATH)
process.on('exit', () => releasePackLock(LOCK_PATH))

// Cross-compile flags: node scripts/pack-offline.mjs --target-platform linux --target-arch x64 [--target-abi 137]
const argVal = (flag) => {
  const i = process.argv.indexOf(flag)
  return i !== -1 ? process.argv[i + 1] : null
}
const TARGET_PLATFORM = argVal('--target-platform')
const TARGET_ARCH = argVal('--target-arch')
const TARGET_ABI = argVal('--target-abi') ?? process.versions.modules
// An explicitly requested ABI means the caller is building for a Node line other
// than this host's, so the ABI MUST show up in the filename — otherwise two
// builds for different Node majors collide on the same name and the second
// silently overwrites the first. Derived from TARGET_ABI (never passed
// separately) so the label cannot disagree with the binary inside.
const ABI_TAG = argVal('--target-abi') !== null ? `-${abiTagForAbi(TARGET_ABI)}` : ''
const isCross = TARGET_PLATFORM !== null || TARGET_ARCH !== null

function sh(cmd) {
  console.log(`$ ${cmd}`)
  execSync(cmd, { stdio: 'inherit', cwd: ROOT })
}

/** node_modules path for a dep name (handles @scope/name). */
function depInstalled(name) {
  return existsSync(join(ROOT, 'node_modules', ...name.split('/')))
}

/**
 * `npm pack` filters EVERY bundledDependency by that dep's own package.json
 * `files` allowlist — it does not ship the whole node_modules subtree
 * verbatim. better-sqlite3's `files` (['binding.gyp','src/**\/*.[ch]pp',
 * 'lib/**','deps/**']) omits `build/Release/**`, so every offline .tgz ever
 * produced silently shipped WITHOUT the compiled native binary (confirmed via
 * a minimal npm-pack repro; see node_a8aff73b3be2). Temporarily widen the
 * dep's `files` list so the binary survives packing; caller restores after.
 */
function patchDepFilesToIncludeBuild(depName, buildGlob) {
  const depPkgPath = join(ROOT, 'node_modules', depName, 'package.json')
  const original = readFileSync(depPkgPath, 'utf8')
  const depPkg = JSON.parse(original)
  if (!Array.isArray(depPkg.files) || depPkg.files.includes(buildGlob)) {
    return null // no `files` allowlist, or already includes it — nothing to patch
  }
  writeFileSync(depPkgPath, JSON.stringify({ ...depPkg, files: [...depPkg.files, buildGlob] }, null, 2) + '\n')
  return { depPkgPath, original }
}

/** The cross-platform installer written next to the tarball. */
const INSTALL_MJS = `#!/usr/bin/env node
/* Offline installer — runs on any OS with Node. Installs the sibling
 * agf-offline-*.tgz globally with zero network (deps are bundled inside). */
import { readdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const tgz = readdirSync(here).find((f) => /^agf-offline-.*\\.tgz$/.test(f))
if (!tgz) {
  console.error('No agf-offline-*.tgz found next to install.mjs')
  process.exit(1)
}
console.log('Installing ' + tgz + ' globally (offline)...')
execSync('npm install -g "' + join(here, tgz) + '" --offline --ignore-scripts', { stdio: 'inherit' })
try {
  console.log('\\nSmoke: agf --help')
  execSync('agf --help', { stdio: 'inherit' })
} catch {
  console.log("\\n(agf installed — ensure npm's global bin dir is on PATH: run 'npm bin -g')")
}
`

/** Generate a platform-specific shell installer. Bundles ABI check and hints. */
function installShFor(nodePlatform, nodeArch) {
  const uname = { linux: 'Linux', darwin: 'Darwin' }[nodePlatform] ?? nodePlatform
  const machine = { x64: 'x86_64', arm64: 'arm64' }[nodeArch] ?? nodeArch
  const tgzGlob = `agf-offline-${nodePlatform}-${nodeArch}-*.tgz`

  const nodeHint =
    nodePlatform === 'darwin'
      ? 'brew install node   (or https://nodejs.org)'
      : 'See https://nodejs.org/en/download (apt/snap/nvm)'

  const abiRebuild =
    nodePlatform === 'darwin'
      ? `  if ! xcode-select -p >/dev/null 2>&1; then\n    echo "  Xcode Command Line Tools missing. Run: xcode-select --install" >&2\n  fi\n  npm install -g "$TGZ" --build-from-source`
      : `  echo "  Build tools needed: sudo apt-get install -y build-essential python3" >&2\n  npm install -g "$TGZ" --build-from-source`

  return `#!/usr/bin/env bash
# Offline installer for agent-graph-flow (\`agf\`). Bundle targets ${uname}/${machine}.
# Self-contained: deps bundled inside the sibling agf-offline-*.tgz.
set -euo pipefail
HERE="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"

# 1. Platform guard.
OS="$(uname -s)"; ARCH="$(uname -m)"
if [ "$OS" != "${uname}" ] || [ "$ARCH" != "${machine}" ]; then
  echo "✗ Bundle targets ${uname}/${machine}; got $OS/$ARCH." >&2
  echo "  Re-run \\\`npm run pack:offline\\\` on the matching OS/arch to produce its bundle." >&2
  exit 1
fi

# 2. Node >= 20 guard.
if ! command -v node >/dev/null 2>&1; then
  echo "✗ Node.js not found. Install Node >= 20: ${nodeHint}" >&2
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "✗ Node $(node -v) is too old. Need >= 20: ${nodeHint}" >&2
  exit 1
fi

# 3. Locate the tarball.
TGZ="$(ls "$HERE"/${tgzGlob} 2>/dev/null | head -n1 || true)"
if [ -z "$TGZ" ]; then
  echo "✗ No ${tgzGlob} found next to install.sh" >&2
  exit 1
fi

# 4. ABI check: the bundled better-sqlite3 binary is tied to the Node ABI it was built
#    against. Match → offline install (no rebuild). Mismatch → rebuild from source.
LOCAL_ABI="$(node -p 'process.versions.modules')"
BUNDLE_ABI=""
[ -f "$HERE/ABI" ] && BUNDLE_ABI="$(cat "$HERE/ABI" | tr -d '[:space:]')"

if [ -n "$BUNDLE_ABI" ] && [ "$LOCAL_ABI" != "$BUNDLE_ABI" ]; then
  echo "⚠ Node ABI mismatch (local=$LOCAL_ABI, bundle=$BUNDLE_ABI)."
  echo "  Rebuilding the native module from source (needs network + build tools)."
${abiRebuild}
else
  echo "Installing $(basename "$TGZ") globally (offline)..."
  npm install -g "$TGZ" --offline --ignore-scripts
fi

# 5. Smoke test.
if command -v agf >/dev/null 2>&1; then
  echo ""; echo "✓ Installed:"; agf --version || true
else
  echo ""; echo "✓ Installed, but \\\`agf\\\` is not on PATH yet."
  echo "  Add npm's global bin dir to PATH:  export PATH=\\"\\$(npm bin -g):\\$PATH\\""
fi
`
}

function readmeFor(name, platform, arch) {
  return `# Offline install — agent-graph-flow (\`agf\`)

Self-contained npm tarball for **${platform}-${arch}**. Installs with **zero network**
(all dependencies, incl. native binaries, are bundled inside via \`npm pack\` +
\`bundledDependencies\`).

## Install (offline)

\`\`\`bash
# macOS (recommended — guards arch/Node, checks native ABI, falls back to rebuild):
bash install.sh

# any OS with Node:
node install.mjs

# equivalente:
npm install -g ${name} --offline --ignore-scripts
\`\`\`

After install, the bins \`agf\`, \`agent-graph-flow\` and \`mcp-graph-agent\` are on your
PATH (npm writes the platform-correct shims: \`.cmd\`/\`.ps1\` on Windows, symlinks on POSIX).

\`\`\`bash
agf --help
\`\`\`

### Windows (PowerShell)

\`install.sh\` is bash-only — on Windows use the cross-platform Node installer (this bundle
must be the **win32-x64** one, built on a Windows runner):

\`\`\`powershell
# from the folder containing agf-offline-win32-x64-*.tgz + install.mjs:
node install.mjs
agf --help
agf doctor          # confirms better-sqlite3 loaded (ONNX may be 'degraded' — ok)
agf status          # Mode should read: delegated (delegated-cli:copilot) when driven by Copilot CLI
\`\`\`

No Visual Studio Build Tools needed: the native \`better-sqlite3\` is pre-compiled inside the
bundle for win32-x64. Keep your Node **major** matching the bundle's (see the \`ABI\` file) to
stay on the offline happy path (otherwise a rebuild — and build tools — would be required).

## Cross-platform

Native modules (\`better-sqlite3\`, \`onnxruntime-node\`) compile per-OS, so this bundle is
specific to **${platform}-${arch}**. To target another OS, run \`npm run pack:offline\` on
that OS to produce its bundle (e.g. \`agf-offline-win32-x64-*.tgz\`,
\`agf-offline-darwin-arm64-*.tgz\`).

## Notes

- \`--ignore-scripts\` keeps the pre-compiled native binary (no rebuild, no git/husky needed).
- The native \`better-sqlite3\` binary is tied to the Node ABI it was built against
  (see the \`ABI\` file). \`install.sh\` compares it to your Node and rebuilds from source
  on mismatch (needs network + Xcode CLT). To stay on the offline happy path, build this
  bundle under the same Node major your targets run (e.g. Node 22 LTS).
- Neural embeddings (\`onnxruntime-node\`, ~254 MB) are NOT bundled by default — enable
  them later with \`agf install-neural\` (needs network). The core \`agf\` graph/CLI works
  fully offline without them.
`
}

/**
 * Download the prebuilt better-sqlite3 binary for a target platform and return
 * the path to the extracted `.node` file (caller injects it — see
 * `injectSqliteBinaryIntoTarball`; do NOT swap it into node_modules: `npm pack`
 * does not read live node_modules content for a bundledDependencies package —
 * confirmed empirically, even a plain text marker written over the binary
 * survived on disk but never appeared in the packed tarball. See
 * node_a8aff73b3be2 for the full repro trail).
 */
function downloadPrebuiltSqlite(targetPlatform, targetArch, abi) {
  const sqlitePkg = JSON.parse(readFileSync(join(ROOT, 'node_modules/better-sqlite3/package.json'), 'utf8'))
  const version = sqlitePkg.version
  const fileName = `better-sqlite3-v${version}-node-v${abi}-${targetPlatform}-${targetArch}.tar.gz`
  const url = `https://github.com/WiseLibs/better-sqlite3/releases/download/v${version}/${fileName}`

  console.log(`\nDownloading prebuilt better-sqlite3 for ${targetPlatform}-${targetArch} (ABI ${abi})`)
  console.log(`  ${url}`)

  mkdirSync(OUT, { recursive: true })
  const tmpTar = join(OUT, `_prebuilt-${targetPlatform}-${targetArch}.tar.gz`)
  const tmpDir = join(OUT, `_prebuilt-${targetPlatform}-${targetArch}`)

  execSync(`curl -sSfL "${url}" -o "${tmpTar}"`, { stdio: 'inherit' })
  mkdirSync(tmpDir, { recursive: true })
  execSync(`tar xzf "${tmpTar}" -C "${tmpDir}"`)

  const nodeFile = execSync(`find "${tmpDir}" -name "*.node" | head -1`, { encoding: 'utf8' }).trim()
  if (!nodeFile) throw new Error(`No .node file found inside ${fileName}`)

  const extracted = join(OUT, `_sqlite3-${targetPlatform}-${targetArch}.node`)
  copyFileSync(nodeFile, extracted)
  rmSync(tmpTar, { force: true })
  rmSync(tmpDir, { recursive: true, force: true })

  return extracted // caller must delete after use
}

/**
 * Post-process an already-packed tarball: unpack, swap the better-sqlite3
 * binary for the target-platform one, re-pack with plain `tar`. This is the
 * only way to get a cross-platform binary into the bundle, since `npm pack`
 * ignores on-disk overrides for bundledDependencies content (see
 * `downloadPrebuiltSqlite` above).
 */
function injectSqliteBinaryIntoTarball(tgzPath, prebuiltNodePath) {
  const workDir = join(OUT, `_tarpatch-${Date.now()}`)
  const tmpOut = `${tgzPath}.repack-tmp`
  mkdirSync(workDir, { recursive: true })
  try {
    execSync(`tar xzf "${tgzPath}" -C "${workDir}"`)
    const targetNodeFile = join(workDir, 'package/node_modules/better-sqlite3/build/Release/better_sqlite3.node')
    mkdirSync(join(workDir, 'package/node_modules/better-sqlite3/build/Release'), { recursive: true })
    copyFileSync(prebuiltNodePath, targetNodeFile)
    // Write to a temp path (never the file we just read) then verify + swap in —
    // avoids ever truncating a tarball we might still be reading, and catches a
    // corrupt repack loud instead of shipping it.
    execSync(`tar czf "${tmpOut}" -C "${workDir}" package`)
    execSync(`gzip -t "${tmpOut}"`)
    renameSync(tmpOut, tgzPath)
  } finally {
    rmSync(workDir, { recursive: true, force: true })
    rmSync(tmpOut, { force: true })
  }
}

// ── main ──────────────────────────────────────────────────────────────────────

const pkg = JSON.parse(readFileSync(PKG, 'utf8'))
const { version } = pkg
const platform = TARGET_PLATFORM ?? process.platform // 'linux' | 'win32' | 'darwin'
const arch = TARGET_ARCH ?? process.arch // 'x64' | 'arm64'

console.log(`\n=== pack-offline: ${pkg.name}@${version} for ${platform}-${arch} ===\n`)

// 1. Build dist/
sh('npm run build')

// 2. Decide which deps to bundle (runtime + optional deps present in node_modules).
// onnxruntime-node (~254 MB) is excluded by default to keep the bundle lean — neural
// embeddings stay opt-in via `agf install-neural` (needs network). Re-include with
// `--with-neural` or `PACK_WITH_NEURAL=1`.
const WITH_NEURAL = process.argv.includes('--with-neural') || process.env.PACK_WITH_NEURAL === '1'
const EXCLUDE = WITH_NEURAL ? [] : ['onnxruntime-node']
const candidateDeps = [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.optionalDependencies || {})]
const bundled = candidateDeps.filter((d) => depInstalled(d) && !EXCLUDE.includes(d))
const missing = candidateDeps.filter((d) => !depInstalled(d) && !EXCLUDE.includes(d))
const excluded = candidateDeps.filter((d) => EXCLUDE.includes(d))

console.log(`\nBundling ${bundled.length} dep(s) into the tarball.`)
if (excluded.length > 0) {
  console.log(`◦ Excluded (lean bundle): ${excluded.join(', ')} — opt-in via \`agf install-neural\`.`)
  console.log('  Use `--with-neural` (or PACK_WITH_NEURAL=1) to include it.')
}
if (missing.length > 0) {
  console.log(`⚠ Not bundled (absent from node_modules): ${missing.join(', ')}`)
  console.log('  Run `npm install` first if you need them included.')
}

// 3. For a cross-target build, download the target's prebuilt binary now — it gets
// stitched into the tarball as a post-process step (step 3b) since npm pack ignores
// on-disk node_modules mutations for bundledDependencies content.
const prebuiltSqlitePath = isCross ? downloadPrebuiltSqlite(platform, arch, TARGET_ABI) : null

mkdirSync(OUT, { recursive: true })
const before = new Set(readdirSync(OUT).filter((f) => f.endsWith('.tgz')))
copyFileSync(PKG, BACKUP)
const sqliteFilesPatch = bundled.includes('better-sqlite3')
  ? patchDepFilesToIncludeBuild('better-sqlite3', 'build/Release/**')
  : null
try {
  const staged = { ...pkg, bundledDependencies: bundled }
  writeFileSync(PKG, JSON.stringify(staged, null, 2) + '\n')
  // --ignore-scripts: do not run `prepare`(husky) / native rebuilds during pack.
  sh(`npm pack --ignore-scripts --pack-destination "${OUT}"`)
} finally {
  copyFileSync(BACKUP, PKG)
  rmSync(BACKUP, { force: true })
  if (sqliteFilesPatch) {
    writeFileSync(sqliteFilesPatch.depPkgPath, sqliteFilesPatch.original)
  }
}

// 4. Identify the tarball just produced (newest .tgz that wasn't there before) and rename it.
const afterTgz = readdirSync(OUT).filter((f) => f.endsWith('.tgz'))
const fresh = afterTgz.filter((f) => !before.has(f) && !f.startsWith('agf-offline-'))
const candidate =
  fresh.length > 0
    ? fresh.sort((a, b) => statSync(join(OUT, b)).mtimeMs - statSync(join(OUT, a)).mtimeMs)[0]
    : afterTgz
        .filter((f) => !f.startsWith('agf-offline-'))
        .sort((a, b) => statSync(join(OUT, b)).mtimeMs - statSync(join(OUT, a)).mtimeMs)[0]
if (!candidate) throw new Error('npm pack produced no .tgz in dist-offline/')
const packedName = `agf-offline-${platform}-${arch}-${version}${ABI_TAG}.tgz`
renameSync(join(OUT, candidate), join(OUT, packedName))

// 3b. Cross-target build: stitch the correct-platform binary into the tarball.
if (prebuiltSqlitePath) {
  injectSqliteBinaryIntoTarball(join(OUT, packedName), prebuiltSqlitePath)
  rmSync(prebuiltSqlitePath, { force: true })
  console.log(`✓ Stitched ${platform}-${arch} better-sqlite3 binary into the tarball`)
}

// 5. Emit installers + README + the native ABI marker (consumed by install-<platform>-<arch>.sh).
// Named per-target — gen-packages.sh cross-compiles every target into the
// same dist-offline/ in one workflow run; a fixed "install.sh" would have
// each target's write silently overwrite the previous one, so only the last
// target built ever reached the release (node_4bb173755098).
const installShName = `install-${platform}-${arch}.sh`
writeFileSync(join(OUT, 'install.mjs'), INSTALL_MJS)
writeFileSync(join(OUT, installShName), installShFor(platform, arch))
chmodSync(join(OUT, installShName), 0o755)
// TARGET_ABI, not the host's: on a cross-build the bundled binary is compiled
// for the target, so writing process.versions.modules here made the marker
// describe the BUILD MACHINE. install.sh compares its Node against this value,
// so a wrong marker either warns spuriously or — worse — stays silent on a real
// mismatch, which is the exact failure this marker exists to catch.
writeFileSync(join(OUT, 'ABI'), `${TARGET_ABI}\n`)
writeFileSync(join(OUT, 'README-OFFLINE.md'), readmeFor(packedName, platform, arch))

// Checksum beside the tarball: install.ps1 verifies it before installing, and a
// truncated 166 MB download otherwise installs "successfully" and fails later.
// Computed AFTER the binary injection above — hashing before it would certify
// bytes that are not the ones shipped.
const tgzSha = createHash('sha256')
  .update(readFileSync(join(OUT, packedName)))
  .digest('hex')
writeFileSync(join(OUT, `${packedName}.sha256`), `${tgzSha}  ${packedName}\n`)

const sizeMB = (statSync(join(OUT, packedName)).size / 1024 / 1024).toFixed(1)
console.log(`\n✓ Offline bundle ready: dist-offline/${packedName} (${sizeMB} MB)`)
console.log(`  Install (macOS):    cd dist-offline && bash ${installShName}`)
console.log(`  Install (any OS):   node dist-offline/install.mjs`)
console.log(`  Or:                 npm install -g dist-offline/${packedName} --offline --ignore-scripts\n`)
