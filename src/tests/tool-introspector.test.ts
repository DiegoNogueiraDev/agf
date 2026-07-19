/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/core/docs/tool-introspector.ts — introspectTools.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { introspectTools } from '../core/docs/tool-introspector.js'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'tool-introspect-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('introspectTools', () => {
  it('extracts tool name + description and skips index.ts', async () => {
    await writeFile(path.join(dir, 'node.ts'), 'server.tool("node_create", "Create a node")\n')
    await writeFile(path.join(dir, 'index.ts'), 'server.tool("ignored", "should not appear")\n')

    const tools = introspectTools(dir)

    expect(tools).toHaveLength(1)
    expect(tools[0].name).toBe('node_create')
    expect(tools[0].description).toBe('Create a node')
    expect(tools[0].category).toBe('Core')
    expect(tools[0].sourceFile).toBe('node.ts')
  })

  it('marks deprecated files and sorts non-deprecated first', async () => {
    await writeFile(path.join(dir, 'add-node.ts'), 'server.tool("add_node", "old")\n')
    await writeFile(path.join(dir, 'knowledge.ts'), 'server.tool("kb_search", "search")\n')

    const tools = introspectTools(dir)

    expect(tools.map((t) => t.name)).toEqual(['kb_search', 'add_node'])
    const addNode = tools.find((t) => t.name === 'add_node')
    expect(addNode?.deprecated).toBe(true)
    expect(addNode?.category).toBe('Deprecated')
    expect(tools.find((t) => t.name === 'kb_search')?.category).toBe('Knowledge')
  })
})
