import { describe, it, expect } from 'vitest'
import { deepMerge, resolveLayers, flattenLayers } from '../schemas/config-layers.schema.js'

describe('deepMerge', () => {
  it('merges two flat objects', () => {
    const result = deepMerge({ a: 1 }, { b: 2 })
    expect(result).toEqual({ a: 1, b: 2 })
  })

  it('deep-merges nested objects', () => {
    const result = deepMerge({ db: { host: 'localhost' } }, { db: { port: 5432 } })
    expect(result).toEqual({ db: { host: 'localhost', port: 5432 } })
  })

  it('later value overwrites scalar', () => {
    const result = deepMerge({ level: 'info' }, { level: 'debug' })
    expect(result).toEqual({ level: 'debug' })
  })

  it('concatenates arrays', () => {
    const result = deepMerge({ tools: ['read'] }, { tools: ['write'] })
    expect(result).toEqual({ tools: ['read', 'write'] })
  })

  it('returns empty object for no sources', () => {
    expect(deepMerge()).toEqual({})
  })
})

describe('resolveLayers', () => {
  it('merges all layers in order', () => {
    const layers = [
      { name: 'defaults', data: { timeout: 5000, retries: 3 } },
      { name: 'project', data: { timeout: 10000 } },
    ]
    const result = resolveLayers(layers)
    expect(result).toEqual({ timeout: 10000, retries: 3 })
  })

  it('returns empty object for empty layers', () => {
    expect(resolveLayers([])).toEqual({})
  })
})

describe('flattenLayers', () => {
  it('returns shallow copies of each layer', () => {
    const original = { name: 'base', data: { x: 1 } }
    const result = flattenLayers([original])
    expect(result[0].data).toEqual({ x: 1 })
    result[0].data.x = 99
    expect(original.data.x).toBe(1)
  })
})
