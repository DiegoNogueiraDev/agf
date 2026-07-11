import { describe, it, expect } from 'vitest'
import { shardPrdText, importShardedPrd } from '../core/importer/prd-sharding.js'
import type { ShardPayload } from '../core/importer/prd-sharding.js'

describe('shardPrdText', () => {
  it('returns single shard for short text', () => {
    const shards = shardPrdText('Short PRD content', 8000)
    expect(shards).toHaveLength(1)
    expect(shards[0]).toContain('Short PRD content')
  })

  it('splits on explicit ---SHARD_BOUNDARY--- markers', () => {
    const text = 'Part A\n---SHARD_BOUNDARY---\nPart B\n---SHARD_BOUNDARY---\nPart C'
    const shards = shardPrdText(text, 8000)
    expect(shards).toHaveLength(3)
    expect(shards[0]).toBe('Part A')
    expect(shards[1]).toBe('Part B')
    expect(shards[2]).toBe('Part C')
  })

  it('splits on ## headings when budget is tight', () => {
    // Shard budget is tokenBudget * 4 chars
    // Use budget=1 (4 chars), forcing each heading into its own shard
    const text = '## Section 1\nContent one.\n\n## Section 2\nContent two.'
    const shards = shardPrdText(text, 1)
    expect(shards.length).toBeGreaterThan(1)
  })

  it('does not split short text even at heading boundary', () => {
    const text = '## Section 1\nSmall.\n\n## Section 2\nAlso small.'
    const shards = shardPrdText(text, 8000)
    expect(shards).toHaveLength(1)
  })

  it('returns non-empty shards only', () => {
    const text = 'A---SHARD_BOUNDARY---\n---SHARD_BOUNDARY---B'
    const shards = shardPrdText(text, 8000)
    expect(shards.every((s) => s.length > 0)).toBe(true)
  })

  it('handles empty string returning single entry', () => {
    const shards = shardPrdText('', 8000)
    expect(shards.length).toBeGreaterThan(0)
  })
})

describe('importShardedPrd', () => {
  const noop = (): ShardPayload => ({ nodes: [], edges: [] })

  it('returns empty result for empty text with noop parser', () => {
    const result = importShardedPrd('', { parseShardFn: noop })
    expect(result.nodes).toEqual([])
    expect(result.edges).toEqual([])
    expect(result.failedShards).toEqual([])
  })

  it('calls parseShardFn for each shard', () => {
    const calls: string[] = []
    const parser = (text: string): ShardPayload => {
      calls.push(text)
      return { nodes: [], edges: [] }
    }
    importShardedPrd('---SHARD_BOUNDARY---\nA---SHARD_BOUNDARY---\nB', { parseShardFn: parser })
    expect(calls.length).toBeGreaterThanOrEqual(2)
  })

  it('records failed shards when parser throws', () => {
    let count = 0
    const flaky = (): ShardPayload => {
      count++
      if (count === 1) throw new Error('parse error')
      return { nodes: [], edges: [] }
    }
    const result = importShardedPrd('A---SHARD_BOUNDARY---B', { parseShardFn: flaky })
    expect(result.failedShards).toContain(0)
    expect(result.shardErrors.length).toBeGreaterThan(0)
  })

  it('merges nodes from multiple shards', () => {
    const shardNodes = ['n1', 'n2']
    let i = 0
    const parser = (): ShardPayload => ({
      nodes: [
        {
          id: shardNodes[i++] ?? 'nx',
          type: 'task',
          title: 'T',
          status: 'backlog',
          priority: 3,
          createdAt: '',
          updatedAt: '',
        },
      ],
      edges: [],
    })
    const result = importShardedPrd('A---SHARD_BOUNDARY---B', { parseShardFn: parser })
    expect(result.nodes.length).toBe(2)
  })
})
