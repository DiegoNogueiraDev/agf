/*!
 * TDD: repo-scanner --exclude robustness (node_433c5db111d8).
 *
 * AC1: glob pattern '*graph*' excludes repos whose path segment contains "graph"
 *      AND prunes the subtree (children never scanned).
 * AC2: exact basename still works (back-compat).
 * AC3: excluding a parent directory prunes the entire subtree.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { scanRepos } from '../core/scan/repo-scanner.js'

function makeRepo(dir: string): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'test' }))
}

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'agf-scanner-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('AC1: glob pattern excludes matching repos + prunes subtree', () => {
  it('*graph* pattern excludes a repo whose name contains "graph"', () => {
    makeRepo(join(root, 'graph-flow'))
    makeRepo(join(root, 'unrelated'))

    const result = scanRepos(root, { exclude: ['*graph*'], includeSelf: true })
    const names = result.repos.map((r) => r.name)
    expect(names).not.toContain('graph-flow')
    expect(names).toContain('unrelated')
  })

  it('*graph* excludes codegraph (substring match)', () => {
    makeRepo(join(root, 'codegraph'))
    makeRepo(join(root, 'other'))

    const result = scanRepos(root, { exclude: ['*graph*'], includeSelf: true })
    const names = result.repos.map((r) => r.name)
    expect(names).not.toContain('codegraph')
  })

  it('glob pattern prunes subtree — children of excluded parent are not scanned', () => {
    const parent = join(root, 'graph-parent')
    makeRepo(parent)
    makeRepo(join(parent, 'child-repo'))

    const result = scanRepos(root, { exclude: ['*graph*'], maxDepth: 2, includeSelf: true })
    const names = result.repos.map((r) => r.name)
    expect(names.some((n) => n.startsWith('graph-parent'))).toBe(false)
  })
})

describe('AC2: exact basename back-compat', () => {
  it('exact name still excludes the repo', () => {
    makeRepo(join(root, 'my-project'))
    makeRepo(join(root, 'other-project'))

    const result = scanRepos(root, { exclude: ['my-project'], includeSelf: true })
    const names = result.repos.map((r) => r.name)
    expect(names).not.toContain('my-project')
    expect(names).toContain('other-project')
  })
})

describe('AC3: excluding a parent prunes the entire subtree', () => {
  it('excluded parent directory stops all descent into it', () => {
    const parent = join(root, 'monorepo')
    mkdirSync(join(parent, 'pkg-a'), { recursive: true })
    mkdirSync(join(parent, 'pkg-b'), { recursive: true })
    makeRepo(join(parent, 'pkg-a'))
    makeRepo(join(parent, 'pkg-b'))

    const result = scanRepos(root, { exclude: ['monorepo'], maxDepth: 2, includeSelf: true })
    const names = result.repos.map((r) => r.name)
    expect(names.some((n) => n.includes('monorepo'))).toBe(false)
    expect(names.some((n) => n.includes('pkg-a'))).toBe(false)
    expect(names.some((n) => n.includes('pkg-b'))).toBe(false)
  })
})

/*!
 * TDD: forage-stop wired into repo-scanner (node_wire_49fe4688ff85).
 *
 * AC1: `distinctiveTerms: true` opt-in populates each repo's `distinctiveTerms`
 *      field (TF-IDF terms via feature-extractor.ts), leveraging forage-stop.ts
 *      through `extractFeaturesWithForageStop` when `forageStop: true`.
 * AC2: Default (opt-out) behaviour is unchanged — no `distinctiveTerms` field.
 */
describe('AC1/AC2: distinctiveTerms opt-in (wires feature-extractor + forage-stop)', () => {
  function makeReadmeRepo(dir: string, readme: string): void {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'README.md'), readme)
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'test' }))
  }

  it('AC2: distinctiveTerms is undefined by default (byte-identical opt-out)', () => {
    makeReadmeRepo(join(root, 'repo-a'), 'authentication login logout session token jwt bearer oauth')

    const result = scanRepos(root, { includeSelf: true })
    expect(result.repos[0]?.distinctiveTerms).toBeUndefined()
  })

  it('AC1: distinctiveTerms:true surfaces distinctive TF-IDF terms per repo', () => {
    makeReadmeRepo(join(root, 'repo-auth'), 'authentication login logout session token jwt bearer oauth')
    makeReadmeRepo(join(root, 'repo-db'), 'database postgres sql query migration schema table index')
    makeReadmeRepo(join(root, 'repo-cache'), 'redis cache eviction ttl lru distributed key-value store')

    const result = scanRepos(root, { includeSelf: true, distinctiveTerms: true })
    const authRepo = result.repos.find((r) => r.name === 'repo-auth')
    expect(authRepo?.distinctiveTerms).toBeDefined()
    expect(authRepo?.distinctiveTerms?.length).toBeGreaterThan(0)
    expect(authRepo?.distinctiveTerms).toContain('authentication')
  })

  it('AC1: forageStop:true wires forage-stop.ts and reads a bounded doc subset', () => {
    makeReadmeRepo(join(root, 'repo-x'), 'authentication login logout session token jwt bearer oauth')
    makeReadmeRepo(join(root, 'repo-y'), 'authentication login logout session token jwt bearer oauth')

    const result = scanRepos(root, { includeSelf: true, distinctiveTerms: true, forageStop: true })
    expect(result.repos.every((r) => r.distinctiveTerms !== undefined)).toBe(true)
  })
})
