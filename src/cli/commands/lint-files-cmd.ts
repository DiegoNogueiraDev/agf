/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * lint-files — expose checkFileSizeCompliance as a CLI command with exit code.
 *
 * WHY here: single source of truth for the 800-line git gate. Reuses
 * checkFileSizeCompliance/MAX_FILE_LINES from fitness-functions.ts — zero
 * new counting logic. The --staged flag checks only git-staged source files.
 *
 * Composing modules: fitness-functions.ts (check), cli-output.ts (envelope).
 * Registered in src/cli/index.ts.
 */

import { Command } from 'commander'
import { execSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { globSync } from 'glob'
import { createLogger } from '../../core/utils/logger.js'
import {
  checkFileSizeCompliance,
  isTestFile,
  MAX_FILE_LINES,
  type FileContent,
} from '../../core/harness/fitness-functions.js'
import { detectViolations } from '../../core/hooks/provider-sdk-lockdown-detector.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'lint-files-cmd.ts' })

// Source file extensions eligible for the 800-line rule. Language-agnostic: the
// 800-line ceiling is about human/agent readability, which is not TS-specific — so
// agf can lint foreign repos (Python/Go/Rust/…) too, not just its own TS source.
// (Generated / .d.ts files are excluded downstream by checkFileSizeCompliance.)
const SOURCE_EXTENSIONS = new Set([
  // TS/JS
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mts',
  '.cts',
  '.mjs',
  '.cjs',
  // Python / Ruby / PHP / Lua
  '.py',
  '.rb',
  '.php',
  '.lua',
  // Go / Rust / C-family / C# / Swift
  '.go',
  '.rs',
  '.c',
  '.cc',
  '.cpp',
  '.cxx',
  '.h',
  '.hpp',
  '.hh',
  '.cs',
  '.swift',
  // JVM / Kotlin / Scala
  '.java',
  '.kt',
  '.kts',
  '.scala',
  // Frontend component & misc
  '.vue',
  '.svelte',
  '.dart',
])

/** Comma-free glob brace list built FROM the extension set (single source of truth). */
const SOURCE_GLOB = `**/*.{${[...SOURCE_EXTENSIONS].map((e) => e.slice(1)).join(',')}}`

/** Directories never worth scanning — deps, VCS, build output, language caches. */
const IGNORE_GLOBS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/dist-bun/**',
  '**/build/**',
  '**/out/**',
  '**/coverage/**',
  '**/.next/**',
  '**/.cache/**',
  '**/vendor/**',
  '**/.venv/**',
  '**/venv/**',
  '**/__pycache__/**',
  '**/target/**',
]

function isSourceFile(filePath: string): boolean {
  const dot = filePath.lastIndexOf('.')
  if (dot === -1) return false
  const ext = filePath.slice(dot)
  return SOURCE_EXTENSIONS.has(ext)
}

/** Result shape returned by buildLintFilesPayload — used by tests and the CLI action. */
export interface LintFilesPayload {
  ok: boolean
  violations: Array<{ file: string; lines: number; rule: string }>
  checkedFiles: number
  maxLines: number
}

/**
 * Pure function: apply file-size compliance + provider-SDK-lockdown to a set
 * of FileContent records. Applies source-only semantics before delegating to
 * checkFileSizeCompliance/detectViolations — both are pure, file-content-in
 * detectors, so they compose over the same collected file set for free.
 */
export function buildLintFilesPayload(files: FileContent[]): LintFilesPayload {
  const sourceFiles = files.filter((f) => isSourceFile(f.path))
  const result = checkFileSizeCompliance(sourceFiles)
  // Test files legitimately reference forbidden SDK names as string literals in
  // their own fixtures (e.g. provider-sdk-lockdown-detector's own test suite) —
  // exclude them from this check, same test-file carve-out checkFileSizeCompliance uses.
  const sdkViolations = detectViolations(sourceFiles.filter((f) => !isTestFile(f.path)))
  return {
    ok: result.passed && sdkViolations.length === 0,
    violations: [
      ...result.violations.map((v) => ({ file: v.file, lines: v.line, rule: v.rule })),
      ...sdkViolations.map((v) => ({ file: v.path, lines: v.line, rule: `provider-sdk-lockdown:${v.sdk}` })),
    ],
    checkedFiles: result.checkedFiles,
    maxLines: MAX_FILE_LINES,
  }
}

/** Collect staged file paths via git; returns [] on failure (fail-open). */
function getStagedFilePaths(cwd: string): string[] {
  try {
    const output = execSync('git diff --cached --name-only', { cwd, encoding: 'utf8' })
    return output
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
  } catch (err) {
    log.warn('lint-files:git-staged:fail-open', { error: String(err) })
    return []
  }
}

/** Read file content; returns null on error (fail-open). */
function readFileSafe(absPath: string): string | null {
  try {
    if (!existsSync(absPath)) return null
    return readFileSync(absPath, 'utf8')
  } catch {
    return null
  }
}

export function lintFilesCommand(): Command {
  return new Command('lint-files')
    .description('Check source files for 800-line compliance; exit 1 if violations found')
    .option('-d, --dir <dir>', 'Project root directory', process.cwd())
    .option('--staged', 'Check only git-staged files', false)
    .option('--select <path>', 'Dot-path filter on output data')
    .action(async (opts: { dir: string; staged: boolean; select?: string }) => {
      const out = createCliOutput('lint-files')
      try {
        let files: FileContent[]

        if (opts.staged) {
          const paths = getStagedFilePaths(opts.dir)
          files = paths
            .map((relPath) => {
              const content = readFileSafe(`${opts.dir}/${relPath}`)
              if (content === null) return null
              return { path: relPath, content }
            })
            .filter((f): f is FileContent => f !== null)
        } else {
          const paths = globSync(SOURCE_GLOB, {
            cwd: opts.dir,
            ignore: IGNORE_GLOBS,
          })
          files = paths
            .map((relPath) => {
              const content = readFileSafe(`${opts.dir}/${relPath}`)
              if (content === null) return null
              return { path: relPath, content }
            })
            .filter((f): f is FileContent => f !== null)
        }

        const payload = buildLintFilesPayload(files)
        // Violations → ok:false (out.fail sets exitCode=1); success → ok:true. The
        // envelope must never say ok:true while the shell exits 1.
        if (!payload.ok) {
          out.fail(
            'LINT_FILES_VIOLATIONS',
            `${payload.violations.length} violation(s) found (file-size >${payload.maxLines} lines and/or forbidden provider SDK imports)`,
            payload,
          )
          return
        }
        out.ok(payload)
      } catch (err) {
        log.error('lint-files:error', { error: String(err) })
        out.fail('LINT_FILES_ERROR', err instanceof Error ? err.message : String(err), null)
        process.exit(1)
      }
    })
}
