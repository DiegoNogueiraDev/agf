import { describe, it, expect } from 'vitest'
import { DependencyTracker } from '../core/cache/dependency-tracker.js'

describe('DependencyTracker', () => {
  it('starts empty', () => {
    const tracker = new DependencyTracker()
    expect(tracker.size()).toBe(0)
  })

  it('record() adds a cache key', () => {
    const tracker = new DependencyTracker()
    tracker.record('key-1', ['node-a', 'node-b'])
    expect(tracker.size()).toBe(1)
  })

  it('getAffected() returns cache keys for mutated nodes', () => {
    const tracker = new DependencyTracker()
    tracker.record('cache-1', ['node-a'])
    tracker.record('cache-2', ['node-b'])
    const affected = tracker.getAffected(['node-a'])
    expect(affected).toContain('cache-1')
    expect(affected).not.toContain('cache-2')
  })

  it('getAffected() returns empty for unknown nodes', () => {
    const tracker = new DependencyTracker()
    expect(tracker.getAffected(['unknown'])).toEqual([])
  })

  it('remove() deletes a cache key', () => {
    const tracker = new DependencyTracker()
    tracker.record('key-1', ['node-a'])
    tracker.remove('key-1')
    expect(tracker.size()).toBe(0)
    expect(tracker.getAffected(['node-a'])).toEqual([])
  })

  it('clear() empties the tracker', () => {
    const tracker = new DependencyTracker()
    tracker.record('k1', ['n1'])
    tracker.record('k2', ['n2'])
    tracker.clear()
    expect(tracker.size()).toBe(0)
  })
})
