import { describe, it, expect } from 'vitest'
import { detectHardBlocks, HARD_BLOCK_RULES } from '../core/planner/hard-block-detector.js'
import type { HardBlockResult } from '../core/planner/hard-block-detector.js'

function task(
  id: string,
  title: string,
  tags: string[] = [],
  description = '',
): {
  id: string
  title: string
  tags: string[]
  description: string
  status: string
  type: string
} {
  return { id, title, tags, description, status: 'backlog', type: 'task' }
}

describe('detectHardBlocks — AC1: task requiring absent runtime becomes blocked', () => {
  it('marks JVM task as hard-blocked when java not in available runtimes', () => {
    const tasks = [task('t1', 'COBOL to Java migration', ['java', 'cobol'])]
    const results = detectHardBlocks(tasks, []) // no runtimes available
    expect(results).toHaveLength(1)
    expect(results[0]!.nodeId).toBe('t1')
    expect(results[0]!.requiredRuntime).toBe('java')
    expect(results[0]!.reason).toBeTruthy()
  })

  it('marks Go task as hard-blocked when go not available', () => {
    const tasks = [task('t2', 'Run go build harness', ['go', 'build'])]
    const results = detectHardBlocks(tasks, ['node', 'python'])
    expect(results.some((r: HardBlockResult) => r.nodeId === 't2')).toBe(true)
  })

  it('records the reason/motivation for blocking', () => {
    const tasks = [task('t3', 'corpus indexing for JVM classes', ['corpus', 'jvm'])]
    const results = detectHardBlocks(tasks, [])
    expect(results[0]!.reason).toMatch(/java|jvm|corpus|runtime/i)
  })

  it('marks corpus-dependent task blocked when corpus is not available', () => {
    const tasks = [task('t4', 'COBOL corpus harvest', ['corpus', 'cobol'])]
    const results = detectHardBlocks(tasks, ['node'])
    expect(results.some((r: HardBlockResult) => r.nodeId === 't4')).toBe(true)
  })
})

describe('detectHardBlocks — AC2: only actionable backlog counts (blocked separate)', () => {
  it('does NOT block task when required runtime is available', () => {
    const tasks = [task('t5', 'java build check', ['java'])]
    const results = detectHardBlocks(tasks, ['java', 'node'])
    expect(results.some((r: HardBlockResult) => r.nodeId === 't5')).toBe(false)
  })

  it('returns empty when all tasks have no external runtime deps', () => {
    const tasks = [task('t6', 'Add TypeScript types', ['typescript']), task('t7', 'Write vitest tests', ['test'])]
    const results = detectHardBlocks(tasks, [])
    expect(results).toHaveLength(0)
  })

  it('separates hard-blocked from actionable: only blocked tasks returned', () => {
    const tasks = [
      task('t8', 'TypeScript refactor', ['typescript']),
      task('t9', 'Java migration', ['java', 'cobol']),
      task('t10', 'Go runtime harness', ['go']),
    ]
    const results = detectHardBlocks(tasks, ['node'])
    const blockedIds = results.map((r: HardBlockResult) => r.nodeId)
    expect(blockedIds).not.toContain('t8') // TS task: no external dep
    expect(blockedIds).toContain('t9') // Java: blocked
    expect(blockedIds).toContain('t10') // Go: blocked
  })
})

describe('HARD_BLOCK_RULES', () => {
  it('includes rules for java, go, and corpus', () => {
    const runtimes = HARD_BLOCK_RULES.map((r) => r.requiredRuntime)
    expect(runtimes).toContain('java')
    expect(runtimes).toContain('go')
    expect(runtimes).toContain('corpus')
  })
})
