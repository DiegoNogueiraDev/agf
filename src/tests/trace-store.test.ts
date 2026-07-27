/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Tests for core/utils/trace-store.ts — AsyncLocalStorage trace context
 */
import { describe, it, expect } from 'vitest'
import { getTraceContext, runWithTrace } from '../core/utils/trace-store.js'

describe('trace-store', () => {
  it('getTraceContext returns undefined outside a trace', () => {
    expect(getTraceContext()).toBeUndefined()
  })

  it('runWithTrace sets context inside the callback', () => {
    runWithTrace('trace-1', 'span-1', () => {
      const ctx = getTraceContext()
      expect(ctx).toBeDefined()
      expect(ctx!.traceId).toBe('trace-1')
      expect(ctx!.spanId).toBe('span-1')
    })
  })

  it('getTraceContext returns undefined after trace completes', () => {
    runWithTrace('t', 's', () => {
      // inside — context active
    })
    expect(getTraceContext()).toBeUndefined()
  })

  it('nested calls are isolated', () => {
    let outer: ReturnType<typeof getTraceContext> | undefined
    let inner: ReturnType<typeof getTraceContext> | undefined

    runWithTrace('outer-trace', 'outer-span', () => {
      outer = getTraceContext()

      runWithTrace('inner-trace', 'inner-span', () => {
        inner = getTraceContext()
      })
    })

    expect(outer!.traceId).toBe('outer-trace')
    expect(inner!.traceId).toBe('inner-trace')
    expect(inner!.traceId).not.toBe(outer!.traceId)
  })

  it('supports returning a value from runWithTrace', () => {
    const result = runWithTrace('t', 's', () => 42)
    expect(result).toBe(42)
  })

  it('supports async callbacks', async () => {
    const result = await runWithTrace('t', 's', async () => {
      const ctx = getTraceContext()
      return ctx!.traceId
    })
    expect(result).toBe('t')
  })

  it('trace context is stable across await points', async () => {
    await runWithTrace('stable', 's1', async () => {
      const ctx1 = getTraceContext()
      await new Promise((r) => setTimeout(r, 1))
      const ctx2 = getTraceContext()
      expect(ctx2!.traceId).toBe(ctx1!.traceId)
      expect(ctx2!.spanId).toBe(ctx1!.spanId)
    })
  })
})
