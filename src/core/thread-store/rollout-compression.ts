/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Cold-file compression for JSONL session files using gzip.
 * JSONL files older than maxAgeDays are compressed to .jsonl.gz.
 * readFile transparently handles both formats.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'

const GZ_EXT = '.gz'

function isGzPath(path: string): boolean {
  return path.endsWith(GZ_EXT)
}

function jsonlGzPath(jsonlPath: string): string {
  return jsonlPath + GZ_EXT
}

/** Gzip-compress a file from inputPath to outputPath. */
export function compressFile(inputPath: string, outputPath: string): void {
  const data = readFileSync(inputPath)
  const compressed = gzipSync(data)
  writeFileSync(outputPath, compressed)
}

/** Decompress a gzipped file from inputPath to outputPath. */
export function decompressFile(inputPath: string, outputPath: string): void {
  const compressed = readFileSync(inputPath)
  const data = gunzipSync(compressed)
  writeFileSync(outputPath, data)
}

/** Read a file as UTF-8, transparently decompressing if gzipped. */
export function readFile(path: string): string {
  if (isGzPath(path)) {
    const compressed = readFileSync(path)
    return gunzipSync(compressed).toString('utf-8')
  }
  return readFileSync(path, 'utf-8')
}

/** Compact session rollout files older than maxAgeDays; returns counts. */
export function runCompaction(sessionsDir: string, maxAgeDays: number): { compressed: number; skipped: number } {
  if (!existsSync(sessionsDir)) {
    return { compressed: 0, skipped: 0 }
  }

  const cutoffMs = Date.now() - maxAgeDays * 86_400_000
  let compressed = 0
  let skipped = 0

  const entries = readdirSync(sessionsDir, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isFile()) continue
    const name = entry.name
    if (!name.endsWith('.jsonl') || isGzPath(name)) continue

    const fullPath = join(sessionsDir, name)
    const stats = statSync(fullPath)

    if (stats.mtimeMs < cutoffMs) {
      const gzPath = jsonlGzPath(fullPath)
      compressFile(fullPath, gzPath)
      unlinkSync(fullPath)
      compressed++
    } else {
      skipped++
    }
  }

  return { compressed, skipped }
}
