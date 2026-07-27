import { SessionCache } from './session-cache.js'
import { createLogger } from '../../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'tui/slash/cache-warmup.ts' })

export const WARMUP_COMMANDS = ['stats', 'metrics', 'phase', 'skills', 'principles', 'provider'] as const

/** Pre-populates the session cache with outputs for the standard warmup commands. */
export async function warmupCache(cache: SessionCache): Promise<void> {
  log.debug('cache warmup starting')
  for (const cmd of WARMUP_COMMANDS) {
    try {
      switch (cmd) {
        case 'stats':
          cache.stats()
          break
        case 'metrics':
          cache.metrics()
          break
        case 'phase':
          cache.getPhase()
          break
        case 'skills':
          cache.listSkills()
          break
        case 'principles':
          cache.principles()
          break
        case 'provider':
          cache.providers()
          break
      }
    } catch {
      // Silently ignore — warmup failures shouldn't block TUI
    }
  }
}
