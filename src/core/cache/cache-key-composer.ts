import { fnv1a64, fnv1a32 } from './cache-types.js'
import { canonicalJson } from '../economy/cache/cache-key.js'

export class CacheKeyComposer {
  compose(toolName: string, args: unknown, schemaVersion = 1): string {
    const raw = `${toolName}|${canonicalJson(args)}|${schemaVersion}`
    return fnv1a64(raw)
  }

  compose32(toolName: string, args: unknown, schemaVersion = 1): string {
    const raw = `${toolName}|${canonicalJson(args)}|${schemaVersion}`
    return fnv1a32(raw)
  }
}
