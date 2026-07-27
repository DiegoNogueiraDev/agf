/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { resolveLayers, type LayerSource, deepMerge, flattenLayers } from '../schemas/config-layers.schema.js'

describe('ConfigLayers', () => {
  describe('deepMerge', () => {
    it('should merge scalars (last wins)', () => {
      const result = deepMerge({ a: 1 }, { a: 2 })
      expect(result).toEqual({ a: 2 })
    })

    it('should deep merge nested objects', () => {
      const result = deepMerge({ nested: { x: 1, y: 2 } }, { nested: { y: 3, z: 4 } })
      expect(result).toEqual({ nested: { x: 1, y: 3, z: 4 } })
    })

    it('should merge arrays by concatenation (last appends)', () => {
      const result = deepMerge({ tools: ['read', 'write'] }, { tools: ['bash', 'search'] })
      expect(result).toEqual({ tools: ['read', 'write', 'bash', 'search'] })
    })

    it('should handle empty merge', () => {
      expect(deepMerge({ a: 1 }, {})).toEqual({ a: 1 })
      expect(deepMerge({}, { b: 2 })).toEqual({ b: 2 })
    })

    it('should merge multiple layers', () => {
      const result = deepMerge(
        { db: { host: 'localhost', port: 3000 } },
        { db: { port: 4000, ssl: true } },
        { db: { ssl: false, pool: 5 } },
      )
      expect(result).toEqual({ db: { host: 'localhost', port: 4000, ssl: false, pool: 5 } })
    })
  })

  describe('resolveLayers', () => {
    it('should return user layer first, then project, then profile, then CLI', () => {
      const layers: LayerSource[] = [
        { name: 'user', data: { model: 'haiku' } },
        { name: 'project', data: { model: 'sonnet', tools: ['read'] } },
        { name: 'profile:fast', data: { retries: 1 } },
        { name: 'cli', data: { retries: 3, verbose: true } },
      ]

      const result = resolveLayers(layers)
      expect(result.model).toBe('sonnet')
      expect(result.tools).toEqual(['read'])
      expect(result.retries).toBe(3)
      expect(result.verbose).toBe(true)
    })

    it('should handle cli override on all fields', () => {
      const layers: LayerSource[] = [
        { name: 'user', data: { host: 'default', port: 3000 } },
        { name: 'cli', data: { port: 8080 } },
      ]

      const result = resolveLayers(layers)
      expect(result.host).toBe('default')
      expect(result.port).toBe(8080)
    })

    it('should return empty object for no layers', () => {
      expect(resolveLayers([])).toEqual({})
    })

    it('should accumulate arrays across layers', () => {
      const layers: LayerSource[] = [
        { name: 'user', data: { tools: ['read'] } },
        { name: 'project', data: { tools: ['write'] } },
        { name: 'cli', data: { tools: ['bash'] } },
      ]

      const result = resolveLayers(layers)
      expect(result.tools).toEqual(['read', 'write', 'bash'])
    })
  })

  describe('flattenLayers', () => {
    it('should flatten layers with metadata', () => {
      const layers: LayerSource[] = [
        { name: 'user', data: { a: 1 } },
        { name: 'project', data: { b: 2 } },
      ]

      const flat = flattenLayers(layers)
      expect(flat).toHaveLength(2)
      expect(flat[0]?.name).toBe('user')
      expect(flat[0]?.data).toEqual({ a: 1 })
      expect(flat[1]?.name).toBe('project')
    })
  })
})
