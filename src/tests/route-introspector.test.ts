/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/core/docs/route-introspector.ts — introspectRoutes.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { introspectRoutes } from '../core/docs/route-introspector.js'

let apiDir: string

beforeEach(async () => {
  apiDir = await mkdtemp(path.join(tmpdir(), 'route-introspect-'))
})

afterEach(async () => {
  await rm(apiDir, { recursive: true, force: true })
})

describe('introspectRoutes', () => {
  it('returns [] when router.ts is absent', () => {
    expect(introspectRoutes(apiDir)).toEqual([])
  })

  it('parses mount paths and endpoint definitions from route files', async () => {
    await writeFile(
      path.join(apiDir, 'router.ts'),
      'router.use("/nodes", createNodesRouter(deps))\nrouter.use("/edges", createEdgesRouter(deps))\n',
    )
    await mkdir(path.join(apiDir, 'routes'), { recursive: true })
    await writeFile(path.join(apiDir, 'routes', 'nodes.ts'), 'router.get("/", h)\nrouter.post("/:id", h)\n')
    // edges.ts intentionally absent → endpoints empty for that mount

    const routes = introspectRoutes(apiDir)

    expect(routes).toHaveLength(2)
    const nodes = routes.find((r) => r.routerName === 'nodes')
    expect(nodes?.mountPath).toBe('/nodes')
    expect(nodes?.sourceFile).toBe('nodes.ts')
    expect(nodes?.endpoints).toEqual([
      { method: 'get', path: '/' },
      { method: 'post', path: '/:id' },
    ])

    const edges = routes.find((r) => r.routerName === 'edges')
    expect(edges?.endpoints).toEqual([])
  })

  it('maps PascalCase factory names to kebab-case source files', async () => {
    await writeFile(path.join(apiDir, 'router.ts'), 'router.use("/tp", createTranslationProjectRouter(deps))\n')

    const routes = introspectRoutes(apiDir)
    expect(routes[0].sourceFile).toBe('translation-project.ts')
  })
})
