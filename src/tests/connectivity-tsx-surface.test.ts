/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/*!
 * TDD: connectivity scanner must scan .tsx/.jsx surface files (node_21f3c0e1b24e).
 *
 * src/tui is an Ink/React surface written entirely in .tsx. gatherTsFiles
 * previously collected only .ts, so every TUI import of a core module was
 * invisible → false-positive dormancy (e.g. collaboration-mode.ts is imported
 * by interactive-app.tsx yet was flagged dormant). These pin the corrected
 * behavior: a core file reachable only via a .tsx surface counts as connected,
 * while test/declaration files stay excluded.
 */

import { describe, it, expect } from 'vitest'
import { scanConnectivity } from '../core/harness/connectivity-scanner.js'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function tmp(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'conn-tsx-'))
  mkdirSync(join(dir, 'src', 'core', 'feat'), { recursive: true })
  mkdirSync(join(dir, 'src', 'tui'), { recursive: true })
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

describe('AC: core file reachable only via a .tsx surface is NOT dormant', () => {
  it('tui/app.tsx → core/feat/a ⇒ a is connected', () => {
    const { dir, cleanup } = tmp()
    try {
      writeFileSync(join(dir, 'src', 'tui', 'app.tsx'), "import { a } from '../core/feat/a.js'\nexport const X = a")
      writeFileSync(join(dir, 'src', 'core', 'feat', 'a.ts'), 'export const a = 1')

      const result = scanConnectivity({ rootDir: dir })
      expect(result.dormantFiles).not.toContain('src/core/feat/a.ts')
      expect(result.dormantFiles).toHaveLength(0)
    } finally {
      cleanup()
    }
  })

  it('propagates transitively from a .tsx seed (app.tsx → a → b)', () => {
    const { dir, cleanup } = tmp()
    try {
      writeFileSync(join(dir, 'src', 'tui', 'app.tsx'), "import { a } from '../core/feat/a.js'\nexport const X = a")
      writeFileSync(join(dir, 'src', 'core', 'feat', 'a.ts'), "import { b } from './b.js'\nexport const a = b")
      writeFileSync(join(dir, 'src', 'core', 'feat', 'b.ts'), 'export const b = 1')

      const result = scanConnectivity({ rootDir: dir })
      expect(result.dormantFiles).toHaveLength(0)
    } finally {
      cleanup()
    }
  })
})

describe('AC: .test.tsx and .d.ts surface files are excluded', () => {
  it('a core file imported only by a .test.tsx stays dormant', () => {
    const { dir, cleanup } = tmp()
    try {
      writeFileSync(
        join(dir, 'src', 'tui', 'app.test.tsx'),
        "import { a } from '../core/feat/a.js'\nexport const X = a",
      )
      writeFileSync(join(dir, 'src', 'core', 'feat', 'a.ts'), 'export const a = 1')

      const result = scanConnectivity({ rootDir: dir })
      expect(result.dormantFiles).toContain('src/core/feat/a.ts')
    } finally {
      cleanup()
    }
  })
})
