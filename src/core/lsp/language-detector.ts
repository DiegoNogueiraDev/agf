/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Language Detector — Detects project languages by config files and file extensions.
 *
 * Scans the project directory tree to identify which programming languages
 * are present, using config file presence (high confidence) and file extension
 * counting (lower confidence) as detection strategies.
 */

import { readdirSync } from 'node:fs'
import path from 'node:path'
import type { DetectedLanguage } from './lsp-types.js'
import type { ServerRegistry } from './server-registry.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'language-detector.ts' })

// ---------------------------------------------------------------------------
// Config files that indicate a language
// ---------------------------------------------------------------------------

const CONFIG_FILE_MAP: Record<string, string> = {
  'tsconfig.json': 'typescript',
  'jsconfig.json': 'typescript',
  'pyproject.toml': 'python',
  'setup.py': 'python',
  Pipfile: 'python',
  'requirements.txt': 'python',
  'go.mod': 'go',
  'Cargo.toml': 'rust',
  'pom.xml': 'java',
  'build.gradle': 'java',
  'build.gradle.kts': 'kotlin',
  Gemfile: 'ruby',
  'composer.json': 'php',
  'Package.swift': 'swift',
  'CMakeLists.txt': 'cpp',
  'compile_commands.json': 'cpp',
  Makefile: 'cpp',
  '.luarc.json': 'lua',
}

/** File extensions that indicate a language (for config detection by extension) */
const CONFIG_EXT_MAP: Record<string, string> = {
  '.csproj': 'csharp',
  '.sln': 'csharp',
  '.fsproj': 'csharp',
}

// ---------------------------------------------------------------------------
// Directories to skip when walking
// ---------------------------------------------------------------------------

const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  'coverage',
  '.next',
  '.nuxt',
  'build',
  'out',
  'target',
  '.venv',
  '__pycache__',
])

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** detectProjectLanguages —  */
export function detectProjectLanguages(projectPath: string, registry: ServerRegistry): DetectedLanguage[] {
  log.debug('detecting project languages', { projectPath })

  // Track config-file detections: languageId -> configFileName
  const configDetections = new Map<string, string>()

  // Track file counts per language
  const fileCounts = new Map<string, number>()

  // 1. Check root directory for config files
  detectConfigFiles(projectPath, configDetections)

  // 2. Walk directory tree to count files by extension
  walkAndCountFiles(projectPath, registry, fileCounts)

  // 3. Build results
  const seen = new Set<string>()
  const results: DetectedLanguage[] = []

  // Languages detected by config file (high confidence)
  for (const [languageId, configFile] of configDetections) {
    seen.add(languageId)
    const fileCount = fileCounts.get(languageId) ?? 0
    results.push({
      languageId,
      confidence: 0.9,
      detectedVia: 'config_file',
      fileCount,
      configFile,
    })
  }

  // Languages detected only by file extension (lower confidence)
  for (const [languageId, fileCount] of fileCounts) {
    if (seen.has(languageId)) continue
    results.push({
      languageId,
      confidence: Math.min(0.7, fileCount / 50),
      detectedVia: 'file_extension',
      fileCount,
    })
  }

  // 4. Sort by fileCount descending
  results.sort((a, b) => b.fileCount - a.fileCount)

  log.info('project languages detected', {
    count: String(results.length),
    languages: results.map((r) => r.languageId).join(','),
  })

  return results
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Check the root directory for known config files. */
function detectConfigFiles(rootPath: string, configDetections: Map<string, string>): void {
  let entries: import('node:fs').Dirent[]
  try {
    entries = readdirSync(rootPath, { withFileTypes: true, encoding: 'utf-8' })
  } catch {
    log.debug('cannot read root directory for config detection', { rootPath })
    return
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue
    const name = String(entry.name)

    // Check exact filename match (e.g., tsconfig.json, Cargo.toml)
    const configLang = CONFIG_FILE_MAP[name]
    if (configLang && !configDetections.has(configLang)) {
      configDetections.set(configLang, name)
      continue
    }

    // Check extension match (e.g., .csproj, .sln)
    const ext = path.extname(name)
    if (ext) {
      const extLang = CONFIG_EXT_MAP[ext]
      if (extLang && !configDetections.has(extLang)) {
        configDetections.set(extLang, name)
      }
    }
  }
}

/** Recursively walk the directory tree counting files by extension. */
function walkAndCountFiles(dirPath: string, registry: ServerRegistry, fileCounts: Map<string, number>): void {
  let entries: import('node:fs').Dirent[]
  try {
    entries = readdirSync(dirPath, { withFileTypes: true, encoding: 'utf-8' })
  } catch {
    log.debug('cannot read directory, skipping', { dirPath })
    return
  }

  for (const entry of entries) {
    const name = String(entry.name)
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(name)) continue
      walkAndCountFiles(path.join(dirPath, name), registry, fileCounts)
      continue
    }

    if (!entry.isFile()) continue

    const ext = path.extname(name)
    if (!ext) continue

    const bareExt = ext.slice(1) // strip leading dot
    const languageId = registry.getLanguageForExtension(bareExt)
    if (!languageId) continue

    fileCounts.set(languageId, (fileCounts.get(languageId) ?? 0) + 1)
  }
}
