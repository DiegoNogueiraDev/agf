/*!
 * TDD: cross-file rename via LSP (node_7a33de4c5476).
 *
 * AC: Given um símbolo usado em N arquivos, When o rename roda,
 *     Then todas as ocorrências são renomeadas (re-search do nome antigo = 0).
 */

import { describe, it, expect, vi } from 'vitest'
import { crossFileRename } from '../core/lsp/lsp-refactor-service.js'
import type { LspRefactorServiceDeps } from '../core/lsp/lsp-refactor-service.js'
import type { LspWorkspaceEdit } from '../core/lsp/lsp-types.js'

function makeDeps(): LspRefactorServiceDeps {
  return {
    toFileUri: (f: string) => `file:///${f}`,
    normalizeWorkspaceEdit: (raw: unknown): LspWorkspaceEdit => raw as LspWorkspaceEdit,
    ensureDocumentOpen: vi.fn().mockResolvedValue(undefined),
  }
}

function makeEdit(files: string[]): LspWorkspaceEdit {
  return {
    changes: files.map((file) => ({
      file,
      startLine: 1,
      startCharacter: 0,
      endLine: 1,
      endCharacter: 6,
      newText: 'newName',
    })),
  }
}

describe('crossFileRename', () => {
  it('calls rename then applies the workspace edit across all files', async () => {
    const edit = makeEdit(['a.ts', 'b.ts'])
    const renameFn = vi.fn().mockResolvedValue(edit)
    const applyFn = vi
      .fn()
      .mockResolvedValue({ applied: true, filesModified: ['a.ts', 'b.ts'], totalEdits: 2, errors: [] })

    const result = await crossFileRename(renameFn, applyFn, 'src/a.ts', 1, 0, 'newName')

    expect(renameFn).toHaveBeenCalledWith('src/a.ts', 1, 0, 'newName')
    expect(applyFn).toHaveBeenCalledWith(edit)
    expect(result?.applied).toBe(true)
    expect(result?.filesModified).toHaveLength(2)
  })

  it('returns null when rename returns no edit', async () => {
    const renameFn = vi.fn().mockResolvedValue(null)
    const applyFn = vi.fn()

    const result = await crossFileRename(renameFn, applyFn, 'src/a.ts', 1, 0, 'newName')

    expect(result).toBeNull()
    expect(applyFn).not.toHaveBeenCalled()
  })

  it('reports errors when apply fails on one file', async () => {
    const edit = makeEdit(['a.ts', 'b.ts', 'c.ts'])
    const renameFn = vi.fn().mockResolvedValue(edit)
    const applyFn = vi.fn().mockResolvedValue({
      applied: false,
      filesModified: ['a.ts'],
      totalEdits: 1,
      errors: ['b.ts: write failed'],
    })

    const result = await crossFileRename(renameFn, applyFn, 'src/a.ts', 1, 0, 'newName')

    expect(result?.applied).toBe(false)
    expect(result?.errors).toContain('b.ts: write failed')
  })

  it('applies rename across zero files gracefully', async () => {
    const edit: LspWorkspaceEdit = { changes: [] }
    const renameFn = vi.fn().mockResolvedValue(edit)
    const applyFn = vi.fn().mockResolvedValue({ applied: true, filesModified: [], totalEdits: 0, errors: [] })

    const result = await crossFileRename(renameFn, applyFn, 'src/a.ts', 1, 0, 'newName')

    expect(result?.filesModified).toHaveLength(0)
    expect(result?.applied).toBe(true)
  })
})
