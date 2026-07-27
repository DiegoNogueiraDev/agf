/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Packaging contract guard: locks the invariants that make `npm pack` /
 * `npm i -g` work across environments — a fresh `dist/` is always built before
 * packing, the `agf` bin points at the built entry, and the published `files`
 * include `dist/`. Fails CI if any of these regress.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const pkgPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
  bin: Record<string, string>
  files: string[]
  scripts: Record<string, string>
  main: string
  exports: Record<string, { import: string }>
  engines: { node: string }
}

describe('packaging contract', () => {
  it('maps the agf bin (and aliases) to the built CLI entry', () => {
    expect(pkg.bin.agf).toBe('dist/cli/index.js')
    expect(pkg.bin['agent-graph-flow']).toBe('dist/cli/index.js')
  })

  it('ships dist/ in the published tarball', () => {
    expect(pkg.files).toContain('dist/')
  })

  it('builds a fresh dist/ before packing (prepack) and before publishing', () => {
    expect(pkg.scripts.prepack, 'add a prepack script that builds').toBeDefined()
    expect(pkg.scripts.prepack).toContain('build')
    expect(pkg.scripts.prepublishOnly ?? '').toContain('build')
  })

  it('points main/exports at the built output', () => {
    expect(pkg.main).toMatch(/^dist\//)
    expect(pkg.exports['.'].import).toMatch(/^\.\/dist\//)
  })

  it('requires Node >= 20', () => {
    expect(pkg.engines.node).toMatch(/>=\s*20/)
  })
})
