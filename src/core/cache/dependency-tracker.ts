export class DependencyTracker {
  private cacheToNodes = new Map<string, Set<string>>()
  private nodeToCaches = new Map<string, Set<string>>()

  record(cacheKey: string, nodeIds: string[]): void {
    this.cacheToNodes.set(cacheKey, new Set(nodeIds))
    for (const nid of nodeIds) {
      let set = this.nodeToCaches.get(nid)
      if (!set) {
        set = new Set()
        this.nodeToCaches.set(nid, set)
      }
      set.add(cacheKey)
    }
  }

  getAffected(mutatedNodeIds: string[]): string[] {
    const affected = new Set<string>()
    for (const nid of mutatedNodeIds) {
      const caches = this.nodeToCaches.get(nid)
      if (caches) {
        for (const ck of caches) {
          affected.add(ck)
        }
      }
    }
    return [...affected]
  }

  remove(cacheKey: string): void {
    const nodeIds = this.cacheToNodes.get(cacheKey)
    if (!nodeIds) return
    for (const nid of nodeIds) {
      const set = this.nodeToCaches.get(nid)
      if (set) {
        set.delete(cacheKey)
        if (set.size === 0) this.nodeToCaches.delete(nid)
      }
    }
    this.cacheToNodes.delete(cacheKey)
  }

  clear(): void {
    this.cacheToNodes.clear()
    this.nodeToCaches.clear()
  }

  size(): number {
    return this.cacheToNodes.size
  }
}
