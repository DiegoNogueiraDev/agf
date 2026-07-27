import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NdjsonLevel, NdjsonEntry } from '../core/output/ndjson-logger.js'
import { writeNdjsonLog } from '../core/output/ndjson-logger.js'

describe('writeNdjsonLog', () => {
  let writeSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    writeSpy.mockRestore()
  })

  it('writes a JSON line to stderr', () => {
    const entry: NdjsonEntry = { ts: '2026-06-22T00:00:00Z', lvl: 'info', msg: 'test' }
    writeNdjsonLog(entry)
    expect(writeSpy).toHaveBeenCalledOnce()
    const written = writeSpy.mock.calls[0]![0] as string
    expect(written).toMatch(/\n$/)
    const parsed = JSON.parse(written.trim())
    expect(parsed.lvl).toBe('info')
    expect(parsed.msg).toBe('test')
  })

  it('includes extra context fields at the top level', () => {
    const entry: NdjsonEntry = { ts: '2026-06-22T00:00:00Z', lvl: 'error', msg: 'fail', nodeId: 'n-123' }
    writeNdjsonLog(entry)
    const written = writeSpy.mock.calls[0]![0] as string
    const parsed = JSON.parse(written.trim())
    expect(parsed.nodeId).toBe('n-123')
  })

  it('NdjsonLevel covers all four levels', () => {
    const levels: NdjsonLevel[] = ['info', 'warn', 'error', 'debug']
    expect(levels).toHaveLength(4)
  })
})
