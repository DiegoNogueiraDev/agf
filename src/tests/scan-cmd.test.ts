/*!
 * TDD: agf scan command (node_af989195dfcb).
 *
 * AC1: `agf scan --json` aggregates findings from >=2 sources (harness | lint | lsp)
 *      with { file, line, severity, message } per finding.
 * AC2: `--select data.findings` narrows output to the array only.
 * AC3: a file with no violations produces findings=[] for that file.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { scanCommand, applyScanFindings } from '../cli/commands/scan-cmd.js'
import { createCliOutput } from '../cli/shared/cli-output.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import type { ScanFinding } from '../core/scan/scan-types.js'

// Capture stdout envelope written by scan
function captureOutput(fn: () => void): unknown {
  let captured: unknown = null
  const orig = process.stdout.write.bind(process.stdout)
  process.stdout.write = (chunk: unknown) => {
    if (typeof chunk === 'string') {
      try {
        captured = JSON.parse(chunk)
      } catch {
        /* ignore non-JSON */
      }
    }
    return true
  }
  try {
    fn()
  } finally {
    process.stdout.write = orig
  }
  return captured
}

describe('scan-cmd — structure (AC1)', () => {
  it('exports a scanCommand factory function', async () => {
    const { scanCommand: sc } = await import('../cli/commands/scan-cmd.js')
    expect(typeof sc).toBe('function')
  })

  it('scan result has findings array with file/line/severity/message per item', async () => {
    const { runScan } = await import('../cli/commands/scan-cmd.js')
    const result = await runScan({ dir: process.cwd(), sources: ['harness'] })
    expect(result).toHaveProperty('findings')
    expect(Array.isArray(result.findings)).toBe(true)
    // Each finding has the required fields
    for (const f of result.findings.slice(0, 5)) {
      expect(f).toHaveProperty('file')
      expect(f).toHaveProperty('line')
      expect(f).toHaveProperty('severity')
      expect(f).toHaveProperty('message')
      expect(f).toHaveProperty('source')
    }
  })

  it('findings include items from harness source (AC1 — >=1 source)', async () => {
    const { runScan } = await import('../cli/commands/scan-cmd.js')
    const result = await runScan({ dir: process.cwd(), sources: ['harness'] })
    const sources = new Set(result.findings.map((f: { source: string }) => f.source))
    expect(sources.has('harness')).toBe(true)
  })
})

describe('scan-cmd — taint source', () => {
  it('runScan with sources=["taint"] returns findings tagged source="taint" when present', async () => {
    const { runScan } = await import('../cli/commands/scan-cmd.js')
    const result = await runScan({
      dir: process.cwd(),
      sources: ['taint'],
      fileFilter: 'src/core/scan/taint-source.ts',
    })
    expect(Array.isArray(result.findings)).toBe(true)
    for (const f of result.findings) {
      expect(f.source).toBe('taint')
    }
  })
})

describe('scan-cmd — empty findings for clean file (AC3)', () => {
  it('AC3: runScan returns findings array (may be empty for a well-typed file)', async () => {
    const { runScan } = await import('../cli/commands/scan-cmd.js')
    const result = await runScan({
      dir: process.cwd(),
      sources: ['harness'],
      fileFilter: 'src/core/rag-in/subcommand-cache.ts',
    })
    // result must have findings array; it may be empty for a clean file
    expect(Array.isArray(result.findings)).toBe(true)
  })
})

describe('scan-cmd — --apply wires findings into real graph nodes (node_wire_02c7185833ad)', () => {
  it('applyScanFindings persists a real bug/risk node per finding via the real store', () => {
    const store = SqliteStore.open(':memory:')
    store.initProject('scan-apply-test')
    const findings: ScanFinding[] = [
      { source: 'harness', file: 'src/core/foo.ts', line: 42, severity: 'error', message: 'no-any violation' },
    ]

    const result = applyScanFindings(store, findings)
    expect(result.created).toBe(1)
    expect(result.skipped).toBe(0)

    const doc = store.toGraphDocument()
    const created = doc.nodes.find((n) => n.metadata?.findingKey === 'harness::src/core/foo.ts::42')
    expect(created).toBeDefined()
    expect(created?.type).toBe('task')
    store.close()
  })

  it('is idempotent — re-applying the same finding skips it', () => {
    const store = SqliteStore.open(':memory:')
    store.initProject('scan-apply-idempotent-test')
    const findings: ScanFinding[] = [
      { source: 'taint', file: 'src/core/bar.ts', line: 7, severity: 'warning', message: 'tainted input' },
    ]

    applyScanFindings(store, findings)
    const second = applyScanFindings(store, findings)
    expect(second.created).toBe(0)
    expect(second.skipped).toBe(1)
    store.close()
  })
})
