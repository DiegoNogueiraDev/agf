/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { wipSummary } from '../cli/commands/insights-cmd.js'

describe('wipSummary', () => {
  const createMockStore = (inProgress: number) =>
    ({
      getStats: () => ({
        totalNodes: 100,
        totalEdges: 200,
        byStatus: {
          backlog: 50,
          ready: 10,
          in_progress: inProgress,
          done: 40,
        },
      }),
    }) as unknown as import('../../core/store/sqlite-store.js').SqliteStore

  it('returns WIP count when zero', () => {
    const store = createMockStore(0)
    const result = wipSummary(store)
    expect(result.current).toBe(0)
    expect(result.alert).toBe(false)
    expect(result.alertMessage).toContain('WIP_OK')
  })

  it('returns WIP count when one', () => {
    const store = createMockStore(1)
    const result = wipSummary(store)
    expect(result.current).toBe(1)
    expect(result.alert).toBe(false)
    expect(result.alertMessage).toContain('WIP_OK')
  })

  it('alerts when WIP > 1', () => {
    const store = createMockStore(3)
    const result = wipSummary(store)
    expect(result.current).toBe(3)
    expect(result.alert).toBe(true)
    expect(result.alertMessage).toContain('WIP_ALERT')
    expect(result.alertMessage).toContain('limit=1')
  })

  it('includes trend array with current value', () => {
    const store = createMockStore(2)
    const result = wipSummary(store)
    expect(result.trend).toHaveLength(1)
    expect(result.trend[0]).toBe(2)
  })
})
