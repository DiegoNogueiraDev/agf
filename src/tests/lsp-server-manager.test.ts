/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { LspServerManager } from '../core/lsp/lsp-server-manager.js'
import type { ServerRegistry } from '../core/lsp/server-registry.js'
import type { LspClient } from '../core/lsp/lsp-client.js'
import type { LspServerConfig } from '../core/lsp/lsp-types.js'

/** Map files/languages to configs without touching the real registry/binaries. */
function fakeRegistry(): ServerRegistry {
  const extToLang: Record<string, string> = { '.ts': 'typescript', '.py': 'python', '.rs': 'rust' }
  const configured = new Set(['typescript', 'python']) // 'rust' has NO server config
  return {
    getLanguageForFile(filePath: string): string | null {
      const ext = filePath.slice(filePath.lastIndexOf('.'))
      return extToLang[ext] ?? null
    },
    getConfigForLanguage(languageId: string): LspServerConfig | null {
      if (!configured.has(languageId)) return null
      return { languageId, command: `${languageId}-ls`, args: [] } as unknown as LspServerConfig
    },
  } as unknown as ServerRegistry
}

/** Minimal LspClient stand-in: exit listener + pid, no process. */
function fakeClient(pid: number): LspClient {
  return {
    pid,
    on(): void {
      /* exit handler never fires in tests */
    },
  } as unknown as LspClient
}

/** Build a manager whose spawn is stubbed; returns the spawn counter. */
function stubbedManager(): { manager: LspServerManager; getSpawnCount: () => number } {
  const manager = new LspServerManager(fakeRegistry(), 'file:///root')
  let spawnCount = 0
  const patch = manager as unknown as {
    isServerInstalled: () => Promise<boolean>
    startServer: () => Promise<LspClient>
  }
  patch.isServerInstalled = async () => true
  patch.startServer = async () => {
    spawnCount += 1
    return fakeClient(1000 + spawnCount)
  }
  return { manager, getSpawnCount: () => spawnCount }
}

describe('LspServerManager.getClientForFile', () => {
  it('routes a file to the server of its detected language', async () => {
    const { manager } = stubbedManager()

    const tsClient = await manager.getClientForFile('/proj/a.ts')
    const pyClient = await manager.getClientForFile('/proj/b.py')

    expect(tsClient).not.toBeNull()
    expect(pyClient).not.toBeNull()
    expect(tsClient?.pid).not.toBe(pyClient?.pid) // distinct servers per language
  })

  it('reuses the same client for repeated calls in one language (spawns once)', async () => {
    const { manager, getSpawnCount } = stubbedManager()

    const first = await manager.getClientForFile('/proj/a.ts')
    const second = await manager.getClientForFile('/proj/other.ts')

    expect(first).toBe(second)
    expect(getSpawnCount()).toBe(1)
  })

  it('returns null (no throw) for a language without a registered server', async () => {
    const { manager, getSpawnCount } = stubbedManager()

    const client = await manager.getClientForFile('/proj/c.rs')

    expect(client).toBeNull()
    expect(getSpawnCount()).toBe(0)
  })

  it('returns null for a file extension with no language mapping', async () => {
    const { manager } = stubbedManager()
    await expect(manager.getClientForFile('/proj/readme.md')).resolves.toBeNull()
  })
})
