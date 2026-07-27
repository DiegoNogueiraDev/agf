#!/usr/bin/env node
/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * make-ico — build assets/agf.ico (multi-resolution Windows icon) from the ant PNG.
 * Uses ImageMagick (no npm dependency added). Emitted resolutions: 16/32/48/256 px.
 *
 * NO CONSUMER since v0.24.0 (f235d361) retired the Windows `.exe`: the icon was
 * embedded into that PE, and the embedder (win-icon.mjs) was deleted with the rest
 * of that cluster. Kept because it is a regenerable brand asset that points at
 * nothing broken — unlike the installer scripts, which named a payload the build
 * no longer produces. If Windows ever ships a PE again, this is how the icon is
 * rebuilt; if it never does, delete this together with assets/agf.ico.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'assets', 'agf-graph-aco-nature.png')
const OUT = join(ROOT, 'assets', 'agf.ico')
const SIZES = [16, 32, 48, 256]

function magickBin() {
  for (const bin of ['magick', 'convert']) {
    try {
      execFileSync(bin, ['-version'], { stdio: 'ignore' })
      return bin
    } catch {
      /* try next */
    }
  }
  throw new Error('ImageMagick not found (need `magick` or `convert` on PATH)')
}

if (!existsSync(SRC)) throw new Error(`source PNG missing: ${SRC}`)
const bin = magickBin()
// -define icon:auto-resize packs all sizes into one .ico dir.
execFileSync(bin, [SRC, '-define', `icon:auto-resize=${SIZES.join(',')}`, OUT], { stdio: 'inherit' })
console.log(`✓ wrote ${OUT} (${SIZES.join('/')} px)`)
