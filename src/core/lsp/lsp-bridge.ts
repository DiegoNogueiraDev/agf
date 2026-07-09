/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * LspBridge — thin facade over the LSP subsystem.
 *
 * WHY: Centralises all LSP surface (navigation, diagnostics, refactor, format,
 * document state) behind a single entry-point so callers never reach into
 * individual collaborators directly.
 *
 * Collaborators (each owns one concern):
 *   lsp-server-manager.ts  — server lifecycle (start/stop/restart)
 *   lsp-client.ts          — raw LSP JSON-RPC transport
 *   lsp-cache.ts           — result caching (LRU, TTL)
 *   lsp-document-session.ts— document open/change/close (didOpen/didChange/didClose)
 *   lsp-format-service.ts  — formatting + range-format
 *   lsp-refactor-service.ts— rename + code-action + apply-edit
 *   lsp-diagnostics.ts     — publishDiagnostics subscription
 *   server-registry.ts     — language→server-config registry
 *
 * Graceful degradation: when no server is available for a language, every
 * operation returns [] or null instead of throwing.
 */

import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import type {
  LspLocation,
  LspHoverResult,
  LspDiagnostic,
  LspCallHierarchyItem,
  LspDocumentSymbol,
  LspServerState,
  LspTextEdit,
  LspWorkspaceEdit,
  LspCodeAction,
} from './lsp-types.js'
import type { LspServerManager } from './lsp-server-manager.js'
import type { LspCache } from './lsp-cache.js'
import type { LspDiagnosticsCollector } from './lsp-diagnostics.js'
import { LspDocumentSession } from './lsp-document-session.js'
import { LspFormatService } from './lsp-format-service.js'
import { LspRefactorService } from './lsp-refactor-service.js'
import {
  normalizeLocation,
  normalizeHover,
  normalizeWorkspaceEdit,
  normalizeCallHierarchyItem,
  normalizeDocumentSymbol,
  type RawLspLocation,
  type RawLspHoverResult,
  type RawCallHierarchyItem,
  type RawIncomingCall,
  type RawOutgoingCall,
  type RawDocumentSymbol,
} from './lsp-normalizers.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'lsp-bridge.ts' })

// ---------------------------------------------------------------------------
// LspBridge
// ---------------------------------------------------------------------------

export class LspBridge {
  private readonly docSession = new LspDocumentSession()
  private readonly formatService: LspFormatService
  private readonly refactorService: LspRefactorService

  constructor(
    private readonly manager: LspServerManager,
    private readonly cache: LspCache | null,
    private readonly diagnostics: LspDiagnosticsCollector,
    private readonly basePath: string,
  ) {
    const sharedDeps = {
      toFileUri: (f: string) => this.toFileUri(f),
      normalizeWorkspaceEdit: (raw: never) => normalizeWorkspaceEdit(raw, this.basePath),
      ensureDocumentOpen: (client: never, file: string, absPath: string) =>
        this.ensureDocumentOpen(client, file, absPath),
    }
    this.formatService = new LspFormatService(sharedDeps)
    this.refactorService = new LspRefactorService(sharedDeps)
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  async goToDefinition(file: string, line: number, character: number): Promise<LspLocation[]> {
    const raw = await this.executeWithCache<RawLspLocation | RawLspLocation[]>(
      'definition',
      file,
      line,
      character,
      'textDocument/definition',
      {
        textDocument: { uri: this.toFileUri(file) },
        position: { line: line - 1, character },
      },
    )

    if (!raw) {
      return []
    }

    const locations = Array.isArray(raw) ? raw : [raw]
    return locations.map((loc) => normalizeLocation(loc, this.basePath))
  }

  async findReferences(file: string, line: number, character: number): Promise<LspLocation[]> {
    const raw = await this.executeWithCache<RawLspLocation[]>(
      'references',
      file,
      line,
      character,
      'textDocument/references',
      {
        textDocument: { uri: this.toFileUri(file) },
        position: { line: line - 1, character },
        context: { includeDeclaration: true },
      },
    )

    if (!raw) {
      return []
    }

    return raw.map((loc) => normalizeLocation(loc, this.basePath))
  }

  async hover(file: string, line: number, character: number): Promise<LspHoverResult | null> {
    const raw = await this.executeWithCache<RawLspHoverResult>('hover', file, line, character, 'textDocument/hover', {
      textDocument: { uri: this.toFileUri(file) },
      position: { line: line - 1, character },
    })

    if (!raw) {
      return null
    }

    return normalizeHover(raw)
  }

  async rename(file: string, line: number, character: number, newName: string): Promise<LspWorkspaceEdit | null> {
    // Rename is NEVER cached — it is a write operation. Delegates to LspRefactorService.
    const absPath = path.resolve(this.basePath, file)
    const client = await this.manager.getClientForFile(absPath)
    return this.refactorService.rename(client, file, line, character, newName, absPath)
  }

  async callHierarchyIncoming(file: string, line: number, character: number): Promise<LspCallHierarchyItem[]> {
    const client = await this.manager.getClientForFile(path.resolve(this.basePath, file))

    if (!client) {
      log.warn('lsp-bridge:callHierarchyIncoming no server available', { file })
      return []
    }

    try {
      // Ensure document is open (LSP protocol requires didOpen before queries)
      const absPath = path.resolve(this.basePath, file)
      await this.ensureDocumentOpen(client, file, absPath)

      // Step 1: prepareCallHierarchy
      const items = await client.sendRequest<RawCallHierarchyItem[]>('textDocument/prepareCallHierarchy', {
        textDocument: { uri: this.toFileUri(file) },
        position: { line: line - 1, character },
      })

      if (!items || items.length === 0) {
        return []
      }

      // Step 2: incomingCalls for the first item
      const incoming = await client.sendRequest<RawIncomingCall[]>('callHierarchy/incomingCalls', { item: items[0] })

      if (!incoming) {
        return []
      }

      return incoming.map((call) => normalizeCallHierarchyItem(call.from, this.basePath))
    } catch (err) {
      log.error('lsp-bridge:callHierarchyIncoming failed', {
        file,
        error: err instanceof Error ? err.message : String(err),
      })
      return []
    }
  }

  async callHierarchyOutgoing(file: string, line: number, character: number): Promise<LspCallHierarchyItem[]> {
    const client = await this.manager.getClientForFile(path.resolve(this.basePath, file))

    if (!client) {
      log.warn('lsp-bridge:callHierarchyOutgoing no server available', { file })
      return []
    }

    try {
      // Ensure document is open (LSP protocol requires didOpen before queries)
      const absPath = path.resolve(this.basePath, file)
      await this.ensureDocumentOpen(client, file, absPath)

      // Step 1: prepareCallHierarchy
      const items = await client.sendRequest<RawCallHierarchyItem[]>('textDocument/prepareCallHierarchy', {
        textDocument: { uri: this.toFileUri(file) },
        position: { line: line - 1, character },
      })

      if (!items || items.length === 0) {
        return []
      }

      // Step 2: outgoingCalls for the first item
      const outgoing = await client.sendRequest<RawOutgoingCall[]>('callHierarchy/outgoingCalls', { item: items[0] })

      if (!outgoing) {
        return []
      }

      return outgoing.map((call) => normalizeCallHierarchyItem(call.to, this.basePath))
    } catch (err) {
      log.error('lsp-bridge:callHierarchyOutgoing failed', {
        file,
        error: err instanceof Error ? err.message : String(err),
      })
      return []
    }
  }

  async getDocumentSymbols(file: string): Promise<LspDocumentSymbol[]> {
    const raw = await this.executeWithCache<RawDocumentSymbol[]>(
      'documentSymbol',
      file,
      0,
      0,
      'textDocument/documentSymbol',
      {
        textDocument: { uri: this.toFileUri(file) },
      },
    )

    if (!raw) {
      return []
    }

    return raw.map((sym) => normalizeDocumentSymbol(file, sym))
  }

  async getDiagnostics(file: string): Promise<LspDiagnostic[]> {
    // Diagnostics are pushed by the server, not requested — return from collector.
    return this.diagnostics.getForFile(file)
  }

  async getLanguageStatus(): Promise<Map<string, LspServerState>> {
    return this.manager.getStatus()
  }

  // -----------------------------------------------------------------------
  // Edit operations — formatting, code actions, document sync
  // -----------------------------------------------------------------------

  async formatDocument(file: string, options?: { tabSize?: number; insertSpaces?: boolean }): Promise<LspTextEdit[]> {
    const absPath = path.resolve(this.basePath, file)
    const client = await this.manager.getClientForFile(absPath)
    return this.formatService.formatDocument(client, file, absPath, options)
  }

  async formatRange(
    file: string,
    startLine: number,
    startCharacter: number,
    endLine: number,
    endCharacter: number,
    options?: { tabSize?: number; insertSpaces?: boolean },
  ): Promise<LspTextEdit[]> {
    const absPath = path.resolve(this.basePath, file)
    const client = await this.manager.getClientForFile(absPath)
    return this.formatService.formatRange(
      client,
      file,
      startLine,
      startCharacter,
      endLine,
      endCharacter,
      absPath,
      options,
    )
  }

  async getCodeActions(
    file: string,
    startLine: number,
    startCharacter: number,
    endLine: number,
    endCharacter: number,
    kinds?: string[],
  ): Promise<LspCodeAction[]> {
    const absPath = path.resolve(this.basePath, file)
    const client = await this.manager.getClientForFile(absPath)
    return this.formatService.getCodeActions(
      client,
      file,
      startLine,
      startCharacter,
      endLine,
      endCharacter,
      kinds,
      absPath,
    )
  }

  async notifyDocumentChanged(file: string, content: string): Promise<void> {
    const absPath = path.resolve(this.basePath, file)
    const client = await this.manager.getClientForFile(absPath)

    if (!client) return

    const uri = this.toFileUri(file)
    const languageId = this.inferLanguageId(file)
    let fileContent = ''
    try {
      fileContent = readFileSync(absPath, 'utf-8')
    } catch {
      /* file unreadable — let session open with empty content */
    }
    this.docSession.ensureDocumentOpen(client, uri, languageId, fileContent)
    this.docSession.notifyDocumentChanged(client, uri, content)
  }

  // -----------------------------------------------------------------------
  // Private helpers — cache-aware execution
  // -----------------------------------------------------------------------

  private async executeWithCache<T>(
    operation: string,
    file: string,
    line: number,
    character: number,
    lspMethod: string,
    params: unknown,
  ): Promise<T | null> {
    const absPath = path.resolve(this.basePath, file)
    const mtime = this.getFileMtime(absPath)
    const cacheKey = this.getCacheKey(operation, file, line, character)

    // 1. Check cache
    if (this.cache && mtime) {
      const cached = this.cache.get('default', cacheKey, mtime)
      if (cached != null) {
        log.debug('lsp-bridge:cache-hit', { operation, file })
        return cached as T
      }
    }

    // 2. Get client
    const client = await this.manager.getClientForFile(absPath)
    if (!client) {
      log.warn('lsp-bridge:no-server', { operation, file })
      return null
    }

    // 3. Ensure document is open (LSP servers require didOpen before queries)
    await this.ensureDocumentOpen(client, file, absPath)

    // 4. Send LSP request
    try {
      const resultValue = await client.sendRequest<T>(lspMethod, params)

      // 5. Cache result
      if (this.cache && mtime && resultValue != null) {
        const languageId = this.inferLanguageId(file)
        this.cache.set('default', cacheKey, operation, languageId, file, resultValue, mtime)
      }

      return resultValue
    } catch (err) {
      log.error('lsp-bridge:request-failed', {
        operation,
        file,
        lspMethod,
        error: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  }

  // -----------------------------------------------------------------------
  // Private helpers — document lifecycle
  // -----------------------------------------------------------------------

  /** Delegates to LspDocumentSession — keeps LSP protocol ordering correct. */
  private async ensureDocumentOpen(
    client: { sendNotification: (method: string, params: unknown) => void },
    file: string,
    absPath: string,
  ): Promise<void> {
    const uri = this.toFileUri(file)
    const languageId = this.inferLanguageId(file)
    let content = ''
    try {
      content = readFileSync(absPath, 'utf-8')
    } catch {
      /* unreadable — open with empty content */
    }
    this.docSession.ensureDocumentOpen(client, uri, languageId, content)
  }

  // -----------------------------------------------------------------------
  // Private helpers — key generation and file utilities
  // -----------------------------------------------------------------------

  private getCacheKey(operation: string, file: string, line: number, character: number): string {
    return createHash('sha256')
      .update(operation + ':' + file + ':' + line + ':' + character)
      .digest('hex')
  }

  private getFileMtime(absPath: string): string {
    try {
      const stat = statSync(absPath)
      return stat.mtimeMs.toString()
    } catch {
      return ''
    }
  }

  // E2-T04: Properly encode file URIs with special characters (spaces, #, ?, %)
  private toFileUri(file: string): string {
    const resolved = path.resolve(this.basePath, file).replaceAll('\\', '/')
    // Encode each path segment but preserve / separators
    const encoded = resolved
      .split('/')
      .map((seg) => encodeURIComponent(seg))
      .join('/')
    return 'file://' + encoded
  }

  private inferLanguageId(file: string): string {
    const ext = path.extname(file).replace(/^\./, '')
    const extMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      mts: 'typescript',
      cts: 'typescript',
      py: 'python',
      pyi: 'python',
      rs: 'rust',
      go: 'go',
      java: 'java',
      kt: 'kotlin',
      kts: 'kotlin',
      swift: 'swift',
      rb: 'ruby',
      php: 'php',
      cs: 'csharp',
      cpp: 'cpp',
      cc: 'cpp',
      cxx: 'cpp',
      c: 'c',
      h: 'c',
      hpp: 'cpp',
      lua: 'lua',
    }
    return extMap[ext] ?? ext
  }
}
