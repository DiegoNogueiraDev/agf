/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/lifecycle-cmd.ts — wires the dormant
 * runLifecycleFacade (src/core/planner/lifecycle-facade.ts) to the CLI by
 * reusing the analyzer sections already computed by buildAnalyzerReport.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildAnalyzerReport } from '../core/analyzer/index.js'
import type { AnalyzerReport } from '../core/analyzer/index.js'
import { buildLifecycleModeInvoker, runLifecycleCli, lifecycleCommand } from '../cli/commands/lifecycle-cmd.js'
import type { GraphDocument } from '../core/graph/graph-types.js'

function emptyDoc(): GraphDocument {
  return {
    version: '1.0',
    project: { id: 'p1', name: 'test', createdAt: '', updatedAt: '' },
    nodes: [],
    edges: [],
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  }
}

describe('lifecycle-cmd', () => {
  let dir: string
  let report: AnalyzerReport

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-lifecycle-cmd-'))
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
    report = buildAnalyzerReport(emptyDoc(), dir)
  })

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  describe('buildLifecycleModeInvoker', () => {
    it('resolves a mapped mode to the matching analyzer section', async () => {
      const invoker = buildLifecycleModeInvoker(report)
      const result = await invoker('prd_quality')
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.payload).toEqual({ ...report.graph.prdQuality })
    })

    it('returns ok:false for a mode with no wired analyzer', async () => {
      const invoker = buildLifecycleModeInvoker(report)
      const result = await invoker('adr_challenge')
      expect(result.ok).toBe(false)
    })
  })

  describe('runLifecycleCli', () => {
    it('fans out VALIDATE phase modes using the analyzer report', async () => {
      const store = { toGraphDocument: () => emptyDoc() }
      const facadeReport = await runLifecycleCli(store, 'VALIDATE', dir)
      expect(facadeReport.phase).toBe('VALIDATE')
      expect(facadeReport.modes.length).toBeGreaterThan(0)
      expect(Object.keys(facadeReport.outputs)).toEqual(expect.arrayContaining(['test_coverage', 'data_integrity']))
    })

    it('runs only the requested subCheck mode', async () => {
      const store = { toGraphDocument: () => emptyDoc() }
      const facadeReport = await runLifecycleCli(store, 'ANALYZE', dir, 'prd_quality')
      expect(facadeReport.modes).toEqual(['prd_quality'])
    })
  })

  describe('lifecycleCommand', () => {
    it('builds the "lifecycle" command with a phase argument', () => {
      const cmd = lifecycleCommand()
      expect(cmd.name()).toBe('lifecycle')
      expect(cmd.description().length).toBeGreaterThan(0)
    })
  })
})
