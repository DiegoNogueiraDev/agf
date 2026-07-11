/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * NDJSON structured logger — one JSON object per line to stderr.
 *
 * Replaces the legacy [LEVEL] msg key="val" format.
 * Every log entry is a flat JSON object with mandatory ts, lvl, msg fields.
 * Context fields are merged at the top level (no nested "context" key).
 */

export type NdjsonLevel = 'info' | 'warn' | 'error' | 'debug'

export interface NdjsonEntry {
  ts: string
  lvl: NdjsonLevel
  msg: string
  [key: string]: unknown
}

export function writeNdjsonLog(entry: NdjsonEntry): void {
  process.stderr.write(JSON.stringify(entry) + '\n')
}
