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

export type CleanupSignal = 'SIGINT' | 'SIGTERM'

const DEFAULT_CLEANUP_SIGNALS: CleanupSignal[] = ['SIGINT', 'SIGTERM']

/**
 * Registers `cleanup.shutdown()` on SIGINT/SIGTERM so spawned MCP child
 * processes are not orphaned when the host CLI is interrupted mid-connection.
 * Returns an unregister function — callers must invoke it once the guarded
 * window has passed (e.g. after a short-lived command completes normally),
 * otherwise the listener leaks for the lifetime of the process.
 */
export function registerCleanupOnSignals(cleanup: ProcessCleanup, signals: CleanupSignal[] = DEFAULT_CLEANUP_SIGNALS): () => void {
  const handler = (): void => {
    void cleanup.shutdown()
  }
  for (const signal of signals) process.once(signal, handler)
  return () => {
    for (const signal of signals) process.off(signal, handler)
  }
}
