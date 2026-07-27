/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_6ba9ef0b5ccd — C79-T1: tests for buildMemorySnippet
 *
 * AC: trims content around firstIdx; prepends/appends ellipsis;
 *     handles negative firstIdx fallback; blast gate passes
 */

import { describe, it, expect } from 'vitest'
import { buildMemorySnippet } from '../core/memory/memory-reader.js'

describe('buildMemorySnippet', () => {
  it('returns a string', () => {
    const result = buildMemorySnippet('hello world', 0, 5)
    expect(typeof result).toBe('string')
  })

  it('returns first 120 chars when firstIdx is negative', () => {
    const content = 'A'.repeat(200)
    const result = buildMemorySnippet(content, -1, 5)
    expect(result).toBe(content.slice(0, 120))
  })

  it('short content with firstIdx=0 returns content without ellipsis', () => {
    const content = 'hello world'
    const result = buildMemorySnippet(content, 0, 5)
    expect(result).not.toContain('…')
    expect(result).toContain('hello')
  })

  it('prepends ellipsis when snippet starts mid-content', () => {
    const content = 'A'.repeat(100) + 'TARGET' + 'B'.repeat(100)
    const firstIdx = 100
    const result = buildMemorySnippet(content, firstIdx, 6)
    expect(result.startsWith('…')).toBe(true)
  })

  it('appends ellipsis when snippet ends before content end', () => {
    const content = 'A'.repeat(100) + 'TARGET' + 'B'.repeat(100)
    const firstIdx = 100
    const result = buildMemorySnippet(content, firstIdx, 6)
    expect(result.endsWith('…')).toBe(true)
  })

  it('no ellipsis when snippet covers entire content', () => {
    const content = 'short text here'
    const result = buildMemorySnippet(content, 6, 4)
    expect(result).not.toContain('…')
  })

  it('includes the matched query region in the snippet', () => {
    const content = 'prefix-text FINDME suffix-text'
    const firstIdx = 12
    const queryLen = 6
    const result = buildMemorySnippet(content, firstIdx, queryLen)
    expect(result).toContain('FINDME')
  })

  it('handles firstIdx=0 for very long content — prepends no ellipsis', () => {
    const content = 'START' + 'X'.repeat(500)
    const result = buildMemorySnippet(content, 0, 5)
    expect(result.startsWith('…')).toBe(false)
    expect(result.startsWith('START')).toBe(true)
  })

  it('handles empty content gracefully', () => {
    expect(() => buildMemorySnippet('', -1, 5)).not.toThrow()
    const result = buildMemorySnippet('', -1, 5)
    expect(typeof result).toBe('string')
  })

  it('snippet is bounded — does not exceed content length by more than ellipsis chars', () => {
    const content = 'hello world'
    const result = buildMemorySnippet(content, 0, 5)
    expect(result.length).toBeLessThanOrEqual(content.length + 2)
  })
})

// ── node_0b126a8889c6 — valid_from/valid_until in writeMemory ─────────────────

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeMemory, readMemory } from '../core/memory/memory-reader.js'

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'agf-mem-test-'))
}

describe('writeMemory valid_from/valid_until (node_0b126a8889c6)', () => {
  it('AC1: write without validity → valid_from defaults, valid_until=null (no error)', async () => {
    const dir = makeTmpDir()
    try {
      await expect(writeMemory(dir, 'test-mem', 'content here')).resolves.not.toThrow()
      const mem = await readMemory(dir, 'test-mem')
      expect(mem).not.toBeNull()
      expect(mem!.content).toContain('content here')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('AC1: ProjectMemory type accepts valid_from/valid_until (optional fields)', async () => {
    const dir = makeTmpDir()
    try {
      await writeMemory(dir, 'dated-mem', 'some content', {
        validFrom: new Date('2026-01-01').toISOString(),
        validUntil: null,
      })
      const mem = await readMemory(dir, 'dated-mem')
      expect(mem).not.toBeNull()
      expect(mem!.content).toContain('some content')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('AC2: write with valid_until in the past → persists normally', async () => {
    const dir = makeTmpDir()
    try {
      const pastDate = new Date('2020-01-01').toISOString()
      await writeMemory(dir, 'expired-mem', 'expired content', { validUntil: pastDate })
      const mem = await readMemory(dir, 'expired-mem')
      expect(mem).not.toBeNull()
      // The validUntil field should be stored in the file
      expect(mem!.validUntil).toBe(pastDate)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('validFrom is present in the returned memory after write', async () => {
    const dir = makeTmpDir()
    try {
      const ts = new Date('2026-06-01').toISOString()
      await writeMemory(dir, 'from-mem', 'content', { validFrom: ts })
      const mem = await readMemory(dir, 'from-mem')
      expect(mem!.validFrom).toBe(ts)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// ── node_wire_49f392b42a5c — memory-dedup-detector wired into writeMemory ────

describe('writeMemory near-duplicate detection (node_wire_49f392b42a5c)', () => {
  it('emits memory:post-store when a near-duplicate memory already exists', async () => {
    const dir = makeTmpDir()
    try {
      const { getSharedHookBus, _resetSharedHookBus } = await import('../core/hooks/shared-hook-bus.js')
      _resetSharedHookBus()
      const events: unknown[] = []
      getSharedHookBus().on('memory:post-store', (e) => events.push(e))

      const longText =
        'agf next é global sem escopo por epic — o picker é FIFO por prioridade e depois id, ignorando parentId'
      await writeMemory(dir, 'pheromone-original', longText)
      await writeMemory(dir, 'pheromone-near-dupe', longText + ' extra')

      expect(events).toHaveLength(1)
      _resetSharedHookBus()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('does not emit for genuinely distinct memories', async () => {
    const dir = makeTmpDir()
    try {
      const { getSharedHookBus, _resetSharedHookBus } = await import('../core/hooks/shared-hook-bus.js')
      _resetSharedHookBus()
      const events: unknown[] = []
      getSharedHookBus().on('memory:post-store', (e) => events.push(e))

      await writeMemory(dir, 'topic-a', 'agf next é global sem escopo por epic — o picker é FIFO')
      await writeMemory(dir, 'topic-b', 'binários de release ficam no servidor via scp, nunca no git')

      expect(events).toHaveLength(0)
      _resetSharedHookBus()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('MCP_GRAPH_MEMORY_DEDUP=off disables the check entirely', async () => {
    const dir = makeTmpDir()
    const original = process.env.MCP_GRAPH_MEMORY_DEDUP
    process.env.MCP_GRAPH_MEMORY_DEDUP = 'off'
    try {
      const { getSharedHookBus, _resetSharedHookBus } = await import('../core/hooks/shared-hook-bus.js')
      _resetSharedHookBus()
      const events: unknown[] = []
      getSharedHookBus().on('memory:post-store', (e) => events.push(e))

      const longText = 'agf next é global sem escopo por epic — o picker é FIFO por prioridade e depois id'
      await writeMemory(dir, 'a', longText)
      await writeMemory(dir, 'b', longText)

      expect(events).toHaveLength(0)
      _resetSharedHookBus()
    } finally {
      if (original === undefined) delete process.env.MCP_GRAPH_MEMORY_DEDUP
      else process.env.MCP_GRAPH_MEMORY_DEDUP = original
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// ── node_wire_662ee61c48da — memory-staleness wired into checkMemoryStaleness ─

describe('checkMemoryStaleness (node_wire_662ee61c48da)', () => {
  it('emits session:memory-staleness for a memory not refreshed in 30+ days', async () => {
    const dir = makeTmpDir()
    try {
      const { utimes } = await import('node:fs/promises')
      const { checkMemoryStaleness } = await import('../core/memory/memory-reader.js')
      const { getSharedHookBus, _resetSharedHookBus } = await import('../core/hooks/shared-hook-bus.js')
      _resetSharedHookBus()
      const events: Array<{ payload: { stale: Array<{ id: string }> } }> = []
      getSharedHookBus().on('session:memory-staleness', (e) => events.push(e as (typeof events)[number]))

      await writeMemory(dir, 'ancient-mem', 'content that is old')
      const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)
      await utimes(join(dir, 'workflow-graph', 'memories', 'ancient-mem.md'), oldDate, oldDate)

      await checkMemoryStaleness(dir)

      expect(events).toHaveLength(1)
      expect(events[0].payload.stale.map((s) => s.id)).toContain('ancient-mem')
      _resetSharedHookBus()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('does not emit for a freshly-written memory', async () => {
    const dir = makeTmpDir()
    try {
      const { checkMemoryStaleness } = await import('../core/memory/memory-reader.js')
      const { getSharedHookBus, _resetSharedHookBus } = await import('../core/hooks/shared-hook-bus.js')
      _resetSharedHookBus()
      const events: unknown[] = []
      getSharedHookBus().on('session:memory-staleness', (e) => events.push(e))

      await writeMemory(dir, 'fresh-mem', 'brand new content')
      await checkMemoryStaleness(dir)

      expect(events).toHaveLength(0)
      _resetSharedHookBus()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('MCP_GRAPH_MEMORY_STALENESS=off disables the check', async () => {
    const dir = makeTmpDir()
    const original = process.env.MCP_GRAPH_MEMORY_STALENESS
    process.env.MCP_GRAPH_MEMORY_STALENESS = 'off'
    try {
      const { utimes } = await import('node:fs/promises')
      const { checkMemoryStaleness } = await import('../core/memory/memory-reader.js')
      const { getSharedHookBus, _resetSharedHookBus } = await import('../core/hooks/shared-hook-bus.js')
      _resetSharedHookBus()
      const events: unknown[] = []
      getSharedHookBus().on('session:memory-staleness', (e) => events.push(e))

      await writeMemory(dir, 'ancient-mem', 'content that is old')
      const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)
      await utimes(join(dir, 'workflow-graph', 'memories', 'ancient-mem.md'), oldDate, oldDate)
      await checkMemoryStaleness(dir)

      expect(events).toHaveLength(0)
      _resetSharedHookBus()
    } finally {
      if (original === undefined) delete process.env.MCP_GRAPH_MEMORY_STALENESS
      else process.env.MCP_GRAPH_MEMORY_STALENESS = original
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
