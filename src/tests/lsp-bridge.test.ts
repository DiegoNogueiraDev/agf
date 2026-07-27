/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Characterization tests for LspBridge navigation methods.
 *
 * Why: lsp-bridge.ts (the 832-line core of the LSP subsystem) shipped with ZERO
 * tests despite the coverage node being marked done. This file is the safety net
 * that pins current navigation behavior (goToDefinition, findReferences, hover,
 * documentSymbols, call hierarchy) BEFORE the God-class is decomposed into SRP
 * collaborators. It uses an in-memory LspClient stub — no real language server,
 * no external binaries (mitigates the known fixture risk) — so it is fast and
 * deterministic. Degradation/cache paths live in a sibling task; this file only
 * covers the happy navigation paths + normalization.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { LspBridge } from '../core/lsp/lsp-bridge.js'
import type { LspServerManager } from '../core/lsp/lsp-server-manager.js'
import type { LspClient } from '../core/lsp/lsp-client.js'
import type { LspDiagnosticsCollector } from '../core/lsp/lsp-diagnostics.js'
import type { LspCache } from '../core/lsp/lsp-cache.js'

interface RecordedCall {
  method: string
  params: unknown
}

/** Build an LspBridge wired to an in-memory client stub over a real temp file. */
function makeBridge(handler: (method: string, params: unknown) => unknown): {
  bridge: LspBridge
  baseDir: string
  file: string
  calls: RecordedCall[]
  notifications: RecordedCall[]
} {
  const baseDir = mkdtempSync(path.join(tmpdir(), 'lsp-bridge-test-'))
  const file = 'target.ts'
  writeFileSync(path.join(baseDir, file), 'export const x = 1\n', 'utf-8')

  const calls: RecordedCall[] = []
  const notifications: RecordedCall[] = []

  const client = {
    async sendRequest<T = unknown>(method: string, params?: unknown): Promise<T> {
      calls.push({ method, params })
      return handler(method, params) as T
    },
    sendNotification(method: string, params?: unknown): void {
      notifications.push({ method, params })
    },
  } as unknown as LspClient

  const manager = {
    async getClientForFile(): Promise<LspClient | null> {
      return client
    },
  } as unknown as LspServerManager

  const diagnostics = {
    getForFile: () => [],
  } as unknown as LspDiagnosticsCollector

  // cache=null exercises the no-cache navigation path directly.
  const bridge = new LspBridge(manager, null, diagnostics, baseDir)
  return { bridge, baseDir, file, calls, notifications }
}

/** Construct a file:// URI for a path under baseDir, matching bridge's fromFileUri. */
function uriFor(baseDir: string, rel: string): string {
  return 'file://' + path.resolve(baseDir, rel)
}

describe('LspBridge navigation (characterization)', () => {
  let cleanup: Array<() => void> = []
  beforeEach(() => {
    cleanup = []
  })
  afterEach(() => {
    for (const fn of cleanup) fn()
  })

  it('goToDefinition normalizes a single RawLspLocation to 1-based lines', async () => {
    const { bridge, baseDir, file } = makeBridge((method) => {
      if (method === 'textDocument/definition') {
        return {
          uri: uriFor(baseDir, 'dep.ts'),
          range: { start: { line: 9, character: 4 }, end: { line: 9, character: 9 } },
        }
      }
      return null
    })
    cleanup.push(() => rmSync(baseDir, { recursive: true, force: true }))

    const result = await bridge.goToDefinition(file, 10, 3)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      file: 'dep.ts',
      startLine: 10, // raw line 9 + 1
      startCharacter: 4,
      endLine: 10,
      endCharacter: 9,
    })
  })

  it('goToDefinition returns [] when the server yields nothing', async () => {
    const { bridge, baseDir, file } = makeBridge(() => null)
    cleanup.push(() => rmSync(baseDir, { recursive: true, force: true }))

    expect(await bridge.goToDefinition(file, 1, 0)).toEqual([])
  })

  it('findReferences sends includeDeclaration=true and normalizes every location', async () => {
    const { bridge, baseDir, file, calls } = makeBridge((method) => {
      if (method === 'textDocument/references') {
        return [
          { uri: uriFor(baseDir, 'a.ts'), range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } } },
          { uri: uriFor(baseDir, 'b.ts'), range: { start: { line: 2, character: 1 }, end: { line: 2, character: 4 } } },
        ]
      }
      return null
    })
    cleanup.push(() => rmSync(baseDir, { recursive: true, force: true }))

    const result = await bridge.findReferences(file, 5, 2)

    expect(result.map((r) => r.file)).toEqual(['a.ts', 'b.ts'])
    expect(result[0].startLine).toBe(1) // raw 0 + 1
    const refCall = calls.find((c) => c.method === 'textDocument/references')
    expect(refCall?.params).toMatchObject({ context: { includeDeclaration: true } })
  })

  it('hover normalizes string, MarkupContent, array, and null contents', async () => {
    // string contents
    const s = makeBridge(() => ({ contents: 'function foo(): void' }))
    cleanup.push(() => rmSync(s.baseDir, { recursive: true, force: true }))
    expect(await s.bridge.hover(s.file, 1, 0)).toEqual({ signature: 'function foo(): void' })

    // MarkupContent object
    const m = makeBridge(() => ({ contents: { kind: 'markdown', value: '`foo`' } }))
    cleanup.push(() => rmSync(m.baseDir, { recursive: true, force: true }))
    expect(await m.bridge.hover(m.file, 1, 0)).toEqual({ signature: '`foo`', language: 'markdown' })

    // array contents → first is signature, rest documentation
    const a = makeBridge(() => ({ contents: ['sig line', 'doc line'] }))
    cleanup.push(() => rmSync(a.baseDir, { recursive: true, force: true }))
    expect(await a.bridge.hover(a.file, 1, 0)).toMatchObject({ signature: 'sig line', documentation: 'doc line' })

    // null → null
    const n = makeBridge(() => null)
    cleanup.push(() => rmSync(n.baseDir, { recursive: true, force: true }))
    expect(await n.bridge.hover(n.file, 1, 0)).toBeNull()
  })

  it('getDocumentSymbols maps LSP kind numbers to names and recurses children', async () => {
    const { bridge, baseDir, file } = makeBridge((method) => {
      if (method === 'textDocument/documentSymbol') {
        return [
          {
            name: 'MyClass',
            kind: 5, // Class
            range: { start: { line: 0, character: 0 }, end: { line: 20, character: 1 } },
            children: [
              { name: 'method', kind: 6, range: { start: { line: 2, character: 2 }, end: { line: 4, character: 3 } } },
            ],
          },
        ]
      }
      return null
    })
    cleanup.push(() => rmSync(baseDir, { recursive: true, force: true }))

    const symbols = await bridge.getDocumentSymbols(file)

    expect(symbols).toHaveLength(1)
    expect(symbols[0]).toMatchObject({ name: 'MyClass', kind: 'Class', startLine: 1, endLine: 21, file })
    expect(symbols[0].children?.[0]).toMatchObject({ name: 'method', kind: 'Method', startLine: 3 })
  })

  it('callHierarchyIncoming runs prepare → incomingCalls and normalizes callers', async () => {
    const { bridge, baseDir, file, calls } = makeBridge((method) => {
      if (method === 'textDocument/prepareCallHierarchy') {
        return [
          {
            name: 'target',
            kind: 12,
            uri: uriFor(baseDir, 'target.ts'),
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } },
          },
        ]
      }
      if (method === 'callHierarchy/incomingCalls') {
        return [
          {
            from: {
              name: 'caller',
              kind: 12,
              uri: uriFor(baseDir, 'caller.ts'),
              range: { start: { line: 7, character: 0 }, end: { line: 9, character: 1 } },
            },
          },
        ]
      }
      return null
    })
    cleanup.push(() => rmSync(baseDir, { recursive: true, force: true }))

    const incoming = await bridge.callHierarchyIncoming(file, 1, 0)

    expect(incoming).toHaveLength(1)
    expect(incoming[0]).toEqual({ name: 'caller', kind: 'Function', file: 'caller.ts', startLine: 8, endLine: 10 })
    expect(calls.map((c) => c.method)).toContain('callHierarchy/incomingCalls')
  })

  it('callHierarchyOutgoing returns [] when prepare yields no items', async () => {
    const { bridge, baseDir, file } = makeBridge((method) => {
      if (method === 'textDocument/prepareCallHierarchy') return []
      return null
    })
    cleanup.push(() => rmSync(baseDir, { recursive: true, force: true }))

    expect(await bridge.callHierarchyOutgoing(file, 1, 0)).toEqual([])
  })
})

/**
 * Build a bridge for degradation/cache scenarios.
 * - noClient: manager.getClientForFile resolves null (no language server)
 * - throwOnRequest: client.sendRequest rejects (server error mid-request)
 * - cache: an in-memory LspCache stub that honors mtime invalidation
 */
function makeBridgeWith(opts: {
  noClient?: boolean
  throwOnRequest?: boolean
  cache?: LspCache | null
  handler?: (method: string, params: unknown) => unknown
}): {
  bridge: LspBridge
  baseDir: string
  file: string
  requestCount: () => number
} {
  const baseDir = mkdtempSync(path.join(tmpdir(), 'lsp-bridge-deg-'))
  const file = 'target.ts'
  writeFileSync(path.join(baseDir, file), 'export const x = 1\n', 'utf-8')

  let requests = 0
  const client = {
    async sendRequest<T = unknown>(method: string, params?: unknown): Promise<T> {
      requests += 1
      if (opts.throwOnRequest) throw new Error('server crashed')
      return (opts.handler ? opts.handler(method, params) : null) as T
    },
    sendNotification(): void {},
  } as unknown as LspClient

  const manager = {
    async getClientForFile(): Promise<LspClient | null> {
      return opts.noClient ? null : client
    },
  } as unknown as LspServerManager

  const diagnostics = { getForFile: () => [] } as unknown as LspDiagnosticsCollector
  const bridge = new LspBridge(manager, opts.cache ?? null, diagnostics, baseDir)
  return { bridge, baseDir, file, requestCount: () => requests }
}

/** Minimal in-memory LspCache that stores one value per key and invalidates on mtime change. */
function makeMemoryCache(): LspCache {
  const store = new Map<string, { value: unknown; mtime: string }>()
  return {
    get(projectId: string, cacheKey: string, currentMtime: string): unknown | null {
      const entry = store.get(projectId + ':' + cacheKey)
      if (!entry) return null
      return entry.mtime === currentMtime ? entry.value : null
    },
    set(
      projectId: string,
      cacheKey: string,
      _operation: string,
      _languageId: string,
      _filePath: string,
      result: unknown,
      fileMtime: string,
    ): void {
      store.set(projectId + ':' + cacheKey, { value: result, mtime: fileMtime })
    },
  } as unknown as LspCache
}

describe('LspBridge degradation (characterization)', () => {
  let dirs: string[] = []
  beforeEach(() => {
    dirs = []
  })
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
  })

  it('returns []/[]/null when no language server is available (no throw)', async () => {
    const { bridge, baseDir, file } = makeBridgeWith({ noClient: true })
    dirs.push(baseDir)

    expect(await bridge.goToDefinition(file, 1, 0)).toEqual([])
    expect(await bridge.findReferences(file, 1, 0)).toEqual([])
    expect(await bridge.hover(file, 1, 0)).toBeNull()
    expect(await bridge.getDocumentSymbols(file)).toEqual([])
  })

  it('callHierarchy degrades to [] when no server is available', async () => {
    const { bridge, baseDir, file } = makeBridgeWith({ noClient: true })
    dirs.push(baseDir)

    expect(await bridge.callHierarchyIncoming(file, 1, 0)).toEqual([])
    expect(await bridge.callHierarchyOutgoing(file, 1, 0)).toEqual([])
  })

  it('swallows a thrown sendRequest and returns null/[] instead of propagating', async () => {
    const { bridge, baseDir, file } = makeBridgeWith({ throwOnRequest: true })
    dirs.push(baseDir)

    await expect(bridge.goToDefinition(file, 1, 0)).resolves.toEqual([])
    await expect(bridge.hover(file, 1, 0)).resolves.toBeNull()
    await expect(bridge.callHierarchyIncoming(file, 1, 0)).resolves.toEqual([])
  })
})

describe('LspBridge cache (characterization)', () => {
  let dirs: string[] = []
  beforeEach(() => {
    dirs = []
  })
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
  })

  it('serves the second identical query from cache (sendRequest called once)', async () => {
    const cache = makeMemoryCache()
    const { bridge, baseDir, file, requestCount } = makeBridgeWith({
      cache,
      handler: (method) =>
        method === 'textDocument/definition'
          ? {
              uri: 'file://' + path.resolve(baseDir, 'dep.ts'),
              range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
            }
          : null,
    })
    dirs.push(baseDir)

    const first = await bridge.goToDefinition(file, 3, 1)
    const second = await bridge.goToDefinition(file, 3, 1)

    expect(first).toEqual(second)
    expect(requestCount()).toBe(1) // 2nd call was a cache hit
  })

  it('re-queries the server after the file mtime changes (stale cache)', async () => {
    const cache = makeMemoryCache()
    const { bridge, baseDir, file, requestCount } = makeBridgeWith({
      cache,
      handler: (method) =>
        method === 'textDocument/definition'
          ? {
              uri: 'file://' + path.resolve(baseDir, 'dep.ts'),
              range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
            }
          : null,
    })
    dirs.push(baseDir)

    await bridge.goToDefinition(file, 3, 1)
    // Touch the file with a new mtime to invalidate the cache entry.
    const future = new Date(Date.now() + 5000)
    const { utimesSync } = await import('node:fs')
    utimesSync(path.join(baseDir, file), future, future)

    await bridge.goToDefinition(file, 3, 1)
    expect(requestCount()).toBe(2) // stale → re-queried
  })
})
