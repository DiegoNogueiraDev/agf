/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task 3.1 AC coverage: memory-migrator.ts
 *
 * AC1: schema antigo com campos extras → preservados sem corrupção
 * AC2: destino já existe → não sobrescreve silenciosamente (skip)
 * AC3: migrator falha no meio → origem permanece intacta
 * Coverage: memory-migrator.ts ≥ 90% branch coverage
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { migrateSerenaMemories } from '../core/memory/memory-migrator.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

let baseDir: string

async function setup(): Promise<void> {
  baseDir = await mkdtemp(path.join(tmpdir(), 'mem-migrator-'))
}

async function createSourceFile(relativePath: string, content: string): Promise<void> {
  const fullPath = path.join(baseDir, '.serena/memories', relativePath)
  await mkdir(path.dirname(fullPath), { recursive: true })
  await writeFile(fullPath, content, 'utf-8')
}

async function readTargetFile(relativePath: string): Promise<string> {
  const targetPath = path.join(baseDir, 'workflow-graph/memories', relativePath)
  return readFile(targetPath, 'utf-8')
}

function targetExists(relativePath: string): boolean {
  return existsSync(path.join(baseDir, 'workflow-graph/memories', relativePath))
}

async function createTargetFile(relativePath: string, content: string): Promise<void> {
  const fullPath = path.join(baseDir, 'workflow-graph/memories', relativePath)
  await mkdir(path.dirname(fullPath), { recursive: true })
  await writeFile(fullPath, content, 'utf-8')
}

beforeEach(setup)

// ── AC1: content preserved (schema + extra fields) ────────────────────────────

describe('AC1: content preserved without corruption', () => {
  it('migrates a simple .md file verbatim', async () => {
    const content = '# My Memory\n\nSome content here.\n'
    await createSourceFile('memory.md', content)

    const result = await migrateSerenaMemories(baseDir)
    expect(result.migrated).toBe(1)
    expect(result.skipped).toBe(0)

    const written = await readTargetFile('memory.md')
    expect(written).toBe(content)
  })

  it('preserves extra fields / YAML frontmatter in the content (AC1)', async () => {
    const content = [
      '---',
      'name: user-prefs',
      'description: user preferences',
      'metadata:',
      '  type: user',
      '  custom_field_extra: some-value',
      '---',
      '',
      '# User Preferences',
      '',
      'The user prefers TypeScript over JavaScript.',
    ].join('\n')

    await createSourceFile('user-prefs.md', content)
    await migrateSerenaMemories(baseDir)
    const written = await readTargetFile('user-prefs.md')
    expect(written).toBe(content)
    expect(written).toContain('custom_field_extra: some-value')
  })

  it('preserves binary-safe content (unicode, special chars)', async () => {
    const content = '# Memória\n\nConteúdo com acentos: ação, atenção, integração.\n🌿\n'
    await createSourceFile('unicode.md', content)
    await migrateSerenaMemories(baseDir)
    const written = await readTargetFile('unicode.md')
    expect(written).toBe(content)
  })

  it('migrates multiple files, each preserved correctly', async () => {
    await createSourceFile('a.md', '# File A\n')
    await createSourceFile('b.md', '# File B\n')
    await createSourceFile('c.md', '# File C\n')

    const result = await migrateSerenaMemories(baseDir)
    expect(result.migrated).toBe(3)

    expect(await readTargetFile('a.md')).toBe('# File A\n')
    expect(await readTargetFile('b.md')).toBe('# File B\n')
    expect(await readTargetFile('c.md')).toBe('# File C\n')
  })

  it('creates nested target directories as needed', async () => {
    await createSourceFile('subdir/nested.md', '# Nested\n')
    await migrateSerenaMemories(baseDir)
    expect(targetExists('subdir/nested.md')).toBe(true)
  })

  it('migrates files from nested subdirectories', async () => {
    await createSourceFile('level1/level2/deep.md', '# Deep\n')
    await migrateSerenaMemories(baseDir)
    const written = await readTargetFile('level1/level2/deep.md')
    expect(written).toBe('# Deep\n')
  })
})

// ── AC2: destination exists → skip, not overwrite ─────────────────────────────

describe('AC2: target exists → skipped without overwrite (AC2)', () => {
  it('skips file if target already exists', async () => {
    await createSourceFile('existing.md', '# Source Content\n')
    await createTargetFile('existing.md', '# Original Target Content\n')

    const result = await migrateSerenaMemories(baseDir)
    expect(result.migrated).toBe(0)
    expect(result.skipped).toBe(1)

    // Target is NOT overwritten
    const written = await readTargetFile('existing.md')
    expect(written).toBe('# Original Target Content\n')
  })

  it('returns correct migrated/skipped counts in mixed batch', async () => {
    await createSourceFile('new.md', '# New\n')
    await createSourceFile('existing.md', '# Source\n')
    await createTargetFile('existing.md', '# Target\n')

    const result = await migrateSerenaMemories(baseDir)
    expect(result.migrated).toBe(1)
    expect(result.skipped).toBe(1)
  })

  it('all files existing → migrated=0, skipped=N', async () => {
    await createSourceFile('a.md', '# A\n')
    await createSourceFile('b.md', '# B\n')
    await createTargetFile('a.md', '# A-target\n')
    await createTargetFile('b.md', '# B-target\n')

    const result = await migrateSerenaMemories(baseDir)
    expect(result.migrated).toBe(0)
    expect(result.skipped).toBe(2)
  })
})

// ── AC3: failure → source remains intact ─────────────────────────────────────

describe('AC3: source remains intact if migration fails', () => {
  it('source files are never modified or deleted during migration', async () => {
    const originalContent = '# Precious Memory\n\nDo not lose this.\n'
    await createSourceFile('precious.md', originalContent)

    await migrateSerenaMemories(baseDir)

    // Source still exists and is unchanged
    const sourceContent = await readFile(path.join(baseDir, '.serena/memories/precious.md'), 'utf-8')
    expect(sourceContent).toBe(originalContent)
  })

  it('source file remains intact after a successfully migrated copy', async () => {
    const content = '# Source\n'
    await createSourceFile('source.md', content)
    await migrateSerenaMemories(baseDir)

    const sourceStillExists = existsSync(path.join(baseDir, '.serena/memories/source.md'))
    expect(sourceStillExists).toBe(true)

    const sourceContent = await readFile(path.join(baseDir, '.serena/memories/source.md'), 'utf-8')
    expect(sourceContent).toBe(content)
  })
})

// ── Branch coverage: no source dir → { migrated: 0, skipped: 0 } ─────────────

describe('Branch: no source directory → early return', () => {
  it('returns { migrated:0, skipped:0 } when .serena/memories does not exist', async () => {
    const result = await migrateSerenaMemories(baseDir)
    expect(result).toEqual({ migrated: 0, skipped: 0 })
  })

  it('no target directory created when source does not exist', async () => {
    await migrateSerenaMemories(baseDir)
    expect(existsSync(path.join(baseDir, 'workflow-graph/memories'))).toBe(false)
  })
})

// ── Branch: empty source dir → { migrated: 0, skipped: 0 } ──────────────────

describe('Branch: empty source directory → migrated=0', () => {
  it('returns { migrated:0, skipped:0 } when source dir exists but has no .md files', async () => {
    // Create source dir but no files
    await mkdir(path.join(baseDir, '.serena/memories'), { recursive: true })
    const result = await migrateSerenaMemories(baseDir)
    expect(result).toEqual({ migrated: 0, skipped: 0 })
  })
})

// ── Branch: non-.md files are ignored ────────────────────────────────────────

describe('Branch: only .md files are migrated', () => {
  it('non-.md files in source are ignored', async () => {
    await mkdir(path.join(baseDir, '.serena/memories'), { recursive: true })
    await writeFile(path.join(baseDir, '.serena/memories/data.json'), '{}')
    await writeFile(path.join(baseDir, '.serena/memories/notes.txt'), 'notes')
    await createSourceFile('real.md', '# Real\n')

    const result = await migrateSerenaMemories(baseDir)
    expect(result.migrated).toBe(1)
    expect(targetExists('data.json')).toBe(false)
    expect(targetExists('notes.txt')).toBe(false)
  })
})
