/*!
 * TDD: repo-dedupe — SimHash-based monorepo subdir deduplication (node_ab7a4d8cfed5).
 *
 * AC1: Given near-identical subdirs in a monorepo, When deduped, Then collapse to 1 unit
 *      (SimHash Hamming distance < threshold).
 * AC2: Given genuinely distinct projects, When deduped, Then remain separate.
 */

import { describe, it, expect } from 'vitest'
import { simhash, hammingDistance, dedupeRepoDirs, type RepoDir } from '../core/scan/repo-dedupe.js'

// Near-identical: same monorepo package ported to two languages.
// Content is the repo capability text (README + file list) as the scanner produces.
const NEAR_IDENTICAL_A = `
supertonic-math go implementation
README: arithmetic math library add subtract multiply divide modulo abs clamp sum average
files: math.go math_test.go go.mod README.md
exports: Add Subtract Multiply Divide Mod Abs Clamp Sum Average
description: pure arithmetic operations no dependencies lightweight fast portable
keywords: arithmetic add subtract multiply divide modulo clamp sum average math
`

const NEAR_IDENTICAL_B = `
supertonic-math cpp implementation
README: arithmetic math library add subtract multiply divide modulo abs clamp sum average
files: math.cpp math.h math_test.cpp CMakeLists.txt README.md
exports: add subtract multiply divide mod abs clamp sum average
description: pure arithmetic operations no dependencies lightweight fast portable
keywords: arithmetic add subtract multiply divide modulo clamp sum average math
`

// Genuinely distinct: HTTP server project — completely different vocabulary
const DISTINCT = `
node-static-server web server http
README: static file server express middleware serve html css js assets cors gzip etag
files: server.ts router.ts middleware.ts handler.ts server.test.ts package.json
exports: createServer createRouter addMiddleware serveStatic handleRequest gracefulShutdown
description: production http server static assets compression caching etag cors headers tls
keywords: http server static assets express middleware gzip compression etag cors tls
`

describe('simhash', () => {
  it('returns a 32-bit integer for any string', () => {
    const h = simhash('hello world')
    expect(Number.isInteger(h)).toBe(true)
  })

  it('produces the same hash for the same input', () => {
    expect(simhash('foo bar')).toBe(simhash('foo bar'))
  })

  it('different strings produce different hashes (probabilistic)', () => {
    expect(simhash(NEAR_IDENTICAL_A)).not.toBe(simhash(DISTINCT))
  })
})

describe('hammingDistance', () => {
  it('same value → distance 0', () => {
    expect(hammingDistance(0b1010, 0b1010)).toBe(0)
  })

  it('all bits flipped → distance 32', () => {
    expect(hammingDistance(0x00000000, 0xffffffff)).toBe(32)
  })

  it('single bit difference → distance 1', () => {
    expect(hammingDistance(0b1010, 0b1011)).toBe(1)
  })
})

describe('AC1: near-identical subdirs collapse to 1 unit', () => {
  it('collapses two near-identical dirs', () => {
    const dirs: RepoDir[] = [
      { path: '/mono/pkg/go', content: NEAR_IDENTICAL_A },
      { path: '/mono/pkg/cpp', content: NEAR_IDENTICAL_B },
    ]
    const result = dedupeRepoDirs(dirs)
    expect(result.groups.length).toBe(1)
    expect(result.groups[0]!.members.length).toBe(2)
  })

  it('keeps the canonical (first) path as group representative', () => {
    const dirs: RepoDir[] = [
      { path: '/mono/pkg/go', content: NEAR_IDENTICAL_A },
      { path: '/mono/pkg/cpp', content: NEAR_IDENTICAL_B },
    ]
    const result = dedupeRepoDirs(dirs)
    expect(result.groups[0]!.canonical).toBe('/mono/pkg/go')
  })
})

describe('AC2: distinct projects remain separate', () => {
  it('does not merge genuinely distinct dirs', () => {
    const dirs: RepoDir[] = [
      { path: '/mono/pkg/math', content: NEAR_IDENTICAL_A },
      { path: '/mono/pkg/server', content: DISTINCT },
    ]
    const result = dedupeRepoDirs(dirs)
    expect(result.groups.length).toBe(2)
  })

  it('three dirs: 2 near-identical + 1 distinct → 2 groups', () => {
    const dirs: RepoDir[] = [
      { path: '/mono/go', content: NEAR_IDENTICAL_A },
      { path: '/mono/cpp', content: NEAR_IDENTICAL_B },
      { path: '/mono/server', content: DISTINCT },
    ]
    const result = dedupeRepoDirs(dirs)
    expect(result.groups.length).toBe(2)
  })
})
