/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { mkdirSync, existsSync, appendFileSync } from 'node:fs'
import { join, dirname } from 'node:path'

export interface RolloutItem {
  kind: 'SessionMeta' | 'ResponseItem' | 'Compacted' | 'TurnContext' | 'EventMsg'
  data: unknown
  timestamp: string
}

export class RolloutRecorder {
  private buffer: RolloutItem[] = []
  private path: string
  private writing = false
  private closed = false

  constructor(baseDir: string, threadId: string) {
    this.path = join(baseDir, 'sessions', `rollout-${threadId}.jsonl`)
  }

  async start(): Promise<void> {
    const dir = dirname(this.path)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
  }

  append(items: RolloutItem | RolloutItem[]): void {
    if (this.closed) return
    const arr = Array.isArray(items) ? items : [items]
    this.buffer.push(...arr)
  }

  async flush(): Promise<void> {
    if (this.writing || this.buffer.length === 0) return
    this.writing = true
    try {
      const items = this.buffer.splice(0)
      const dir = dirname(this.path)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
      for (const item of items) {
        const line = JSON.stringify(item) + '\n'
        appendFileSync(this.path, line, 'utf-8')
      }
    } catch {
      try {
        const dir = dirname(this.path)
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true })
        }
        for (const item of this.buffer.splice(0)) {
          const line = JSON.stringify(item) + '\n'
          appendFileSync(this.path, line, 'utf-8')
        }
      } catch {
        /* swallow — best effort */
      }
    } finally {
      this.writing = false
    }
  }

  async shutdown(): Promise<void> {
    if (this.closed) return
    this.closed = true
    await this.flush()
  }
}
