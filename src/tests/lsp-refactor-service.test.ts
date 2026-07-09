/*!
 * Tests for src/core/lsp/lsp-refactor-service.ts
 * AC: rename delegates to LSP; no-server returns null; NOT cached (write op).
 */

import { describe, it, expect, vi } from 'vitest'
import { LspRefactorService } from '../core/lsp/lsp-refactor-service.js'
import type { LspRefactorServiceDeps } from '../core/lsp/lsp-refactor-service.js'

function makeClient(response: unknown = null) {
  return { sendRequest: vi.fn().mockResolvedValue(response) }
}

function makeDeps(): LspRefactorServiceDeps {
  return {
    toFileUri: (f: string) => `file:///${f}`,
    normalizeWorkspaceEdit: (_raw: unknown) => ({
      changes: [{ file: 'foo.ts', startLine: 1, startCharacter: 0, endLine: 1, endCharacter: 3, newText: 'bar' }],
    }),
    ensureDocumentOpen: vi.fn().mockResolvedValue(undefined),
  }
}

describe('LspRefactorService', () => {
  it('returns null when client is null (no server available)', async () => {
    const deps = makeDeps()
    const svc = new LspRefactorService(deps)
    const result = await svc.rename(null, 'test.ts', 1, 0, 'newName')
    expect(result).toBeNull()
  })

  it('sends textDocument/rename and maps the result', async () => {
    const rawEdit = { changes: { 'file:///test.ts': [] } }
    const client = makeClient(rawEdit)
    const deps = makeDeps()
    const svc = new LspRefactorService(deps)
    const result = await svc.rename(client as never, 'test.ts', 1, 0, 'newName')
    expect(result).not.toBeNull()
    expect(client.sendRequest).toHaveBeenCalledWith(
      'textDocument/rename',
      expect.objectContaining({ newName: 'newName' }),
    )
    expect(deps.ensureDocumentOpen).toHaveBeenCalledOnce()
  })

  it('returns null when server returns no edit', async () => {
    const client = makeClient(null)
    const deps = makeDeps()
    const svc = new LspRefactorService(deps)
    const result = await svc.rename(client as never, 'test.ts', 5, 3, 'x')
    expect(result).toBeNull()
  })

  it('converts 1-indexed line to 0-indexed for LSP protocol', async () => {
    const client = makeClient({ changes: {} })
    const deps = makeDeps()
    const svc = new LspRefactorService(deps)
    await svc.rename(client as never, 'test.ts', 3, 5, 'renamed')
    const callParams = client.sendRequest.mock.calls[0][1] as { position: { line: number; character: number } }
    expect(callParams.position.line).toBe(2) // 3 - 1 = 2 (0-indexed)
    expect(callParams.position.character).toBe(5)
  })
})
