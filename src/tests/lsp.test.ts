/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, writeFileSync, rmSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { LspBridge } from '../core/lsp/lsp-bridge.js'
import { LspClient } from '../core/lsp/lsp-client.js'
import { LspCache } from '../core/lsp/lsp-cache.js'
import { LspDiagnosticsCollector } from '../core/lsp/lsp-diagnostics.js'
import { LspEditApplier } from '../core/lsp/lsp-edit-applier.js'
import { LspServerManager } from '../core/lsp/lsp-server-manager.js'
import { ServerRegistry } from '../core/lsp/server-registry.js'
import { detectProjectLanguages } from '../core/lsp/language-detector.js'
import {
  LspServerConfigSchema,
  LspLocationSchema,
  LspHoverResultSchema,
  LspDiagnosticSchema,
  LspDiagnosticSeverity,
  LspTextEditSchema,
  LspWorkspaceEditSchema,
  LspCodeActionSchema,
  EditApplyResultSchema,
  LspServerStateSchema,
  DetectedLanguageSchema,
  LspCallHierarchyItemSchema,
  LspDocumentSymbolSchema,
} from '../core/lsp/lsp-types.js'
import { checkLspDep } from '../core/lsp/lsp-deps-installer.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'lsp-test-'))
}

function touchFile(dir: string, relPath: string, content: string = ''): string {
  const full = join(dir, relPath)
  const parent = join(full, '..')
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true })
  writeFileSync(full, content, 'utf-8')
  return full
}

// ---------------------------------------------------------------------------
// 1. LspBridge
// ---------------------------------------------------------------------------

describe('LspBridge', () => {
  let tmpDir: string
  let bridge: LspBridge

  beforeEach(() => {
    tmpDir = createTempDir()
    const manager = {
      getClientForFile: vi.fn().mockResolvedValue(null),
      getStatus: vi.fn().mockReturnValue(new Map()),
    } as unknown as LspServerManager
    bridge = new LspBridge(manager, null, new LspDiagnosticsCollector(), tmpDir)
  })

  it('returns empty array for goToDefinition when no server available', async () => {
    const result = await bridge.goToDefinition('test.ts', 1, 0)
    expect(result).toEqual([])
  })

  it('returns empty array for findReferences when no server available', async () => {
    const result = await bridge.findReferences('test.ts', 1, 0)
    expect(result).toEqual([])
  })

  it('returns null for hover when no server available', async () => {
    const result = await bridge.hover('test.ts', 1, 0)
    expect(result).toBeNull()
  })

  it('returns null for rename when no server available', async () => {
    const result = await bridge.rename('test.ts', 1, 0, 'newName')
    expect(result).toBeNull()
  })

  it('returns empty array for callHierarchyIncoming when no server available', async () => {
    const result = await bridge.callHierarchyIncoming('test.ts', 1, 0)
    expect(result).toEqual([])
  })

  it('returns empty array for callHierarchyOutgoing when no server available', async () => {
    const result = await bridge.callHierarchyOutgoing('test.ts', 1, 0)
    expect(result).toEqual([])
  })

  it('returns empty array for getDocumentSymbols when no server available', async () => {
    const result = await bridge.getDocumentSymbols('test.ts')
    expect(result).toEqual([])
  })

  it('returns empty array for getDiagnostics initially', async () => {
    const result = await bridge.getDiagnostics('test.ts')
    expect(result).toEqual([])
  })

  it('returns empty array for formatDocument when no server available', async () => {
    const result = await bridge.formatDocument('test.ts')
    expect(result).toEqual([])
  })

  it('returns empty array for formatRange when no server available', async () => {
    const result = await bridge.formatRange('test.ts', 1, 0, 1, 10)
    expect(result).toEqual([])
  })

  it('returns empty array for getCodeActions when no server available', async () => {
    const result = await bridge.getCodeActions('test.ts', 1, 0, 1, 10)
    expect(result).toEqual([])
  })

  it('handles notifyDocumentChanged gracefully when no server', async () => {
    writeFileSync(join(tmpDir, 'test.ts'), 'let x = 1', 'utf-8')
    await expect(bridge.notifyDocumentChanged('test.ts', 'let y = 2')).resolves.toBeUndefined()
  })

  it('getLanguageStatus returns status map from manager', async () => {
    const result = await bridge.getLanguageStatus()
    expect(result).toBeInstanceOf(Map)
  })
})

// ---------------------------------------------------------------------------
// 2. LspClient
// ---------------------------------------------------------------------------

describe('LspClient', () => {
  it('has ready=false initially', () => {
    const client = new LspClient('node', ['-e', 'process.stdin.resume()'])
    expect(client.ready).toBe(false)
  })

  it('has pid undefined before start', () => {
    const client = new LspClient('node', ['-e', ''])
    expect(client.pid).toBeUndefined()
  })

  it('start with non-existent command emits error event', async () => {
    const client = new LspClient('command-that-does-not-exist-12345', [])
    const errorPromise = new Promise<void>((resolve) => {
      client.on('error', () => resolve())
    })
    await client.start()
    await expect(errorPromise).resolves.toBeUndefined()
  })

  it('sendRequest throws when stdin not writable', async () => {
    const client = new LspClient('node', ['-e', ''])
    await expect(client.sendRequest('test')).rejects.toThrow('LSP process is not running')
  })

  it('sendNotification does not throw when stdin not writable', () => {
    const client = new LspClient('node', ['-e', ''])
    expect(() => client.sendNotification('test')).not.toThrow()
  })

  it('stop without starting does not throw', async () => {
    const client = new LspClient('node', ['-e', ''])
    await expect(client.stop()).resolves.toBeUndefined()
  })

  it('kill without starting does not throw', () => {
    const client = new LspClient('node', ['-e', ''])
    expect(() => client.kill()).not.toThrow()
  })

  it('double start does not spawn second process', async () => {
    const client = new LspClient('node', ['-e', 'process.stdin.resume()'])
    await client.start()
    const pid1 = client.pid
    await client.start()
    expect(client.pid).toBe(pid1)
    client.kill()
  })
})

// ---------------------------------------------------------------------------
// 3. LspDiagnosticsCollector
// ---------------------------------------------------------------------------

describe('LspDiagnosticsCollector', () => {
  let collector: LspDiagnosticsCollector

  beforeEach(() => {
    collector = new LspDiagnosticsCollector()
  })

  const makeDiag = (overrides?: Partial<LspDiagnostic>): LspDiagnostic => ({
    file: 'test.ts',
    startLine: 1,
    startCharacter: 0,
    endLine: 1,
    endCharacter: 5,
    severity: 1,
    message: 'test error',
    ...overrides,
  })

  it('stores and retrieves diagnostics per file', () => {
    collector.onDiagnostics('typescript', 'test.ts', [makeDiag()])
    const result = collector.getForFile('test.ts')
    expect(result).toHaveLength(1)
    expect(result[0].message).toBe('test error')
  })

  it('returns empty for unknown file', () => {
    expect(collector.getForFile('unknown.ts')).toEqual([])
  })

  it('deletes entry when empty diagnostics received', () => {
    collector.onDiagnostics('typescript', 'test.ts', [makeDiag()])
    expect(collector.getForFile('test.ts')).toHaveLength(1)
    collector.onDiagnostics('typescript', 'test.ts', [])
    expect(collector.getForFile('test.ts')).toEqual([])
  })

  it('getForLanguage returns map for known language', () => {
    collector.onDiagnostics('typescript', 'a.ts', [makeDiag()])
    const langMap = collector.getForLanguage('typescript')
    expect(langMap.has('a.ts')).toBe(true)
  })

  it('getForLanguage returns empty map for unknown language', () => {
    const langMap = collector.getForLanguage('unknown')
    expect(langMap.size).toBe(0)
  })

  it('getAll returns all diagnostics across languages', () => {
    collector.onDiagnostics('typescript', 'a.ts', [makeDiag({ message: 'err1' })])
    collector.onDiagnostics('python', 'b.py', [makeDiag({ message: 'err2' })])
    const all = collector.getAll()
    expect(all.size).toBe(2)
  })

  it('getAll filters by severity', () => {
    collector.onDiagnostics('typescript', 'a.ts', [
      makeDiag({ severity: 1, message: 'error' }),
      makeDiag({ severity: 2, message: 'warning' }),
    ])
    const errors = collector.getAll(1)
    const allEntries = [...errors.values()]
    expect(allEntries[0]).toHaveLength(1)
    expect(allEntries[0][0].message).toBe('error')
  })

  it('getSummary returns correct counts', () => {
    collector.onDiagnostics('typescript', 'a.ts', [
      makeDiag({ severity: 1 }),
      makeDiag({ severity: 2 }),
      makeDiag({ severity: 3 }),
      makeDiag({ severity: 4 }),
    ])
    const summary = collector.getSummary()
    expect(summary.total.errors).toBe(1)
    expect(summary.total.warnings).toBe(1)
    expect(summary.total.info).toBe(1)
    expect(summary.total.hints).toBe(1)
    expect(summary.byLanguage.typescript).toBeDefined()
  })

  it('clearLanguage removes all diagnostics for that language', () => {
    collector.onDiagnostics('typescript', 'a.ts', [makeDiag()])
    collector.clearLanguage('typescript')
    expect(collector.getForLanguage('typescript').size).toBe(0)
  })

  it('clearAll removes everything', () => {
    collector.onDiagnostics('typescript', 'a.ts', [makeDiag()])
    collector.clearAll()
    expect(collector.getForFile('a.ts')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 4. LspCache
// ---------------------------------------------------------------------------

describe('LspCache', () => {
  let db: Database.Database
  let cache: LspCache

  beforeEach(() => {
    db = new Database(':memory:')
    cache = new LspCache(db)
  })

  afterEach(() => {
    db.close()
  })

  it('returns null for missing key', () => {
    const result = cache.get('p1', 'nonexistent', '123')
    expect(result).toBeNull()
  })

  it('stores and retrieves values', () => {
    cache.set('p1', 'key1', 'hover', 'typescript', 'test.ts', { result: 'ok' }, '100')
    const result = cache.get('p1', 'key1', '100')
    expect(result).toEqual({ result: 'ok' })
  })

  it('returns null when mtime differs', () => {
    cache.set('p1', 'key1', 'hover', 'typescript', 'test.ts', { result: 'ok' }, '100')
    const result = cache.get('p1', 'key1', '200')
    expect(result).toBeNull()
  })

  it('invalidateFile removes entries', () => {
    cache.set('p1', 'key1', 'hover', 'typescript', 'test.ts', 'val', '100')
    const deleted = cache.invalidateFile('p1', 'test.ts')
    expect(deleted).toBeGreaterThan(0)
    expect(cache.get('p1', 'key1', '100')).toBeNull()
  })

  it('invalidateLanguage removes entries for that language', () => {
    cache.set('p1', 'k1', 'hover', 'typescript', 'a.ts', 'v1', '100')
    cache.set('p1', 'k2', 'hover', 'python', 'b.py', 'v2', '100')
    cache.invalidateLanguage('p1', 'typescript')
    expect(cache.get('p1', 'k1', '100')).toBeNull()
    expect(cache.get('p1', 'k2', '100')).toEqual('v2')
  })

  it('invalidateAll removes everything for a project', () => {
    cache.set('p1', 'k1', 'hover', 'ts', 'a.ts', 'v1', '100')
    cache.set('p1', 'k2', 'hover', 'py', 'b.py', 'v2', '100')
    cache.invalidateAll('p1')
    expect(cache.get('p1', 'k1', '100')).toBeNull()
    expect(cache.get('p1', 'k2', '100')).toBeNull()
  })

  it('prune removes old entries', () => {
    cache.set('p1', 'k1', 'hover', 'ts', 'a.ts', 'v1', '100')
    // Set created_at to very old date via raw SQL
    db.prepare(`UPDATE lsp_cache SET created_at = '2020-01-01' WHERE cache_key = 'k1'`).run()
    const pruned = cache.prune(1)
    expect(pruned).toBeGreaterThan(0)
  })

  it('getStats returns counts', () => {
    cache.set('p1', 'k1', 'hover', 'typescript', 'a.ts', 'v1', '100')
    cache.set('p1', 'k2', 'references', 'typescript', 'a.ts', 'v2', '100')
    cache.set('p1', 'k3', 'hover', 'python', 'b.py', 'v3', '100')
    const stats = cache.getStats('p1')
    expect(stats.total).toBe(3)
    expect(stats.byLanguage.typescript).toBe(2)
    expect(stats.byLanguage.python).toBe(1)
    expect(stats.byOperation.hover).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// 5. LspTypes (schemas)
// ---------------------------------------------------------------------------

describe('LSP types schemas', () => {
  it('LspServerConfigSchema validates a valid config', () => {
    const result = LspServerConfigSchema.parse({
      languageId: 'typescript',
      extensions: ['ts'],
      command: 'ts-ls',
      args: ['--stdio'],
      configFiles: ['tsconfig.json'],
    })
    expect(result.languageId).toBe('typescript')
  })

  it('LspLocationSchema validates a location', () => {
    const result = LspLocationSchema.parse({
      file: 'test.ts',
      startLine: 1,
      startCharacter: 0,
      endLine: 1,
      endCharacter: 5,
    })
    expect(result.startLine).toBe(1)
  })

  it('LspHoverResultSchema validates hover result', () => {
    const result = LspHoverResultSchema.parse({
      signature: 'foo()',
      documentation: 'docs',
      language: 'typescript',
    })
    expect(result.signature).toBe('foo()')
  })

  it('LspDiagnosticSchema validates diagnostic', () => {
    const result = LspDiagnosticSchema.parse({
      file: 'test.ts',
      startLine: 1,
      startCharacter: 0,
      endLine: 1,
      endCharacter: 5,
      severity: 1,
      message: 'err',
    })
    expect(result.severity).toBe(1)
  })

  it('LspDiagnosticSeverity has correct values', () => {
    expect(LspDiagnosticSeverity.Error).toBe(1)
    expect(LspDiagnosticSeverity.Warning).toBe(2)
    expect(LspDiagnosticSeverity.Information).toBe(3)
    expect(LspDiagnosticSeverity.Hint).toBe(4)
  })

  it('LspTextEditSchema validates', () => {
    const result = LspTextEditSchema.parse({
      file: 'test.ts',
      startLine: 1,
      startCharacter: 0,
      endLine: 1,
      endCharacter: 5,
      newText: 'foo',
    })
    expect(result.newText).toBe('foo')
  })

  it('LspWorkspaceEditSchema validates', () => {
    const result = LspWorkspaceEditSchema.parse({
      changes: [
        {
          file: 'test.ts',
          startLine: 1,
          startCharacter: 0,
          endLine: 1,
          endCharacter: 5,
          newText: 'foo',
        },
      ],
    })
    expect(result.changes).toHaveLength(1)
  })

  it('LspCodeActionSchema validates', () => {
    const result = LspCodeActionSchema.parse({
      title: 'Fix',
      kind: 'quickfix',
      isPreferred: true,
    })
    expect(result.title).toBe('Fix')
  })

  it('EditApplyResultSchema validates', () => {
    const result = EditApplyResultSchema.parse({
      applied: true,
      filesModified: ['test.ts'],
      totalEdits: 1,
      errors: [],
      backups: new Map([['test.ts', 'content']]),
    })
    expect(result.applied).toBe(true)
  })

  it('LspServerStateSchema validates', () => {
    const result = LspServerStateSchema.parse({
      languageId: 'typescript',
      status: 'ready',
      pid: 1234,
    })
    expect(result.status).toBe('ready')
  })

  it('DetectedLanguageSchema validates', () => {
    const result = DetectedLanguageSchema.parse({
      languageId: 'typescript',
      confidence: 0.9,
      detectedVia: 'file_extension',
      fileCount: 10,
    })
    expect(result.confidence).toBe(0.9)
  })

  it('LspCallHierarchyItemSchema validates', () => {
    const result = LspCallHierarchyItemSchema.parse({
      name: 'foo',
      kind: 'Function',
      file: 'test.ts',
      startLine: 1,
      endLine: 10,
    })
    expect(result.name).toBe('foo')
  })
})

// ---------------------------------------------------------------------------
// 6. LspEditApplier
// ---------------------------------------------------------------------------

describe('LspEditApplier', () => {
  let tmpDir: string
  let applier: LspEditApplier

  beforeEach(() => {
    tmpDir = createTempDir()
    applier = new LspEditApplier()
  })

  it('returns applied=true for empty changes', async () => {
    const result = await applier.applyWorkspaceEdit({ changes: [] })
    expect(result.applied).toBe(true)
    expect(result.filesModified).toEqual([])
  })

  it('returns applied=false when file does not exist', async () => {
    const result = await applier.applyWorkspaceEdit({
      changes: [
        {
          file: join(tmpDir, 'nonexistent.ts'),
          startLine: 1,
          startCharacter: 0,
          endLine: 1,
          endCharacter: 0,
          newText: 'foo',
        },
      ],
    })
    expect(result.applied).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('applies edits to existing file', async () => {
    const filePath = touchFile(tmpDir, 'test.ts', 'hello world')
    const result = await applier.applyWorkspaceEdit({
      changes: [
        {
          file: filePath,
          startLine: 1,
          startCharacter: 0,
          endLine: 1,
          endCharacter: 5,
          newText: 'hi',
        },
      ],
    })
    expect(result.applied).toBe(true)
    expect(result.filesModified).toEqual([filePath])
  })

  it('rollback restores original file content', async () => {
    const filePath = touchFile(tmpDir, 'rollback.ts', 'original')
    const result = await applier.applyWorkspaceEdit({
      changes: [
        {
          file: filePath,
          startLine: 1,
          startCharacter: 0,
          endLine: 1,
          endCharacter: 8,
          newText: 'modified',
        },
      ],
    })
    expect(result.applied).toBe(true)
    await applier.rollback(result)
    const content = await import('node:fs/promises').then((fs) => fs.readFile(filePath, 'utf-8'))
    expect(content).toBe('original')
  })
})

// ---------------------------------------------------------------------------
// 7. ServerRegistry
// ---------------------------------------------------------------------------

describe('ServerRegistry', () => {
  it('loads all 12 default servers', () => {
    const registry = new ServerRegistry()
    const configs = registry.getAllConfigs()
    expect(configs.length).toBe(12)
  })

  it('maps extension to language', () => {
    const registry = new ServerRegistry()
    expect(registry.getLanguageForExtension('ts')).toBe('typescript')
    expect(registry.getLanguageForExtension('py')).toBe('python')
    expect(registry.getLanguageForExtension('rs')).toBe('rust')
  })

  it('maps file path to language', () => {
    const registry = new ServerRegistry()
    expect(registry.getLanguageForFile('/path/to/file.ts')).toBe('typescript')
    expect(registry.getLanguageForFile('/path/to/file.py')).toBe('python')
  })

  it('returns undefined for unknown extension', () => {
    const registry = new ServerRegistry()
    expect(registry.getLanguageForExtension('xyz')).toBeUndefined()
  })

  it('returns undefined for file without extension', () => {
    const registry = new ServerRegistry()
    expect(registry.getLanguageForFile('/path/to/README')).toBeUndefined()
  })

  it('getConfigForLanguage returns config for known language', () => {
    const registry = new ServerRegistry()
    const config = registry.getConfigForLanguage('typescript')
    expect(config?.command).toBe('typescript-language-server')
  })

  it('getConfigForLanguage returns undefined for unknown', () => {
    const registry = new ServerRegistry()
    expect(registry.getConfigForLanguage('unknown')).toBeUndefined()
  })

  it('getSupportedExtensions returns all registered extensions', () => {
    const registry = new ServerRegistry()
    const exts = registry.getSupportedExtensions()
    expect(exts).toContain('ts')
    expect(exts).toContain('py')
    expect(exts).toContain('go')
  })

  it('applies overrides to existing server', () => {
    const registry = new ServerRegistry([
      {
        languageId: 'typescript',
        command: 'custom-ts-ls',
        args: [],
      },
    ])
    const config = registry.getConfigForLanguage('typescript')
    expect(config?.command).toBe('custom-ts-ls')
  })

  it('adds new language via override', () => {
    const registry = new ServerRegistry([
      {
        languageId: 'elixir',
        command: 'elixir-ls',
        args: [],
        extensions: ['ex'],
      },
    ])
    expect(registry.getConfigForLanguage('elixir')).toBeDefined()
    expect(registry.getLanguageForExtension('ex')).toBe('elixir')
  })
})

// ---------------------------------------------------------------------------
// 8. LspServerManager
// ---------------------------------------------------------------------------

describe('LspServerManager', () => {
  let registry: ServerRegistry

  beforeEach(() => {
    registry = new ServerRegistry()
  })

  it('getStatus returns stopped for known but unstarted servers', () => {
    const manager = new LspServerManager(registry, 'file:///test')
    const status = manager.getStatus()
    expect(status.get('typescript')?.status).toBe('stopped')
  })

  it('ensureServer returns null for unknown language', async () => {
    const manager = new LspServerManager(registry, 'file:///test')
    const client = await manager.ensureServer('unknown')
    expect(client).toBeNull()
  })

  it('shutdownAll does not throw when no servers running', async () => {
    const manager = new LspServerManager(registry, 'file:///test')
    await expect(manager.shutdownAll()).resolves.toBeUndefined()
  })

  it('stopServer does not throw for unknown language', async () => {
    const manager = new LspServerManager(registry, 'file:///test')
    await expect(manager.stopServer('unknown')).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 9. language-detector
// ---------------------------------------------------------------------------

describe('language-detector', () => {
  it('detects languages by config file in root', () => {
    const tmpDir = createTempDir()
    writeFileSync(join(tmpDir, 'tsconfig.json'), '{}', 'utf-8')
    writeFileSync(join(tmpDir, 'main.ts'), 'let x = 1', 'utf-8')

    const registry = new ServerRegistry()
    const result = detectProjectLanguages(tmpDir, registry)
    expect(result.length).toBeGreaterThan(0)
    const ts = result.find((r) => r.languageId === 'typescript')
    expect(ts).toBeDefined()
    expect(ts?.detectedVia).toBe('config_file')
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('detects languages by file extension count', () => {
    const tmpDir = createTempDir()
    writeFileSync(join(tmpDir, 'main.py'), 'print(1)', 'utf-8')
    writeFileSync(join(tmpDir, 'util.py'), 'print(2)', 'utf-8')

    const registry = new ServerRegistry()
    const result = detectProjectLanguages(tmpDir, registry)
    const py = result.find((r) => r.languageId === 'python')
    expect(py).toBeDefined()
    expect(py?.fileCount).toBe(2)
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns empty array when directory does not exist', () => {
    const registry = new ServerRegistry()
    const result = detectProjectLanguages('/nonexistent/path', registry)
    expect(result).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 10. lsp-deps-installer
// ---------------------------------------------------------------------------

describe('lsp-deps-installer', () => {
  it('checkLspDep returns not_found for missing command', async () => {
    const result = await checkLspDep('typescript', 'command-does-not-exist-99999')
    expect(result.status).toBe('not_found')
    expect(result.languageId).toBe('typescript')
  })

  it('checkLspDep includes npmPackage hint for npm-installable languages', async () => {
    const result = await checkLspDep('typescript', 'typescript-language-server')
    // On CI or dev machines it could be already_available
    expect(['already_available', 'not_found']).toContain(result.status)
    if (result.status === 'not_found') {
      expect(result.npmPackage).toBeDefined()
    }
  })

  it('checkLspDep includes installHint for system packages', async () => {
    const result = await checkLspDep('python', 'pylsp')
    expect(['already_available', 'not_found']).toContain(result.status)
    if (result.status === 'not_found') {
      expect(result.installHint).toContain('pip')
    }
  })
})

// ---------------------------------------------------------------------------
// 11. index exports
// ---------------------------------------------------------------------------

describe('LSP index exports', () => {
  it('exports all expected named exports', async () => {
    const mod = await import('../core/lsp/index.js')
    expect(mod.LspBridge).toBeDefined()
    expect(mod.LspCache).toBeDefined()
    expect(mod.LspClient).toBeDefined()
    expect(mod.LspDiagnosticsCollector).toBeDefined()
    expect(mod.LspEditApplier).toBeDefined()
    expect(mod.LspServerManager).toBeDefined()
    expect(mod.ServerRegistry).toBeDefined()
    expect(mod.detectProjectLanguages).toBeDefined()
    expect(mod.LspServerConfigSchema).toBeDefined()
    expect(mod.LspLocationSchema).toBeDefined()
    expect(mod.LspHoverResultSchema).toBeDefined()
    expect(mod.LspDiagnosticSchema).toBeDefined()
    expect(mod.LspDiagnosticSeverity).toBeDefined()
    expect(mod.LspTextEditSchema).toBeDefined()
    expect(mod.LspWorkspaceEditSchema).toBeDefined()
    expect(mod.LspCodeActionSchema).toBeDefined()
    expect(mod.LspServerStateSchema).toBeDefined()
    expect(mod.DetectedLanguageSchema).toBeDefined()
    expect(mod.LspCallHierarchyItemSchema).toBeDefined()
    expect(mod.LspDocumentSymbolSchema).toBeDefined()
    expect(mod.EditApplyResultSchema).toBeDefined()
    expect(mod.checkLspDep).toBeDefined()
  })
})
