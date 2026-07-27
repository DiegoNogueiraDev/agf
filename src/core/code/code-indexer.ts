/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Code indexer — orchestrates: walk files → analyze → store.
 * Supports incremental reindexing by clearing per-file data before reinserting.
 * Multi-language: accepts pluggable CodeAnalyzer instances (defaults to TsAnalyzer).
 */

import { readdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { McpGraphError } from '../utils/errors.js'
import { CodeStore } from './code-store.js'
import type { CodeAnalyzer, IndexResult } from './code-types.js'
import { isTypeScriptAvailable } from './ts-analyzer.js'
import { TsAnalyzer } from './ts-analyzer.js'
import { now } from '../utils/time.js'
import { createLogger } from '../utils/logger.js'
import { createAnalyzers } from './analyzer-factory.js'
import type { SqliteStore } from '../store/sqlite-store.js'

const log = createLogger({ layer: 'core', source: 'code-indexer.ts' })

function getGitHash(basePath: string): string | null {
  try {
    return execSync('git rev-parse HEAD', {
      cwd: basePath,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts'])
const IGNORED_DIRS = new Set([
  // JavaScript/Node.js
  'node_modules',
  'dist',
  '.next',
  '.nuxt',
  // General
  '.git',
  'coverage',
  // Go
  'vendor',
  // Python
  '__pycache__',
  'venv',
  '.venv',
  '.mypy_cache',
  '.pytest_cache',
  '.tox',
  // C#/.NET
  'bin',
  'obj',
  '.vs',
  // Java/Kotlin
  'target',
  '.gradle',
  '.idea',
  // C/C++
  'cmake-build-debug',
  'cmake-build-release',
  // Rust
  // "target" already listed under Java/Kotlin
  // Ruby
  '.bundle',
  // Swift
  '.build',
  'DerivedData',
  'Pods',
  '.swiftpm',
  // Lua
  'lua_modules',
  '.luarocks',
])

/** Matches test files across all supported languages and TS declaration files. */
// eslint-disable-next-line security/detect-non-literal-regexp
export const TEST_OR_DECL_PATTERN = new RegExp(
  [
    // TypeScript/JavaScript: .test.ts, .spec.js, .d.ts
    /\.(test|spec)\.(ts|tsx|js|jsx|mts|cts)$/.source,
    /\.d\.(ts|mts|cts)$/.source,
    // Go: _test.go
    /_test\.go$/.source,
    // Python: test_*.py, *_test.py, conftest.py
    /(^|[/\\])test_[^/\\]+\.py$/.source,
    /_test\.py$/.source,
    /(^|[/\\])conftest\.py$/.source,
    // C#: *Tests.cs, *Test.cs
    /Tests?\.cs$/.source,
    // Java/Kotlin: *Test.java, *Tests.java, *IT.java, *Test.kt
    /(Tests?|IT)\.(java|kt|kts)$/.source,
    // Ruby: *_spec.rb, *_test.rb
    /_(spec|test)\.rb$/.source,
    // PHP: *Test.php
    /Test\.php$/.source,
    // Rust: already in src/tests/ convention, no file pattern needed
    // Swift: *Tests.swift
    /Tests?\.swift$/.source,
    // Lua: _test.lua, _spec.lua
    /_(test|spec)\.lua$/.source,
  ].join('|'),
)

export class CodeIndexer {
  private readonly extensionMap: Map<string, CodeAnalyzer>

  constructor(
    private readonly store: CodeStore,
    private readonly projectId: string,
    analyzers?: CodeAnalyzer[],
  ) {
    if (!projectId) {
      throw new McpGraphError('CodeIndexer requires a valid projectId')
    }
    const effectiveAnalyzers = analyzers ?? [new TsAnalyzer()]
    this.extensionMap = new Map()
    for (const analyzer of effectiveAnalyzers) {
      for (const ext of analyzer.extensions) {
        this.extensionMap.set(ext, analyzer)
      }
    }
  }

  /**
   * Index all supported files in a directory tree.
   */
  async indexDirectory(dirPath: string, basePath: string): Promise<IndexResult> {
    const supportedExtensions = new Set(this.extensionMap.keys())
    const files = walkDirectory(dirPath, supportedExtensions)

    log.info('code-indexer:start', {
      directory: dirPath,
      fileCount: files.length,
    })

    return this.indexFiles(files, basePath)
  }

  /**
   * Index specific files.
   */
  async indexFiles(filePaths: string[], basePath: string): Promise<IndexResult> {
    const typescriptAvailable = await isTypeScriptAvailable()

    // Track per-language stats
    const langStats: Record<
      string,
      { available: boolean; serverName?: string; fileCount: number; symbolCount: number }
    > = {}

    // Initialize langStats for all registered analyzers
    for (const analyzer of new Set(this.extensionMap.values())) {
      for (const lang of analyzer.languages) {
        if (!langStats[lang]) {
          langStats[lang] = { available: true, fileCount: 0, symbolCount: 0 }
        }
      }
    }

    // Check TS availability for the typescript/javascript entries
    if (!typescriptAvailable) {
      if (langStats['typescript']) langStats['typescript'].available = false
      if (langStats['javascript']) langStats['javascript'].available = false
    }

    // If only TS analyzers and TS not available, short-circuit (backward compat)
    const hasOnlyTsAnalyzers = [...new Set(this.extensionMap.values())].every((a) => a instanceof TsAnalyzer)

    if (hasOnlyTsAnalyzers && !typescriptAvailable) {
      log.warn('code-indexer:typescript-unavailable', {
        message: 'typescript package not found — code indexing disabled. Install it: npm install -D typescript',
        fileCount: filePaths.length,
      })

      this.store.upsertIndexMeta({
        projectId: this.projectId,
        lastIndexed: now(),
        fileCount: 0,
        symbolCount: 0,
        relationCount: 0,
      })

      return {
        fileCount: 0,
        filesWithSymbols: 0,
        symbolCount: 0,
        relationCount: 0,
        typescriptAvailable: false,
        languageStatus: langStats,
      }
    }

    let totalSymbols = 0
    let totalRelations = 0
    let fileCount = 0
    let filesWithSymbols = 0

    for (const filePath of filePaths) {
      const ext = path.extname(filePath)
      const analyzer = this.extensionMap.get(ext)
      if (!analyzer) continue

      // Skip TS files when typescript is unavailable
      if (analyzer instanceof TsAnalyzer && !typescriptAvailable) continue

      try {
        const relativePath = path.relative(basePath, filePath)

        // Clear existing data for this file (incremental)
        this.store.deleteSymbolsByFile(relativePath, this.projectId)

        const resultValue = await analyzer.analyzeFile(filePath, basePath)

        fileCount++

        if (resultValue.symbols.length === 0) continue

        filesWithSymbols++

        // Insert symbols
        const symbolsWithProject = resultValue.symbols.map((s) => ({
          ...s,
          projectId: this.projectId,
          modulePath: extractModulePath(s.file),
        }))

        const symCount = this.store.insertSymbolsBulk(symbolsWithProject)
        totalSymbols += symCount

        // Update per-language stats
        for (const lang of analyzer.languages) {
          if (langStats[lang]) {
            langStats[lang].fileCount++
            langStats[lang].symbolCount += symCount
          }
        }

        // Insert relations — need to resolve symbol IDs
        if (resultValue.relations.length > 0) {
          const resolvedRelations = resolveRelationIds(
            resultValue.relations,
            resultValue.symbols,
            this.store,
            this.projectId,
          )

          if (resolvedRelations.length > 0) {
            const relCount = this.store.insertRelationsBulk(resolvedRelations)
            totalRelations += relCount
          }
        }
      } catch (err) {
        log.warn('code-indexer:file-error', {
          file: filePath,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    // Update metadata (with git hash for staleness detection)
    this.store.upsertIndexMeta({
      projectId: this.projectId,
      lastIndexed: now(),
      fileCount,
      symbolCount: totalSymbols,
      relationCount: totalRelations,
      gitHash: getGitHash(basePath),
    })

    log.info('code-indexer:done', {
      fileCount,
      filesWithSymbols,
      symbolCount: totalSymbols,
      relationCount: totalRelations,
    })

    return {
      fileCount,
      filesWithSymbols,
      symbolCount: totalSymbols,
      relationCount: totalRelations,
      typescriptAvailable,
      languageStatus: langStats,
    }
  }
}

// ── Helpers ──────────────────────────────────────────

function walkDirectory(dir: string, supportedExtensions: Set<string> = TS_EXTENSIONS): string[] {
  const files: string[] = []

  function recurse(currentDir: string): void {
    let entries
    try {
      entries = readdirSync(currentDir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      if (IGNORED_DIRS.has(entry.name)) continue

      const fullPath = path.join(currentDir, entry.name)

      if (entry.isDirectory()) {
        recurse(fullPath)
      } else if (entry.isFile() && supportedExtensions.has(path.extname(entry.name))) {
        // Skip test files and declaration files
        if (TEST_OR_DECL_PATTERN.test(entry.name)) {
          continue
        }
        files.push(fullPath)
      }
    }
  }

  recurse(dir)
  return files
}

function extractModulePath(file: string): string {
  const dir = path.dirname(file)
  if (dir === '.' || dir === '') return 'root'
  // Normalize: src/core/utils → core/utils
  return dir.replace(/^src\//, '')
}

interface PartialRelation {
  fromSymbol: string
  toSymbol: string
  type: string
  file?: string | null
  line?: number | null
  metadata?: Record<string, unknown>
}

/**
 * Resolve symbolic relation references (symbol names) to actual stored IDs.
 * For belongs_to/extends/implements, both symbols are in the same file.
 * For calls/imports, the target may be in another file.
 */
function resolveRelationIds(
  relations: PartialRelation[],
  fileSymbols: Array<{ name: string; file: string }>,
  store: CodeStore,
  projectId: string,
): Array<Omit<import('./code-types.js').CodeRelation, 'id' | 'indexedAt'>> {
  const resolved: Array<Omit<import('./code-types.js').CodeRelation, 'id' | 'indexedAt'>> = []

  for (const rel of relations) {
    // Find source symbol ID — disambiguate by file path when multiple matches
    const fromCandidates = store.findSymbolsByName(rel.fromSymbol, projectId)
    const from =
      fromCandidates.length > 0
        ? rel.file && fromCandidates.length > 1
          ? (fromCandidates.find((c) => c.file === rel.file) ?? fromCandidates[0])
          : fromCandidates[0]
        : null

    // Find target symbol ID — disambiguate by file path when multiple matches
    const toCandidates = store.findSymbolsByName(rel.toSymbol, projectId)
    const to =
      toCandidates.length > 0
        ? rel.file && toCandidates.length > 1
          ? (toCandidates.find((c) => c.file === rel.file) ?? toCandidates[0])
          : toCandidates[0]
        : null

    if (from && to) {
      resolved.push({
        projectId,
        fromSymbol: from.id,
        toSymbol: to.id,
        type: rel.type as 'calls' | 'imports' | 'extends' | 'implements' | 'belongs_to',
        file: rel.file,
        line: rel.line,
        metadata: rel.metadata,
      })
    }
  }

  return resolved
}

/**
 * Run a full code-symbol reindex for the active project.
 * Mirrors `runCodeGraphReindex()` in `src/mcp/server.ts` minus the in-flight
 * guard and label logging, so it can be called from any reindex entry point
 * (file watcher, MCP knowledge tool, API route).
 *
 * Updates `code_index_meta` (last_indexed, git_hash, counts) — which is what
 * `detectStaleIndex()` reads to surface or clear the stale-index advisory.
 */
export async function reindexCodeForProject(
  store: SqliteStore,
  basePath: string,
): Promise<{ fileCount: number; symbolCount: number; relationCount: number }> {
  const project = store.getProject()
  if (!project) {
    throw new McpGraphError('reindexCodeForProject requires an active project')
  }
  const codeStore = new CodeStore(store.getDb())
  const analyzers = await createAnalyzers(basePath)
  const indexer = new CodeIndexer(codeStore, project.id, analyzers)
  const resultValue = await indexer.indexDirectory(basePath, basePath)
  return {
    fileCount: resultValue.fileCount,
    symbolCount: resultValue.symbolCount,
    relationCount: resultValue.relationCount,
  }
}
