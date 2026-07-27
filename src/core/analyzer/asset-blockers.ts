/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Asset Blockers Analyzer — tracks assets blocking tasks.
 *
 * Checks:
 * - Finds asset nodes with status !== "done"
 * - Finds tasks with requires_asset edges to those assets
 * - Reports blocked task count and asset list
 */

import type { GraphDocument } from '../graph/graph-types.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'asset-blockers.ts' })

export interface BlockingAsset {
  assetId: string
  assetTitle: string
  assetStatus: string
  blockedTaskIds: string[]
}

export interface AssetBlockersReport {
  totalAssets: number
  pendingAssets: number
  blockedTaskCount: number
  blockingAssets: BlockingAsset[]
}

/** analyzeAssetBlockers —  */
export function analyzeAssetBlockers(doc: GraphDocument): AssetBlockersReport {
  const assetNodes = doc.nodes.filter((n) => n.type === 'asset')
  const pendingAssets = assetNodes.filter((n) => n.status !== 'done')

  // Build map: assetId -> list of task IDs that require it
  const pendingAssetIds = new Set(pendingAssets.map((a) => a.id))
  const assetToTasks = new Map<string, string[]>()

  for (const edge of doc.edges) {
    if (edge.relationType === 'requires_asset' && pendingAssetIds.has(edge.to)) {
      const tasks = assetToTasks.get(edge.to) ?? []
      tasks.push(edge.from)
      assetToTasks.set(edge.to, tasks)
    }
  }

  const blockingAssets: BlockingAsset[] = []
  let blockedTaskCount = 0

  for (const asset of pendingAssets) {
    const blockedTaskIds = assetToTasks.get(asset.id) ?? []
    if (blockedTaskIds.length > 0) {
      blockingAssets.push({
        assetId: asset.id,
        assetTitle: asset.title,
        assetStatus: asset.status,
        blockedTaskIds,
      })
      blockedTaskCount += blockedTaskIds.length
    }
  }

  log.debug('analyzer:asset-blockers', {
    totalAssets: assetNodes.length,
    pendingAssets: pendingAssets.length,
    blockedTaskCount,
    blockingAssets: blockingAssets.length,
  })

  return {
    totalAssets: assetNodes.length,
    pendingAssets: pendingAssets.length,
    blockedTaskCount,
    blockingAssets,
  }
}
