/*!
 * TDD: connectivity scanner captures dynamic import() edges (node_660cc185a8cf).
 *
 * The scanner read only static `from '...'` / `export ... from '...'`. A core file
 * loaded ONLY via dynamic `import('...')` (e.g. the CLI's lazy command loaders, or
 * lazy core wiring) was a false-positive "dormant". This pins dynamic-import capture
 * so the dormancy count is trustworthy before harvesting/deleting on top of it.
 *
 * AC1: a core file imported by a surface only via import() is NOT dormant.
 * AC2: transitive: surface →(static) A →(dynamic import) B ⇒ B not dormant.
 */

import { describe, it, expect } from 'vitest'
import { scanConnectivity } from '../core/harness/connectivity-scanner.js'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function tmp(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'conn-dynimport-'))
  mkdirSync(join(dir, 'src', 'core', 'feat'), { recursive: true })
  mkdirSync(join(dir, 'src', 'cli'), { recursive: true })
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

describe('AC1: dynamic import() from surface marks core file connected', () => {
  it('surface →import() A ⇒ A is not dormant', () => {
    const { dir, cleanup } = tmp()
    try {
      writeFileSync(
        join(dir, 'src', 'cli', 'cmd.ts'),
        "const m = await import('../core/feat/dyn.js')\nexport const x = m",
      )
      writeFileSync(join(dir, 'src', 'core', 'feat', 'dyn.ts'), 'export const dyn = 1')

      const result = scanConnectivity({ rootDir: dir })
      expect(result.dormantFiles).not.toContain('src/core/feat/dyn.ts')
      expect(result.dormantFiles).toHaveLength(0)
    } finally {
      cleanup()
    }
  })
})

describe('AC2: transitive dynamic edge', () => {
  it('surface→A (static), A→B (dynamic import) ⇒ B not dormant', () => {
    const { dir, cleanup } = tmp()
    try {
      writeFileSync(join(dir, 'src', 'cli', 'cmd.ts'), "import { a } from '../core/feat/a.js'\nexport const x = a")
      writeFileSync(join(dir, 'src', 'core', 'feat', 'a.ts'), "export async function a() { return import('./b.js') }")
      writeFileSync(join(dir, 'src', 'core', 'feat', 'b.ts'), 'export const b = 1')

      const result = scanConnectivity({ rootDir: dir })
      expect(result.dormantFiles).not.toContain('src/core/feat/b.ts')
      expect(result.dormantFiles).toHaveLength(0)
    } finally {
      cleanup()
    }
  })
})
