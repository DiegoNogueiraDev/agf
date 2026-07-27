/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/*!
 * TDD: connectivity scanner must treat src/api as a surface (node_wire_653a015352af).
 *
 * src/api/routes/*.ts is a real REST surface (app-factory, router, routes,
 * middleware) that exposes core capabilities over HTTP, but SURFACE_DIRS only
 * listed src/cli, src/tui, src/mcp, src/web and src/app-server. Any core module
 * reachable only via src/api (e.g. agent-learnings.ts, imported solely by
 * src/api/routes/agent.ts) was flagged as false-positive dormant. This pins the
 * corrected behavior: a core file reachable only via src/api counts as connected.
 */

import { describe, it, expect } from 'vitest'
import { scanConnectivity } from '../core/harness/connectivity-scanner.js'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function tmp(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'conn-api-'))
  mkdirSync(join(dir, 'src', 'core', 'feat'), { recursive: true })
  mkdirSync(join(dir, 'src', 'api', 'routes'), { recursive: true })
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

describe('AC: core file reachable only via src/api is NOT dormant', () => {
  it('api/routes/agent.ts → core/feat/a ⇒ a is connected', () => {
    const { dir, cleanup } = tmp()
    try {
      writeFileSync(
        join(dir, 'src', 'api', 'routes', 'agent.ts'),
        "import { a } from '../../core/feat/a.js'\nexport const X = a",
      )
      writeFileSync(join(dir, 'src', 'core', 'feat', 'a.ts'), 'export const a = 1')

      const result = scanConnectivity({ rootDir: dir })
      expect(result.dormantFiles).not.toContain('src/core/feat/a.ts')
      expect(result.dormantFiles).toHaveLength(0)
    } finally {
      cleanup()
    }
  })

  it('propagates transitively from an src/api seed (agent.ts → a → b)', () => {
    const { dir, cleanup } = tmp()
    try {
      writeFileSync(
        join(dir, 'src', 'api', 'routes', 'agent.ts'),
        "import { a } from '../../core/feat/a.js'\nexport const X = a",
      )
      writeFileSync(join(dir, 'src', 'core', 'feat', 'a.ts'), "import { b } from './b.js'\nexport const a = b")
      writeFileSync(join(dir, 'src', 'core', 'feat', 'b.ts'), 'export const b = 1')

      const result = scanConnectivity({ rootDir: dir })
      expect(result.dormantFiles).toHaveLength(0)
    } finally {
      cleanup()
    }
  })
})
