/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkDocSync, DOC_BASELINE_FILE } from '../core/hooks/doc-sync-hook.js'
import { hashDocContent } from '../core/hooks/doc-sync-guard.js'

const DAY_MS = 24 * 60 * 60 * 1000

function makeProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'agf-docsync-'))
  mkdirSync(join(dir, 'workflow-graph'), { recursive: true })
  // graph.db present so its mtime is "now" (proxy for latest node activity)
  writeFileSync(join(dir, 'workflow-graph', 'graph.db'), 'x')
  return dir
}

describe('checkDocSync', () => {
  let dir: string
  beforeEach(() => {
    dir = makeProject()
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('is disabled via MCP_GRAPH_DOC_SYNC=off (opt-out preserved)', () => {
    writeFileSync(join(dir, 'CLAUDE.md'), '# docs')
    const report = checkDocSync({ cwd: dir, env: { MCP_GRAPH_DOC_SYNC: 'off' } })
    expect(report.disabled).toBe(true)
    expect(report.checked).toBe(0)
    expect(report.advisories).toHaveLength(0)
  })

  it('records a baseline on first run and does not warn', () => {
    writeFileSync(join(dir, 'CLAUDE.md'), '# project docs')
    const report = checkDocSync({ cwd: dir, env: {} })
    expect(report.disabled).toBe(false)
    expect(report.checked).toBeGreaterThanOrEqual(1)
    expect(report.advisories).toHaveLength(0)
    expect(report.baselinesWritten).toBeGreaterThanOrEqual(1)
    expect(existsSync(join(dir, 'workflow-graph', DOC_BASELINE_FILE))).toBe(true)
  })

  it('emits a stale_doc advisory when doc is old but graph moved on', () => {
    const content = '# CLAUDE\nunchanged content'
    writeFileSync(join(dir, 'CLAUDE.md'), content)
    // Seed a baseline with the SAME hash but recorded 10 days ago.
    const baselines = {
      'CLAUDE.md': { path: 'CLAUDE.md', hash: hashDocContent(content), recordedAt: Date.now() - 10 * DAY_MS },
    }
    writeFileSync(join(dir, 'workflow-graph', DOC_BASELINE_FILE), JSON.stringify(baselines))
    const report = checkDocSync({ cwd: dir, env: {} })
    const stale = report.advisories.find((a) => a.path === 'CLAUDE.md')
    expect(stale).toBeDefined()
    expect(stale?.reason).toBe('stale_doc')
    expect(stale?.ageDays).toBeGreaterThan(7)
  })

  it('refreshes the baseline (no warn) when content changed', () => {
    const content = '# CLAUDE v2'
    writeFileSync(join(dir, 'CLAUDE.md'), content)
    const baselines = {
      'CLAUDE.md': { path: 'CLAUDE.md', hash: hashDocContent('# CLAUDE v1'), recordedAt: Date.now() - 10 * DAY_MS },
    }
    writeFileSync(join(dir, 'workflow-graph', DOC_BASELINE_FILE), JSON.stringify(baselines))
    const report = checkDocSync({ cwd: dir, env: {} })
    expect(report.advisories).toHaveLength(0)
    const written = JSON.parse(readFileSync(join(dir, 'workflow-graph', DOC_BASELINE_FILE), 'utf8'))
    expect(written['CLAUDE.md'].hash).toBe(hashDocContent(content))
  })

  it('never throws when the project has no docs at all', () => {
    expect(() => checkDocSync({ cwd: dir, env: {} })).not.toThrow()
  })
})
