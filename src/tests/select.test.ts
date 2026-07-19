import { describe, it, expect } from 'vitest'
import { projectEnvelope } from '../core/output/select.js'
import type { OutputEnvelope } from '../core/output/envelope.js'

function makeEnv<T>(data: T): OutputEnvelope<T> {
  return { ok: true, data, meta: { command: 'test', ms: 1 } }
}

describe('projectEnvelope', () => {
  it('returns original envelope when paths is empty', () => {
    const env = makeEnv({ a: 1, b: 2 })
    const result = projectEnvelope(env, [])
    expect(result).toEqual(env)
  })

  it('returns single dot-path field', () => {
    const env = makeEnv({ node: { id: 'n1', title: 'test' } })
    const result = projectEnvelope(env, ['data.node.id'])
    expect((result as Record<string, unknown>).data).toEqual({ node: { id: 'n1' } })
  })

  it('always retains ok field', () => {
    const env = makeEnv({ x: 1 })
    const result = projectEnvelope(env, ['data.x'])
    expect(result.ok).toBe(true)
  })

  it('retains meta field', () => {
    const env = makeEnv({ x: 1 })
    const result = projectEnvelope(env, ['data.x'])
    expect(result.meta).toEqual({ command: 'test', ms: 1 })
  })

  it('handles nonexistent path gracefully — returns original', () => {
    const env = makeEnv({ a: 1 })
    const result = projectEnvelope(env, ['data.nonexistent'])
    expect(result).toEqual(env)
  })

  it('merges two paths', () => {
    const env = makeEnv({ score: 42, grade: 'A', extra: 'ignored' })
    const result = projectEnvelope(env, ['data.score', 'data.grade'])
    const d = (result as Record<string, unknown>).data as Record<string, unknown>
    expect(d).toHaveProperty('score', 42)
    expect(d).toHaveProperty('grade', 'A')
    expect(d).not.toHaveProperty('extra')
  })

  it('projects into nested arrays', () => {
    const env = makeEnv({ nodes: [{ id: 'a' }, { id: 'b' }] })
    const result = projectEnvelope(env, ['data.nodes.id'])
    const d = (result as Record<string, unknown>).data as Record<string, unknown>
    expect(d.nodes).toEqual([{ id: 'a' }, { id: 'b' }])
  })

  it('returns original if no path resolves in array', () => {
    const env = makeEnv({ nodes: [{ id: 'a' }] })
    const result = projectEnvelope(env, ['data.nodes.notexist'])
    expect(result).toEqual(env)
  })

  it('retains error field from envelope when present', () => {
    const env: OutputEnvelope<never> = { ok: false, code: 'ERR', error: 'bad', meta: { command: 'test', ms: 1 } }
    const result = projectEnvelope(env, ['data.x'])
    expect(result.error).toBe('bad')
  })

  it('handles empty string path by ignoring it', () => {
    const env = makeEnv({ a: 1 })
    const result = projectEnvelope(env, [''])
    expect(result).toEqual(env)
  })
})
