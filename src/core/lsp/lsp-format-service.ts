/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * LspFormatService — owns formatDocument, formatRange, and getCodeActions.
 * Extracted from LspBridge (SRP). Bridge delegates to this class.
 *
 * WHY: LspBridge was growing into a god class; formatting/code-action
 * concerns have their own request/response shape and belong here.
 * Composing: lsp-bridge.ts → this; lsp-types.ts for shared types.
 */

import { createLogger } from '../utils/logger.js'
import type { LspTextEdit, LspWorkspaceEdit, LspCodeAction } from './lsp-types.js'

const log = createLogger({ layer: 'core', source: 'lsp-format-service.ts' })

type RawEdit = {
  range: { start: { line: number; character: number }; end: { line: number; character: number } }
  newText: string
}

type FormatClient = { sendRequest: <T>(method: string, params: unknown) => Promise<T | null> } | null

export interface LspFormatServiceDeps {
  toFileUri(file: string): string
  normalizeWorkspaceEdit(raw: unknown): LspWorkspaceEdit
  ensureDocumentOpen(
    client: { sendNotification: (method: string, params: unknown) => void },
    file: string,
    absPath: string,
  ): Promise<void>
}

/** Handles LSP formatting and code-action requests on behalf of LspBridge. */
export class LspFormatService {
  constructor(private readonly deps: LspFormatServiceDeps) {}

  async formatDocument(
    client: FormatClient,
    file: string,
    absPath?: string,
    options?: { tabSize?: number; insertSpaces?: boolean },
  ): Promise<LspTextEdit[]> {
    if (!client) {
      log.warn('lsp-format-service:formatDocument no server available', { file })
      return []
    }

    await this.deps.ensureDocumentOpen(client as never, file, absPath ?? file)

    try {
      const raw = await client.sendRequest<RawEdit[]>('textDocument/formatting', {
        textDocument: { uri: this.deps.toFileUri(file) },
        options: { tabSize: options?.tabSize ?? 2, insertSpaces: options?.insertSpaces ?? true },
      })
      if (!raw) return []
      return raw.map((edit) => this.toTextEdit(file, edit))
    } catch (err) {
      log.error('lsp-format-service:formatDocument failed', {
        file,
        error: err instanceof Error ? err.message : String(err),
      })
      return []
    }
  }

  async formatRange(
    client: FormatClient,
    file: string,
    startLine: number,
    startCharacter: number,
    endLine: number,
    endCharacter: number,
    absPath?: string,
    options?: { tabSize?: number; insertSpaces?: boolean },
  ): Promise<LspTextEdit[]> {
    if (!client) {
      log.warn('lsp-format-service:formatRange no server available', { file })
      return []
    }

    await this.deps.ensureDocumentOpen(client as never, file, absPath ?? file)

    try {
      const raw = await client.sendRequest<RawEdit[]>('textDocument/rangeFormatting', {
        textDocument: { uri: this.deps.toFileUri(file) },
        range: {
          start: { line: startLine - 1, character: startCharacter },
          end: { line: endLine - 1, character: endCharacter },
        },
        options: { tabSize: options?.tabSize ?? 2, insertSpaces: options?.insertSpaces ?? true },
      })
      if (!raw) return []
      return raw.map((edit) => this.toTextEdit(file, edit))
    } catch (err) {
      log.error('lsp-format-service:formatRange failed', {
        file,
        error: err instanceof Error ? err.message : String(err),
      })
      return []
    }
  }

  async getCodeActions(
    client: FormatClient,
    file: string,
    startLine: number,
    startCharacter: number,
    endLine: number,
    endCharacter: number,
    kinds?: string[],
    absPath?: string,
  ): Promise<LspCodeAction[]> {
    if (!client) {
      log.warn('lsp-format-service:getCodeActions no server available', { file })
      return []
    }

    await this.deps.ensureDocumentOpen(client as never, file, absPath ?? file)

    try {
      const raw = await client.sendRequest<
        Array<{ title: string; kind?: string; isPreferred?: boolean; edit?: unknown }>
      >('textDocument/codeAction', {
        textDocument: { uri: this.deps.toFileUri(file) },
        range: {
          start: { line: startLine - 1, character: startCharacter },
          end: { line: endLine - 1, character: endCharacter },
        },
        context: { diagnostics: [], ...(kinds ? { only: kinds } : {}) },
      })
      if (!raw) return []

      let actions: LspCodeAction[] = raw.map((a) => ({
        title: a.title,
        kind: a.kind,
        isPreferred: a.isPreferred,
        edit: a.edit ? this.deps.normalizeWorkspaceEdit(a.edit) : undefined,
      }))

      if (kinds && kinds.length > 0) {
        actions = actions.filter((a) => a.kind && kinds.some((k) => (a.kind as string).startsWith(k)))
      }

      return actions
    } catch (err) {
      log.error('lsp-format-service:getCodeActions failed', {
        file,
        error: err instanceof Error ? err.message : String(err),
      })
      return []
    }
  }

  private toTextEdit(file: string, edit: RawEdit): LspTextEdit {
    return {
      file,
      startLine: edit.range.start.line + 1,
      startCharacter: edit.range.start.character,
      endLine: edit.range.end.line + 1,
      endCharacter: edit.range.end.character,
      newText: edit.newText,
    }
  }
}
