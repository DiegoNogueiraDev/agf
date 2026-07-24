/*!
 * TDD: connectivity transitive reachability (node_4926eb89d7b4).
 *
 * The scanner must count a core file as CONNECTED when it is reachable from a
 * surface (cli/tui/...) directly OR transitively through the core import graph.
 * Previously it only checked DIRECT surface imports, so a core lib imported only
 * by another (surface-reachable) core file was a false-positive "dormant" → the
 * ~1040 noise. This pins the corrected behavior.
 *
 * AC1: a core file imported only by a surface-reachable core file is NOT dormant.
 * AC2: a genuinely orphan core file (imported by nothing) stays dormant.
 * AC3: a deep chain (surface → A → B → C) marks all reachable, none dormant.
 */

import { describe, it, expect } from 'vitest'
import { scanConnectivity } from '../core/harness/connectivity-scanner.js'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function tmp(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'conn-transitive-'))
  mkdirSync(join(dir, 'src', 'core', 'feat'), { recursive: true })
  mkdirSync(join(dir, 'src', 'cli'), { recursive: true })
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

describe('AC1: core file reachable transitively (not directly by surface) is NOT dormant', () => {
  it('surface→A, A→B ⇒ B is connected', () => {
    const { dir, cleanup } = tmp()
    try {
      writeFileSync(join(dir, 'src', 'cli', 'cmd.ts'), "import { a } from '../core/feat/a.js'\nexport const x = a")
      writeFileSync(join(dir, 'src', 'core', 'feat', 'a.ts'), "import { b } from './b.js'\nexport const a = b")
      writeFileSync(join(dir, 'src', 'core', 'feat', 'b.ts'), 'export const b = 1')

      const result = scanConnectivity({ rootDir: dir })
      expect(result.dormantFiles).not.toContain('src/core/feat/b.ts')
      expect(result.dormantFiles).toHaveLength(0)
    } finally {
      cleanup()
    }
  })
})

describe('AC2: genuinely orphan core file stays dormant', () => {
  it('a core file imported by nothing is dormant', () => {
    const { dir, cleanup } = tmp()
    try {
      writeFileSync(join(dir, 'src', 'cli', 'cmd.ts'), "import { a } from '../core/feat/a.js'\nexport const x = a")
      writeFileSync(join(dir, 'src', 'core', 'feat', 'a.ts'), 'export const a = 1')
      writeFileSync(join(dir, 'src', 'core', 'feat', 'orphan.ts'), 'export const orphan = 1')

      const result = scanConnectivity({ rootDir: dir })
      expect(result.dormantFiles).toContain('src/core/feat/orphan.ts')
      expect(result.dormantFiles).not.toContain('src/core/feat/a.ts')
    } finally {
      cleanup()
    }
  })
})

describe('AC3: deep chain surface→A→B→C marks all reachable', () => {
  it('3-hop chain leaves zero dormant', () => {
    const { dir, cleanup } = tmp()
    try {
      writeFileSync(join(dir, 'src', 'cli', 'cmd.ts'), "import { a } from '../core/feat/a.js'\nexport const x = a")
      writeFileSync(join(dir, 'src', 'core', 'feat', 'a.ts'), "import { b } from './b.js'\nexport const a = b")
      writeFileSync(join(dir, 'src', 'core', 'feat', 'b.ts'), "import { c } from './c.js'\nexport const b = c")
      writeFileSync(join(dir, 'src', 'core', 'feat', 'c.ts'), 'export const c = 1')

      const result = scanConnectivity({ rootDir: dir })
      expect(result.dormantFiles).toHaveLength(0)
      expect(result.connectivityScore).toBe(100)
    } finally {
      cleanup()
    }
  })
})

// node_eae7e7425657 (B11) — barrels (index.ts) re-export; they are not capabilities.
// They must NOT be counted as dormant or inflate the denominator, but must still
// propagate reachability (surface → barrel → re-exported module).
describe('B11: barrels (index.ts) are not counted as capabilities', () => {
  it('an unimported barrel is not listed as a dormant capability', () => {
    const { dir, cleanup } = tmp()
    try {
      writeFileSync(join(dir, 'src', 'cli', 'cmd.ts'), "import { a } from '../core/feat/a.js'\nexport const x = a")
      writeFileSync(join(dir, 'src', 'core', 'feat', 'a.ts'), 'export const a = 1')
      // barrel nobody imports — re-export only
      writeFileSync(join(dir, 'src', 'core', 'feat', 'index.ts'), "export { a } from './a.js'")

      const result = scanConnectivity({ rootDir: dir })
      expect(result.dormantFiles).not.toContain('src/core/feat/index.ts')
      expect(result.dormantFiles).toHaveLength(0)
    } finally {
      cleanup()
    }
  })

  it('a barrel still propagates reachability to its re-exported module', () => {
    const { dir, cleanup } = tmp()
    try {
      // surface imports the BARREL; the real module is only reached through it
      writeFileSync(join(dir, 'src', 'cli', 'cmd.ts'), "import { a } from '../core/feat/index.js'\nexport const x = a")
      writeFileSync(join(dir, 'src', 'core', 'feat', 'index.ts'), "export { a } from './a.js'")
      writeFileSync(join(dir, 'src', 'core', 'feat', 'a.ts'), 'export const a = 1')

      const result = scanConnectivity({ rootDir: dir })
      expect(result.dormantFiles).not.toContain('src/core/feat/a.ts')
    } finally {
      cleanup()
    }
  })
})
