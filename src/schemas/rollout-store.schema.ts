/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §S3.3 — RolloutStore: persistência de eventos de sessão para resume/fork.
 * Usa NDJSON files (Newline-Delimited JSON) por sessão.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, appendFileSync } from 'node:fs'
import { join, dirname } from 'node:path'

export interface RolloutEntry {
  kind: string
  content?: string
  toolName?: string
  timestamp?: string
  [key: string]: unknown
}

export interface ResumeResult {
  sessionId: string
  entries: RolloutEntry[]
  entryCount: number
  loadedAt: string
}

export interface IntegrityResult {
  valid: boolean
  errors?: string[]
}

export class RolloutStore {
  private readonly baseDir: string

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? join(process.cwd(), '.rollouts')
    if (!existsSync(this.baseDir)) {
      mkdirSync(this.baseDir, { recursive: true })
    }
  }

  private filePath(sessionId: string): string {
    return join(this.baseDir, `rollout-${sanitizeId(sessionId)}.ndjson`)
  }

  async append(sessionId: string, entry: RolloutEntry): Promise<void> {
    const path = this.filePath(sessionId)
    const dir = dirname(path)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    const line = JSON.stringify({ ...entry, timestamp: entry.timestamp ?? new Date().toISOString() }) + '\n'
    appendFileSync(path, line, 'utf-8')
  }

  async load(sessionId: string): Promise<RolloutEntry[]> {
    const path = this.filePath(sessionId)
    if (!existsSync(path)) return []
    try {
      const raw = readFileSync(path, 'utf-8')
      return raw
        .split('\n')
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l) as RolloutEntry)
    } catch {
      return []
    }
  }

  async fork(sourceId: string, newSessionId: string, mode: 'full' | 'lastN', lastN?: number): Promise<string> {
    const entries = await this.load(sourceId)

    let forkEntries: RolloutEntry[]
    if (mode === 'lastN' && lastN !== undefined && lastN > 0) {
      forkEntries = entries.slice(-lastN)
    } else {
      forkEntries = [...entries]
    }

    const path = this.filePath(newSessionId)
    const dir = dirname(path)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    const content = forkEntries.map((e) => JSON.stringify(e)).join('\n') + '\n'
    writeFileSync(path, content, 'utf-8')

    return newSessionId
  }

  async list(): Promise<string[]> {
    if (!existsSync(this.baseDir)) return []
    const files = readdirSync(this.baseDir)
    return files
      .filter((f) => f.startsWith('rollout-') && f.endsWith('.ndjson'))
      .map((f) => f.replace(/^rollout-/, '').replace(/\.ndjson$/, ''))
  }

  async validate(sessionId: string): Promise<IntegrityResult> {
    const path = this.filePath(sessionId)
    if (!existsSync(path)) {
      return { valid: true, errors: [] }
    }
    try {
      const raw = readFileSync(path, 'utf-8')
      const errors: string[] = []
      const lines = raw.split('\n').filter((l) => l.trim())
      for (let i = 0; i < lines.length; i++) {
        try {
          JSON.parse(lines[i]!)
        } catch {
          errors.push(`Line ${i + 1}: invalid JSON`)
        }
      }
      return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined }
    } catch (err) {
      return { valid: false, errors: [`File read error: ${String(err)}`] }
    }
  }

  async resume(sessionId: string): Promise<ResumeResult | null> {
    const integrity = await this.validate(sessionId)
    if (!integrity.valid) {
      return null
    }
    const entries = await this.load(sessionId)
    if (entries.length === 0) {
      return null
    }
    return {
      sessionId,
      entries,
      entryCount: entries.length,
      loadedAt: new Date().toISOString(),
    }
  }
}

/** Returns all stored rollout session IDs from the default or specified base directory. */
export async function listSessions(baseDir?: string): Promise<string[]> {
  const store = new RolloutStore(baseDir)
  return store.list()
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_')
}
