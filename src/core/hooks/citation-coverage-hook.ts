/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Wires the (previously dormant) citation-coverage-guard into the
 * `task:post-complete` channel. checkCitationCoverage shipped with a test but
 * no caller; its header promised a "hook task:post-complete" that never
 * existed. This module reads a completed node's declared implementationFiles
 * from disk and is that caller.
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { checkCitationCoverage, isCitationGuardDisabled, type CoverageReport } from './citation-coverage-guard.js'
import type { SqliteStore } from '../store/sqlite-store.js'

/**
 * Read `nodeId`'s declared implementationFiles from disk (relative to `cwd`)
 * and report which src/core/ files lack a §CITATION. Returns `undefined` when
 * the guard is opted out, the node does not exist, or it declared no
 * implementationFiles. Missing files on disk are skipped, never thrown.
 */
export function runCitationCoverageCheck(
  store: SqliteStore,
  nodeId: string,
  cwd: string = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): CoverageReport | undefined {
  if (isCitationGuardDisabled(env)) return undefined

  const node = store.getNodeById(nodeId)
  if (!node?.implementationFiles || node.implementationFiles.length === 0) return undefined

  const files = node.implementationFiles
    .filter((file) => existsSync(join(cwd, file)))
    .map((file) => ({ file, content: readFileSync(join(cwd, file), 'utf-8') }))

  return checkCitationCoverage(files)
}
