import type { CacheStats } from './session-cache.js'
import { createLogger } from '../../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'tui/slash/cache-stats-handler.ts' })

const AVG_TOKENS_PER_HIT = 500
const USD_PER_TOKEN = 0.000003

/** Formats session cache stats (hit rate, savings, estimated cost) as a human-readable string. */
export function formatCacheStats(stats: CacheStats): string {
  log.debug('formatCacheStats')
  const total = stats.hits + stats.misses
  const hitRate = total > 0 ? ((stats.hits / total) * 100).toFixed(1) : '0.0'
  const tokensSaved = stats.hits * AVG_TOKENS_PER_HIT
  const costAvoided = tokensSaved * USD_PER_TOKEN

  const lines: string[] = [
    '═ /cache-stats ═',
    `  Hit rate:  ${hitRate}% (${stats.hits} hits, ${stats.misses} misses)`,
    `  Cache:     ${stats.size}/${stats.capacity} entries`,
    `  Tokens:    ${tokensSaved.toLocaleString()} estimated saved`,
    `  Cost:      $${costAvoided.toFixed(4)} avoided`,
  ]

  if (stats.evictions > 0) {
    lines.push(`  Evictions: ${stats.evictions}`)
  }

  return lines.join('\n')
}
