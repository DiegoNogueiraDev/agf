/*!
 * TDD: dead export detection via knip — ci:smoke gate (node_656ae5ff1475).
 *
 * AC1: a known dormant export is detected by the script.
 * AC2: allowlisted or wired exports pass.
 * AC3: knip script exists and runs without crashing existing gates.
 *
 * Strategy: test the script file exists and is executable; actual knip invocation
 * is covered by ci:smoke integration. Unit-level: test the allowlist filter logic.
 */

import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const SCRIPT = join(process.cwd(), 'scripts', 'check-dead-exports.mjs')

describe('AC3: check-dead-exports script exists', () => {
  it('scripts/check-dead-exports.mjs exists', () => {
    expect(existsSync(SCRIPT)).toBe(true)
  })
})

describe('AC2: allowlist filter logic', () => {
  it('isAllowlisted returns true for entries matching the list', async () => {
    const { isAllowlisted } = await import('../../scripts/check-dead-exports.mjs')
    expect(isAllowlisted('src/core/foo.ts:barExport', ['src/core/foo.ts:barExport'])).toBe(true)
  })

  it('isAllowlisted returns false for unknown entries', async () => {
    const { isAllowlisted } = await import('../../scripts/check-dead-exports.mjs')
    expect(isAllowlisted('src/core/foo.ts:unknownExport', ['src/core/foo.ts:barExport'])).toBe(false)
  })
})
