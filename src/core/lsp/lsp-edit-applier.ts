/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * LSP Edit Applier — applies LspWorkspaceEdit to the filesystem.
 *
 * Key behaviors:
 * - In-memory backup before each file modification
 * - Edits sorted in reverse document order (bottom-to-top) to preserve positions
 * - Atomic: if any file fails, all changes are rolled back
 * - Range validation: rejects edits outside file bounds
 */

import { readFile, writeFile } from 'node:fs/promises'
import type { LspWorkspaceEdit, LspTextEdit, EditApplyResult } from './lsp-types.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'lsp-edit-applier.ts' })

/**
 * Groups edits by file path.
 */
function groupEditsByFile(changes: LspTextEdit[]): Map<string, LspTextEdit[]> {
  const groups = new Map<string, LspTextEdit[]>()
  for (const edit of changes) {
    const existing = groups.get(edit.file)
    if (existing) {
      existing.push(edit)
    } else {
      groups.set(edit.file, [edit])
    }
  }
  return groups
}

/**
 * Sorts edits in reverse document order (bottom-to-top, right-to-left).
 * This ensures earlier edits don't shift positions of later ones.
 */
function sortEditsReverse(edits: LspTextEdit[]): LspTextEdit[] {
  return [...edits].sort((a, b) => {
    if (b.startLine !== a.startLine) return b.startLine - a.startLine
    return b.startCharacter - a.startCharacter
  })
}

/**
 * Detects the line separator used in the content.
 * Returns "\r\n" for CRLF, "\n" for LF.
 */
function detectLineSeparator(content: string): string {
  return content.includes('\r\n') ? '\r\n' : '\n'
}

/**
 * Splits content into lines, handling both LF and CRLF.
 */
function splitLines(content: string): string[] {
  return content.split(/\r?\n/)
}

/**
 * Converts 1-based line/character to a string offset.
 * LSP uses 0-based lines, but lsp-bridge normalizes to 1-based.
 * Handles both LF (\n) and CRLF (\r\n) line endings.
 */
function positionToOffset(lines: string[], line: number, character: number, separator: string): number {
  let offset = 0
  // line is 1-based, so index = line - 1
  const lineIndex = line - 1
  for (let i = 0; i < lineIndex; i++) {
    offset += lines[i].length + separator.length
  }
  offset += character
  return offset
}

/**
 * Validates that an edit's range is within file bounds.
 */
function validateEditRange(edit: LspTextEdit, lines: string[]): string | null {
  const startIdx = edit.startLine - 1
  const endIdx = edit.endLine - 1

  if (startIdx < 0 || startIdx >= lines.length) {
    return `startLine ${edit.startLine} out of bounds (file has ${lines.length} lines)`
  }
  if (endIdx < 0 || endIdx >= lines.length) {
    return `endLine ${edit.endLine} out of bounds (file has ${lines.length} lines)`
  }
  if (edit.startCharacter > lines[startIdx].length) {
    return `startCharacter ${edit.startCharacter} exceeds line ${edit.startLine} length (${lines[startIdx].length})`
  }
  if (edit.endCharacter > lines[endIdx].length) {
    return `endCharacter ${edit.endCharacter} exceeds line ${edit.endLine} length (${lines[endIdx].length})`
  }
  return null
}

/**
 * Applies a sorted (reverse) list of edits to file content.
 * Handles both LF and CRLF line endings.
 */
function applyEditsToContent(content: string, edits: LspTextEdit[]): string {
  let resultValue = content
  const separator = detectLineSeparator(content)

  for (const edit of edits) {
    // Recalculate lines from current result for each edit
    const currentLines = splitLines(resultValue)
    const startOffset = positionToOffset(currentLines, edit.startLine, edit.startCharacter, separator)
    const endOffset = positionToOffset(currentLines, edit.endLine, edit.endCharacter, separator)
    resultValue = resultValue.slice(0, startOffset) + edit.newText + resultValue.slice(endOffset)
  }

  return resultValue
}

export class LspEditApplier {
  /**
   * Apply a workspace edit to disk.
   * Edits within each file are sorted in reverse document order.
   * Atomic: if any file fails, all changes are rolled back.
   */
  async applyWorkspaceEdit(edit: LspWorkspaceEdit): Promise<EditApplyResult> {
    if (edit.changes.length === 0) {
      return {
        applied: true,
        filesModified: [],
        totalEdits: 0,
        errors: [],
        backups: new Map(),
      }
    }

    const backups = new Map<string, string>()
    const filesModified: string[] = []
    const errors: string[] = []
    const grouped = groupEditsByFile(edit.changes)

    // Phase 1: Read all files, validate all ranges, create backups
    const fileContents = new Map<string, string>()
    for (const [filePath, edits] of grouped) {
      let content: string
      try {
        content = await readFile(filePath, 'utf-8')
      } catch (err) {
        errors.push(`Failed to read ${filePath}: ${err instanceof Error ? err.message : String(err)}`)
        return { applied: false, filesModified: [], totalEdits: 0, errors, backups: new Map() }
      }

      backups.set(filePath, content)
      const lines = splitLines(content)

      // Validate all edit ranges
      for (const e of edits) {
        const validationError = validateEditRange(e, lines)
        if (validationError) {
          errors.push(`${filePath}: ${validationError}`)
          return { applied: false, filesModified: [], totalEdits: 0, errors, backups: new Map() }
        }
      }

      fileContents.set(filePath, content)
    }

    // Phase 2: Apply edits to each file
    for (const [filePath, edits] of grouped) {
      const content = fileContents.get(filePath) as string
      const sortedEdits = sortEditsReverse(edits)

      try {
        const newContent = applyEditsToContent(content, sortedEdits)
        await writeFile(filePath, newContent, 'utf-8')
        filesModified.push(filePath)
        log.debug('LSP edit applied', { file: filePath, edits: edits.length })
      } catch (err) {
        errors.push(`Failed to write ${filePath}: ${err instanceof Error ? err.message : String(err)}`)

        // Rollback all previously written files
        for (const modifiedFile of filesModified) {
          const backup = backups.get(modifiedFile)
          if (backup !== undefined) {
            try {
              await writeFile(modifiedFile, backup, 'utf-8')
            } catch (rollbackErr) {
              log.error('Rollback failed', {
                file: modifiedFile,
                error: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr),
              })
            }
          }
        }

        return { applied: false, filesModified: [], totalEdits: 0, errors, backups: new Map() }
      }
    }

    return {
      applied: true,
      filesModified,
      totalEdits: edit.changes.length,
      errors: [],
      backups,
    }
  }

  /**
   * Rollback a previously applied edit using the in-memory backups.
   */
  async rollback(result: EditApplyResult): Promise<void> {
    if (!result.backups) return

    for (const [filePath, content] of result.backups) {
      try {
        await writeFile(filePath, content, 'utf-8')
        log.debug('LSP edit rolled back', { file: filePath })
      } catch (err) {
        log.error('Rollback failed', {
          file: filePath,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }
}
