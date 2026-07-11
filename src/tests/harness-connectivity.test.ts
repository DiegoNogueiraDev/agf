/*!
 * TDD: connectivity dimension in harness — measures core capabilities reachable
 * from ≥1 surface (CLI/TUI/MCP/web) (node_9b7bc7f1ea0b).
 *
 * AC1: scanConnectivity returns score = connected/total for core files.
 * AC2: a dormant core file (not imported anywhere) lowers the score.
 * AC3: allowlisted files don't count as dormant.
 */

import { describe, it, expect } from 'vitest'
import { scanConnectivity } from '../core/harness/connectivity-scanner.js'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function makeTmpProject(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'conn-test-'))
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

describe('AC1: connectivity score = connected/total', () => {
  it('returns 100 when all core files are imported by at least one surface', () => {
    const { dir, cleanup } = makeTmpProject()
    try {
      mkdirSync(join(dir, 'src', 'core', 'utils'), { recursive: true })
      mkdirSync(join(dir, 'src', 'cli'), { recursive: true })
      writeFileSync(join(dir, 'src', 'core', 'utils', 'foo.ts'), 'export function foo() {}')
      writeFileSync(join(dir, 'src', 'cli', 'cmd.ts'), "import { foo } from '../core/utils/foo.js'")

      const result = scanConnectivity({ rootDir: dir })
      expect(result.connectivityScore).toBe(100)
      expect(result.totalCapabilities).toBe(1)
      expect(result.connectedCapabilities).toBe(1)
    } finally {
      cleanup()
    }
  })

  it('returns 0 when no core files are imported by surfaces', () => {
    const { dir, cleanup } = makeTmpProject()
    try {
      mkdirSync(join(dir, 'src', 'core', 'utils'), { recursive: true })
      mkdirSync(join(dir, 'src', 'cli'), { recursive: true })
      writeFileSync(join(dir, 'src', 'core', 'utils', 'orphan.ts'), 'export function orphan() {}')
      writeFileSync(join(dir, 'src', 'cli', 'cmd.ts'), '// no imports')

      const result = scanConnectivity({ rootDir: dir })
      expect(result.connectivityScore).toBe(0)
    } finally {
      cleanup()
    }
  })
})

describe('AC2: dormant core file lowers score', () => {
  it('50% score when 1 of 2 core files is orphaned', () => {
    const { dir, cleanup } = makeTmpProject()
    try {
      mkdirSync(join(dir, 'src', 'core', 'utils'), { recursive: true })
      mkdirSync(join(dir, 'src', 'cli'), { recursive: true })
      writeFileSync(join(dir, 'src', 'core', 'utils', 'wired.ts'), 'export function wired() {}')
      writeFileSync(join(dir, 'src', 'core', 'utils', 'dormant.ts'), 'export function dormant() {}')
      writeFileSync(join(dir, 'src', 'cli', 'cmd.ts'), "import { wired } from '../core/utils/wired.js'")

      const result = scanConnectivity({ rootDir: dir })
      expect(result.connectivityScore).toBe(50)
      expect(result.dormantFiles).toContain('src/core/utils/dormant.ts')
    } finally {
      cleanup()
    }
  })
})

describe('AC3: allowlisted files are excluded from dormant count', () => {
  it('allowlisted orphan does not reduce score', () => {
    const { dir, cleanup } = makeTmpProject()
    try {
      mkdirSync(join(dir, 'src', 'core', 'types'), { recursive: true })
      mkdirSync(join(dir, 'src', 'cli'), { recursive: true })
      writeFileSync(join(dir, 'src', 'core', 'types', 'shared.ts'), 'export type Foo = string')
      writeFileSync(join(dir, 'src', 'cli', 'cmd.ts'), '// no imports')

      const result = scanConnectivity({
        rootDir: dir,
        allowlist: ['src/core/types/'],
      })
      // allowlisted file excluded from total → 0 capabilities → score 100
      expect(result.connectivityScore).toBe(100)
      expect(result.totalCapabilities).toBe(0)
    } finally {
      cleanup()
    }
  })
})
