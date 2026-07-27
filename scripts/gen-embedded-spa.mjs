/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * gen-embedded-spa — generate src/api/embedded-spa-data.ts from the built Vite
 * SPA (src/web/dashboard/dist) as a base64 map keyed by URL path, so the
 * standalone bun binary can serve the full Graph+Economy UI without a filesystem
 * dist. Called by pack-bun.mjs right before `bun build --compile`, then reverted
 * to the empty stub via writeStub(). Reading the dist directly (not dist/web/...)
 * keeps this independent of the copy-dashboard step.
 *
 * CLI: `node scripts/gen-embedded-spa.mjs`        → embed
 *      `node scripts/gen-embedded-spa.mjs --stub` → restore empty stub
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SPA_DIST = join(ROOT, 'src', 'web', 'dashboard', 'dist')
const OUT_FILE = join(ROOT, 'src', 'api', 'embedded-spa-data.ts')

const HEADER = `/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * embedded-spa-data — base64 map of the built Vite SPA, keyed by URL path
 * (e.g. "/index.html", "/assets/index-xxhash.js"). DEFAULT EMPTY: the npm/source
 * install serves the SPA from the filesystem (dist/web/dashboard/dist), so this
 * stays \`{}\` and the binary stays small in dev.
 *
 * pack:bun regenerates this file (scripts/gen-embedded-spa.mjs) with the full
 * SPA right before \`bun build --compile\`, then restores this empty stub — so the
 * standalone binary embeds the full Graph+Economy UI instead of the lite page,
 * without committing ~2.7 MB of base64 to the repo. See app-factory.ts for the
 * serve order: filesystem dist → embedded SPA → lite fallback.
 */`

/** Recursively collect every file under dir as absolute paths. */
function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

/** Write the empty stub (default committed state). */
export function writeStub() {
  writeFileSync(OUT_FILE, `${HEADER}\nexport const EMBEDDED_SPA_DATA: Record<string, string> = {}\n`)
}

/** Generate the embedded base64 map from the built SPA. Returns the file count. */
export function generate() {
  const files = walk(SPA_DIST)
  if (files.length === 0) throw new Error(`no SPA files under ${SPA_DIST} — run "npm run dashboard:build" first`)
  const entries = files
    .map((abs) => {
      const url = '/' + relative(SPA_DIST, abs).split(sep).join('/')
      const b64 = readFileSync(abs).toString('base64')
      return `  ${JSON.stringify(url)}: ${JSON.stringify(b64)},`
    })
    .sort()
  const body = `${HEADER}\nexport const EMBEDDED_SPA_DATA: Record<string, string> = {\n${entries.join('\n')}\n}\n`
  writeFileSync(OUT_FILE, body)
  return files.length
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--stub')) {
    writeStub()
    console.log('embedded-spa-data.ts → empty stub')
  } else {
    const n = generate()
    console.log(`embedded-spa-data.ts → embedded ${n} SPA files`)
  }
}
