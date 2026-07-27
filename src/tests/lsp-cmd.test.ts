/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/lsp-cmd.ts — wires LspBridge (node_wire_344d2edf3ee6),
 * the LSP subsystem facade that had no caller (src/core/lsp/lsp-bridge.ts).
 * Also wires LspEditApplier (node_wire_c39b6b4f1fdb), which had no CLI caller
 * (src/core/lsp/lsp-edit-applier.ts) — see `agf lsp apply-edit` below.
 * Also wires findSymbolByPath (node_wire_491687c71cb4), which had no CLI caller
 * (src/core/lsp/symbol-path-resolver.ts) — see `agf lsp find-symbol` below.
 */
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { lspCommand } from '../cli/commands/lsp-cmd.js'

function lastEnvelope(out: string[]): Record<string, unknown> {
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

async function run(args: string[]): Promise<Record<string, unknown>> {
  const out: string[] = []
  const spy = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: unknown) => {
    out.push(String(chunk))
    return true
  }) as typeof process.stdout.write
  try {
    await lspCommand().parseAsync(args, { from: 'user' })
  } finally {
    process.stdout.write = spy
  }
  return lastEnvelope(out)
}

describe('agf lsp status (node_wire_344d2edf3ee6)', () => {
  // AC1: GIVEN a project directory WHEN `agf lsp status` runs THEN it lists configured language servers
  it('returns the configured language servers with a status field', async () => {
    const baseDir = mkdtempSync(path.join(tmpdir(), 'lsp-cmd-test-'))
    try {
      const result = await run(['status', '--dir', baseDir])
      expect(result.ok).toBe(true)
      const data = result.data as { servers: Array<{ languageId: string; status: string }> }
      expect(data.servers.length).toBeGreaterThan(0)
      expect(data.servers.every((s) => typeof s.languageId === 'string' && typeof s.status === 'string')).toBe(true)
    } finally {
      rmSync(baseDir, { recursive: true, force: true })
    }
  })

  // AC2: GIVEN no server has been started WHEN `agf lsp status` runs THEN every entry reports 'stopped'
  it('reports stopped for every server when none has been started', async () => {
    const baseDir = mkdtempSync(path.join(tmpdir(), 'lsp-cmd-test-'))
    try {
      const result = await run(['status', '--dir', baseDir])
      const data = result.data as { servers: Array<{ status: string }> }
      expect(data.servers.every((s) => s.status === 'stopped')).toBe(true)
    } finally {
      rmSync(baseDir, { recursive: true, force: true })
    }
  })
})

describe('agf lsp apply-edit (node_wire_c39b6b4f1fdb)', () => {
  // AC1: GIVEN a valid workspace edit JSON WHEN `agf lsp apply-edit` runs THEN it writes the change to disk
  it('applies a workspace edit to disk and reports the modified file', async () => {
    const baseDir = mkdtempSync(path.join(tmpdir(), 'lsp-cmd-apply-test-'))
    const target = path.join(baseDir, 'sample.txt')
    writeFileSync(target, 'hello world\n', 'utf-8')
    try {
      const edit = JSON.stringify({
        changes: [{ file: target, startLine: 1, startCharacter: 0, endLine: 1, endCharacter: 5, newText: 'goodbye' }],
      })
      const result = await run(['apply-edit', '--edit', edit])
      expect(result.ok).toBe(true)
      const data = result.data as { applied: boolean; filesModified: string[]; totalEdits: number }
      expect(data.applied).toBe(true)
      expect(data.filesModified).toEqual([target])
      expect(data.totalEdits).toBe(1)
      expect(readFileSync(target, 'utf-8')).toBe('goodbye world\n')
    } finally {
      rmSync(baseDir, { recursive: true, force: true })
    }
  })

  // AC2: GIVEN malformed --edit JSON WHEN `agf lsp apply-edit` runs THEN it fails with INVALID_EDIT and touches no file
  it('rejects malformed --edit JSON without touching any file', async () => {
    const result = await run(['apply-edit', '--edit', 'not-json'])
    expect(result.ok).toBe(false)
    expect(result.code).toBe('INVALID_EDIT')
  })
})

describe('agf lsp find-symbol (node_wire_491687c71cb4)', () => {
  // AC1: GIVEN a symbol tree JSON and a nested name path WHEN `agf lsp find-symbol` runs THEN it returns the matching symbol's location
  it('finds a nested symbol by name path and reports its location', async () => {
    const symbols = JSON.stringify([
      {
        name: 'MyClass',
        kind: 'class',
        file: 'src/example.ts',
        startLine: 0,
        endLine: 10,
        children: [{ name: 'myMethod', kind: 'method', file: 'src/example.ts', startLine: 2, endLine: 4 }],
      },
    ])
    const result = await run([
      'find-symbol',
      '--symbols',
      symbols,
      '--path',
      'MyClass/myMethod',
      '--file',
      'src/example.ts',
    ])
    expect(result.ok).toBe(true)
    const data = result.data as {
      found: boolean
      symbol?: { name: string; location: { startLine: number; endLine: number } }
    }
    expect(data.found).toBe(true)
    expect(data.symbol?.name).toBe('myMethod')
    expect(data.symbol?.location.startLine).toBe(2)
    expect(data.symbol?.location.endLine).toBe(4)
  })

  // AC2: GIVEN a name path that matches nothing in the tree WHEN `agf lsp find-symbol` runs THEN it reports found=false
  it('reports found=false when the name path matches nothing', async () => {
    const symbols = JSON.stringify([
      { name: 'MyClass', kind: 'class', file: 'src/example.ts', startLine: 0, endLine: 10 },
    ])
    const result = await run([
      'find-symbol',
      '--symbols',
      symbols,
      '--path',
      'DoesNotExist',
      '--file',
      'src/example.ts',
    ])
    expect(result.ok).toBe(true)
    const data = result.data as { found: boolean }
    expect(data.found).toBe(false)
  })

  // AC3: GIVEN malformed --symbols JSON WHEN `agf lsp find-symbol` runs THEN it fails with INVALID_SYMBOLS
  it('rejects malformed --symbols JSON', async () => {
    const result = await run(['find-symbol', '--symbols', 'not-json', '--path', 'Foo', '--file', 'src/example.ts'])
    expect(result.ok).toBe(false)
    expect(result.code).toBe('INVALID_SYMBOLS')
  })
})
