import { fnv1a32, fnv1a64 } from '../../core/cache/cache-types.js'
import { createLogger } from '../../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'tui/slash/cache-key-composer.ts' })

/** Current schema version for cache keys. Bump to invalidate all session caches. */
export const CURRENT_CACHE_SCHEMA = 1

export interface GraphFingerprint {
  totalNodes: number
  byStatus: Record<string, number>
  lastMutationTs: number
}

function fnv1a(input: string): string {
  return fnv1a32(input)
}

function fingerprintToString(fp: GraphFingerprint): string {
  const statusStr = Object.entries(fp.byStatus)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join(',')
  return `${fp.totalNodes}|${statusStr}|${fp.lastMutationTs}`
}

/** Builds a deterministic cache key from command, args, graph fingerprint, and schema version. */
export function composeCacheKey(
  command: string,
  args: string,
  fingerprint: GraphFingerprint,
  schemaVersion: number,
): string {
  log.debug(`composeCacheKey: ${command}`)
  const raw = `${command}|${args}|${fingerprintToString(fingerprint)}|${schemaVersion}`
  return fnv1a(raw)
}

/** 64-bit variant for new code. */
export function composeCacheKey64(
  command: string,
  args: string,
  fingerprint: GraphFingerprint,
  schemaVersion: number,
): string {
  const raw = `${command}|${args}|${fingerprintToString(fingerprint)}|${schemaVersion}`
  return fnv1a64(raw)
}
