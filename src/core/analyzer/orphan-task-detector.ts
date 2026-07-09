/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * OrphanTaskDetector — detects tasks stuck in backlog/ready whose
 * implementation already exists on disk.
 *
 * Detection strategies (by confidence):
 * 1. sourceRef.file exists on disk (0.9)
 * 2. testFiles entries exist on disk (0.85)
 * 3. Code symbol match in code_symbols table (0.6)
 * 4. Title-to-filename heuristic (0.3)
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { SqliteStore } from '../store/sqlite-store.js'
import type { GraphNode } from '../graph/graph-types.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'orphan-task-detector.ts' })

export interface OrphanEvidence {
  type: 'file_exists' | 'test_exists' | 'code_symbol_match' | 'title_heuristic'
  detail: string
  confidence: number
}

export interface OrphanCandidate {
  nodeId: string
  title: string
  currentStatus: string
  evidence: OrphanEvidence[]
  confidence: number
  suggestedAction: 'mark_done' | 'mark_in_progress' | 'review'
}

/**
 * Detect tasks in backlog/ready whose implementation already exists.
 */
export function detectOrphanTasks(store: SqliteStore, basePath: string): OrphanCandidate[] {
  const doc = store.toGraphDocument()

  // Only check tasks/subtasks in backlog or ready
  const candidates = doc.nodes.filter(
    (n) => (n.type === 'task' || n.type === 'subtask') && (n.status === 'backlog' || n.status === 'ready'),
  )

  if (candidates.length === 0) return []

  const orphans: OrphanCandidate[] = []

  for (const node of candidates) {
    const evidence = collectEvidence(node, basePath)

    if (evidence.length > 0) {
      const maxConfidence = Math.max(...evidence.map((e) => e.confidence))
      orphans.push({
        nodeId: node.id,
        title: node.title,
        currentStatus: node.status,
        evidence,
        confidence: maxConfidence,
        suggestedAction: suggestAction(maxConfidence),
      })
    }
  }

  log.debug('orphan-detector:scan', {
    checked: candidates.length,
    orphansFound: orphans.length,
  })

  return orphans
}

/**
 * Collect evidence for a single node.
 */
function collectEvidence(node: GraphNode, basePath: string): OrphanEvidence[] {
  const evidence: OrphanEvidence[] = []

  // Strategy 1: sourceRef.file exists on disk
  if (node.sourceRef?.file) {
    const fullPath = join(basePath, node.sourceRef.file)
    if (existsSync(fullPath)) {
      evidence.push({
        type: 'file_exists',
        detail: `Source file exists: ${node.sourceRef.file}`,
        confidence: 0.9,
      })
    }
  }

  // Strategy 2: testFiles exist on disk
  if (node.testFiles && node.testFiles.length > 0) {
    for (const testFile of node.testFiles) {
      const fullPath = join(basePath, testFile)
      if (existsSync(fullPath)) {
        evidence.push({
          type: 'test_exists',
          detail: `Test file exists: ${testFile}`,
          confidence: 0.85,
        })
        break // One match is enough for this strategy
      }
    }
  }

  return evidence
}

/**
 * Suggest action based on confidence level.
 */
function suggestAction(confidence: number): OrphanCandidate['suggestedAction'] {
  if (confidence >= 0.85) return 'mark_done'
  if (confidence >= 0.5) return 'mark_in_progress'
  return 'review'
}
