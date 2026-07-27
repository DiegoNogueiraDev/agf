/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Verified auto-promote — cross-checks a parent node's deliverable
 * (sourceRef.file exists + testFiles exist + tests pass) BEFORE promoting it
 * to "done". Closes the gap left by autoPromoteEpic which only checks that
 * children are status=done, allowing drift between "marked done" and
 * "actually delivered".
 *
 * The chain walks ascendentally from the triggering node; if any ancestor
 * fails verification, the cascade stops there (do not promote above an
 * unverified parent).
 */

import type { SqliteStore } from '../store/sqlite-store.js'
import { fileExists } from './fs.js'
import { createLogger } from './logger.js'
import { runTestGate as defaultRunTestGate, type TestGateResult } from '../harness/test-gate.js'

const log = createLogger({ layer: 'core', source: 'verified-auto-promote.ts' })

const MAX_DEPTH = 10

export interface VerifyRejection {
  nodeId: string
  title: string
  reasons: string[]
}

export interface VerifyAndPromoteResult {
  promoted: string[]
  rejected: VerifyRejection[]
}

/** Injection seam — tests pass a synthetic runTestGate; production uses the real one. */
export interface VerifyOptions {
  runTestGate?: (store: SqliteStore, nodeId: string) => Promise<TestGateResult>
}

async function verifyParent(
  store: SqliteStore,
  parentId: string,
  parentTitle: string,
  runTestGate: NonNullable<VerifyOptions['runTestGate']>,
): Promise<{ ok: true } | { ok: false; reasons: string[] }> {
  const parent = store.getNodeById(parentId)
  if (!parent) return { ok: false, reasons: [`parent not found: ${parentId}`] }

  const reasons: string[] = []

  // 1. sourceRef.file must exist (when defined)
  const sourceFile = parent.sourceRef?.file
  if (sourceFile) {
    const ok = await fileExists(sourceFile)
    if (!ok) reasons.push(`sourceRef file missing on disk: ${sourceFile}`)
  }

  // 2. each testFiles entry must exist (when defined)
  const testFiles = parent.testFiles ?? []
  for (const tVar of testFiles) {
    const ok = await fileExists(tVar)
    if (!ok) reasons.push(`testFile missing on disk: ${tVar}`)
  }

  // 3. tests must pass (only when there are testFiles to run)
  if (testFiles.length > 0 && reasons.length === 0) {
    try {
      const gate = await runTestGate(store, parentId)
      if (gate.status === 'failed' || gate.failed > 0) {
        reasons.push(`tests failed for ${parentTitle}: ${gate.failed} failure(s)`)
      }
    } catch (err) {
      reasons.push(`runTestGate threw: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return reasons.length === 0 ? { ok: true } : { ok: false, reasons }
}

/**
 * Walk up the parent chain from `nodeId`. For each ancestor whose siblings
 * are all done and whose deliverable verifies, promote it to done. Stop the
 * cascade as soon as an ancestor fails verification.
 */
export async function verifyAndPromote(
  store: SqliteStore,
  nodeId: string,
  options: VerifyOptions = {},
): Promise<VerifyAndPromoteResult> {
  const resultValue: VerifyAndPromoteResult = { promoted: [], rejected: [] }
  const runTestGate = options.runTestGate ?? ((s, id) => defaultRunTestGate(s, id, 'strict'))

  let cursor = nodeId
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    const node = store.getNodeById(cursor)
    if (!node?.parentId) break

    const parent = store.getNodeById(node.parentId)
    if (!parent || parent.status === 'done') break

    const siblings = store.getChildNodes(parent.id)
    const allDone = siblings.length > 0 && siblings.every((s) => s.status === 'done')
    if (!allDone) break

    const verdict = await verifyParent(store, parent.id, parent.title, runTestGate)
    if (!verdict.ok) {
      resultValue.rejected.push({ nodeId: parent.id, title: parent.title, reasons: verdict.reasons })
      log.warn('verified-auto-promote:rejected', {
        nodeId: parent.id,
        title: parent.title,
        reasons: verdict.reasons,
      })
      break
    }

    store.updateNodeStatus(parent.id, 'done')
    resultValue.promoted.push(parent.id)
    log.info('verified-auto-promote:promoted', {
      nodeId: parent.id,
      title: parent.title,
      childrenDone: siblings.length,
      depth,
    })

    cursor = parent.id
  }

  return resultValue
}
