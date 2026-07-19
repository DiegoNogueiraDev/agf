/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_18dacd94465c — classifyLlmError: classificação pura de erros do provider
 * em retryable/permanente, com retryAfterMs para rate-limit. Corta tokens
 * desperdiçados re-tentando erros não-recuperáveis (auth, content-policy).
 */
import { describe, it, expect } from 'vitest'
import { classifyLlmError } from '../core/model-hub/llm-error.js'

describe('classifyLlmError — permanentes (não re-tentar)', () => {
  it('401/403 → auth, retryable=false', () => {
    expect(classifyLlmError({ status: 401, message: 'unauthorized' })).toEqual({ kind: 'auth', retryable: false })
    expect(classifyLlmError({ status: 403, message: 'forbidden' })).toMatchObject({ kind: 'auth', retryable: false })
  })

  it('content-policy (400 + content_filter) → content_policy, retryable=false', () => {
    const r = classifyLlmError({ status: 400, message: 'content_filter triggered: policy violation' })
    expect(r).toEqual({ kind: 'content_policy', retryable: false })
  })

  it('400 genérico → invalid_request, retryable=false', () => {
    expect(classifyLlmError({ status: 400, message: 'bad request: missing field' })).toEqual({
      kind: 'invalid_request',
      retryable: false,
    })
  })

  it('erro desconhecido → unknown, retryable=false (conservador, não queima tokens)', () => {
    expect(classifyLlmError(new Error('boom'))).toEqual({ kind: 'unknown', retryable: false })
  })
})

describe('classifyLlmError — rate-limit (429)', () => {
  it('429 + retry-after numérico (segundos) → retryAfterMs em ms', () => {
    const r = classifyLlmError({ status: 429, headers: { 'retry-after': '2' } })
    expect(r).toEqual({ kind: 'rate_limit', retryable: true, retryAfterMs: 2000 })
  })

  it('429 com headers estilo Headers (.get) → retryAfterMs', () => {
    const headers = { get: (k: string): string | null => (k.toLowerCase() === 'retry-after' ? '3' : null) }
    const r = classifyLlmError({ status: 429, headers })
    expect(r).toMatchObject({ kind: 'rate_limit', retryable: true, retryAfterMs: 3000 })
  })

  it('429 sem retry-after → retryable=true com retryAfterMs default', () => {
    const r = classifyLlmError({ status: 429 })
    expect(r.kind).toBe('rate_limit')
    expect(r.retryable).toBe(true)
    expect(r.retryAfterMs).toBeGreaterThan(0)
  })
})

describe('classifyLlmError — transitórios (retryable)', () => {
  it.each([500, 502, 503, 504, 529])('5xx (%i) → server, retryable=true', (status) => {
    expect(classifyLlmError({ status })).toMatchObject({ kind: 'server', retryable: true })
  })

  it('erro de rede (code ECONNRESET) → network, retryable=true', () => {
    expect(classifyLlmError({ code: 'ECONNRESET', message: 'socket hang up' })).toMatchObject({
      kind: 'network',
      retryable: true,
    })
  })

  it('status extraído da mensagem do ModelAdapterError → classifica igual', () => {
    // A superfície atual lança string: "API do Copilot retornou 503: ..."
    const r = classifyLlmError(new Error('Model adapter error: API do Copilot retornou 503: upstream'))
    expect(r).toMatchObject({ kind: 'server', retryable: true })
  })

  it('statusCode (alias) e response.status são reconhecidos', () => {
    expect(classifyLlmError({ statusCode: 429, headers: { 'retry-after': '1' } })).toMatchObject({ kind: 'rate_limit' })
    expect(classifyLlmError({ response: { status: 503 } })).toMatchObject({ kind: 'server', retryable: true })
  })
})
