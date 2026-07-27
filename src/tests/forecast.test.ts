import { describe, it, expect } from 'vitest'
import { calculateForecast } from '../core/insights/forecast.js'

describe('forecast', () => {
  function makeStore(opts: {
    backlogCount?: number
    sprintTasks?: Record<string, number>
  }): Parameters<typeof calculateForecast>[0] {
    const backlogCount = opts.backlogCount ?? 0
    const sprints = opts.sprintTasks ?? { S1: 5, S2: 7, S3: 6 }

    const nodes: Record<string, unknown>[] = []
    let idx = 0

    for (let i = 0; i < backlogCount; i++) {
      nodes.push({
        id: `b${idx++}`,
        type: 'task',
        title: `Backlog ${i}`,
        status: 'backlog',
        priority: 3,
        xpSize: 'S',
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
        sprint: '__unassigned__',
        description: '',
        parentId: null,
        acceptanceCriteria: [],
        tags: [],
        metadata: {},
        blocked: false,
      })
    }

    for (const [sprint, count] of Object.entries(sprints)) {
      for (let i = 0; i < count; i++) {
        nodes.push({
          id: `d${idx++}`,
          type: 'task',
          title: `Done ${sprint}-${i}`,
          status: 'done',
          priority: 3,
          xpSize: 'S',
          createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          updatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          sprint,
          description: '',
          parentId: null,
          acceptanceCriteria: [],
          tags: [],
          metadata: {},
          blocked: false,
        })
      }
    }

    const doc = {
      version: '1' as const,
      project: { id: 'p1', name: 'test', createdAt: '', updatedAt: '' },
      nodes: nodes as never,
      edges: [],
      indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
      meta: { sourceFiles: [], lastImport: null },
    }

    let getCount = 0
    const getValues = [0, 0, 0, 0, 0]

    return {
      toGraphDocument: () => doc,
      getDb: () => ({
        prepare: () => ({
          get: () => {
            const v = getValues[getCount] ?? 0
            getCount++
            return { cnt: v }
          },
          all: () => [],
        }),
      }),
      getProject: () => ({ id: 'p1' }),
    } as never
  }

  it('returns etaDays=0 when backlog is empty', () => {
    const store = makeStore({ backlogCount: 0 })
    const result = calculateForecast(store)
    expect(result.backlogCount).toBe(0)
    expect(result.etaDays).toBe(0)
    expect(result.etaDate).toBe('now')
  })

  it('returns positive etaDays when backlog exists', () => {
    const store = makeStore({ backlogCount: 10 })
    const result = calculateForecast(store)
    expect(result.backlogCount).toBe(10)
    expect(result.etaDays).toBeGreaterThan(0)
  })

  it('returns etaDate as ISO date string', () => {
    const store = makeStore({ backlogCount: 5 })
    const result = calculateForecast(store)
    expect(result.etaDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('returns confidenceLevel=95', () => {
    const store = makeStore({ backlogCount: 5 })
    const result = calculateForecast(store)
    expect(result.confidenceLevel).toBe(95)
  })

  it('returns trend from DORA', () => {
    const store = makeStore({ backlogCount: 5 })
    const result = calculateForecast(store)
    expect(['improving', 'stable', 'declining']).toContain(result.trend)
  })

  it('returns velocityPerDay > 0 when there is throughput', () => {
    const store = makeStore({ backlogCount: 10 })
    const result = calculateForecast(store)
    expect(result.velocityPerDay).toBeGreaterThan(0)
  })

  it('returns r2 as a number between 0 and 1', () => {
    const store = makeStore({ backlogCount: 10 })
    const result = calculateForecast(store)
    expect(result.r2).toBeGreaterThanOrEqual(0)
    expect(result.r2).toBeLessThanOrEqual(1)
  })

  it('has all required ForecastResult properties', () => {
    const store = makeStore({ backlogCount: 3 })
    const result = calculateForecast(store)
    expect(result).toHaveProperty('etaDays')
    expect(result).toHaveProperty('etaDate')
    expect(result).toHaveProperty('velocityPerDay')
    expect(result).toHaveProperty('ciLower')
    expect(result).toHaveProperty('ciUpper')
    expect(result).toHaveProperty('confidenceLevel')
    expect(result).toHaveProperty('backlogCount')
    expect(result).toHaveProperty('trend')
    expect(result).toHaveProperty('r2')
  })

  it('forecast with 5 sprints yields reasonable ETA', () => {
    const store = makeStore({
      backlogCount: 50,
      sprintTasks: { S1: 8, S2: 10, S3: 9, S4: 11, S5: 12 },
    })
    const result = calculateForecast(store)
    expect(result.etaDays).toBeGreaterThan(0)
    expect(result.velocityPerDay).toBeGreaterThan(0)
    expect(result.ciUpper).toBeGreaterThanOrEqual(result.ciLower)
    expect(result.r2).toBeGreaterThan(0)
  })

  it('forecast with only 1 sprint uses fallback', () => {
    const store = makeStore({
      backlogCount: 20,
      sprintTasks: { S1: 5 },
    })
    const result = calculateForecast(store)
    expect(result.backlogCount).toBe(20)
    expect(result.etaDays).toBeGreaterThan(0)
  })
})
