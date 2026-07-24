#!/usr/bin/env node
/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * pack-bun — build tamper-resistant, self-contained `agf` executables with Bun.
 *
 * `bun build --compile --minify` embeds the (minified) bundle + the Bun runtime
 * into one standalone binary per OS — no Node, no npm, no native `.node` on the
 * target. SQLite goes through `bun:sqlite` (built into the runtime via the
 * database-factory adapter), so Bun CROSS-COMPILES all three OSes from ONE host.
 *
 * Source protection: by default we bundle ENTRY to a single file (version baked
 * in), run it through javascript-obfuscator (MODERATE: string-array base64 +
 * hex identifier mangling, NO control-flow-flattening — that path is validated
 * to NOT change runtime behavior or measurably slow startup), then compile each
 * OS target from the obfuscated bundle. If bundling/obfuscation fails, we fall
 * back to a direct ENTRY compile so a build never breaks. When obfuscation is
 * off (`--no-obfuscate`), we attempt `--bytecode` and fall back to minify-only
 * (Bun can't generate bytecode for the full import.meta module graph). The
 * chosen mode is recorded in BUILDINFO so the artifact is honest about it.
 *
 * Usage:
 *   node scripts/pack-bun.mjs                 # all OS targets (default, obfuscated)
 *   node scripts/pack-bun.mjs --host          # only the current OS/arch
 *   node scripts/pack-bun.mjs --no-obfuscate  # skip obfuscation (bytecode/minify path)
 *   node scripts/pack-bun.mjs --no-bytecode   # (with --no-obfuscate) skip the bytecode attempt
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { signDarwinAdhoc } from './codesign-darwin.mjs'
import { ALL_TARGETS, hostTriple } from './bun-targets.mjs'
import { generate as genEmbeddedSpa, writeStub as stubEmbeddedSpa } from './gen-embedded-spa.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'dist-bun')
const argv = process.argv.slice(2)
const HOST_ONLY = argv.includes('--host')
const NO_BYTECODE = argv.includes('--no-bytecode')

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'))
const VERSION = pkg.version
const BUN_VERSION = execFileSync('bun', ['--version']).toString().trim()
const ENTRY = 'src/cli/index.ts'
const NO_OBFUSCATE = argv.includes('--no-obfuscate')
const OBF_BUNDLE = join(OUT, '.agf-obf-bundle.mjs')

/**
 * Bundle ENTRY once (version baked in BEFORE obfuscation — critical: defining
 * AGF_VERSION after string-array encoding would leave it un-encoded), then run
 * javascript-obfuscator with MODERATE settings: string-array (base64) +
 * hexadecimal identifier mangling, NO control-flow-flattening / dead-code /
 * self-defending (those measurably slow startup or risk breaking the runtime).
 * Returns the obfuscated bundle path, or null so the caller falls back to a
 * direct ENTRY compile — a broken obfuscation must never produce a release.
 */
function buildObfuscatedBundle() {
  if (NO_OBFUSCATE) return null
  const raw = join(OUT, '.agf-bundle.mjs')
  const b = spawnSync(
    'bun',
    [
      'build',
      ENTRY,
      '--target',
      'node',
      '--format',
      'esm',
      '--external',
      'onnxruntime-node',
      '--define',
      `process.env.AGF_VERSION="${VERSION}"`,
      '--outfile',
      raw,
    ],
    { cwd: ROOT, encoding: 'utf-8' },
  )
  if (b.status !== 0) {
    console.warn(`⚠ obfuscation bundle step failed — falling back to direct compile.\n${b.stderr ?? ''}`)
    return null
  }
  const o = spawnSync(
    'npx',
    [
      '--yes',
      'javascript-obfuscator',
      raw,
      '--output',
      OBF_BUNDLE,
      '--compact',
      'true',
      '--string-array',
      'true',
      '--string-array-encoding',
      'base64',
      '--string-array-threshold',
      '0.75',
      '--identifier-names-generator',
      'hexadecimal',
      '--control-flow-flattening',
      'false',
      '--dead-code-injection',
      'false',
      '--self-defending',
      'false',
      '--rename-globals',
      'false',
      '--unicode-escape-sequence',
      'false',
    ],
    { cwd: ROOT, encoding: 'utf-8', shell: process.platform === 'win32' },
  )
  if (o.status !== 0 || !existsSync(OBF_BUNDLE)) {
    console.warn(`⚠ javascript-obfuscator failed — falling back to direct compile.\n${o.stderr ?? ''}`)
    return null
  }
  return OBF_BUNDLE
}

const targets = HOST_ONLY ? ALL_TARGETS.filter((t) => t.triple === hostTriple()) : ALL_TARGETS

const isHost = (t) => t.triple === hostTriple()

/**
 * Run a bun compile; return true on a usable binary.
 * `source` is the obfuscated bundle (version already baked) or the raw ENTRY.
 * `--minify`/`--define` are only meaningful for the raw ENTRY path — an
 * obfuscated bundle is already minified and carries the baked version.
 */
function compile(target, withBytecode, source = ENTRY) {
  const outfile = join(OUT, target.out)
  const fromObf = source !== ENTRY
  const args = [
    'build',
    '--compile',
    '--minify',
    // onnxruntime-node is an OPTIONAL native dep (RAG neural embeddings) whose
    // dynamic `require('../bin/napi-v6/<os>/<arch>/...node')` can't be resolved
    // when cross-compiling a foreign target (e.g. darwin-x64 from Linux). Keep
    // it external — the standalone binary falls back to non-neural RAG.
    '--external',
    'onnxruntime-node',
    `--target=${target.triple}`,
    source,
    '--outfile',
    outfile,
  ]
  // Version is baked into the obfuscated bundle already; only inject for ENTRY.
  if (!fromObf) args.splice(args.length - 3, 0, '--define', `process.env.AGF_VERSION="${VERSION}"`)
  if (withBytecode) args.splice(3, 0, '--bytecode')
  const r = spawnSync('bun', args, { cwd: ROOT, encoding: 'utf-8' })
  const combined = `${r.stdout ?? ''}\n${r.stderr ?? ''}`
  if (r.status !== 0) return false
  // Bun prints "Failed to generate bytecode" to stderr but still exits 0 and
  // leaves a BROKEN binary — treat that as failure so we fall back to minify.
  if (withBytecode && /Failed to generate bytecode/i.test(combined)) return false
  // For the host target we can actually run it: confirm it boots and reports
  // the embedded version (a broken bytecode binary fails this).
  if (isHost(target)) {
    const v = spawnSync(outfile, ['--version'], { encoding: 'utf-8' })
    if (v.status !== 0 || !String(v.stdout).includes(VERSION)) return false
  }
  return true
}

function sha256(file) {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256')
    createReadStream(file)
      .on('data', (d) => h.update(d))
      .on('end', () => resolve(h.digest('hex')))
      .on('error', reject)
  })
}

const INSTALL_SH = `#!/usr/bin/env bash
# Self-contained agf installer (POSIX). Picks the binary for this OS/arch and
# puts it on PATH. No Node, no npm — the Bun runtime is embedded.
set -euo pipefail
HERE="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
# Pick by OS *and* arch — we now ship both Mac archs and both Linux archs.
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64)               BIN="agf-darwin-arm64" ;;
  Darwin-x86_64)              BIN="agf-darwin-x64" ;;
  Linux-x86_64)               BIN="agf-linux-x64" ;;
  Linux-aarch64|Linux-arm64)  BIN="agf-linux-arm64" ;;
  *) echo "Unsupported OS/arch: $(uname -s)-$(uname -m). On Windows, use the Windows installer from the project site." >&2; exit 1 ;;
esac
SRC="$HERE/$BIN"
[ -f "$SRC" ] || { echo "Missing $SRC" >&2; exit 1; }
DEST="\${1:-/usr/local/bin}"
if [ ! -w "$DEST" ]; then DEST="$HOME/.local/bin"; mkdir -p "$DEST"; fi
install -m 0755 "$SRC" "$DEST/agf"
echo "✓ installed agf → $DEST/agf"
"$DEST/agf" --version || true
echo "Ensure $DEST is on your PATH."
`

// No Windows installer ships here since v0.24.0: there is no `.exe` to install.
// Windows installs from an npm tarball on Node, via the installer published on
// the project site (which also deletes any `.exe` a pre-0.24.0 install left).
// Re-adding a PowerShell installer beside these binaries would advertise a
// channel that no longer has an artifact.

async function main() {
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })

  // Embed the full SPA into the binary: build the Vite dist if missing, then
  // generate embedded-spa-data.ts so the compiled binary serves Graph+Economy
  // (not the lite page). Restored to the empty stub in finally — see gen-embedded-spa.mjs.
  const spaIndex = join(ROOT, 'src', 'web', 'dashboard', 'dist', 'index.html')
  if (!existsSync(spaIndex)) {
    console.log('Building dashboard SPA (npm run dashboard:build)…')
    const b = spawnSync('npm', ['run', 'dashboard:build'], {
      cwd: ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })
    if (b.status !== 0) throw new Error('dashboard:build failed — cannot embed SPA into binary')
  }
  const embedded = genEmbeddedSpa()
  console.log(`Embedded ${embedded} SPA files into the binary.`)

  // Obfuscate once (version baked in), reuse the bundle for every OS target.
  const obf = buildObfuscatedBundle()
  console.log(
    obf ? '✓ obfuscated bundle ready — compiling all targets from it.' : 'Compiling targets directly (no obfuscation).',
  )

  const results = []
  for (const t of targets) {
    const source = obf ?? ENTRY
    let mode = obf ? 'minify+obfuscate' : 'minify'
    let ok = false
    if (obf) {
      // Obfuscated single-file bundle: bytecode is moot (import.meta graph) —
      // compile straight from it. The obfuscation IS the tamper resistance.
      ok = compile(t, false, source)
    } else {
      // Raw ENTRY path: try bytecode first, fall back to minify-only.
      mode = NO_BYTECODE ? 'minify' : 'minify+bytecode'
      ok = NO_BYTECODE ? compile(t, false, source) : compile(t, true, source)
      if (!ok) {
        mode = 'minify'
        ok = compile(t, false, source)
      }
    }
    if (!ok) {
      console.error(`✗ failed to build ${t.out}`)
      process.exitCode = 1
      continue
    }
    const file = join(OUT, t.out)
    // `bun --compile` invalidates the darwin ad-hoc signature (it appends the
    // bundle post-link), so re-sign BEFORE hashing — the checksum must cover
    // the final, signed bytes. No-ops for non-darwin / non-macOS hosts.
    const signed = signDarwinAdhoc(file, { targetOs: t.os, hostPlatform: process.platform })
    if (t.os === 'darwin' && !signed.applied) {
      console.warn(`⚠ ${t.out}: ad-hoc codesign skipped (${signed.reason}) — arm64 macOS may reject it as "damaged"`)
    }
    const sum = await sha256(file)
    writeFileSync(`${file}.sha256`, `${sum}  ${t.out}\n`)
    results.push({ ...t, mode, signed: signed.applied, sha256: sum })
    console.log(`✓ ${t.out}  [${mode}${signed.applied ? '+adhoc-signed' : ''}]  sha256=${sum.slice(0, 16)}…`)
  }

  writeFileSync(join(OUT, 'install-bun.sh'), INSTALL_SH, { mode: 0o755 })
  writeFileSync(
    join(OUT, 'BUILDINFO'),
    JSON.stringify({ version: VERSION, bun: BUN_VERSION, builtBy: hostTriple(), targets: results }, null, 2) + '\n',
  )

  const anyObfuscate = results.some((r) => r.mode.includes('obfuscate'))
  const anyBytecode = results.some((r) => r.mode.includes('bytecode'))
  const protection = anyObfuscate
    ? 'obfuscated (string-array + identifier mangling) + minified'
    : anyBytecode
      ? 'bytecode-compiled + minified'
      : 'minified'
  writeFileSync(
    join(OUT, 'README-BUN.md'),
    `# agf — standalone binaries (Bun)\n\nVersion ${VERSION}. Self-contained: embedded Bun runtime + SQLite\n(\`bun:sqlite\`). No Node/npm/native module on the target.\n\n## Install\n- macOS/Linux: \`bash install-bun.sh\`\n- Windows: not distributed as a binary — install on Node with the Windows\n  installer from the project site (an unsigned standalone \`.exe\` is what\n  corporate EDR/AppLocker blocks, so it was retired in 0.24.0).\n\n## Protection\nBinaries are **${protection}** and embedded in the\nexecutable — the source is not shipped as readable files. This is strong\ndeterrence against casual reverse-engineering, not a mathematical guarantee.\nVerify integrity with the matching \`.sha256\`.\n`,
  )

  console.log(`\ndist-bun/ ready (v${VERSION}, bun ${BUN_VERSION}). Modes: ${results.map((r) => r.mode).join(', ')}`)
  if (anyObfuscate) {
    console.log('Note: binaries are obfuscated + minified (bytecode N/A for the import.meta graph).')
  } else if (!anyBytecode) {
    console.log('Note: bytecode unavailable for this bundle — shipped minify-only (see BUILDINFO).')
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => {
    // Always revert embedded-spa-data.ts to the empty stub so the committed repo
    // never carries the ~2.7 MB base64 payload.
    stubEmbeddedSpa()
    // Remove the intermediate readable bundles — they are the un-obfuscated /
    // obfuscated SOURCE and must never end up in dist-bun (which gets deployed).
    rmSync(join(OUT, '.agf-bundle.mjs'), { force: true })
    rmSync(OBF_BUNDLE, { force: true })
  })
