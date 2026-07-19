/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { RolloutRecorder } from './rollout-recorder.js'
import type { RolloutItem } from './rollout-recorder.js'
import type { ThreadStore } from './thread-store.js'

export class LiveThread {
  private recorder: RolloutRecorder
  private store: ThreadStore
  private threadId: string
  private active: boolean = true

  constructor(store: ThreadStore, baseDir: string, threadId: string) {
    this.store = store
    this.threadId = threadId
    this.recorder = new RolloutRecorder(baseDir, threadId)
  }

  get id(): string {
    return this.threadId
  }

  get isActive(): boolean {
    return this.active
  }

  async start(): Promise<void> {
    await this.recorder.start()
  }

  async appendItems(items: RolloutItem[]): Promise<void> {
    this.recorder.append(items)
    await this.syncMetadata(items)
  }

  async flush(): Promise<void> {
    await this.recorder.flush()
  }

  async shutdown(): Promise<void> {
    await this.recorder.shutdown()
    this.active = false
  }

  async discard(): Promise<void> {
    this.active = false
    await this.store.discardThread(this.threadId)
  }

  private async syncMetadata(items: RolloutItem[]): Promise<void> {
    let totalTokens = 0
    let preview: string | undefined

    for (const item of items) {
      const data = item.data as Record<string, unknown>
      if (typeof data.tokens === 'number') {
        totalTokens += data.tokens
      }
      if (preview === undefined && typeof data.content === 'string') {
        preview = data.content
      }
    }

    await this.store.updateThreadMetadata({
      id: this.threadId,
      tokensUsed: totalTokens > 0 ? totalTokens : undefined,
      preview: preview ?? undefined,
    })
  }
}
