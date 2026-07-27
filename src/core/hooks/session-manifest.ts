/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * Session Integrity Manifest (M6) — append-only JSON log of all agf commands
 * run during a session, with test results and file modification evidence.
 *
 * Written to <STORE_DIR>/session-manifest/<sessionId>.jsonl
 * Each line is a self-describing JSON object (ndjson).
 *
 * The manifest is INTEGRITY CHECK, not state — it exists so the NEXT
 * session (or a reviewer) can verify what was actually done vs. claimed.
 * This prevents the "Hallucinated Success Problem" (Tian Pan, Apr 2026)
 * where agents narrate work they never performed.
 */

import { mkdirSync, appendFileSync, readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { STORE_DIR } from '../utils/constants.js'

export interface ManifestEntry {
  ts: string
  sessionId: string
  command: string
  /** Exit code of the command (0 = success, non-zero = failure) */
  exitCode: number
  /** Number of files modified in this command (via git diff) */
  filesModified: number
  /** List of modified files (max 20 to keep size bounded) */
  filesModifiedList: string[]
  /** Test results if tests were run */
  testResult?: {
    passed: number
    failed: number
    durationMs: number
  }
  /** Task ID if a graph operation was involved */
  taskId?: string
  /** Previous sessionId if this is a resumed session */
  resumedSession?: string
}

export interface SessionManifest {
  sessionId: string
  startedAt: string
  resumedSession?: string
  graphNodeCount: number
  graphEdgeCount: number
  entries: ManifestEntry[]
  /** SHA256 of the session manifest at close (for tamper detection) */
  sha256?: string
}

let currentSessionId: string | null = null
let manifestPath: string | null = null
const inMemory: ManifestEntry[] = []

/**
 * Start a new session manifest.
 * Creates the manifest directory and writes the header.
 */
export function startSessionManifest(baseDir: string, resumeSessionId?: string): string {
  const sessionId = randomUUID()
  currentSessionId = sessionId
  inMemory.length = 0

  const manifestDir = join(baseDir, STORE_DIR, 'session-manifest')
  mkdirSync(manifestDir, { recursive: true })

  manifestPath = join(manifestDir, `${sessionId}.jsonl`)

  const header: ManifestEntry = {
    ts: new Date().toISOString(),
    sessionId,
    command: 'session:start',
    exitCode: 0,
    filesModified: 0,
    filesModifiedList: [],
    ...(resumeSessionId ? { resumedSession: resumeSessionId } : {}),
  }

  appendFileSync(manifestPath, JSON.stringify(header) + '\n', 'utf-8')
  return sessionId
}

/**
 * Record an agf command execution in the manifest.
 * Appends one JSON line to the manifest file.
 */
export function recordInManifest(
  command: string,
  exitCode: number,
  filesModified: number,
  filesModifiedList: string[],
  testResult?: { passed: number; failed: number; durationMs: number },
  taskId?: string,
): void {
  if (!manifestPath) return

  const entry: ManifestEntry = {
    ts: new Date().toISOString(),
    sessionId: currentSessionId ?? '',
    command,
    exitCode,
    filesModified,
    filesModifiedList: filesModifiedList.slice(0, 20),
    ...(testResult ? { testResult } : {}),
    ...(taskId ? { taskId } : {}),
  }

  inMemory.push(entry)

  try {
    appendFileSync(manifestPath, JSON.stringify(entry) + '\n', 'utf-8')
  } catch {
    // Append never breaks execution
  }
}

/**
 * Close the session manifest with graph state snapshot + SHA256.
 * Returns the SHA256 hash of the full manifest file.
 */
export function closeSessionManifest(baseDir: string, graphNodeCount: number, graphEdgeCount: number): string | null {
  if (!manifestPath || !existsSync(manifestPath)) return null

  try {
    const content = readFileSync(manifestPath, 'utf-8')
    const hash = createHash('sha256').update(content).digest('hex')

    const closer: ManifestEntry & { _sha256: string; _graphNodes: number; _graphEdges: number } = {
      ts: new Date().toISOString(),
      sessionId: currentSessionId ?? '',
      command: 'session:end',
      exitCode: 0,
      filesModified: 0,
      filesModifiedList: [],
      _sha256: hash,
      _graphNodes: graphNodeCount,
      _graphEdges: graphEdgeCount,
    }

    appendFileSync(manifestPath, JSON.stringify(closer) + '\n', 'utf-8')
    currentSessionId = null
    manifestPath = null
    return hash
  } catch {
    return null
  }
}

/**
 * Read all manifest entries for a given session.
 */
export function readSessionManifest(baseDir: string, sessionId: string): ManifestEntry[] {
  const p = join(baseDir, STORE_DIR, 'session-manifest', `${sessionId}.jsonl`)
  if (!existsSync(p)) return []

  const content = readFileSync(p, 'utf-8')
  return content
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ManifestEntry)
}

/**
 * List all session manifest IDs (sorted by most recent first).
 */
export function listSessionManifests(baseDir: string): Array<{ sessionId: string; entryCount: number }> {
  const dir = join(baseDir, STORE_DIR, 'session-manifest')
  if (!existsSync(dir)) return []

  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .sort()
    .reverse()

  return files.map((f) => {
    const sessionId = f.replace(/\.jsonl$/, '')
    const entries = readSessionManifest(baseDir, sessionId)
    return { sessionId, entryCount: entries.length }
  })
}

/**
 * Verify the integrity of a session manifest by recomputing its SHA256
 * (before the closing entry) and comparing.
 */
export function verifySessionManifest(baseDir: string, sessionId: string): { valid: boolean; error?: string } {
  const p = join(baseDir, STORE_DIR, 'session-manifest', `${sessionId}.jsonl`)
  if (!existsSync(p)) return { valid: false, error: 'Manifest not found' }

  try {
    const content = readFileSync(p, 'utf-8').trimEnd()
    const lines = content.split('\n')
    if (lines.length < 2) return { valid: false, error: 'Manifest too short (no closing entry)' }

    const body = lines.slice(0, -1).join('\n') + '\n'
    const closer = JSON.parse(lines[lines.length - 1]!)
    const hash = createHash('sha256').update(body).digest('hex')

    if (hash !== closer._sha256) {
      return { valid: false, error: `SHA256 mismatch: computed ${hash}, recorded ${closer._sha256}` }
    }

    return { valid: true }
  } catch (err) {
    return { valid: false, error: `Read error: ${(err as Error).message}` }
  }
}

/**
 * Get the current session ID (null if no session active).
 */
export function getCurrentSessionId(): string | null {
  return currentSessionId
}
