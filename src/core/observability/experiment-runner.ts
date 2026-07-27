/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * ExperimentRunner — Systematic hypothesis testing for agent pipelines.
 *
 * Implements Hypothesis Testing (Fisher, 1925; Neyman-Pearson, 1933):
 * Dataset (controlled population) + Target (intervention) + Evaluators (test statistic)
 * = Experiment (controlled trial with measurable outcome).
 *
 * Layer: L4_MetaRule (compares results, generates insights).
 */

import type Database from 'better-sqlite3'
import { generateId } from '../utils/id.js'
import { now } from '../utils/time.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'experiment-runner.ts' })

// ── Interfaces ─────────────────────────────────────────

export interface EvaluatorConfig {
  evaluators: string[]
  targetFn?: (input: Record<string, unknown>) => Record<string, unknown>
}

export interface ExperimentRecord {
  id: string
  name: string
  datasetId: string
  evaluatorConfig: EvaluatorConfig
  status: string
  summary: ExperimentSummary | null
  createdAt: string
  completedAt: string | null
}

export interface ExperimentSummary {
  status: 'completed' | 'failed'
  resultCount: number
  avgScores: Record<string, number>
  minScores: Record<string, number>
  maxScores: Record<string, number>
}

export interface ComparisonResult {
  exp1Name: string
  exp2Name: string
  exp1Scores: Record<string, number>
  exp2Scores: Record<string, number>
  deltas: Record<string, number>
}

// ── Row types ──────────────────────────────────────────

interface ExperimentRow {
  id: string
  name: string
  dataset_id: string
  evaluator_config: string
  status: string
  summary: string | null
  created_at: string
  completed_at: string | null
}

// ── Built-in Evaluators ────────────────────────────────

type EvaluatorFn = (actual: Record<string, unknown>, expected: Record<string, unknown> | null) => number

function exactMatchEvaluator(actual: Record<string, unknown>, expected: Record<string, unknown> | null): number {
  if (!expected) return 0
  return JSON.stringify(actual) === JSON.stringify(expected) ? 1.0 : 0.0
}

const BUILT_IN_EVALUATORS: Record<string, EvaluatorFn> = {
  exact_match: exactMatchEvaluator,
}

// ── ExperimentRunner ───────────────────────────────────

export class ExperimentRunner {
  private db: Database.Database
  private configs: Map<string, EvaluatorConfig> = new Map()

  constructor(db: Database.Database) {
    this.db = db
  }

  /** Create an experiment (pending state). */
  createExperiment(name: string, datasetId: string, config: EvaluatorConfig): string {
    const id = generateId('exp')
    const createdAt = now()

    // Store config without targetFn (not serializable)
    const serializableConfig = { evaluators: config.evaluators }

    this.db
      .prepare(
        `INSERT INTO eval_experiments (id, name, dataset_id, evaluator_config, status, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
      )
      .run(id, name, datasetId, JSON.stringify(serializableConfig), createdAt)

    // Keep full config (with targetFn) in memory
    this.configs.set(id, config)

    log.debug('experiment:created', { id, name, datasetId })
    return id
  }

  /** Run an experiment: execute target on each entry, score with evaluators. */
  runExperiment(experimentId: string): ExperimentSummary | null {
    const exp = this.getExperiment(experimentId)
    if (!exp) return null

    const config = this.configs.get(experimentId) ?? exp.evaluatorConfig
    const targetFn = config.targetFn ?? ((input: Record<string, unknown>) => input)

    // Update status to running
    this.db.prepare("UPDATE eval_experiments SET status = 'running' WHERE id = ?").run(experimentId)

    const entries = this.db
      .prepare('SELECT * FROM eval_dataset_entries WHERE dataset_id = ? ORDER BY created_at ASC')
      .all(exp.datasetId) as Array<{
      id: string
      input: string
      expected_output: string | null
    }>

    const allScores: Record<string, number[]> = {}
    for (const evaluator of config.evaluators) {
      allScores[evaluator] = []
    }

    for (const entry of entries) {
      const input = JSON.parse(entry.input) as Record<string, unknown>
      const expected = entry.expected_output ? (JSON.parse(entry.expected_output) as Record<string, unknown>) : null

      const actualOutput = targetFn(input)
      const scores: Record<string, number> = {}

      for (const evaluatorName of config.evaluators) {
        const evaluatorFn = BUILT_IN_EVALUATORS[evaluatorName]
        if (evaluatorFn) {
          const score = evaluatorFn(actualOutput, expected)
          scores[evaluatorName] = score
          ;(allScores[evaluatorName] ??= []).push(score)
        }
      }

      const resultId = generateId('result')
      this.db
        .prepare(
          `INSERT INTO eval_experiment_results (id, experiment_id, entry_id, actual_output, scores, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(resultId, experimentId, entry.id, JSON.stringify(actualOutput), JSON.stringify(scores), now())
    }

    // Compute summary
    const avgScores: Record<string, number> = {}
    const minScores: Record<string, number> = {}
    const maxScores: Record<string, number> = {}

    for (const [name, scores] of Object.entries(allScores)) {
      if (scores.length === 0) continue
      avgScores[name] = scores.reduce((a, b) => a + b, 0) / scores.length
      minScores[name] = Math.min(...scores)
      maxScores[name] = Math.max(...scores)
    }

    const summary: ExperimentSummary = {
      status: 'completed',
      resultCount: entries.length,
      avgScores,
      minScores,
      maxScores,
    }

    this.db
      .prepare("UPDATE eval_experiments SET status = 'completed', summary = ?, completed_at = ? WHERE id = ?")
      .run(JSON.stringify(summary), now(), experimentId)

    log.debug('experiment:completed', { experimentId, resultCount: entries.length, avgScores })
    return summary
  }

  /** Get an experiment by ID. */
  getExperiment(experimentId: string): ExperimentRecord | null {
    const row = this.db.prepare('SELECT * FROM eval_experiments WHERE id = ?').get(experimentId) as
      ExperimentRow | undefined

    if (!row) return null

    return {
      id: row.id,
      name: row.name,
      datasetId: row.dataset_id,
      evaluatorConfig: JSON.parse(row.evaluator_config) as EvaluatorConfig,
      status: row.status,
      summary: row.summary ? (JSON.parse(row.summary) as ExperimentSummary) : null,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    }
  }

  /** Compare two experiments side-by-side. */
  compareExperiments(expId1: string, expId2: string): ComparisonResult | null {
    const exp1 = this.getExperiment(expId1)
    const exp2 = this.getExperiment(expId2)

    if (!exp1?.summary || !exp2?.summary) return null

    const deltas: Record<string, number> = {}
    const allMetrics = new Set([...Object.keys(exp1.summary.avgScores), ...Object.keys(exp2.summary.avgScores)])

    for (const metric of allMetrics) {
      const s1 = exp1.summary.avgScores[metric] ?? 0
      const s2 = exp2.summary.avgScores[metric] ?? 0
      deltas[metric] = Math.round((s1 - s2) * 1000) / 1000
    }

    return {
      exp1Name: exp1.name,
      exp2Name: exp2.name,
      exp1Scores: exp1.summary.avgScores,
      exp2Scores: exp2.summary.avgScores,
      deltas,
    }
  }
}
