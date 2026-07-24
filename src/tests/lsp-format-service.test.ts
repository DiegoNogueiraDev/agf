/*!
 * Tests for src/core/lsp/lsp-format-service.ts
 * AC: formatDocument, formatRange, getCodeActions delegate correctly; bridge-via-stub.
 */

import { describe, it, expect, vi } from 'vitest'
import { LspFormatService } from '../core/lsp/lsp-format-service.js'
import type { LspFormatServiceDeps } from '../core/lsp/lsp-format-service.js'

function makeClient(response: unknown = null) {
  return { sendRequest: vi.fn().mockResolvedValue(response) }
}

function makeDeps(client: ReturnType<typeof makeClient>): LspFormatServiceDeps {
  return {
    toFileUri: (f: string) => `file:///${f}`,
    normalizeWorkspaceEdit: (raw: unknown) => ({ changes: [] }),
    ensureDocumentOpen: vi.fn().mockResolvedValue(undefined),
  }
}

describe('LspFormatService', () => {
  it('formatDocument returns empty array when client is null', async () => {
    const deps = makeDeps(makeClient())
    const svc = new LspFormatService(deps)
    const result = await svc.formatDocument(null, 'test.ts')
    expect(result).toEqual([])
  })

  it('formatDocument maps raw LSP edits to LspTextEdit (1-indexed lines)', async () => {
    const raw = [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, newText: 'hello' }]
    const client = makeClient(raw)
    const deps = makeDeps(client)
    const svc = new LspFormatService(deps)
    const result = await svc.formatDocument(client as never, 'test.ts')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ startLine: 1, endLine: 1, newText: 'hello', file: 'test.ts' })
    expect(deps.ensureDocumentOpen).toHaveBeenCalledOnce()
  })

  it('formatRange maps raw LSP edits', async () => {
    const raw = [{ range: { start: { line: 2, character: 0 }, end: { line: 2, character: 4 } }, newText: 'TEST' }]
    const client = makeClient(raw)
    const deps = makeDeps(client)
    const svc = new LspFormatService(deps)
    const result = await svc.formatRange(client as never, 'test.ts', 3, 0, 3, 4)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ startLine: 3, newText: 'TEST' })
  })

  it('getCodeActions filters by kinds client-side', async () => {
    const raw = [
      { title: 'Fix A', kind: 'quickfix.lint' },
      { title: 'Refactor B', kind: 'refactor.extract' },
    ]
    const client = makeClient(raw)
    const deps = makeDeps(client)
    const svc = new LspFormatService(deps)
    const result = await svc.getCodeActions(client as never, 'test.ts', 1, 0, 1, 10, ['quickfix'])
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Fix A')
  })

  it('getCodeActions returns empty on null client', async () => {
    const deps = makeDeps(makeClient())
    const svc = new LspFormatService(deps)
    const result = await svc.getCodeActions(null, 'test.ts', 1, 0, 1, 5)
    expect(result).toEqual([])
  })
})
