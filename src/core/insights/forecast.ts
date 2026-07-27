import type { SqliteStore } from '../store/sqlite-store.js'
import { linearRegression } from '../algorithms/stats/linear-regression.js'
import { calculateVelocity, applyDoraAdjustment } from '../planner/velocity.js'
import { calculateDoraMetrics } from './dora-metrics.js'
import { monteCarloForecast } from './monte-carlo-forecast.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'forecast.ts' })

export interface ForecastResult {
  etaDays: number
  etaDate: string
  velocityPerDay: number
  ciLower: number
  ciUpper: number
  confidenceLevel: number
  backlogCount: number
  trend: 'improving' | 'stable' | 'declining'
  r2: number
  /** Probabilistic delivery days from Monte Carlo (P50/P85/P95). */
  p50Days: number
  p85Days: number
  p95Days: number
  /** 'monte-carlo' (primary, ≥2 periods of history) | 'parametric' (cold fallback). */
  method: 'monte-carlo' | 'parametric'
}

export function calculateForecast(store: SqliteStore): ForecastResult {
  const doc = store.toGraphDocument()
  const velocity = calculateVelocity(doc)
  const dora = calculateDoraMetrics(store)

  const backlogCount = doc.nodes.filter(
    (n) => (n.type === 'task' || n.type === 'subtask') && n.status === 'backlog',
  ).length

  const sprints = velocity.sprints.filter((s) => s.tasksCompleted > 0)
  const totalWeeks = sprints.length

  if (sprints.length < 2) {
    const fallbackRate =
      velocity.overall.totalTasksCompleted > 0 ? velocity.overall.totalTasksCompleted / Math.max(1, totalWeeks) : 1
    const etaDays = backlogCount > 0 ? Math.ceil((backlogCount / Math.max(0.1, fallbackRate)) * 7) : 0
    return {
      etaDays,
      etaDate: formatEtaDate(etaDays),
      velocityPerDay: Math.round((fallbackRate / 7) * 100) / 100,
      ciLower: 0,
      ciUpper: 0,
      confidenceLevel: 0,
      backlogCount,
      trend: dora.trend,
      r2: 0,
      // Not enough history for a distribution ⇒ degenerate point estimate.
      p50Days: etaDays,
      p85Days: etaDays,
      p95Days: etaDays,
      method: 'parametric',
    }
  }

  const points: number[][] = sprints.map((s, i) => [i, s.tasksCompleted]).filter(([, y]) => Number.isFinite(y!))

  const regression = linearRegression(points)
  const n = points.length

  const adustedVelocity = applyDoraAdjustment(Math.max(0.1, regression.slope), {
    mttrHours: dora.mttr,
    changeFailureRate: dora.changeFailureRate,
    deploymentFrequencyPerDay: dora.deploymentFrequency,
  })

  const predictedPerSprint = Math.max(0.1, adustedVelocity.adjustedVelocity * (n + 1) + regression.intercept)

  const velocityPerDay = Math.round((predictedPerSprint / 7) * 100) / 100
  const etaDays = velocityPerDay > 0 ? Math.ceil(backlogCount / velocityPerDay) : 999

  let ssErr = 0
  for (const [x, y] of points) {
    const pred = regression.slope * x! + regression.intercept
    ssErr += (y! - pred) ** 2
  }
  const rmse = n > 2 ? Math.sqrt(ssErr / (n - 2)) : predictedPerSprint * 0.5

  const tScore = criticalT(n - 2, 0.95)
  const ci = (tScore * rmse) / Math.sqrt(n)
  // Faster velocity (pred + ci) ⇒ fewer days = lower bound; slower (pred − ci) ⇒ more
  // days = upper bound. (Fixes the previous inconsistent `predictedPerSprint + ci * 2`.)
  const ciDaysLow = Math.ceil(backlogCount / Math.max(0.1, (predictedPerSprint + ci) / 7))
  const ciDaysHigh =
    predictedPerSprint - ci > 0 ? Math.ceil(backlogCount / Math.max(0.1, (predictedPerSprint - ci) / 7)) : 999

  // Primary forecast: Monte Carlo over the observed per-period throughput (robust to
  // the non-Gaussian, over-dispersed nature of task counts). Deterministic seed so the
  // command output is stable for a given graph state.
  const samples = sprints.map((s) => s.tasksCompleted)
  const mc = monteCarloForecast(samples, backlogCount, {
    seed: backlogCount * 1000 + samples.reduce((a, b) => a + b, 0),
  })

  log.info('forecast:calculated', {
    backlogCount,
    etaDays,
    velocityPerDay,
    trend: dora.trend,
    r2: regression.r2,
    p50Days: mc.p50Days,
    p85Days: mc.p85Days,
  })

  return {
    etaDays,
    etaDate: formatEtaDate(etaDays),
    velocityPerDay,
    ciLower: ciDaysLow,
    ciUpper: ciDaysHigh,
    confidenceLevel: 95,
    backlogCount,
    trend: dora.trend,
    r2: Math.round(regression.r2 * 1000) / 1000,
    p50Days: mc.p50Days,
    p85Days: mc.p85Days,
    p95Days: mc.p95Days,
    method: 'monte-carlo',
  }
}

function formatEtaDate(days: number): string {
  if (days === 0) return 'now'
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  return d.toISOString().split('T')[0]!
}

function criticalT(df: number, _confidence: number): number {
  if (df <= 0) return 0
  const table: Record<number, number> = {
    1: 12.706,
    2: 4.303,
    3: 3.182,
    4: 2.776,
    5: 2.571,
    6: 2.447,
    7: 2.365,
    8: 2.306,
    9: 2.262,
    10: 2.228,
    15: 2.131,
    20: 2.086,
    25: 2.06,
    30: 2.042,
    40: 2.021,
    50: 2.009,
    60: 2.0,
    80: 1.99,
    100: 1.984,
    120: 1.98,
  }
  if (df >= 120) return 1.96
  let closest = 1
  for (const k of Object.keys(table).map(Number)) {
    if (Math.abs(k - df) < Math.abs(closest - df)) closest = k
  }
  return table[closest] ?? 1.96
}
