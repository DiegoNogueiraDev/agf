/*!
 * SPDX-License-Identifier: MIT
 * Copyright © 2024-2026 decolua and contributors (9router)
 * Copyright © 2026 Diego Lima Nogueira de Paula (TypeScript port and changes)
 *
 * Ported from 9router (https://github.com/decolua/9router), MIT, whose
 * open-sse/rtk module is itself a port of rtk (https://github.com/rtk-ai/rtk),
 * Apache-2.0, © Patrick Szymkowiak. This file stays under its original MIT
 * terms; agent-graph-flow as a whole is Apache-2.0. See THIRD-PARTY-NOTICES.md.
 *
 * Tee system — when tool output compression fails (error, empty, or lossy
 * gate reverts), the raw output is saved to workflow-graph/tee/ so the
 * agent can retrieve it without re-executing the tool. The compressed
 * output includes a `[full: tee/<filename>]` pointer.
 *
 * Inspired by tee.rs — saves raw output on failure for recovery.
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'tool-compress/tee.ts' })

export interface TeeResult {
  /** Path to the saved raw output file (relative to project dir). */
  savedPath: string | null
  /** Pointer line to inject into the compressed/fallback output. */
  pointer: string | null
}

/**
 * Save raw tool output to tee directory. Returns path info for the pointer.
 * Only saves when the output is substantial (>500 chars) to avoid tee spam.
 */
export function teeRawOutput(rawOutput: string, dir: string, context: string = 'unknown'): TeeResult {
  if (!rawOutput || rawOutput.length < 500) {
    return { savedPath: null, pointer: null }
  }

  try {
    const teeDir = path.join(dir, 'workflow-graph', 'tee')
    if (!existsSync(teeDir)) {
      mkdirSync(teeDir, { recursive: true })
    }

    const timestamp = Date.now()
    const safeContext = context.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)
    const filename = `${timestamp}_${safeContext}.log`
    const filePath = path.join(teeDir, filename)

    writeFileSync(filePath, rawOutput, 'utf-8')

    const relativePath = `workflow-graph/tee/${filename}`
    const pointer = `[full: ${relativePath}]`

    log.info('tee:saved', { path: relativePath, bytes: rawOutput.length, context })
    return { savedPath: relativePath, pointer }
  } catch (err) {
    log.warn('tee:save-failed', { error: err instanceof Error ? err.message : String(err) })
    return { savedPath: null, pointer: null }
  }
}

/**
 * Generate a pointer-only line when raw output was already teed.
 * Use this when the caller already saved the file manually.
 */
export function teePointer(filename: string): string {
  return `[full: workflow-graph/tee/${filename}]`
}
