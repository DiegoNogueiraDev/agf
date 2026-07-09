import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'process-cleanup.ts' })

export interface CleanupEntry {
  name: string
  pid: number
  onCleanup: () => void | Promise<void>
}

export class ProcessCleanup {
  private entries: CleanupEntry[] = []
  private cleaned = false

  register(entry: CleanupEntry): void {
    this.entries.push(entry)
  }

  async shutdown(): Promise<void> {
    if (this.cleaned) return
    this.cleaned = true
    const results = await Promise.allSettled(this.entries.map((e) => Promise.resolve().then(() => e.onCleanup())))
    for (const r of results) {
      if (r.status === 'rejected') {
        log.warn('cleanup error', { error: String(r.reason) })
      }
    }
    this.entries = []
  }

  get entryCount(): number {
    return this.entries.length
  }
}
