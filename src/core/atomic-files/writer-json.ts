/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-atomic-files-writer — Task 1.3: JSON writer with _managedFields + schema version.
 *
 * Convention:
 *   _managedSchemaVersion: 1  — schema version at JSON root
 *   _managedFields: string[]  — keys this system manages; user may remove entries to opt-out
 *
 * Atomic write: tmpfile + rename (same pattern as writer-markdown.ts).
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import type { AtomicFile, AtomicFileMode, WriteResult } from './types.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'writer-json.ts' })

type JsonObject = Record<string, unknown>

function atomicWrite(filePath: string, content: string): void {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  const tmp = path.join(dir, `.mcp-graph-tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  try {
    fs.writeFileSync(tmp, content, 'utf8')
    fs.renameSync(tmp, filePath)
  } catch (err) {
    try {
      fs.unlinkSync(tmp)
    } catch (e) {
      log.debug('intentional swallow', { error: e, reason: 'tmp file already gone, cleanup not needed' })
    }
    throw err
  }
}

/** Creates the file with defaults + managed metadata. Noop if file already exists. */
export function initJson(filePath: string, managedFields: string[], defaults: JsonObject): void {
  if (fs.existsSync(filePath)) return

  const content: JsonObject = {
    ...defaults,
    _managedSchemaVersion: 1,
    _managedFields: managedFields,
  }
  atomicWrite(filePath, JSON.stringify(content, null, 2))
}

/**
 * Replaces only the keys that are listed in the file's `_managedFields`.
 * Keys the user has removed from `_managedFields` are left untouched (opt-out).
 * Custom keys not in any managed list are always preserved.
 */
export function updateJson(filePath: string, managedFields: string[], values: JsonObject): void {
  if (!fs.existsSync(filePath)) {
    initJson(filePath, managedFields, values)
    return
  }

  const raw = fs.readFileSync(filePath, 'utf8')
  const existing = JSON.parse(raw) as JsonObject

  // Honour the user's opt-out: use the file's _managedFields, not the caller's
  const activeManagedFields = Array.isArray(existing._managedFields)
    ? (existing._managedFields as string[])
    : managedFields

  const updated: JsonObject = { ...existing }
  for (const key of activeManagedFields) {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      updated[key] = values[key]
    }
  }

  atomicWrite(filePath, JSON.stringify(updated, null, 2))
}

/**
 * `runner.ts` entry point for `format: 'json'` AtomicFile entries — mirrors
 * writer-markdown.ts's `write(file, mode)` signature so the runner can
 * dispatch to either writer uniformly. `managedContent` is the JSON-encoded
 * managed values; its top-level keys become `_managedFields`.
 */
export function write(file: AtomicFile, _mode: AtomicFileMode): WriteResult {
  const { path: filePath, managedContent } = file
  const values = JSON.parse(managedContent) as JsonObject
  const managedFields = Object.keys(values)
  const existed = fs.existsSync(filePath)

  if (!existed) {
    initJson(filePath, managedFields, values)
    return { status: 'created' }
  }

  const before = fs.readFileSync(filePath, 'utf8')
  updateJson(filePath, managedFields, values)
  const after = fs.readFileSync(filePath, 'utf8')
  return { status: before === after ? 'noop' : 'updated' }
}
