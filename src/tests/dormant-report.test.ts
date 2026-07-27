/*!
 * TDD: dormant-report — lists capabilities with no surface consumer (node_42df4845ae4f).
 *
 * AC1: dormant core files (not imported from any surface) appear with module+reason.
 * AC2: allowlisted files do NOT appear (no false-positives).
 * AC3: when everything is wired, dormant === [].
 */

import { describe, it, expect } from 'vitest'
import { buildDormantReport, type DormantReportOptions } from '../core/harness/dormant-report.js'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function makeTmpProject(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'dormant-test-'))
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

describe('AC1: dormant core files listed with module+reason', () => {
  it('returns dormant entry for an orphaned core file', () => {
    const { dir, cleanup } = makeTmpProject()
    try {
      mkdirSync(join(dir, 'src', 'core', 'utils'), { recursive: true })
      mkdirSync(join(dir, 'src', 'cli'), { recursive: true })
      writeFileSync(join(dir, 'src', 'core', 'utils', 'orphan.ts'), 'export function orphan() {}')
      writeFileSync(join(dir, 'src', 'cli', 'cmd.ts'), '// no imports')

      const opts: DormantReportOptions = { rootDir: dir }
      const report = buildDormantReport(opts)

      expect(report.dormant.length).toBeGreaterThan(0)
      const entry = report.dormant.find((d) => d.module.includes('orphan'))
      expect(entry).toBeDefined()
      expect(entry?.reason).toBe('no-surface')
    } finally {
      cleanup()
    }
  })

  it('wired core file does NOT appear in dormant list', () => {
    const { dir, cleanup } = makeTmpProject()
    try {
      mkdirSync(join(dir, 'src', 'core', 'utils'), { recursive: true })
      mkdirSync(join(dir, 'src', 'cli'), { recursive: true })
      writeFileSync(join(dir, 'src', 'core', 'utils', 'wired.ts'), 'export function wired() {}')
      writeFileSync(join(dir, 'src', 'cli', 'cmd.ts'), "import { wired } from '../core/utils/wired.js'")

      const opts: DormantReportOptions = { rootDir: dir }
      const report = buildDormantReport(opts)

      expect(report.dormant.find((d) => d.module.includes('wired'))).toBeUndefined()
    } finally {
      cleanup()
    }
  })
})

describe('AC2: allowlisted files do not appear', () => {
  it('allowlisted path excluded from dormant even when not imported', () => {
    const { dir, cleanup } = makeTmpProject()
    try {
      mkdirSync(join(dir, 'src', 'core', 'types'), { recursive: true })
      mkdirSync(join(dir, 'src', 'cli'), { recursive: true })
      writeFileSync(join(dir, 'src', 'core', 'types', 'shared.ts'), 'export type Foo = string')
      writeFileSync(join(dir, 'src', 'cli', 'cmd.ts'), '// no imports')

      const opts: DormantReportOptions = { rootDir: dir, allowlist: ['src/core/types/'] }
      const report = buildDormantReport(opts)

      expect(report.dormant.find((d) => d.module.includes('types/shared'))).toBeUndefined()
    } finally {
      cleanup()
    }
  })
})

describe('AC3: everything wired → dormant === []', () => {
  it('returns empty dormant when all core files are imported by surfaces', () => {
    const { dir, cleanup } = makeTmpProject()
    try {
      mkdirSync(join(dir, 'src', 'core', 'utils'), { recursive: true })
      mkdirSync(join(dir, 'src', 'cli'), { recursive: true })
      writeFileSync(join(dir, 'src', 'core', 'utils', 'util.ts'), 'export function util() {}')
      writeFileSync(join(dir, 'src', 'cli', 'cmd.ts'), "import { util } from '../core/utils/util.js'")

      const opts: DormantReportOptions = { rootDir: dir }
      const report = buildDormantReport(opts)

      expect(report.dormant).toEqual([])
    } finally {
      cleanup()
    }
  })
})
