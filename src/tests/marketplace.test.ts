/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { MarketplaceRegistry, DEFAULT_SKILL_SOURCE, type GitCloner } from '../core/marketplace/marketplace.js'
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

// ── Default source + persistence (node_086a503b2efd) ──────────────────
//
// The epic's promise is that anyone can install the published skills without
// knowing a URL. Two things were missing: nowhere named the public source, and
// the registry was in-memory — `marketplace add` cloned, reported success, and
// the next process saw nothing. A source you cannot list is a source that does
// not exist to the user.
describe('default source and cross-process persistence', () => {
  it('names a public default source so install works with no URL', () => {
    expect(DEFAULT_SKILL_SOURCE).toMatch(/^https?:\/\/.+/)
  })

  it('remembers an added source in a NEW registry instance (survives the process)', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'agf-persist-'))
    const origin = path.join(root, 'origin')
    mkdirSync(path.join(origin, 'demo'), { recursive: true })
    writeFileSync(path.join(origin, 'demo', 'SKILL.md'), '# demo\n', 'utf8')
    // A real git repo, cloned by the real cloner — no fake source.
    for (const args of [
      ['init', '-q'],
      ['add', '-A'],
      ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'x'],
    ]) {
      execFileSync('git', args, { cwd: origin })
    }
    const cache = path.join(root, 'cache')

    const first = new MarketplaceRegistry({ rootCacheDir: cache })
    await first.addSource(origin)
    expect(first.list()).toHaveLength(1)

    // A different instance is what the next CLI invocation actually gets.
    const second = new MarketplaceRegistry({ rootCacheDir: cache })
    expect(second.list().map((s) => s.gitUrl)).toContain(origin)
    expect(second.getItems(second.list()[0].id).map((i) => i.id)).toContain('demo')

    rmSync(root, { recursive: true, force: true })
  })

  it('reports an unreadable persisted record instead of crashing the registry', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'agf-persist-'))
    const cache = path.join(root, 'cache')
    mkdirSync(cache, { recursive: true })
    writeFileSync(path.join(cache, 'sources.json'), '{ not json', 'utf8')
    expect(new MarketplaceRegistry({ rootCacheDir: cache }).list()).toEqual([])
    rmSync(root, { recursive: true, force: true })
  })
})
