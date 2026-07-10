/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { SqliteStore } from './sqlite-store.js'
import { STORE_DIR, DB_FILE } from '../utils/constants.js'
import { createLogger } from '../utils/logger.js'
import { atomicJsonWrite } from '../utils/atomic-json-write.js'

const log = createLogger({ layer: 'core', source: 'store-manager.ts' })

/** Mutable reference to the current SqliteStore — shared across route closures. */
export interface StoreRef {
  current: SqliteStore
}

const MAX_RECENT = 10
const RECENT_FILE = path.join(os.homedir(), '.mcp-graph-recent-folders.json')

export class StoreManager {
  private _ref: StoreRef
  private _basePath: string
  private _recentFolders: string[]

  private constructor(store: SqliteStore, basePath: string, recentFolders: string[]) {
    this._ref = { current: store }
    this._basePath = basePath
    this._recentFolders = recentFolders
  }

  static create(basePath: string): StoreManager {
    const store = SqliteStore.open(basePath)
    const recent = loadRecentFolders()
    return new StoreManager(store, basePath, recent)
  }

  get store(): SqliteStore {
    return this._ref.current
  }

  get storeRef(): StoreRef {
    return this._ref
  }

  get basePath(): string {
    return this._basePath
  }

  get recentFolders(): string[] {
    return [...this._recentFolders]
  }

  get recentFilePath(): string {
    return RECENT_FILE
  }

  /** Returns a stable getter function for basePath — captures `this` by reference. */
  get getBasePathFn(): () => string {
    return () => this._basePath
  }

  /**
   * Swap the active store to a new project directory.
   * If the swap fails, the old store remains active.
   */
  swap(newBasePath: string): { ok: true; basePath: string } | { ok: false; error: string } {
    // Validate directory exists
    if (!existsSync(newBasePath)) {
      return { ok: false, error: `Directory does not exist: ${newBasePath}` }
    }

    // Check for graph.db in workflow-graph/
    const newStoreDir = path.join(newBasePath, STORE_DIR)
    const hasGraph = existsSync(path.join(newStoreDir, DB_FILE))

    if (!hasGraph) {
      return { ok: false, error: `No graph database found at ${newBasePath}. Expected ${STORE_DIR}/${DB_FILE}` }
    }

    // Preserve eventBus from current store
    const eventBus = this._ref.current.eventBus
    const oldStore = this._ref.current
    const oldBasePath = this._basePath

    try {
      const newStore = SqliteStore.open(newBasePath)
      if (eventBus) {
        newStore.eventBus = eventBus
      }

      // Close old store
      oldStore.close()

      // Update refs — Bug #049: safe without lock because JS is single-threaded.
      // The assignment is atomic within the event loop. Any in-flight async tool
      // handler that captured `this._ref` will see the new store on next await point.
      this._ref.current = newStore
      this._basePath = newBasePath

      // Update recent folders
      this._addRecent(oldBasePath)
      this._addRecent(newBasePath)
      this._persistRecent()

      log.info('store-manager:swap:ok', { from: oldBasePath, to: newBasePath })
      return { ok: true, basePath: newBasePath }
    } catch (err) {
      // Swap failed — old store remains active
      log.error('store-manager:swap:fail', {
        error: err instanceof Error ? err.message : String(err),
        targetPath: newBasePath,
      })
      return {
        ok: false,
        error: `Failed to open store at ${newBasePath}: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  }

  close(): void {
    this._ref.current.close()
  }

  private _addRecent(folder: string): void {
    // Remove if already present (dedup)
    this._recentFolders = this._recentFolders.filter((f) => f !== folder)
    // Add to front
    this._recentFolders.unshift(folder)
    // Trim to max
    if (this._recentFolders.length > MAX_RECENT) {
      this._recentFolders = this._recentFolders.slice(0, MAX_RECENT)
    }
  }

  private _persistRecent(): void {
    try {
      atomicJsonWrite(RECENT_FILE, this._recentFolders)
    } catch (err) {
      log.warn('store-manager:persist-recent:fail', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
}

function loadRecentFolders(): string[] {
  try {
    if (existsSync(RECENT_FILE)) {
      const dataValue = JSON.parse(readFileSync(RECENT_FILE, 'utf-8'))
      if (Array.isArray(dataValue)) {
        return dataValue.filter((item): item is string => typeof item === 'string').slice(0, MAX_RECENT)
      }
    }
  } catch (_err) {
    void _err // Ignore corrupt file
  }
  return []
}
