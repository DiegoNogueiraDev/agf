/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * LspDiagnosticsCollector — Multi-language diagnostics collector.
 *
 * Receives diagnostics pushed from LSP servers via textDocument/publishDiagnostics
 * and provides query APIs for files, languages, severity filtering, and summaries.
 */

import type { LspDiagnostic } from './lsp-types.js'
import { LspDiagnosticSeverity } from './lsp-types.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'lsp-diagnostics.ts' })

export interface DiagnosticsSummary {
  byLanguage: Record<string, { errors: number; warnings: number; info: number; hints: number }>
  total: { errors: number; warnings: number; info: number; hints: number }
}

export class LspDiagnosticsCollector {
  /** Map<languageId, Map<file, LspDiagnostic[]>> */
  private store = new Map<string, Map<string, LspDiagnostic[]>>()

  /** Called when a server sends textDocument/publishDiagnostics. */
  onDiagnostics(languageId: string, file: string, diagnostics: LspDiagnostic[]): void {
    let langMap = this.store.get(languageId)
    if (!langMap) {
      langMap = new Map<string, LspDiagnostic[]>()
      this.store.set(languageId, langMap)
    }

    if (diagnostics.length === 0) {
      langMap.delete(file)
    } else {
      langMap.set(file, diagnostics)
    }

    log.debug('lsp-diagnostics:onDiagnostics', {
      languageId,
      file,
      count: String(diagnostics.length),
    })
  }

  /** Get diagnostics for a specific file (across all languages). */
  getForFile(file: string): LspDiagnostic[] {
    const resultValue: LspDiagnostic[] = []

    for (const langMap of this.store.values()) {
      const fileDiags = langMap.get(file)
      if (fileDiags) {
        resultValue.push(...fileDiags)
      }
    }

    return resultValue
  }

  /** Get all diagnostics for a language. */
  getForLanguage(languageId: string): Map<string, LspDiagnostic[]> {
    return this.store.get(languageId) ?? new Map<string, LspDiagnostic[]>()
  }

  /** Get all diagnostics, optionally filtered by severity (1=error,2=warning,3=info,4=hint). */
  getAll(severity?: number): Map<string, LspDiagnostic[]> {
    const resultValue = new Map<string, LspDiagnostic[]>()

    for (const langMap of this.store.values()) {
      for (const [file, diagnostics] of langMap) {
        const filtered = severity != null ? diagnostics.filter((d) => d.severity === severity) : diagnostics

        if (filtered.length === 0) {
          continue
        }

        const existing = resultValue.get(file)
        if (existing) {
          existing.push(...filtered)
        } else {
          resultValue.set(file, [...filtered])
        }
      }
    }

    return resultValue
  }

  /** Get summary counts. */
  getSummary(): DiagnosticsSummary {
    const total = { errors: 0, warnings: 0, info: 0, hints: 0 }
    const byLanguage: Record<string, { errors: number; warnings: number; info: number; hints: number }> = {}

    for (const [languageId, langMap] of this.store) {
      const langCounts = { errors: 0, warnings: 0, info: 0, hints: 0 }

      for (const diagnostics of langMap.values()) {
        for (const diag of diagnostics) {
          switch (diag.severity) {
            case LspDiagnosticSeverity.Error:
              langCounts.errors++
              total.errors++
              break
            case LspDiagnosticSeverity.Warning:
              langCounts.warnings++
              total.warnings++
              break
            case LspDiagnosticSeverity.Information:
              langCounts.info++
              total.info++
              break
            case LspDiagnosticSeverity.Hint:
              langCounts.hints++
              total.hints++
              break
          }
        }
      }

      if (langCounts.errors + langCounts.warnings + langCounts.info + langCounts.hints > 0) {
        byLanguage[languageId] = langCounts
      }
    }

    return { byLanguage, total }
  }

  /** Clear all diagnostics for a language (e.g., when server restarts). */
  clearLanguage(languageId: string): void {
    this.store.delete(languageId)
    log.debug('lsp-diagnostics:clearLanguage', { languageId })
  }

  /** Clear everything. */
  clearAll(): void {
    this.store.clear()
    log.debug('lsp-diagnostics:clearAll')
  }
}
