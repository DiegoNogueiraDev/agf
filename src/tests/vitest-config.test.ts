/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const configPath = resolve(__dirname, '../../vitest.config.ts')
const configContent = readFileSync(configPath, 'utf8')

describe('vitest.config.ts — coverage config (R1.1)', () => {
  it('coverage.include cobre 7 diretórios', () => {
    const includes = [
      'src/core/**',
      'src/mcp/**',
      'src/cli/**',
      'src/schemas/**',
      'src/skills/**',
      'src/tui/**',
      'src/plugins/**',
    ]
    for (const dir of includes) {
      expect(configContent).toContain(dir)
    }
  })

  it('thresholds statements >= 30', () => {
    expect(configContent).toMatch(/statements:\s*(3[0-9]|[4-9][0-9]|[0-9]{3,})/)
  })

  it('thresholds branches >= 25', () => {
    expect(configContent).toMatch(/branches:\s*(2[5-9]|[3-9][0-9]|[0-9]{3,})/)
  })

  it('thresholds functions >= 30', () => {
    expect(configContent).toMatch(/functions:\s*(3[0-9]|[4-9][0-9]|[0-9]{3,})/)
  })

  it('thresholds lines >= 30', () => {
    expect(configContent).toMatch(/lines:\s*(3[0-9]|[4-9][0-9]|[0-9]{3,})/)
  })

  it('provider é v8', () => {
    // Quote-agnostic: prettier may render the value single- or double-quoted.
    expect(configContent).toMatch(/provider:\s*['"]v8['"]/)
  })
})

describe('package.json — test:all script (R1.2)', () => {
  const pkgPath = resolve(__dirname, '../../package.json')
  const pkgContent = JSON.parse(readFileSync(pkgPath, 'utf8'))

  it('test:all script existe e executa coverage', () => {
    expect(pkgContent.scripts).toHaveProperty('test:all')
    expect(pkgContent.scripts['test:all']).toContain('vitest run --coverage')
  })
})
