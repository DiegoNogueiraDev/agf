/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Immune Recovery — applies T-Cell responses to the filesystem.
 *
 * Each recovery action modifies the target source file. All actions are
 * best-effort and non-destructive (they only add imports / wrap blocks,
 * never remove code). The caller decides whether to commit the changes.
 *
 * Phase 4 expansion: Recovery Verification. After each fix, the system
 * verifies the file still compiles (build check). On failure, the change
 * is rolled back and the recovery is marked as failed.
 *
 * Bio foundation: Clonal Deletion / Anergy. Self-reactive lymphocytes are
 * eliminated or inactivated. If a recovery fix breaks the build, it should
 * be rolled back (deleted) and the memory entry marked as failed.
 */

import type { TCellResponse, RecoveryActionKind, VerificationResult } from './immune-types.js'
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'immune-recovery.ts' })

export interface RecoveryResult {
  responseId: string
  success: boolean
  error?: string
  verification?: VerificationResult
}

const fileBackups = new Map<string, string>()

function saveBackup(filePath: string): void {
  if (!fileBackups.has(filePath)) {
    try {
      fileBackups.set(filePath, readFileSync(filePath, 'utf-8'))
    } catch {
      /* file may not exist */
    }
  }
}

function rollbackFile(filePath: string): void {
  const original = fileBackups.get(filePath)
  if (original !== undefined) {
    try {
      writeFileSync(filePath, original, 'utf-8')
      log.info('immune-recovery:rollback', { file: filePath, action: 'restored original' })
    } catch (err) {
      log.warn('immune-recovery:rollback-failed', { file: filePath, error: String(err) })
    }
    fileBackups.delete(filePath)
  }
}

function verifyBuild(projectDir: string): VerificationResult {
  const start = Date.now()
  try {
    execSync('npm run build --if-present 2>/dev/null || npx tsc --noEmit 2>/dev/null', {
      cwd: projectDir,
      timeout: 30_000,
      stdio: 'pipe',
    })
    return {
      responseId: '',
      actionKind: 'add_typed_import',
      kind: 'build_compile',
      status: 'passed',
      durationMs: Date.now() - start,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      responseId: '',
      actionKind: 'add_typed_import',
      kind: 'build_compile',
      status: 'failed',
      error: msg.slice(0, 200),
      durationMs: Date.now() - start,
    }
  }
}

function applyAddTypedImport(filePath: string): boolean {
  try {
    saveBackup(filePath)
    let content = readFileSync(filePath, 'utf-8')
    if (content.includes("from '../utils/errors'") || content.includes('from "../../utils/errors"')) {
      return false
    }
    const importLine = `import { GraphError } from '../utils/errors.js'`
    const firstImport = content.indexOf('import ')
    if (firstImport === -1) {
      content = importLine + '\n' + content
    } else {
      const afterFirstImport = content.indexOf('\n', firstImport)
      content = content.slice(0, afterFirstImport + 1) + importLine + '\n' + content.slice(afterFirstImport + 1)
    }
    writeFileSync(filePath, content, 'utf-8')
    return true
  } catch (err) {
    log.warn('immune-recovery:add-typed-import-failed', { file: filePath, error: String(err) })
    return false
  }
}

function applyWrapInTryCatch(filePath: string, line: number): boolean {
  try {
    saveBackup(filePath)
    const content = readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')
    if (line < 1 || line > lines.length) return false

    const catchLine = lines[line - 1]
    const indent = catchLine.match(/^\s*/)?.[0] ?? '  '
    const wrapped = `${indent}// immune-recovery: wrap empty catch\n${indent}catch (err) {\n${indent}  log.error('operation_failed', { error: String(err) })\n${indent}}`

    lines[line - 1] = wrapped
    writeFileSync(filePath, lines.join('\n'), 'utf-8')
    return true
  } catch (err) {
    log.warn('immune-recovery:wrap-catch-failed', { file: filePath, error: String(err) })
    return false
  }
}

function applyReplaceConsole(filePath: string): boolean {
  try {
    saveBackup(filePath)
    const content = readFileSync(filePath, 'utf-8')
    const updated = content.replace(/console\.error\s*\(/g, 'log.error(').replace(/console\.warn\s*\(/g, 'log.warn(')
    if (updated === content) return false
    writeFileSync(filePath, updated, 'utf-8')
    return true
  } catch (err) {
    log.warn('immune-recovery:replace-console-failed', { file: filePath, error: String(err) })
    return false
  }
}

function needsBuildCheck(actionKind: RecoveryActionKind): boolean {
  return actionKind !== 'flag_for_review' && actionKind !== 'suppress' && actionKind !== 'defer'
}

const ACTION_HANDLERS: Record<RecoveryActionKind, (file: string, line: number) => boolean> = {
  add_typed_import: (f) => applyAddTypedImport(f),
  wrap_in_try_catch: (f, l) => applyWrapInTryCatch(f, l),
  replace_console: (f) => applyReplaceConsole(f),
  add_error_boundary: () => false, // requires design review
  flag_for_review: () => true, // non-destructive metadata only
  suppress: () => true,
  defer: () => true,
}

export function applyRecovery(responses: TCellResponse[], projectDir = process.cwd()): RecoveryResult[] {
  const results: RecoveryResult[] = []

  for (const response of responses) {
    try {
      const handler = ACTION_HANDLERS[response.actionKind]
      if (!handler) {
        results.push({ responseId: response.id, success: false, error: `No handler for ${response.actionKind}` })
        continue
      }
      const modSuccess = handler(response.targetFile, response.targetLine)

      if (modSuccess) {
        response.applied = true
        response.appliedAt = Date.now()
      }

      let verification: VerificationResult | undefined

      if (modSuccess && needsBuildCheck(response.actionKind)) {
        verification = verifyBuild(projectDir)
        if (verification.status === 'failed') {
          rollbackFile(response.targetFile)
          response.applied = false
          response.appliedAt = null
          log.warn('immune-recovery:verify-failed-rollback', {
            file: response.targetFile,
            error: verification.error,
          })
        }
      } else {
        verification = {
          responseId: response.id,
          actionKind: response.actionKind,
          kind: 'noop',
          status: 'skipped',
          durationMs: 0,
        }
      }

      results.push({
        responseId: response.id,
        success: modSuccess && verification?.status !== 'failed',
        error: verification?.status === 'failed' ? verification.error : undefined,
        verification,
      })
    } catch (err) {
      results.push({ responseId: response.id, success: false, error: String(err) })
    }
  }

  return results
}

export function clearBackups(): void {
  fileBackups.clear()
}
