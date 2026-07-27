/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * `agf flow` — superfície de primeira classe para a fórmula do flow
 * (Φ(t) · λ_flow = λ_base + α·Φ · e^{-λ·d}), que dilui o contexto no hot-path.
 *
 * Papel: só liga/desliga/inspeciona — a fórmula vive em flow-index.ts e o
 * pipeline em flow-compact.ts (não recomputa nada aqui além do Φ de leitura).
 * Sem `flow_config` gravado o flow é OFF e o contexto permanece byte-idêntico
 * (contrato de não-regressão do flow-compact). Toggle: enable-flow.ts.
 */

import { Command } from 'commander'
import type Database from 'better-sqlite3'
import { openStoreOrFail } from '../open-store.js'
import { createCliOutput } from '../shared/cli-output.js'
import { setFlowEnabled, setFlowAbEnabled } from '../shared/enable-flow.js'
import { resolveFlowConfig } from '../../core/context/flow-config.js'
import { computeFlowIndex, computeLambdaFlow } from '../../core/context/flow-index.js'
import { queryEpisodicOutcomes } from '../../core/store/episodic-outcomes-store.js'
import { createLogger } from '../../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'flow-cmd.ts' })

/** Superfície mínima do store para o status (DIP — testável com :memory:). */
export interface FlowStatusSource {
  getProjectSetting(key: string): string | null
  getDb(): Database.Database
}

/** Snapshot de leitura da fórmula do flow — contrato do `agf flow status`. */
export interface FlowStatus {
  enabled: boolean
  /** Φ(t) ∈ [0,1] computado dos episodic outcomes recentes. */
  phi: number
  /** Sucessos consecutivos mais recentes. */
  streak: number
  /** Quantos outcomes alimentaram o Φ. */
  sampleCount: number
  /** λ_flow = λ_base + α·Φ com a config efetiva. */
  lambda: number
  /** Linhas de telemetria em flow_metrics (0 = o A/B nunca rodou). */
  metricsCount: number
}

/** Lê o estado efetivo do flow — mesmo caminho de dados do flow-compact.ts. */
export function buildFlowStatus(store: FlowStatusSource): FlowStatus {
  const cfg = resolveFlowConfig(store)
  const outcomes = queryEpisodicOutcomes(store.getDb(), { limit: cfg.historyWindow }).map((o) => o.outcome)
  const state = computeFlowIndex(outcomes, {
    emaGain: cfg.emaGain,
    resetFactor: cfg.resetFactor,
    partialFactor: cfg.partialFactor,
  })
  const lambda = computeLambdaFlow(state.phi, cfg.lambdaBase, cfg.alpha)

  return {
    enabled: cfg.enabled,
    phi: state.phi,
    streak: state.streak,
    sampleCount: state.sampleCount,
    lambda,
    metricsCount: countFlowMetrics(store.getDb()),
  }
}

/** Defensivo: DB pré-migração pode não ter a tabela (código vence _migrations). */
function countFlowMetrics(db: Database.Database): number {
  try {
    return (db.prepare('SELECT COUNT(*) AS c FROM flow_metrics').get() as { c: number }).c
  } catch {
    return 0
  }
}

function toggleAction(command: string, enabled: boolean): (opts: { dir: string }) => void {
  return (opts: { dir: string }) => {
    const out = createCliOutput(command)
    const store = openStoreOrFail(opts.dir, { requireExisting: true })
    try {
      setFlowEnabled(store, enabled)
      out.ok({ enabled })
    } finally {
      store.close()
    }
  }
}

/** Builds the `agf flow` CLI command (Commander definition). */
export function flowCommand(): Command {
  log.info('flow command registered')
  const cmd = new Command('flow')
    .description('Fórmula do flow (Φ/λ_flow): liga, desliga e inspeciona a diluição de contexto')
    .enablePositionalOptions()

  cmd
    .command('on')
    .description('Liga o flow no projeto (preserva overrides do flow_config)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--ab', 'Liga também o experimento A/B (flow_on vs flow_off por node)', false)
    .action((opts: { dir: string; ab: boolean }) => {
      const out = createCliOutput('flow.on')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        setFlowEnabled(store, true)
        if (opts.ab) setFlowAbEnabled(store, true)
        out.ok({ enabled: true, abEnabled: opts.ab || undefined })
      } finally {
        store.close()
      }
    })

  cmd
    .command('off')
    .description('Desliga o flow no projeto (preserva overrides do flow_config)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action(toggleAction('flow.off', false))

  cmd
    .command('status')
    .description('Estado efetivo do flow: enabled, Φ, streak, λ_flow e telemetria acumulada')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((opts: { dir: string }) => {
      const out = createCliOutput('flow.status')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        out.ok(buildFlowStatus(store))
      } finally {
        store.close()
      }
    })

  return cmd
}
