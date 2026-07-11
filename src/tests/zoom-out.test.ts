/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { globSync } from 'glob'
import {
  buildMermaid,
  analyzeZoomOut,
  resolveModuleSpecifier,
  CENTRAL_FAN_IN_THRESHOLD,
} from '../core/analyzer/zoom-out.js'
import { extractImportSpecifiers } from '../core/analyzer/seam-audit.js'

describe('CENTRAL_FAN_IN_THRESHOLD', () => {
  it('is defined as 5', () => {
    expect(CENTRAL_FAN_IN_THRESHOLD).toBe(5)
  })
})

describe('buildMermaid', () => {
  it('generates a graph TD diagram', () => {
    const nodes = [
      { file: 'src/a.ts', fanIn: 0, fanOut: 1 },
      { file: 'src/b.ts', fanIn: 1, fanOut: 0 },
    ]
    const edges = [{ from: 'src/a.ts', to: 'src/b.ts' }]
    const result = buildMermaid(nodes, edges)
    expect(result).toContain('graph TD')
    expect(result).toContain('a["src/a.ts"]')
    expect(result).toContain('b["src/b.ts"]')
    expect(result).toContain('-->')
  })

  it('escape double quotes in file labels', () => {
    const nodes = [{ file: 'src/"test".ts', fanIn: 0, fanOut: 0 }]
    const result = buildMermaid(nodes, [])
    expect(result).toContain('\\"')
  })

  it('returns graph TD header even with empty nodes', () => {
    expect(buildMermaid([], [])).toBe('graph TD')
  })

  it('skips edges where node not in nodes list', () => {
    const nodes = [{ file: 'src/a.ts', fanIn: 0, fanOut: 1 }]
    const edges = [{ from: 'src/a.ts', to: 'src/missing.ts' }]
    const result = buildMermaid(nodes, edges)
    expect(result).not.toContain('missing')
  })
})

describe('analyzeZoomOut', () => {
  it('identifies central modules, leaves and islands', () => {
    const files = ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts']
    const edges = [
      { from: 'src/a.ts', to: 'src/c.ts' },
      { from: 'src/b.ts', to: 'src/c.ts' },
      { from: 'src/a.ts', to: 'src/b.ts' },
    ]
    const report = analyzeZoomOut(files, edges, 2)
    expect(report.central).toContain('src/c.ts') // fanIn=2 >= threshold=2
    expect(report.leaves).toContain('src/c.ts') // fanOut=0, fanIn>0
    expect(report.islands).toContain('src/d.ts') // fanIn=0, fanOut=0
    expect(report.nodes).toHaveLength(4)
  })

  it('uses default threshold of 5', () => {
    const files = ['src/a.ts']
    expect(analyzeZoomOut(files, []).mermaid).toContain('a["src/a.ts"]')
  })

  it('handles nodes with no edges', () => {
    const report = analyzeZoomOut(['src/a.ts', 'src/b.ts'], [])
    expect(report.nodes).toHaveLength(2)
    expect(report.central).toEqual([])
    expect(report.islands).toEqual(['src/a.ts', 'src/b.ts'])
  })

  it('computes fan-in and fan-out correctly', () => {
    const files = ['src/a.ts', 'src/b.ts', 'src/c.ts']
    const edges = [
      { from: 'src/a.ts', to: 'src/b.ts' },
      { from: 'src/a.ts', to: 'src/c.ts' },
      { from: 'src/b.ts', to: 'src/c.ts' },
    ]
    const report = analyzeZoomOut(files, edges, 5)
    const nodeA = report.nodes.find((n) => n.file === 'src/a.ts')
    const nodeB = report.nodes.find((n) => n.file === 'src/b.ts')
    const nodeC = report.nodes.find((n) => n.file === 'src/c.ts')
    expect(nodeA?.fanOut).toBe(2)
    expect(nodeA?.fanIn).toBe(0)
    expect(nodeB?.fanOut).toBe(1)
    expect(nodeB?.fanIn).toBe(1)
    expect(nodeC?.fanOut).toBe(0)
    expect(nodeC?.fanIn).toBe(2)
  })
})

describe('resolveModuleSpecifier', () => {
  const knownFiles = new Set(['src/core/code/code-store.ts', 'src/b.ts', 'src/dir/index.ts'])

  it('resolves a relative .js specifier to the sibling .ts file', () => {
    expect(resolveModuleSpecifier('src/a.ts', './b.js', knownFiles)).toBe('src/b.ts')
  })

  it('resolves a relative specifier that walks up a directory', () => {
    expect(resolveModuleSpecifier('src/core/analyzer/zoom-out.ts', '../code/code-store.js', knownFiles)).toBe(
      'src/core/code/code-store.ts',
    )
  })

  it('resolves a directory specifier to its index.ts', () => {
    expect(resolveModuleSpecifier('src/a.ts', './dir', knownFiles)).toBe('src/dir/index.ts')
  })

  it('returns null for non-relative (package) specifiers', () => {
    expect(resolveModuleSpecifier('src/a.ts', 'node:fs', knownFiles)).toBeNull()
    expect(resolveModuleSpecifier('src/a.ts', 'commander', knownFiles)).toBeNull()
  })

  it('returns null when the resolved path is not a known file', () => {
    expect(resolveModuleSpecifier('src/a.ts', './missing.js', knownFiles)).toBeNull()
  })
})

describe('analyzeZoomOut against the real corpus/', () => {
  // The fixture-only gate (node_61e14cd0711a) exists precisely because a
  // hand-built fixture proves the happy path, not that a core module
  // survives real input — so this resolves imports across agf's OWN
  // src/core/analyzer tree (the actual corpus), not synthetic strings.
  it('resolves real relative imports and produces a structurally valid report', () => {
    const repoRoot = join(import.meta.dirname, '..', '..')
    const files = globSync('src/core/analyzer/*.ts', { cwd: repoRoot })
    const knownFiles = new Set(files)

    const edges = files.flatMap((file) => {
      const content = readFileSync(join(repoRoot, file), 'utf-8')
      return extractImportSpecifiers(content)
        .map((specifier) => resolveModuleSpecifier(file, specifier, knownFiles))
        .filter((resolved): resolved is string => resolved !== null)
        .map((to) => ({ from: file, to }))
    })

    const report = analyzeZoomOut(files, edges)
    expect(report.nodes.length).toBe(files.length)
    expect(report.mermaid).toContain('graph TD')
    for (const edge of edges) {
      expect(files).toContain(edge.from)
      expect(files).toContain(edge.to)
    }
  })
})
