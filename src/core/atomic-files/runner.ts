/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-atomic-files-writer — Task 2.2: runAtomicWrites — iterates registry and applies writes.
 * Dispatches to the correct writer based on file.format.
 */

import { getRegistry } from './registry.js'
import { write as writeMarkdown } from './writer-markdown.js'
import { write as writeJson } from './writer-json.js'
import type { AtomicFileMode, WriteResult } from './types.js'

export type AtomicWriteReport = Map<string, WriteResult>

export async function runAtomicWrites(mode: AtomicFileMode): Promise<AtomicWriteReport> {
  const files = getRegistry()
  const report: AtomicWriteReport = new Map()
  for (const file of files) {
    const result = file.format === 'json' ? writeJson(file, mode) : await writeMarkdown(file, mode)
    report.set(file.fileId, result)
  }
  return report
}
