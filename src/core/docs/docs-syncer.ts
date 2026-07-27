/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import type { DocsCacheStore, CachedDoc } from './docs-cache-store.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'docs-syncer.ts' })

export interface Context7Fetcher {
  resolveLibraryId(name: string): Promise<string>
  queryDocs(libId: string): Promise<string>
}

export class DocsSyncer {
  private cacheStore: DocsCacheStore
  private fetcher: Context7Fetcher

  constructor(cacheStore: DocsCacheStore, fetcher: Context7Fetcher) {
    this.cacheStore = cacheStore
    this.fetcher = fetcher
  }

  async syncLib(libName: string): Promise<CachedDoc> {
    log.info(`Syncing docs for: ${libName}`)

    const libId = await this.fetcher.resolveLibraryId(libName)
    const content = await this.fetcher.queryDocs(libId)

    return this.cacheStore.upsertDoc({
      libId,
      libName,
      content,
    })
  }

  async syncAll(): Promise<CachedDoc[]> {
    const ONE_DAY_MS = 24 * 60 * 60 * 1000
    const staleLibs = this.cacheStore.getStaleLibs(ONE_DAY_MS)

    log.info(`Syncing ${staleLibs.length} stale libs`)

    const results: CachedDoc[] = []

    for (const lib of staleLibs) {
      try {
        const doc = await this.syncLib(lib.libName)
        results.push(doc)
      } catch (err) {
        log.error(`Failed to sync ${lib.libName}`, {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return results
  }
}
