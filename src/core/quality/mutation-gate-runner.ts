/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Drives a real (bounded) mutation pass: apply each spec to a source file, run
 * the task's test file, record kill/survive, then ALWAYS restore the original.
 *
 * mutation-runner only generates/summarizes mutants and mutation-gate only
 * scores a pre-computed summary — neither executes tests. This driver closes
 * that gap so `agf check --mutation` is a real gate, not a cosmetic stub.
 *
 * The core `runMutationGate` is pure given its injected deps (fully testable
 * with fakes). `realMutationGateDeps` supplies the fs + vitest-subprocess
 * implementations for the CLI. No provider/LLM involved — delegate-safe.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  applyMutation,
  summarizeMutants,
  DEFAULT_MUTATION_SPECS,
  type MutationSpec,
  type MutantResult,
  type MutationRunSummary,
} from './mutation-runner.js'
import { checkMutationKillRatio, type MutationGateResult } from './mutation-gate.js'

export interface MutationGateInput {
  sourceFile: string
  testFile: string
  /** Defaults to DEFAULT_MUTATION_SPECS. */
  specs?: readonly MutationSpec[]
  /** Kill-ratio threshold; defaults to mutation-gate's DEFAULT_KILL_THRESHOLD. */
  threshold?: number
}

export interface MutationGateDeps {
  readSource: (file: string) => string
  writeSource: (file: string, content: string) => void
  /** Runs the test file; returns true when tests PASS (mutant survived). */
  runTest: (testFile: string) => boolean
}

export interface MutationGateRun {
  summary: MutationRunSummary
  gate: MutationGateResult
}

/**
 * Applies each matching spec, runs the test file, and restores the source.
 *
 * Kill semantics: a mutant is *killed* when the test run FAILS (tests caught the
 * behaviour change). A passing run means the mutant *survived* — a coverage gap.
 * Specs whose pattern doesn't match the source generate no mutant (skipped).
 *
 * The original source is restored in a `finally` so a thrown runner never leaves
 * the working tree mutated.
 */
export function runMutationGate(input: MutationGateInput, deps: MutationGateDeps): MutationGateRun {
  const specs = input.specs ?? DEFAULT_MUTATION_SPECS
  const original = deps.readSource(input.sourceFile)
  const mutants: MutantResult[] = []
  let mutantId = 0

  // Pre-mutation snapshot: save original to .snapshot file as defense-in-depth.
  // If the process crashes (SIGKILL/OOM) before `finally` runs, the snapshot
  // provides a restore point. Best-effort: never breaks the mutation gate.
  const snapshotDir = join(dirname(input.sourceFile), '.mutation-snapshots')
  const snapshotPath = join(snapshotDir, `${basename(input.sourceFile)}.snapshot`)
  try {
    mkdirSync(snapshotDir, { recursive: true })
    writeFileSync(snapshotPath, original, 'utf8')
  } catch {
    // Snapshot is best-effort
  }

  try {
    for (const spec of specs) {
      const mutated = applyMutation(original, spec)
      if (mutated === original) continue // pattern didn't match — no mutant generated
      deps.writeSource(input.sourceFile, mutated)
      let survived: boolean
      try {
        survived = deps.runTest(input.testFile)
      } catch {
        survived = false // a crashing run counts as a kill (defensive, no false-negative)
      }
      mutants.push({ mutantId: mutantId++, spec: spec.name, killed: !survived })
    }
  } finally {
    deps.writeSource(input.sourceFile, original) // ALWAYS restore the working tree
  }

  const summary = summarizeMutants(input.sourceFile, mutants)
  const gate = checkMutationKillRatio(summary, input.threshold)
  return { summary, gate }
}

/**
 * Real fs + vitest-subprocess deps for the CLI. `runTest` spawns vitest on the
 * single test file and reports pass/fail via exit status.
 */
export function realMutationGateDeps(cwd: string): MutationGateDeps {
  return {
    readSource: (file) => readFileSync(file, 'utf8'),
    writeSource: (file, content) => writeFileSync(file, content, 'utf8'),
    runTest: (testFile) => {
      const res = spawnSync('npx', ['vitest', 'run', testFile, '--project=node'], {
        cwd,
        stdio: 'ignore',
        encoding: 'utf8',
      })
      return res.status === 0 // exit 0 = tests passed = mutant survived
    },
  }
}
