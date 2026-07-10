/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { detectCapabilities, agfCapabilities, specForTag } from '../core/scan/capability-lexicon.js'
import { scanRepos } from '../core/scan/repo-scanner.js'
import { renderReport, rankGaps, buildInsightNodes } from '../core/scan/insight-report.js'

function makeRepo(root: string, name: string, readme: string, manifest?: { file: string; body: string }): void {
  const dir = path.join(root, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'README.md'), readme, 'utf-8')
  if (manifest) writeFileSync(path.join(dir, manifest.file), manifest.body, 'utf-8')
}

describe('capability lexicon', () => {
  it('detects capabilities from text', () => {
    const caps = detectCapabilities('We ship a content-router and reversible compression (CCR).')
    expect(caps).toContain('content-router')
    expect(caps).toContain('reversible-compression')
  })

  it('agf already-has set excludes provider-failover and output-compression', () => {
    const has = agfCapabilities(['provider', 'compress', 'code'])
    expect(has.has('provider-failover')).toBe(true)
    expect(has.has('output-compression')).toBe(true)
    expect(has.has('code-intel')).toBe(true)
    // content-router is real (core/economy/content-router.ts, wired via economy-pipeline.ts)
    // and lives in AGF_BASE_CAPABILITIES — always present regardless of commandNames.
    expect(has.has('content-router')).toBe(true)
    expect(has.has('reversible-compression')).toBe(false)
  })

  it('every lexicon spec has non-empty insight metadata', () => {
    for (const cap of ['content-router', 'affected-tests', 'lsp-symbolic-edit']) {
      const spec = specForTag(cap)
      expect(spec).toBeDefined()
      expect(spec?.insight.length).toBeGreaterThan(10)
    }
  })

  it('detects the newly-enriched capability tags', () => {
    expect(detectCapabilities('We convert docs with markitdown and the magika mime detector.')).toContain(
      'doc-to-markdown',
    )
    expect(
      detectCapabilities('AirLLM does layer-wise inference and block-wise quantization via bitsandbytes.'),
    ).toContain('local-inference-optimization')
    expect(detectCapabilities('Every node has an Ideal State Artifact with ISC criteria.')).toContain(
      'ideal-state-artifact',
    )
    expect(detectCapabilities('A ubiquitous language glossary lives in CONTEXT.md.')).toContain('domain-vocabulary')
  })
})

describe('scanRepos', () => {
  let root: string

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agf-scan-'))
    makeRepo(
      root,
      'repo-a',
      '# repo-a\nA headroom-style tool with a content-router and reversible compression (CCR).',
      { file: 'package.json', body: '{"name":"repo-a","devDependencies":{"typescript":"5.0.0"}}' },
    )
    makeRepo(
      root,
      'repo-b',
      '# repo-b\nUses an LSP language server, computes affected tests, and runs a file watcher.',
      { file: 'go.mod', body: 'module repo-b\n\ngo 1.22\n' },
    )
    makeRepo(root, 'repo-c', '# repo-c\nSmart provider failover with a fallback chain across providers.', {
      file: 'Cargo.toml',
      body: '[package]\nname = "repo-c"\n',
    })
    // a plain directory that is NOT a repo (no readme/manifest/git) — must be skipped
    mkdirSync(path.join(root, 'not-a-repo'), { recursive: true })
  })

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('throws when the root does not exist', () => {
    expect(() => scanRepos(path.join(root, 'nope'))).toThrow()
  })

  it('fingerprints stacks and capabilities, skips non-repos', () => {
    const res = scanRepos(root)
    const names = res.repos.map((r) => r.name).sort()
    expect(names).toEqual(['repo-a', 'repo-b', 'repo-c'])
    expect(res.summary.scannedCount).toBe(4) // includes not-a-repo
    expect(res.summary.repoCount).toBe(3)

    const a = res.repos.find((r) => r.name === 'repo-a')!
    expect(a.kind).toBe('node-ts')
    expect(a.capabilities).toContain('content-router')
    expect(a.capabilities).toContain('reversible-compression')

    const b = res.repos.find((r) => r.name === 'repo-b')!
    expect(b.kind).toBe('go')
    expect(b.capabilities).toContain('affected-tests')

    const c = res.repos.find((r) => r.name === 'repo-c')!
    expect(c.kind).toBe('rust')
    expect(c.capabilities).toContain('provider-failover')
  })

  it('gap diff surfaces missing capabilities but excludes ones agf already has', () => {
    const res = scanRepos(root)
    const gapCaps = res.insights.map((i) => i.capability)
    expect(gapCaps).toContain('reversible-compression')
    expect(gapCaps).toContain('affected-tests')
    // provider-failover and content-router are in AGF capabilities → never an insight
    expect(gapCaps).not.toContain('provider-failover')
    expect(gapCaps).not.toContain('content-router')
  })

  it('respects exclude and self filters', () => {
    const res = scanRepos(root, { exclude: ['repo-a'], selfName: 'repo-c' })
    const names = res.repos.map((r) => r.name).sort()
    expect(names).toEqual(['repo-b'])
  })
})

describe('insight-report', () => {
  function buildResult() {
    const root = mkdtempSync(path.join(tmpdir(), 'agf-scan-rep-'))
    makeRepo(root, 'r1', '# r1\nreversible compression (CCR), affected tests and an LSP language server.')
    makeRepo(root, 'r2', '# r2\nalso reversible compression (CCR) here.')
    const res = scanRepos(root)
    rmSync(root, { recursive: true, force: true })
    return res
  }

  it('ranks unique gaps and aggregates repos', () => {
    const res = buildResult()
    const gaps = rankGaps(res.insights)
    const reversibleCompression = gaps.find((g) => g.capability === 'reversible-compression')!
    expect(reversibleCompression.repos.sort()).toEqual(['r1', 'r2'])
    // unique, not per-repo
    expect(gaps.filter((g) => g.capability === 'reversible-compression')).toHaveLength(1)
  })

  it('renders a markdown report with a ranked table', () => {
    const res = buildResult()
    const md = renderReport(res, { generatedAt: '2026-06-15' })
    expect(md).toContain('# Sibling-repo insight scan')
    expect(md).toContain('Generated 2026-06-15')
    expect(md).toContain('| Capability | Pillar | Effort | Impact | Seen in | Transferable idea |')
    expect(md).toContain('Reversible compression (CCR)') // ranked-gap label
    expect(md).toContain('## Repo fingerprints')
  })

  it('builds a valid epic + task backlog with edges', () => {
    const res = buildResult()
    const { epic, tasks, edges } = buildInsightNodes(res, { now: '2026-06-15T00:00:00.000Z', label: 'test' })
    const uniqueGaps = new Set(res.insights.map((i) => i.capability)).size
    expect(epic.type).toBe('epic')
    expect(tasks).toHaveLength(uniqueGaps)
    expect(edges).toHaveLength(uniqueGaps)
    for (const t of tasks) {
      expect(t.parentId).toBe(epic.id)
      expect(t.acceptanceCriteria?.length).toBeGreaterThan(0)
    }
    for (const e of edges) {
      expect(e.from).toBe(epic.id)
      expect(e.relationType).toBe('parent_of')
    }
  })

  it('skipCapabilities omits already-ingested gaps', () => {
    const res = buildResult() // gaps include reversible-compression, affected-tests, lsp-symbolic-edit
    const full = buildInsightNodes(res, { now: '2026-06-15T00:00:00.000Z' })
    const skipped = buildInsightNodes(res, {
      now: '2026-06-15T00:00:00.000Z',
      skipCapabilities: new Set(['reversible-compression']),
    })
    expect(skipped.tasks).toHaveLength(full.tasks.length - 1)
    expect(skipped.tasks.some((t) => t.metadata?.capability === 'reversible-compression')).toBe(false)
  })
})

describe('deepened scanner (docs read + recursion)', () => {
  let root: string

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agf-scan-deep-'))
    // README has NO capability keyword; the signal lives only in docs/**.
    const a = path.join(root, 'docs-repo')
    mkdirSync(path.join(a, 'docs', 'sub'), { recursive: true })
    writeFileSync(path.join(a, 'README.md'), '# docs-repo\nNothing special here.', 'utf-8')
    writeFileSync(path.join(a, 'docs', 'sub', 'design.md'), 'We use a content-router for compression.', 'utf-8')

    // A monorepo: parent is not a repo, but a nested child is (depth 2).
    const mono = path.join(root, 'mono')
    mkdirSync(path.join(mono, 'packages', 'inner'), { recursive: true })
    writeFileSync(
      path.join(mono, 'packages', 'inner', 'README.md'),
      '# inner\nShips an LSP language server and affected tests.',
      'utf-8',
    )
  })

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('reads docs/**/*.md (not just the README) for capability detection', () => {
    const res = scanRepos(root)
    const docsRepo = res.repos.find((r) => r.name === 'docs-repo')!
    expect(docsRepo.capabilities).toContain('content-router')
  })

  it('maxDepth>1 fingerprints nested sub-projects in monorepos', () => {
    const shallow = scanRepos(root)
    expect(shallow.repos.some((r) => r.name.includes('inner'))).toBe(false)

    const deep = scanRepos(root, { maxDepth: 3 })
    const inner = deep.repos.find((r) => r.name.endsWith('inner'))
    expect(inner).toBeDefined()
    expect(inner!.name).toContain(path.sep) // relative path, e.g. mono/packages/inner
    expect(inner!.capabilities).toContain('lsp-symbolic-edit')
  })
})
