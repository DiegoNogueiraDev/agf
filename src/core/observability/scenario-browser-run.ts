/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * scenario-browser-run — the production caller the scenario chain never had.
 *
 * Every stage already existed and was tested — compile, execute, evaluate, record
 * — but nothing in production joined them, so the surface gate had evidence it
 * could read and no one ever wrote. This module is that arrow, and nothing more:
 * it owns no browser logic, no oracle rules, no storage format.
 *
 * It DOES own the two guarantees that live between the stages, because no single
 * stage can enforce either:
 *
 *  - **Never drive a browser at the live graph.** The dashboard can create edges
 *    and delete agents, so a scenario proving a surface can destroy real work.
 *    The target is classified BEFORE the first action, and an unnamed target is
 *    refused rather than assumed safe — a permissive default here is irreversible.
 *  - **Infra absence is not a broken delivery.** A driver that cannot be reached
 *    yields a refusal, never a `failed` verdict: recording one would make a dead
 *    daemon indistinguishable from a regression and train the operator to ignore
 *    the gate.
 *
 * Composes with: nl-scenario-compiler, scenario-executor, scenario-oracle (all in
 * plugins/browser) and scenario-verdict-store (the gate's reader).
 */

import path from 'node:path'
import type Database from 'better-sqlite3'
import { compileScenario } from '../../plugins/browser/nl-scenario-compiler.js'
import { executeScenario } from '../../plugins/browser/scenario-executor.js'
import { evaluateScenario, type ScenarioVerdict } from '../../plugins/browser/scenario-oracle.js'
import type { BrowserActions } from '../../plugins/browser/actions/index.js'
import { recordScenarioVerdict, oracleDetail } from './scenario-verdict-store.js'

/**
 * Failure codes that mean "the driver never got there", not "the surface is broken".
 * Reused from the browser-pilot schema so this list cannot drift from the producer's.
 */
const INFRA_FAILURE_CODES = ['bridge_unreachable', 'cdp_ws_unreachable', 'browser_use_crash', 'timeout'] as const

function isInfraFailure(error: string | undefined): boolean {
  return error !== undefined && INFRA_FAILURE_CODES.some((code) => error.includes(code))
}

/** Where the scenario is allowed to point, once classified. */
export type TargetResolution = { ok: true; graphDir: string } | { ok: false; code: string; error: string }

/**
 * Decide whether a scenario may drive a browser against `graphDir`.
 *
 * Paths are resolved before comparison: a relative segment that climbs back into
 * the project (`<project>/tmp/..`) is the project, and a string compare would wave
 * it through. Absence of a named target is refused for the same reason the
 * unrecognized case always is — the damage here cannot be undone.
 */
export function resolveScenarioTarget(input: { projectDir: string; graphDir?: string }): TargetResolution {
  if (!input.graphDir) {
    return {
      ok: false,
      code: 'UNSAFE_TARGET',
      error: 'no disposable graph directory was named for the scenario target',
    }
  }

  const project = path.resolve(input.projectDir)
  const target = path.resolve(input.graphDir)
  const insideProject = target === project || target.startsWith(`${project}${path.sep}`)
  if (insideProject) {
    return {
      ok: false,
      code: 'UNSAFE_TARGET',
      error: `refusing to drive a browser at ${target}: it is the live project graph, and the dashboard can mutate it`,
    }
  }
  return { ok: true, graphDir: target }
}

export interface BrowserScenarioRun {
  db: Database.Database
  /** Task whose surface proof this run produces. */
  nodeId: string
  /** Natural-language scenario text, compiled by the existing compiler. */
  nl: string
  /** Injected port — a real driver is never required to exercise this wiring. */
  actions: BrowserActions
  projectDir: string
  graphDir?: string
  scenarioId?: string
}

export type BrowserScenarioResult = { ok: true; verdict: ScenarioVerdict } | { ok: false; code: string; error: string }

/**
 * Compile, drive, judge and record — in that order, with the target classified first.
 *
 * The verdict is written through the oracle-tagged detail so the gate reads the
 * oracle's three-valued truth rather than a boolean; `inconclusive` therefore stays
 * distinct from `failed` all the way to the refusal message.
 */
export async function runBrowserScenario(run: BrowserScenarioRun): Promise<BrowserScenarioResult> {
  const target = resolveScenarioTarget({ projectDir: run.projectDir, graphDir: run.graphDir })
  if (!target.ok) return target

  const plan = compileScenario(run.nl)

  const steps = await executeScenario(plan, run.actions)

  // The executor deliberately never throws — it converts a rejected adapter into a
  // failed step so a run is never thrown away. That means an unreachable driver
  // arrives here looking exactly like a broken control, and only the preserved
  // cause tells them apart. Infra codes are the canonical ones the browser-pilot
  // schema already defines; matching on prose would rot the moment a message changes.
  const infra = steps.find((s) => !s.ok && isInfraFailure(s.error))
  if (infra) {
    // Nothing is recorded: the run produced no reading of the surface at all, so
    // the gate keeps reporting `missing` — which is the truth.
    return { ok: false, code: 'DRIVER_UNREACHABLE', error: `browser driver unreachable: ${infra.error}` }
  }

  const verdict = evaluateScenario(steps)
  recordScenarioVerdict(run.db, {
    nodeId: run.nodeId,
    passed: verdict.verdict === 'passed',
    // The level rides along with the verdict: recording the pass without it would
    // reproduce this epic's recurring failure — a field the report reads and no
    // producer ever writes, leaving every green indistinguishable.
    detail: oracleDetail(verdict.verdict, verdict.corroboration),
    ranAt: Date.now(),
    ...(run.scenarioId ? { scenarioId: run.scenarioId } : {}),
  })

  return { ok: true, verdict }
}
