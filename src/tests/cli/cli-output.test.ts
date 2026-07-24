/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { createCliOutput } from '../../cli/shared/cli-output.js'

describe('cli-output — createCliOutput', () => {
  it('ok escreve um envelope com ok=true e os dados fornecidos', () => {
    const out = createCliOutput('test-cmd')
    let written = ''
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      written += chunk
      return true
    })
    try {
      out.ok({ id: 'n1', value: 42 })
      const parsed = JSON.parse(written)
      expect(parsed.ok).toBe(true)
      expect(parsed.data).toEqual({ id: 'n1', value: 42 })
      expect(parsed.meta.command).toBe('test-cmd')
      expect(typeof parsed.meta.ms).toBe('number')
    } finally {
      spy.mockRestore()
    }
  })

  it('ok aceita meta extra (count)', () => {
    const out = createCliOutput('list-cmd')
    let written = ''
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      written += chunk
      return true
    })
    try {
      out.ok([1, 2, 3], { count: 3 })
      const parsed = JSON.parse(written)
      expect(parsed.meta.count).toBe(3)
    } finally {
      spy.mockRestore()
    }
  })

  it('err escreve envelope com ok=false, code e error, exitCode=1', () => {
    const out = createCliOutput('test-cmd')
    let written = ''
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      written += chunk
      return true
    })
    try {
      out.err('NOT_FOUND', 'Node nao encontrado')
      const parsed = JSON.parse(written)
      expect(parsed.ok).toBe(false)
      expect(parsed.code).toBe('NOT_FOUND')
      expect(parsed.error).toBe('Node nao encontrado')
      expect(process.exitCode).toBe(1)
    } finally {
      spy.mockRestore()
    }
  })

  it('fail escreve envelope com ok=false, code, error, data e status=fail', () => {
    const out = createCliOutput('test-cmd')
    let written = ''
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      written += chunk
      return true
    })
    try {
      out.fail('PARSE_ERROR', 'Falha ao parsear', { line: 10 })
      const parsed = JSON.parse(written)
      expect(parsed.ok).toBe(false)
      expect(parsed.code).toBe('PARSE_ERROR')
      expect(parsed.status).toBe('fail')
      expect(parsed.data).toEqual({ line: 10 })
    } finally {
      spy.mockRestore()
    }
  })

  it('advisory escreve envelope com ok=true, status=advisory, code e message', () => {
    const out = createCliOutput('test-cmd')
    let written = ''
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      written += chunk
      return true
    })
    try {
      out.advisory('WARN', 'Algo requer atencao', { detail: 'x' })
      const parsed = JSON.parse(written)
      expect(parsed.ok).toBe(true)
      expect(parsed.status).toBe('advisory')
      expect(parsed.code).toBe('WARN')
      expect(parsed.message).toBe('Algo requer atencao')
      expect(parsed.data).toEqual({ detail: 'x' })
    } finally {
      spy.mockRestore()
    }
  })
})
