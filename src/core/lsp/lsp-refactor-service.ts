/*!
 * LspRefactorService — owns rename (write op, never cached).
 * Extracted from LspBridge (SRP). Bridge delegates to this class.
 *
 * WHY: rename is a write operation with its own protocol concerns; keeping it
 * separate from read/cache operations makes the boundary explicit.
 * Composing: lsp-bridge.ts → this; lsp-types.ts for shared types.
 */

import { createLogger } from '../utils/logger.js'
import type { LspWorkspaceEdit, EditApplyResult } from './lsp-types.js'

const log = createLogger({ layer: 'core', source: 'lsp-refactor-service.ts' })

type RefactorClient = { sendRequest: <T>(method: string, params: unknown) => Promise<T | null> } | null

export interface LspRefactorServiceDeps {
  toFileUri(file: string): string
  normalizeWorkspaceEdit(raw: unknown): LspWorkspaceEdit
  ensureDocumentOpen(
    client: { sendNotification: (method: string, params: unknown) => void },
    file: string,
    absPath: string,
  ): Promise<void>
}

/**
 * Cross-file rename: chains a rename call with an apply call.
 * Kept as a free function (not a method) so callers can inject both halves independently.
 *
 * @param renameFn - calls textDocument/rename and returns the workspace edit
 * @param applyFn  - applies the workspace edit to disk
 * @returns EditApplyResult (multi-file), or null when rename returns no edit
 */
export async function crossFileRename(
  renameFn: (file: string, line: number, character: number, newName: string) => Promise<LspWorkspaceEdit | null>,
  applyFn: (edit: LspWorkspaceEdit) => Promise<EditApplyResult>,
  file: string,
  line: number,
  character: number,
  newName: string,
): Promise<EditApplyResult | null> {
  const edit = await renameFn(file, line, character, newName)
  if (!edit) return null
  return applyFn(edit)
}

/** Handles LSP rename (refactor) on behalf of LspBridge. Never uses cache — rename is a write op. */
export class LspRefactorService {
  constructor(private readonly deps: LspRefactorServiceDeps) {}

  async rename(
    client: RefactorClient,
    file: string,
    line: number,
    character: number,
    newName: string,
    absPath?: string,
  ): Promise<LspWorkspaceEdit | null> {
    if (!client) {
      log.warn('lsp-refactor-service:rename no server available', { file })
      return null
    }

    await this.deps.ensureDocumentOpen(client as never, file, absPath ?? file)

    try {
      const raw = await client.sendRequest<unknown>('textDocument/rename', {
        textDocument: { uri: this.deps.toFileUri(file) },
        position: { line: line - 1, character },
        newName,
      })

      if (!raw) return null

      return this.deps.normalizeWorkspaceEdit(raw)
    } catch (err) {
      log.error('lsp-refactor-service:rename failed', { file, error: err instanceof Error ? err.message : String(err) })
      return null
    }
  }
}
