/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { MarketplaceRegistry, type GitCloner } from '../core/marketplace/marketplace.js'
import { MarketplaceError } from '../core/marketplace/types.js'

/** A cloner that materialises a fixture tree instead of hitting the network. */
function fixtureCloner(): GitCloner {
  return {
    async clone(_gitUrl, _ref, destDir) {
      mkdirSync(path.join(destDir, 'skills', 'hello'), { recursive: true })
      writeFileSync(path.join(destDir, 'skills', 'hello', 'SKILL.md'), '# Hello skill')
      mkdirSync(path.join(destDir, 'plugins', 'demo'), { recursive: true })
      writeFileSync(
        path.join(destDir, 'plugins', 'demo', 'plugin.json'),
        JSON.stringify({ name: 'demo', version: '1.2.3' }),
      )
    },
  }
}

describe('MarketplaceRegistry', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agf-mkt-'))
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('clones and indexes a source (skill + plugin)', async () => {
    const registry = new MarketplaceRegistry({ rootCacheDir: root, cloner: fixtureCloner() })
    const { source, items } = await registry.addSource('file:///tmp/fixture.git')

    expect(source.gitUrl).toBe('file:///tmp/fixture.git')
    expect(registry.list()).toHaveLength(1)

    const kinds = items.map((i) => i.kind).sort()
    expect(kinds).toEqual(['plugin', 'skill'])

    const plugin = items.find((i) => i.kind === 'plugin')
    expect(plugin?.version).toBe('1.2.3')
    expect(plugin?.sourceId).toBe(source.id)
  })

  it('throws a typed MarketplaceError on a malformed URL', async () => {
    const registry = new MarketplaceRegistry({ rootCacheDir: root, cloner: fixtureCloner() })
    await expect(registry.addSource('   ')).rejects.toBeInstanceOf(MarketplaceError)
  })
})
