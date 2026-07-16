/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * RD Sweep — pontos operacionais rate×distortion por compressor lossy (E4.T2,
 * node_493efe4a5bc7; teoria rate-distortion de Shannon + arXiv 2503.19114).
 *
 * "Economia sem perda" só é alegável com a curva MEDIDA: para cada compressor
 * registrado, rate = % de tokens poupados e distortion = fração de entidades
 * perdidas ({@link measureDistortion} — mesma família de sinais da lossy-gate).
 * O registry é declarativo (OCP): compressor novo = entrada nova, nunca editar
 * o motor. A baseline persiste em project_settings e alimenta o gate de
 * regressão de distorção (E4.T3).
 */

import { cavemanFilterInput } from './caveman-input.js'
import { measureDistortion } from './lossy-gate.js'
import { compressWithBm25 } from '../context/bm25-compressor.js'
import { compressBullets } from '../context/rule-compressor.js'
import { compressToolOutput } from '../tool-compress/index.js'
import { estimateTokens } from '../context/token-estimator.js'

export interface RdCompressorEntry {
  compressor: string
  mode: string
  run: (text: string) => string | Promise<string>
}

/** Registry dos compressores lossy varridos — adicionar aqui, nunca no motor. */
export const RD_COMPRESSORS: readonly RdCompressorEntry[] = [
  { compressor: 'caveman-input', mode: 'light', run: (t) => cavemanFilterInput(t, 'light') },
  { compressor: 'caveman-input', mode: 'aggressive', run: (t) => cavemanFilterInput(t, 'aggressive') },
  {
    compressor: 'bm25',
    mode: 'half-budget',
    run: (t) => {
      const lines = t.split('\n')
      const budget = Math.ceil(estimateTokens(t) / 2)
      return compressWithBm25(lines, lines[0] ?? '', budget)
        .map((c) => c.content)
        .join('\n')
    },
  },
  {
    compressor: 'rule-compressor',
    mode: 'bullets-half',
    run: (t) => compressBullets(t, Math.ceil(estimateTokens(t) / 2)),
  },
  { compressor: 'tool-compress', mode: 'auto', run: (t) => compressToolOutput(t).value },
]

/** Fixtures determinísticas — os 3 formatos que o agf mais comprime. */
export const RD_FIXTURES: readonly string[] = [
  // Prosa markdown com entidades — em inglês de propósito: articles/fillers
  // (light) vs hedges/transitions/whitespace (aggressive) diferenciam os modos.
  [
    '# Execution report',
    '',
    'Basically the pipeline actually processed https://exemplo.dev/api and honestly it was',
    'quite fast: on 2026-07-11 at 14:30 it really wrote 12345 rows to src/core/economy/rd-sweep.ts.',
    'I think that perhaps the outcome was essentially satisfactory, maybe even quite good overall.',
    'Furthermore, the contact admin@exemplo.dev probably confirmed a total of 67890 records.',
    'However, it seems that the operation was sort of adequate at the end of the day.',
  ].join('\n'),
  // Log estilo vitest (o que o hook comprime)
  Array.from({ length: 40 }, (_, i) => `✓ suite caso ${100 + i} passou em src/tests/mod-${i}.test.ts (${i}ms)`).join(
    '\n',
  ),
  // Lista de passos/bullets (o que o rule-compressor ataca)
  Array.from({ length: 30 }, (_, i) => `- passo ${200 + i}: executar a etapa em src/steps/etapa-${i}.ts`).join('\n'),
]

export interface RdPoint {
  compressor: string
  mode: string
  /** % média de tokens poupados sobre as fixtures (clamp ≥ 0). */
  ratePct: number
  /** Distorção média ({@link measureDistortion}) sobre as fixtures. */
  distortion: number
}

/** Varre o registry sobre as fixtures — determinístico p/ os mesmos inputs. */
export async function runRdSweep(fixtures: readonly string[] = RD_FIXTURES): Promise<RdPoint[]> {
  const points: RdPoint[] = []
  for (const entry of RD_COMPRESSORS) {
    let rateSum = 0
    let distortionSum = 0
    for (const fixture of fixtures) {
      const compressed = await entry.run(fixture)
      const before = estimateTokens(fixture)
      const after = estimateTokens(compressed)
      rateSum += before > 0 ? Math.max(0, ((before - after) / before) * 100) : 0
      distortionSum += measureDistortion(fixture, compressed)
    }
    points.push({
      compressor: entry.compressor,
      mode: entry.mode,
      ratePct: rateSum / fixtures.length,
      distortion: distortionSum / fixtures.length,
    })
  }
  return points
}

// ── Baseline persistida (roundtrip re-executável entre versões) ──

export const RD_BASELINE_SETTING_KEY = 'rd_baseline'

export interface RdBaselineStore {
  getProjectSetting(key: string): string | null
  setProjectSetting(key: string, value: string): void
}

export function saveRdBaseline(store: RdBaselineStore, points: readonly RdPoint[]): void {
  store.setProjectSetting(RD_BASELINE_SETTING_KEY, JSON.stringify(points))
}

/** Null quando nunca houve sweep persistido (ou setting corrompido). */
export function loadRdBaseline(store: Pick<RdBaselineStore, 'getProjectSetting'>): RdPoint[] | null {
  const raw = store.getProjectSetting(RD_BASELINE_SETTING_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as RdPoint[]
  } catch {
    return null
  }
}

// ── Gate de regressão de distorção (E4.T3, node_de35f1764076) ──

export interface RdRegression {
  compressor: string
  mode: string
  baselineDistortion: number
  currentDistortion: number
}

export interface RdComparison {
  passed: boolean
  regressions: RdRegression[]
}

const DISTORTION_TOLERANCE_PCT = 10
/** Baseline 0: qualquer distorção acima deste piso absoluto é material. */
const ZERO_BASELINE_FLOOR = 0.01

/**
 * Compara o sweep atual com a baseline: regressão = distorção >10% pior
 * (relativa; piso absoluto quando a baseline é 0). Ponto sem baseline
 * correspondente é ignorado (compressor novo ainda sem referência).
 */
export function compareRdToBaseline(
  current: readonly RdPoint[],
  baseline: readonly RdPoint[],
  tolerancePct: number = DISTORTION_TOLERANCE_PCT,
): RdComparison {
  const byKey = new Map(baseline.map((b) => [`${b.compressor}:${b.mode}`, b]))
  const regressions: RdRegression[] = []
  for (const p of current) {
    const b = byKey.get(`${p.compressor}:${p.mode}`)
    if (!b) continue
    const limit = b.distortion > 0 ? b.distortion * (1 + tolerancePct / 100) : ZERO_BASELINE_FLOOR
    if (p.distortion > limit) {
      regressions.push({
        compressor: p.compressor,
        mode: p.mode,
        baselineDistortion: b.distortion,
        currentDistortion: p.distortion,
      })
    }
  }
  return { passed: regressions.length === 0, regressions }
}

export interface RdGateResult extends RdComparison {
  /** true na primeira execução: a baseline foi semeada agora (gate passa). */
  seeded: boolean
  points: RdPoint[]
}

/**
 * Checagem completa do gate: sweep fresco vs baseline persistida. Sem baseline
 * ⇒ semeia com o sweep atual e passa (padrão do economy:gate — a primeira
 * execução cria a referência; as seguintes cobram).
 */
export async function rdGateCheck(store: RdBaselineStore): Promise<RdGateResult> {
  const points = await runRdSweep()
  const baseline = loadRdBaseline(store)
  if (!baseline) {
    saveRdBaseline(store, points)
    return { passed: true, seeded: true, regressions: [], points }
  }
  return { ...compareRdToBaseline(points, baseline), seeded: false, points }
}
