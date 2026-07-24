/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { StoreManager } from '../core/store/store-manager.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import * as atomicJsonWriteModule from '../core/utils/atomic-json-write.js'

describe('StoreManager — create with :memory:', () => {
  let manager: StoreManager

  afterEach(() => {
    manager?.close()
  })

  it('creates a store manager with in-memory database', () => {
    manager = StoreManager.create(':memory:')
    expect(manager).toBeInstanceOf(StoreManager)
    expect(manager.store).toBeInstanceOf(SqliteStore)
  })

  it('storeRef returns the mutable reference', () => {
    manager = StoreManager.create(':memory:')
    expect(manager.storeRef.current).toBe(manager.store)
  })

  it('basePath returns the given path', () => {
    manager = StoreManager.create(':memory:')
    expect(manager.basePath).toBe(':memory:')
  })

  it('recentFolders returns a copy', () => {
    manager = StoreManager.create(':memory:')
    const folders = manager.recentFolders
    expect(Array.isArray(folders)).toBe(true)
  })

  it('getBasePathFn captures basePath', () => {
    manager = StoreManager.create(':memory:')
    const fn = manager.getBasePathFn
    expect(fn()).toBe(':memory:')
  })

  it('close cleans up the store', () => {
    manager = StoreManager.create(':memory:')
    manager.close()
  })

  it('recentFilePath returns the expected path', () => {
    manager = StoreManager.create(':memory:')
    expect(manager.recentFilePath).toContain('.mcp-graph-recent-folders.json')
  })

  it('store getter returns same instance', () => {
    manager = StoreManager.create(':memory:')
    expect(manager.store).toBe(manager.storeRef.current)
  })
})

describe('StoreManager — initProject through manager', () => {
  let manager: StoreManager

  beforeEach(() => {
    manager = StoreManager.create(':memory:')
  })

  afterEach(() => {
    manager?.close()
  })

  it('can initialize a project via store', () => {
    const project = manager.store.initProject('Test Project')
    expect(project.name).toBe('Test Project')
    expect(manager.store.getProject()!.id).toBe(project.id)
  })

  it('can insert nodes through managed store', () => {
    manager.store.initProject()
    manager.store.insertNode({
      id: 'n1',
      type: 'task',
      title: 'Managed Task',
      status: 'backlog',
      priority: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    const node = manager.store.getNodeById('n1')
    expect(node).not.toBeNull()
    expect(node!.title).toBe('Managed Task')
  })
})

describe('StoreManager — swap', () => {
  let tmpDir: string
  let tmpDir2: string

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `mcp-graph-test-${Math.random().toString(36).slice(2, 8)}`)
    tmpDir2 = path.join(os.tmpdir(), `mcp-graph-test-${Math.random().toString(36).slice(2, 8)}`)
  })

  afterEach(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      /* ok */
    }
    try {
      rmSync(tmpDir2, { recursive: true, force: true })
    } catch {
      /* ok */
    }
  })

  it('swap fails when directory does not exist', () => {
    const manager = StoreManager.create(':memory:')
    try {
      const result = manager.swap('/nonexistent/directory')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain('Directory does not exist')
      }
    } finally {
      manager.close()
    }
  })

  it('swap fails when directory has no graph DB', () => {
    mkdirSync(tmpDir, { recursive: true })
    const manager = StoreManager.create(':memory:')
    try {
      const result = manager.swap(tmpDir)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain('No graph database found')
      }
    } finally {
      manager.close()
    }
  })

  it('swap succeeds when target has a valid graph DB', () => {
    mkdirSync(path.join(tmpDir, 'workflow-graph'), { recursive: true })
    const srcMgr = StoreManager.create(tmpDir)
    srcMgr.store.initProject('Swap Target')
    srcMgr.close()

    const manager = StoreManager.create(':memory:')
    manager.store.initProject('Original')
    try {
      const result = manager.swap(tmpDir)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.basePath).toBe(tmpDir)
      }
      expect(manager.store.getProject()!.name).toBe('Swap Target')
    } finally {
      manager.close()
    }
  })

  it('persists recent folders via the shared atomicJsonWrite utility (crash-safe write)', () => {
    mkdirSync(path.join(tmpDir, 'workflow-graph'), { recursive: true })
    const srcMgr = StoreManager.create(tmpDir)
    srcMgr.store.initProject('Swap Target')
    srcMgr.close()

    const atomicWriteSpy = vi.spyOn(atomicJsonWriteModule, 'atomicJsonWrite')
    const manager = StoreManager.create(':memory:')
    manager.store.initProject('Original')
    try {
      manager.swap(tmpDir)

      expect(atomicWriteSpy).toHaveBeenCalledWith(manager.recentFilePath, manager.recentFolders)

      const onDisk = JSON.parse(readFileSync(manager.recentFilePath, 'utf-8'))
      expect(onDisk).toEqual(manager.recentFolders)
    } finally {
      manager.close()
      atomicWriteSpy.mockRestore()
    }
  })
})
