/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * AST Dogfood Benchmark — Task 4.2
 *
 * Scans a source directory, runs every .ts file through astCompressCode(),
 * reports reduction metrics, and records savings as lever events in the
 * economy_lever_ledger so `agf savings` and `agf metrics --economy-report`
 * reflect the AST compression opportunity cost.
 *
 * Zero LLM, deterministic, runs in <1s on the typical src/core tree.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { astCompressCode } from '../economy/code-ast-compress.js'
import { recordLeverEvent } from '../economy/economy-lever-ledger.js'

export interface AstDogfoodResult {
  /** Total .ts files scanned (excluding .d.ts). */
  filesProcessed: number
  /** Files where astCompressCode produced a smaller output. */
  filesCompressed: number
  totalBytesBefore: number
  totalBytesAfter: number
  totalBytesSaved: number
  /** Average reduction % across all files that had gain (0 when none). */
  avgReductionPct: number
}

export interface AstDogfoodOpts {
  sessionId: string
  nodeId?: string
}

function collectTsFiles(dir: string): string[] {
  const files: string[] = []
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return files
  }
  for (const entry of entries) {
    const name = entry.name as string
    const p = join(dir, name)
    if (entry.isDirectory()) {
      files.push(...collectTsFiles(p))
    } else if (entry.isFile() && name.endsWith('.ts') && !name.endsWith('.d.ts')) {
      files.push(p)
    }
  }
  return files
}

/**
 * Runs the AST dogfood benchmark over all .ts files in `dir`.
 * Records a lever event per compressed file in `db`.
 */
export function runAstDogfood(dir: string, db: Database.Database, opts: AstDogfoodOpts): AstDogfoodResult {
  const files = collectTsFiles(dir)
  let filesCompressed = 0
  let totalBytesBefore = 0
  let totalBytesAfter = 0
  let totalBytesSaved = 0
  const reductionPcts: number[] = []

  for (const filePath of files) {
    let src: string
    try {
      src = readFileSync(filePath, 'utf8')
    } catch {
      continue
    }
    const before = src.length
    const compressed = astCompressCode(src)
    const after = compressed.length
    const saved = before - after

    totalBytesBefore += before
    totalBytesAfter += after

    if (saved > 0) {
      filesCompressed++
      totalBytesSaved += saved
      const pct = (saved / before) * 100
      reductionPcts.push(pct)
      recordLeverEvent(db, {
        surface: 'internal',
        sessionId: opts.sessionId,
        nodeId: opts.nodeId,
        lever: 'ast_compress',
        tokensBefore: Math.ceil(before / 4),
        tokensAfter: Math.ceil(after / 4),
        saved: Math.ceil(saved / 4),
        accepted: true,
        gateOutcome: 'accepted',
      })
    }
  }

  const avgReductionPct = reductionPcts.length > 0 ? reductionPcts.reduce((s, p) => s + p, 0) / reductionPcts.length : 0

  return {
    filesProcessed: files.length,
    filesCompressed,
    totalBytesBefore,
    totalBytesAfter,
    totalBytesSaved,
    avgReductionPct: Math.round(avgReductionPct * 10) / 10,
  }
}
