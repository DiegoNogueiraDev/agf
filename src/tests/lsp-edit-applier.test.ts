/*!
 * Tests for src/core/lsp/lsp-edit-applier.ts
 * Covers edit ordering, range validation, CRLF support, and rollback path.
 * All tests use in-memory content via temp files.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { LspEditApplier } from '../core/lsp/lsp-edit-applier.js'
import type { LspWorkspaceEdit, LspTextEdit } from '../core/lsp/lsp-types.js'

function tmpFile(name: string, content: string): string {
  const p = join(tmpdir(), `agf-lsp-test-${Date.now()}-${name}`)
  writeFileSync(p, content, 'utf-8')
  return p
}

function cleanup(...paths: string[]) {
  for (const p of paths) {
    if (existsSync(p)) unlinkSync(p)
  }
}

let applier: LspEditApplier

beforeEach(() => {
  applier = new LspEditApplier()
})

function edit(file: string, sl: number, sc: number, el: number, ec: number, newText: string): LspTextEdit {
  return { file, startLine: sl, startCharacter: sc, endLine: el, endCharacter: ec, newText }
}

describe('LspEditApplier', () => {
  describe('applyWorkspaceEdit', () => {
    it('returns applied=true with no changes for empty edit list', async () => {
      const result = await applier.applyWorkspaceEdit({ changes: [] })
      expect(result.applied).toBe(true)
      expect(result.filesModified).toHaveLength(0)
      expect(result.totalEdits).toBe(0)
    })

    it('applies a single text edit to a file', async () => {
      const path = tmpFile('single.txt', 'hello world\n')
      try {
        const workspace: LspWorkspaceEdit = {
          changes: [edit(path, 1, 6, 1, 11, 'earth')],
        }
        const result = await applier.applyWorkspaceEdit(workspace)
        expect(result.applied).toBe(true)
        expect(readFileSync(path, 'utf-8')).toBe('hello earth\n')
      } finally {
        cleanup(path)
      }
    })

    it('applies multiple edits in reverse document order', async () => {
      const path = tmpFile('multi.txt', 'line1\nline2\nline3\n')
      try {
        // Replace line3 content and line1 content — must apply bottom-to-top
        const workspace: LspWorkspaceEdit = {
          changes: [
            edit(path, 1, 0, 1, 5, 'LINE1'), // line1 replacement
            edit(path, 3, 0, 3, 5, 'LINE3'), // line3 replacement
          ],
        }
        const result = await applier.applyWorkspaceEdit(workspace)
        expect(result.applied).toBe(true)
        const content = readFileSync(path, 'utf-8')
        expect(content).toContain('LINE1')
        expect(content).toContain('LINE3')
      } finally {
        cleanup(path)
      }
    })

    it('returns applied=false with out-of-bounds range', async () => {
      const path = tmpFile('bounds.txt', 'hello\n')
      try {
        const workspace: LspWorkspaceEdit = {
          changes: [edit(path, 99, 0, 99, 5, 'X')], // line 99 does not exist
        }
        const result = await applier.applyWorkspaceEdit(workspace)
        expect(result.applied).toBe(false)
        expect(result.errors.length).toBeGreaterThan(0)
      } finally {
        cleanup(path)
      }
    })

    it('handles CRLF line endings correctly', async () => {
      const path = tmpFile('crlf.txt', 'hello\r\nworld\r\n')
      try {
        const workspace: LspWorkspaceEdit = {
          changes: [edit(path, 2, 0, 2, 5, 'earth')],
        }
        const result = await applier.applyWorkspaceEdit(workspace)
        expect(result.applied).toBe(true)
        expect(readFileSync(path, 'utf-8')).toContain('earth')
      } finally {
        cleanup(path)
      }
    })

    it('records backups in the result', async () => {
      const path = tmpFile('backup.txt', 'original content\n')
      try {
        const workspace: LspWorkspaceEdit = {
          changes: [edit(path, 1, 0, 1, 8, 'replaced')],
        }
        const result = await applier.applyWorkspaceEdit(workspace)
        expect(result.applied).toBe(true)
        expect(result.backups.has(path)).toBe(true)
        expect(result.backups.get(path)).toBe('original content\n')
      } finally {
        cleanup(path)
      }
    })
  })

  describe('rollback', () => {
    it('restores file to backup content', async () => {
      const path = tmpFile('rollback.txt', 'original\n')
      try {
        const workspace: LspWorkspaceEdit = {
          changes: [edit(path, 1, 0, 1, 8, 'modified')],
        }
        const result = await applier.applyWorkspaceEdit(workspace)
        expect(readFileSync(path, 'utf-8')).toContain('modified')
        await applier.rollback(result)
        expect(readFileSync(path, 'utf-8')).toBe('original\n')
      } finally {
        cleanup(path)
      }
    })
  })
})
