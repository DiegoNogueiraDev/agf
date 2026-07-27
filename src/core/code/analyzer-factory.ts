/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * AnalyzerFactory — Auto-detects project languages and creates
 * the appropriate CodeAnalyzer[] for the CodeIndexer.
 *
 * - TsAnalyzer is always included (higher accuracy for TS/JS)
 * - TreeSitterAnalyzer is added for any non-TS/JS languages detected
 * - No extension overlap: TsAnalyzer owns .ts/.js/.tsx/.jsx/.mts/.cts
 */

import type { CodeAnalyzer } from './code-types.js'
import { TsAnalyzer } from './ts-analyzer.js'
import { TreeSitterAnalyzer } from './treesitter/treesitter-analyzer.js'
import { ServerRegistry } from '../lsp/server-registry.js'
import { detectProjectLanguages } from '../lsp/language-detector.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'analyzer-factory.ts' })

const TS_LANGUAGE_IDS = new Set(['typescript', 'javascript'])

/**
 * Create analyzers for a project based on detected languages.
 * Always includes TsAnalyzer. Adds TreeSitterAnalyzer for other languages.
 */
export async function createAnalyzers(basePath: string): Promise<CodeAnalyzer[]> {
  const analyzers: CodeAnalyzer[] = []

  // 1. TsAnalyzer always included (native TS parser, higher accuracy)
  analyzers.push(new TsAnalyzer())

  // 2. Detect other languages
  const registry = new ServerRegistry()
  const detected = detectProjectLanguages(basePath, registry)

  // 3. Filter out TS/JS (already handled by TsAnalyzer)
  const otherLanguages = detected
    .filter((d) => !TS_LANGUAGE_IDS.has(d.languageId))
    .filter((d) => d.confidence >= 0.3 || d.detectedVia === 'config_file')

  if (otherLanguages.length > 0) {
    const tsAnalyzerExts = new Set(analyzers[0].extensions)
    const treeSitterAnalyzer = new TreeSitterAnalyzer()
    await treeSitterAnalyzer.initialize()

    // Remove TS/JS extensions from TreeSitterAnalyzer to avoid overlap
    const filteredExtensions = treeSitterAnalyzer.extensions.filter((ext) => !tsAnalyzerExts.has(ext))

    // Only add if there are non-TS extensions to handle
    if (filteredExtensions.length > 0) {
      // Create a proxy that filters extensions
      const proxy: CodeAnalyzer = {
        languages: treeSitterAnalyzer.languages.filter((l) => !TS_LANGUAGE_IDS.has(l)),
        extensions: filteredExtensions,
        analyzeFile: treeSitterAnalyzer.analyzeFile.bind(treeSitterAnalyzer),
      }

      // Use the actual TreeSitterAnalyzer instance but expose filtered interface
      // For instanceof checks to work, we need the real instance
      Object.setPrototypeOf(proxy, TreeSitterAnalyzer.prototype)

      analyzers.push(proxy)
    }

    log.info('analyzer-factory:created', {
      tsAnalyzer: true,
      treeSitter: filteredExtensions.length > 0,
      detectedLanguages: otherLanguages.map((d) => d.languageId).join(','),
    })
  }

  return analyzers
}
