/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * LspDocumentSession — owns the didOpen/didChange lifecycle and version tracking
 * for LSP documents. Extracted from LspBridge to give this concern a single owner.
 *
 * WHY: LspBridge was mixing transport coordination with document-lifecycle state.
 * Composing: lsp-bridge.ts delegates to this class; lsp-types.ts for shared types.
 */

import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'lsp-document-session.ts' })

/** Minimal client interface needed for document notifications. */
export interface NotificationClient {
  sendNotification(method: string, params: unknown): void
}

/**
 * Tracks open documents and their versions.
 * One instance per LspBridge; scoped to the bridge's server connection lifetime.
 */
export class LspDocumentSession {
  private readonly versions = new Map<string, number>()

  /** Returns true if the document URI has been opened in this session. */
  isOpen(uri: string): boolean {
    return this.versions.has(uri)
  }

  /** Returns the current version for the URI, or undefined if not opened. */
  getVersion(uri: string): number | undefined {
    return this.versions.get(uri)
  }

  /**
   * Sends textDocument/didOpen on first call for a given URI.
   * Idempotent — subsequent calls for the same URI are no-ops.
   */
  ensureDocumentOpen(client: NotificationClient, uri: string, languageId: string, content: string): void {
    if (this.versions.has(uri)) return

    try {
      client.sendNotification('textDocument/didOpen', {
        textDocument: { uri, languageId, version: 1, text: content },
      })
      this.versions.set(uri, 1)
      log.debug('lsp-document-session:opened', { uri, languageId })
    } catch (err) {
      log.warn('lsp-document-session:didOpen-failed', {
        uri,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  /**
   * Sends textDocument/didChange with an incremented version.
   * Call ensureDocumentOpen before this (or check isOpen).
   */
  notifyDocumentChanged(client: NotificationClient, uri: string, content: string): void {
    const currentVersion = this.versions.get(uri) ?? 1
    const newVersion = currentVersion + 1
    this.versions.set(uri, newVersion)

    client.sendNotification('textDocument/didChange', {
      textDocument: { uri, version: newVersion },
      contentChanges: [{ text: content }],
    })

    log.debug('lsp-document-session:changed', { uri, version: newVersion })
  }
}
